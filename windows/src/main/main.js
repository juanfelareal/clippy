// Clippy para Windows — proceso principal.
// Port de la app de barra de menú de macOS (Sources/Clippy/*.swift): historial del portapapeles,
// captura anotable, OCR, calculadora natural, snippets y mantener despierto. Todo local, sin red.
const { app, BrowserWindow, Tray, Menu, ipcMain, nativeImage, nativeTheme, screen,
  globalShortcut, powerSaveBlocker, Notification, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { pathToFileURL } = require('url');

const { Settings } = require('./store');
const { History } = require('./history');
const { ClipboardMonitor } = require('./clipboard');
const { Keyboard } = require('./keyboard');
const { SnippetStore, SnippetEngine } = require('./snippets');
const { CaptureService } = require('./capture');
const { OcrService } = require('./ocr');
const { WinHelper } = require('./winhelper');

const isWin = process.platform === 'win32';
const isMac = process.platform === 'darwin';
const ROOT = path.join(__dirname, '..', '..');
const ASSETS = path.join(ROOT, 'assets');
const RENDERER = path.join(__dirname, '..', 'renderer');
const PRELOAD = path.join(__dirname, 'preload.js');

// En desarrollo usar una carpeta aparte para no mezclar datos con la app instalada
if (!app.isPackaged) app.setPath('userData', process.env.CLIPPY_USERDATA || path.join(app.getPath('appData'), 'Clippy-Windows-Dev'));
// Un build empaquetado fuera de Windows (solo pruebas) no debe tocar los datos de la app Swift de macOS
else if (process.platform !== 'win32') app.setPath('userData', path.join(app.getPath('appData'), 'Clippy-Windows-Port'));
if (!app.requestSingleInstanceLock()) { app.quit(); process.exit(0); }
if (isWin) app.setAppUserModelId('com.juanfe.clippy');

const DATA = app.getPath('userData');
fs.mkdirSync(DATA, { recursive: true });
const LOG_FILE = path.join(DATA, 'clippy.log');
try { if (fs.statSync(LOG_FILE).size > 2 * 1024 * 1024) fs.renameSync(LOG_FILE, LOG_FILE + '.old'); } catch {}
function log(...a) {
  const line = new Date().toISOString() + ' ' + a.map(x => (typeof x === 'string' ? x : JSON.stringify(x))).join(' ');
  console.log(line);
  try { fs.appendFileSync(LOG_FILE, line + '\n'); } catch {}
}
process.on('uncaughtException', err => log('uncaughtException', String(err && err.stack || err)));
process.on('unhandledRejection', err => log('unhandledRejection', String(err && err.stack || err)));

const sleep = ms => new Promise(r => setTimeout(r, ms));
const TESSDATA = app.isPackaged ? path.join(process.resourcesPath, 'tessdata') : path.join(ROOT, 'resources', 'tessdata');

const SHORTCUTS = {
  history: { accel: 'Control+Shift+C', label: 'Ctrl+Shift+C' },
  annotate: { accel: 'Control+Shift+1', label: 'Ctrl+Shift+1' },
  ocr: { accel: 'Control+Shift+2', label: 'Ctrl+Shift+2' },
  calculator: { accel: 'Control+Shift+=', label: 'Ctrl+Shift+=' }
};

let settings, history, monitor, keyboard, snippetStore, snippetEngine, capture, ocr, helper;
let tray = null, historyWin = null, calcWin = null, hudWin = null, snippetsWin = null;
let awakeId = null;
let quitting = false;
let lastExternalHwnd = null;   // última ventana de otra app en primer plano (Windows)
let pasteTarget = null;        // ventana a la que se devuelve el foco al pegar
let historyHiddenAt = 0;
const editors = new Set();

// ---------------- Utilidades de ventanas ----------------
const bg = () => (nativeTheme.shouldUseDarkColors ? '#202020' : '#ffffff');

function panelWindow(file, { width, height }) {
  const win = new BrowserWindow({
    width, height, show: false, frame: false, resizable: false, movable: false, minimizable: false,
    maximizable: false, fullscreenable: false, skipTaskbar: true, alwaysOnTop: true,
    roundedCorners: true, backgroundColor: bg(), title: 'Clippy',
    webPreferences: { preload: PRELOAD, contextIsolation: true, nodeIntegration: false, spellcheck: false }
  });
  win.setAlwaysOnTop(true, 'pop-up-menu');
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  win.removeMenu();
  win.loadFile(path.join(RENDERER, file));
  win.on('close', e => { if (!quitting) { e.preventDefault(); win.hide(); } });
  return win;
}

function positionNearCursor(win, width, height) {
  const pt = screen.getCursorScreenPoint();
  const wa = screen.getDisplayNearestPoint(pt).workArea;
  const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), Math.max(lo, hi));
  const x = clamp(Math.round(pt.x - width / 2), wa.x + 8, wa.x + wa.width - width - 8);
  let y = pt.y + 12;
  if (y + height > wa.y + wa.height - 8) y = pt.y - height - 12;
  y = clamp(y, wa.y + 8, wa.y + wa.height - height - 8);
  const b = { x, y, width, height };
  win.setBounds(b);
  return b;
}

function showPanel(win, width, height) {
  const b = positionNearCursor(win, width, height);
  win.show();
  win.setBounds(b); // DPI mixto: re-aplicar tras mostrar en otro monitor
  win.focus();
  win.webContents.focus();
}

// ---------------- HUD ----------------
function createHud() {
  hudWin = new BrowserWindow({
    width: 420, height: 64, show: false, frame: false, transparent: true, resizable: false, movable: false,
    focusable: false, skipTaskbar: true, alwaysOnTop: true, hasShadow: false, backgroundColor: '#00000000',
    webPreferences: { preload: PRELOAD, contextIsolation: true, nodeIntegration: false }
  });
  hudWin.setAlwaysOnTop(true, 'screen-saver');
  hudWin.setIgnoreMouseEvents(true);
  hudWin.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  hudWin.loadFile(path.join(RENDERER, 'hud.html'));
}

let hudTimer = null;
function hud(message) {
  log('hud', message);
  if (!hudWin || hudWin.isDestroyed()) return;
  const pt = screen.getCursorScreenPoint();
  const wa = screen.getDisplayNearestPoint(pt).workArea;
  const b = { x: Math.round(wa.x + wa.width / 2 - 210), y: Math.round(wa.y + wa.height * 0.12), width: 420, height: 64 };
  hudWin.setBounds(b);
  hudWin.webContents.send('hud:show', message);
  hudWin.showInactive();
  hudWin.setBounds(b);
  clearTimeout(hudTimer);
  hudTimer = setTimeout(() => { if (hudWin && !hudWin.isDestroyed()) hudWin.hide(); }, 1900);
}

// ---------------- Historial ----------------
const PANEL_W = 420, PANEL_H = 480;

function createHistoryWindow() {
  historyWin = panelWindow('history.html', { width: PANEL_W, height: PANEL_H });
  historyWin.on('blur', () => { if (historyWin.isVisible() && !historyWin.webContents.isDevToolsOpened()) hideHistory(); });
}

function showHistory() {
  hideCalculator();
  pasteTarget = lastExternalHwnd;
  historyWin.webContents.send('history:show', history.toView());
  showPanel(historyWin, PANEL_W, PANEL_H);
}

function hideHistory() {
  if (historyWin && historyWin.isVisible()) { historyWin.hide(); historyHiddenAt = Date.now(); }
}

function toggleHistory() {
  if (historyWin.isVisible()) return hideHistory();
  if (Date.now() - historyHiddenAt < 250) return; // el click en la bandeja acaba de cerrarlo por blur
  showHistory();
}

async function returnFocusToPreviousApp(target) {
  if (isMac) { app.hide(); await sleep(120); return; }
  if (isWin && helper && helper.available && target) {
    await sleep(40);
    const ok = await helper.focus(target);
    if (!ok) log('focus restore failed', target);
  }
}

async function pasteIntoPreviousApp(target) {
  await keyboard.waitModifiersReleased();
  await returnFocusToPreviousApp(target);
  await sleep(isWin ? 70 : 60);
  await keyboard.injecting(async () => {
    if (!keyboard.pasteShortcut()) hud('Copiado — pégalo con Ctrl+V');
  });
}

async function commitHistory(action, id) {
  const item = history.get(id);
  if (!item) return;
  if (item.kind === 'image') {
    const img = nativeImage.createFromPath(history.imagePath(item));
    if (img.isEmpty()) { hud('No se encontró la imagen'); return; }
    await monitor.writeImageSilently(img);
  } else {
    // El texto se guarda plano, así que "pegar sin formato" escribe solo texto (igual que en Mac)
    await monitor.writeTextSilently(item.text || '');
  }
  history.touch(id);
  const target = pasteTarget;
  hideHistory();
  if (action === 'paste' || action === 'pastePlain') await pasteIntoPreviousApp(target);
}

// ---------------- Calculadora ----------------
const CALC_W = 380, CALC_H = 110;
function createCalculatorWindow() { calcWin = panelWindow('calculator.html', { width: CALC_W, height: CALC_H }); calcWin.on('blur', () => hideCalculator()); }
function showCalculator() { hideHistory(); calcWin.webContents.send('calc:show'); showPanel(calcWin, CALC_W, CALC_H); }
function hideCalculator() { if (calcWin && calcWin.isVisible()) calcWin.hide(); }
function toggleCalculator() { if (calcWin.isVisible()) hideCalculator(); else showCalculator(); }

// Copia texto/imagen al portapapeles y lo agrega al historial (OCR, calculadora, captura)
async function copyTextToHistory(text) { history.addText(text); await monitor.writeTextSilently(text); }
async function copyImageToHistory(img) { history.addImage(img); await monitor.writeImageSilently(img); }

// ---------------- Captura + OCR + Editor ----------------
async function runCapture(mode) {
  if (capture.isCapturing) return;
  hideHistory(); hideCalculator();
  let result;
  try { result = await capture.selectRegion(); }
  catch (err) { hud('No se pudo capturar la pantalla'); return; }
  if (!result) return;
  if (mode === 'ocr') return runOcr(result);
  openEditor(result.image, result.scaleFactor);
}

async function runOcr({ image, scaleFactor }) {
  if (!ocr.available()) { hud('Faltan los datos de OCR'); log('ocr: tessdata missing at', TESSDATA); return; }
  hud('Reconociendo texto…');
  try {
    let img = nativeImage.createFromBuffer(fullResPNG(image).png);
    const { width, height } = img.getSize();
    // Pantallas a 100–150 %: duplicar el tamaño mejora mucho a Tesseract
    if (scaleFactor < 2 && width * height < 8e6) img = img.resize({ width: width * 2, height: height * 2, quality: 'best' });
    const t0 = Date.now();
    const text = await ocr.recognize(img.toPNG());
    log('ocr done', `${Date.now() - t0}ms`, `${text.length} chars`);
    if (!text) { hud('Sin texto detectado'); return; }
    await copyTextToHistory(text);
    hud('✓ Texto copiado');
  } catch (err) {
    log('ocr error', String(err && err.stack || err));
    hud('Error en el OCR');
  }
}

// Bitmap a resolución máxima (una nativeImage puede tener varias representaciones de escala)
function fullResPNG(image) {
  const scale = Math.max(1, ...image.getScaleFactors());
  return { png: image.toPNG({ scaleFactor: scale }), size: image.getSize(scale) };
}

function openEditor(image, density) {
  if (!image || image.isEmpty()) { hud('No se pudo abrir la captura'); return null; }
  const tmp = path.join(os.tmpdir(), `clippy-edit-${Date.now()}-${Math.random().toString(16).slice(2)}.png`);
  const full = fullResPNG(image);
  fs.writeFileSync(tmp, full.png);
  const { width, height } = full.size;
  const wa = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea;
  const toolbar = 52;
  const winW = Math.round(Math.min(Math.max(width / density, 560), wa.width * 0.9));
  const winH = Math.round(Math.min(Math.max(height / density + toolbar, 360), wa.height * 0.9));
  const win = new BrowserWindow({
    width: winW, height: winH, minWidth: 560, minHeight: 360, show: false, title: 'Captura — Clippy',
    backgroundColor: bg(), icon: path.join(ASSETS, 'icon.png'),
    webPreferences: { preload: PRELOAD, contextIsolation: true, nodeIntegration: false, spellcheck: false }
  });
  win.removeMenu();
  win.clippyEditor = { file: tmp, width, height, density };
  editors.add(win);
  win.loadFile(path.join(RENDERER, 'editor.html'));
  win.once('ready-to-show', () => { win.center(); win.show(); win.focus(); });
  win.on('closed', () => { editors.delete(win); try { fs.unlinkSync(tmp); } catch {} });
  return win;
}

function captureFileName() {
  const d = new Date();
  const p = n => String(n).padStart(2, '0');
  return `Captura ${p(d.getDate())}-${p(d.getMonth() + 1)}-${d.getFullYear()} a las ${p(d.getHours())}.${p(d.getMinutes())}.${p(d.getSeconds())}.png`;
}

// ---------------- Snippets ----------------
function openSnippets() {
  if (snippetsWin && !snippetsWin.isDestroyed()) { snippetsWin.show(); snippetsWin.focus(); return; }
  snippetsWin = new BrowserWindow({
    width: 680, height: 440, minWidth: 580, minHeight: 360, show: false, title: 'Snippets — Clippy',
    backgroundColor: bg(), icon: path.join(ASSETS, 'icon.png'),
    webPreferences: { preload: PRELOAD, contextIsolation: true, nodeIntegration: false }
  });
  snippetsWin.removeMenu();
  snippetsWin.loadFile(path.join(RENDERER, 'snippets.html'));
  snippetsWin.once('ready-to-show', () => { snippetsWin.show(); snippetsWin.focus(); });
  snippetsWin.on('closed', () => { snippetsWin = null; });
  if (!keyboard.started) hud('Los snippets no están activos (no se pudo escuchar el teclado)');
}

async function snippetReplace(deleteCount, expansion) {
  await keyboard.injecting(async () => {
    await sleep(30); // que la última tecla del atajo llegue primero a la app
    await keyboard.waitModifiersReleased(800);
    keyboard.backspaces(deleteCount);
    const snap = await monitor.snapshot();
    await monitor.writeTextSilently(expansion);
    await sleep(40);
    keyboard.pasteShortcut();
    await sleep(350); // dejar que el pegado aterrice antes de restaurar
    await monitor.restore(snap);
  }, 300);
}

// ---------------- Mantener despierto ----------------
function toggleKeepAwake() {
  if (awakeId !== null && powerSaveBlocker.isStarted(awakeId)) {
    powerSaveBlocker.stop(awakeId); awakeId = null;
    hud('Modo normal');
  } else {
    awakeId = powerSaveBlocker.start('prevent-display-sleep');
    hud('☕ PC despierto');
  }
  refreshTray();
}
const isAwake = () => awakeId !== null && powerSaveBlocker.isStarted(awakeId);

// ---------------- Iniciar con Windows ----------------
const loginSupported = () => app.isPackaged && (isWin || isMac);
const isLaunchAtLogin = () => loginSupported() && app.getLoginItemSettings().openAtLogin;
function toggleLaunchAtLogin() {
  if (!loginSupported()) { hud('Solo disponible en la app instalada'); return; }
  app.setLoginItemSettings({ openAtLogin: !isLaunchAtLogin() });
  refreshTray();
}

// ---------------- Bandeja ----------------
function trayImage() {
  const awake = isAwake();
  if (isMac) {
    const img = nativeImage.createFromPath(path.join(ASSETS, awake ? 'trayAwakeTemplate.png' : 'trayTemplate.png'));
    img.setTemplateImage(true);
    return img;
  }
  const dark = nativeTheme.shouldUseDarkColorsForSystemIntegratedUI;
  return nativeImage.createFromPath(path.join(ASSETS, `tray-${dark ? 'dark' : 'light'}${awake ? '-awake' : ''}.ico`));
}

function createTray() {
  tray = new Tray(trayImage());
  tray.on('click', () => toggleHistory());
  refreshTray();
}

function refreshTray() {
  if (!tray) return;
  tray.setImage(trayImage());
  tray.setToolTip(isAwake() ? 'Clippy — PC despierto' : 'Clippy');
  const s = SHORTCUTS;
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Clippy — Utilidades', enabled: false },
    { type: 'separator' },
    { label: `Abrir historial (${s.history.label})`, click: () => showHistory() },
    { label: `Captura anotable (${s.annotate.label})`, click: () => runCapture('annotate') },
    { label: `Copiar texto de pantalla — OCR (${s.ocr.label})`, click: () => runCapture('ocr') },
    { label: `Calculadora (${s.calculator.label})`, click: () => showCalculator() },
    { label: 'Snippets…', click: () => openSnippets() },
    { label: 'Mantener despierto', type: 'checkbox', checked: isAwake(), click: () => toggleKeepAwake() },
    { type: 'separator' },
    { label: 'Limpiar historial (conserva pineados)', click: () => history.clearUnpinned() },
    { label: isWin ? 'Iniciar con Windows' : 'Iniciar con el sistema', type: 'checkbox', checked: isLaunchAtLogin(), enabled: loginSupported(), click: () => toggleLaunchAtLogin() },
    { label: 'Abrir carpeta de datos', click: () => shell.openPath(DATA) },
    { type: 'separator' },
    { label: `Acerca de Clippy (versión ${app.getVersion()})`, click: () => showAbout() },
    { label: 'Salir de Clippy', click: () => { quitting = true; app.quit(); } }
  ]));
}

function showAbout() {
  dialog.showMessageBox({
    type: 'info', title: 'Acerca de Clippy', icon: nativeImage.createFromPath(path.join(ASSETS, 'icon.png')),
    message: `Clippy ${app.getVersion()}`,
    detail: 'Historial del portapapeles, capturas anotables, OCR, calculadora natural, snippets y mantener despierto.\n\nTodo funciona 100 % local, sin conexión a internet.\n\nDatos: ' + DATA,
    buttons: ['Cerrar']
  });
}

// ---------------- Atajos globales ----------------
function registerShortcuts() {
  const handlers = {
    history: () => toggleHistory(),
    annotate: () => runCapture('annotate'),
    ocr: () => runCapture('ocr'),
    calculator: () => toggleCalculator()
  };
  const failed = [];
  for (const [key, { accel, label }] of Object.entries(SHORTCUTS)) {
    let ok = false;
    try { ok = globalShortcut.register(accel, handlers[key]); } catch (e) { log('shortcut error', accel, String(e)); }
    if (!ok) failed.push(label);
    log('shortcut', accel, ok ? 'ok' : 'FAILED');
  }
  if (failed.length) notify('Atajo no disponible', `No se pudo registrar ${failed.join(', ')}: otra app ya lo está usando. Usa el menú de la bandeja.`);
}

function notify(title, body) {
  try { if (Notification.isSupported()) new Notification({ title, body, icon: path.join(ASSETS, 'icon.png') }).show(); } catch (e) { log('notify error', String(e)); }
}

// ---------------- IPC ----------------
function setupIpc() {
  ipcMain.handle('history:list', () => history.toView());
  ipcMain.on('history:commit', (_e, action, id) => commitHistory(action, id).catch(err => log('commit error', String(err))));
  ipcMain.on('history:pin', (_e, id) => history.togglePin(id));
  ipcMain.on('history:delete', (_e, id) => history.delete(id));
  ipcMain.on('history:hide', () => hideHistory());

  ipcMain.on('calc:hide', () => hideCalculator());
  ipcMain.on('calc:copy', async (_e, text) => { hideCalculator(); if (typeof text === 'string' && text) await copyTextToHistory(text); });

  ipcMain.handle('editor:init', e => {
    const win = BrowserWindow.fromWebContents(e.sender);
    const info = win && win.clippyEditor;
    if (!info) return null;
    return { url: pathToFileURL(info.file).href, width: info.width, height: info.height, density: info.density };
  });
  ipcMain.handle('editor:export', async (e, action, arrayBuffer) => {
    const img = nativeImage.createFromBuffer(Buffer.from(arrayBuffer));
    if (img.isEmpty()) { hud('Error al exportar'); return false; }
    if (action === 'copy') { await copyImageToHistory(img); hud('✓ Imagen copiada'); return true; }
    if (action === 'save') {
      const file = path.join(app.getPath('desktop'), captureFileName());
      try { fs.writeFileSync(file, Buffer.from(arrayBuffer)); hud('✓ Guardada en el Escritorio'); log('saved', file); return file; }
      catch (err) { log('save error', String(err)); hud('Error al guardar'); return false; }
    }
    return false;
  });
  ipcMain.on('editor:close', e => { const w = BrowserWindow.fromWebContents(e.sender); if (w) w.close(); });

  ipcMain.handle('snippets:list', () => snippetStore.list());
  ipcMain.handle('snippets:save', (_e, s) => snippetStore.upsert(s || {}));
  ipcMain.handle('snippets:delete', (_e, id) => { snippetStore.delete(id); return true; });
  ipcMain.handle('app:info', () => ({ version: app.getVersion(), hookActive: keyboard.started, platform: process.platform }));
}

// ---------------- Arranque ----------------
app.on('second-instance', () => { if (app.isReady()) { hud('Clippy ya está abierto'); showHistory(); } });
app.on('window-all-closed', () => { /* app de bandeja: seguir viva */ });
app.on('before-quit', () => { quitting = true; });
app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  try { keyboard && keyboard.stop(); } catch {}
  try { helper && helper.stop(); } catch {}
  try { monitor && monitor.stop(); } catch {}
  try { history && history.flush(); } catch {}
  try { ocr && ocr.terminate(); } catch {}
});

// Errores de consola de los renderers → log (diagnóstico)
app.on('web-contents-created', (_e, wc) => {
  wc.on('console-message', (ev, ...rest) => {
    const level = ev && ev.level !== undefined ? ev.level : rest[0];
    const message = ev && ev.message !== undefined ? ev.message : rest[1];
    if (level === 'error' || level === 'warning' || level === 3 || level === 2 || process.env.CLIPPY_DEV_OPEN) log('renderer', String(level), String(message).slice(0, 500));
  });
  wc.on('preload-error', (_ev, p, err) => log('preload-error', p, String(err)));
  wc.on('render-process-gone', (_ev, d) => log('render-process-gone', JSON.stringify(d)));
  // Ninguna ventana navega fuera de los archivos locales
  wc.on('will-navigate', (ev, url) => { if (!url.startsWith('file://')) ev.preventDefault(); });
  wc.setWindowOpenHandler(() => ({ action: 'deny' }));
});

app.whenReady().then(() => {
  if (isMac && app.dock) app.dock.hide();
  settings = new Settings(DATA);
  history = new History({ dir: DATA, settings, nativeImage });
  history.on('changed', () => { if (historyWin && !historyWin.isDestroyed()) historyWin.webContents.send('history:update', history.toView()); });

  helper = new WinHelper(log);
  helper.on('foreground', st => {
    if (snippetEngine) snippetEngine.reset(); // cambio de ventana/app → reiniciar buffer
    const shellClasses = ['Shell_TrayWnd', 'Shell_SecondaryTrayWnd', 'NotifyIconOverflowWindow', 'TopLevelWindowForOverflowXamlIsland', 'XamlExplorerHostIslandWindow', 'Windows.UI.Core.CoreWindow', 'Progman', 'WorkerW'];
    if (st.pid && st.pid !== process.pid && st.hwnd !== '0' && !shellClasses.includes(st.cls)) lastExternalHwnd = st.hwnd;
  });
  helper.start();

  monitor = new ClipboardMonitor({ history, helper, log });
  monitor.start().catch(err => log('monitor start error', String(err)));

  keyboard = new Keyboard(log);
  snippetStore = new SnippetStore(DATA);
  snippetEngine = new SnippetEngine({
    store: snippetStore, keyboard, log,
    getLayout: () => (helper.state ? helper.state.hkl : null),
    replace: snippetReplace
  });
  if (process.env.CLIPPY_NO_HOOK !== '1') keyboard.start();

  capture = new CaptureService({ preload: PRELOAD, rendererDir: RENDERER, log });
  ocr = new OcrService({ langPath: TESSDATA, log });

  setupIpc();
  createHud();
  createHistoryWindow();
  createCalculatorWindow();
  createTray();
  registerShortcuts();

  nativeTheme.on('updated', () => {
    for (const w of BrowserWindow.getAllWindows()) if (w !== hudWin && !w.isDestroyed()) w.setBackgroundColor(bg());
    refreshTray();
  });

  log('Clippy started', app.getVersion(), process.platform, process.arch, `ocr=${ocr.available()}`, `hook=${keyboard.started}`, `data=${DATA}`);

  // Autoprueba de OCR (también en la app empaquetada; la usa el smoke test de CI):
  //   CLIPPY_OCR_SELFTEST=<ruta a un PNG>  → escribe "OCR selftest: <texto>" en clippy.log
  if (process.env.CLIPPY_OCR_SELFTEST) {
    const t0 = Date.now();
    ocr.recognize(fs.readFileSync(process.env.CLIPPY_OCR_SELFTEST))
      .then(text => log('OCR selftest:', JSON.stringify(text), `${Date.now() - t0}ms`))
      .catch(err => log('OCR selftest error', String(err && err.stack || err)));
  }

  // Pruebas end-to-end en desarrollo (no se empaqueta la carpeta test/)
  if (!app.isPackaged && process.env.CLIPPY_E2E) {
    require(path.join(ROOT, 'test', 'e2e.js'))({
      log, history, monitor, snippetStore, snippetEngine, capture, keyboard,
      get historyWin() { return historyWin; }, get calcWin() { return calcWin; }, get snippetsWin() { return snippetsWin; },
      editors, showHistory, showCalculator, openSnippets, openEditor, runCapture, toggleKeepAwake, isAwake
    });
  }

  // Diagnóstico en desarrollo: CLIPPY_DEV_OPEN=history,calculator,snippets,editor,hud
  const devOpen = (process.env.CLIPPY_DEV_OPEN || '').split(',').filter(Boolean);
  if (devOpen.length) {
    setTimeout(() => {
      if (devOpen.includes('history')) { history.addText('Texto de prueba de Clippy — señor Muñoz'); showHistory(); }
      if (devOpen.includes('calculator')) showCalculator();
      if (devOpen.includes('snippets')) openSnippets();
      if (devOpen.includes('hud')) hud('✓ Texto copiado');
      if (devOpen.includes('editor')) {
        const img = nativeImage.createFromPath(path.join(ROOT, 'test', 'fixtures', 'ocr-es-2x.png'));
        if (!img.isEmpty()) openEditor(img, 2);
      }
      if (devOpen.includes('ocr')) {
        const img = nativeImage.createFromPath(path.join(ROOT, 'test', 'fixtures', 'ocr-es.png'));
        runOcr({ image: img, scaleFactor: 1 });
      }
    }, 800);
    // CLIPPY_DEV_SNAPSHOT=<carpeta>: guarda una imagen de cada ventana visible (revisión visual)
    const snapDir = process.env.CLIPPY_DEV_SNAPSHOT;
    if (snapDir) setTimeout(async () => {
      fs.mkdirSync(snapDir, { recursive: true });
      for (const w of BrowserWindow.getAllWindows()) {
        if (w.isDestroyed() || !w.isVisible()) continue;
        try {
          const img = await w.webContents.capturePage();
          const name = path.basename(w.webContents.getURL().split('?')[0]).replace('.html', '');
          fs.writeFileSync(path.join(snapDir, `${name}.png`), img.toPNG());
          log('snapshot', name, JSON.stringify(img.getSize()));
        } catch (e) { log('snapshot error', String(e)); }
      }
    }, 3000);
  }
});
