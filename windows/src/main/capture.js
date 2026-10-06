// Captura de región: congela todas las pantallas (desktopCapturer a resolución nativa, multi-monitor
// y DPI mixto), muestra un overlay a pantalla completa por monitor para arrastrar la selección y
// devuelve el recorte en píxeles reales.
const { BrowserWindow, desktopCapturer, screen, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');

class CaptureService {
  constructor({ preload, rendererDir, log = () => {} }) {
    this.preload = preload;
    this.rendererDir = rendererDir;
    this.log = log;
    this.active = null;
    ipcMain.handle('overlay:init', e => this._init(e));
    ipcMain.on('overlay:done', (e, payload) => this._done(e, payload));
  }

  get isCapturing() { return !!this.active; }

  /// Captura nativa de cada monitor → [{ display, image (nativeImage), file }]
  async grabDisplays() {
    const displays = screen.getAllDisplays();
    const native = d => ({ width: Math.round(d.bounds.width * d.scaleFactor), height: Math.round(d.bounds.height * d.scaleFactor) });
    // Una llamada por tamaño nativo distinto: la miniatura se ajusta al tamaño pedido
    const bySize = new Map();
    for (const d of displays) { const s = native(d); const k = `${s.width}x${s.height}`; if (!bySize.has(k)) bySize.set(k, s); }
    const sourcesBySize = new Map();
    for (const [k, size] of bySize) {
      sourcesBySize.set(k, await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: size, fetchWindowIcons: false }));
    }
    return displays.map((d, idx) => {
      const s = native(d);
      const sources = sourcesBySize.get(`${s.width}x${s.height}`) || [];
      const src = sources.find(x => String(x.display_id) === String(d.id)) || sources[idx] || sources[0];
      return { display: d, image: src ? src.thumbnail : null };
    });
  }

  /// Muestra los overlays y resuelve { image, scaleFactor } o null si se cancela
  async selectRegion() {
    if (this.active) return null;
    const t0 = Date.now();
    let grabs;
    try { grabs = await this.grabDisplays(); }
    catch (err) { this.log('capture failed', String(err)); throw err; }
    grabs = grabs.filter(g => g.image && !g.image.isEmpty());
    if (!grabs.length) throw new Error('No se pudo capturar la pantalla');

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'clippy-cap-'));
    grabs.forEach((g, i) => {
      g.file = path.join(tmpDir, `screen-${i}.jpg`);
      fs.writeFileSync(g.file, g.image.toJPEG(92)); // solo para mostrar; el recorte sale del original
    });
    this.log('capture grabbed', grabs.map(g => `${g.image.getSize().width}x${g.image.getSize().height}@${g.display.scaleFactor}`).join(' '), `${Date.now() - t0}ms`);

    return new Promise(resolve => {
      const windows = grabs.map((g, i) => this._overlay(g, i));
      this.active = { grabs, windows, resolve, tmpDir };
    });
  }

  _overlay(g, index) {
    const b = g.display.bounds;
    const win = new BrowserWindow({
      x: b.x, y: b.y, width: b.width, height: b.height,
      frame: false, show: false, resizable: false, movable: false, minimizable: false, maximizable: false,
      fullscreenable: false, skipTaskbar: true, alwaysOnTop: true, enableLargerThanScreen: true,
      hasShadow: false, roundedCorners: false, backgroundColor: '#000000', thickFrame: false,
      webPreferences: { preload: this.preload, contextIsolation: true, nodeIntegration: false, additionalArguments: [`--clippy-overlay=${index}`] }
    });
    win.setAlwaysOnTop(true, 'screen-saver');
    win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    win.loadFile(path.join(this.rendererDir, 'overlay.html'), { query: { i: String(index) } });
    win.once('ready-to-show', () => {
      // Con DPI mixto Windows puede re-escalar la ventana al moverla: fijar límites otra vez
      win.setBounds(b);
      win.show();
      win.setBounds(b);
      if (screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).id === g.display.id) win.focus();
    });
    return win;
  }

  _init(e) {
    if (!this.active) return null;
    const i = this.active.windows.findIndex(w => !w.isDestroyed() && w.webContents === e.sender);
    if (i < 0) return null;
    const g = this.active.grabs[i];
    const { pathToFileURL } = require('url');
    const size = g.image.getSize();
    return { url: pathToFileURL(g.file).href, width: size.width, height: size.height };
  }

  // payload: null (cancelar) o { x, y, w, h, vw, vh } en px CSS del overlay
  _done(e, payload) {
    if (!this.active) return;
    const { grabs, windows, resolve, tmpDir } = this.active;
    const i = windows.findIndex(w => !w.isDestroyed() && w.webContents === e.sender);
    this.active = null;
    for (const w of windows) if (!w.isDestroyed()) w.destroy();
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
    if (!payload || i < 0) return resolve(null);
    const g = grabs[i];
    const size = g.image.getSize();
    // Escala real imagen/ventana (robusto aunque el overlay haya quedado con otro DPI)
    const sx = size.width / payload.vw, sy = size.height / payload.vh;
    const rect = {
      x: Math.max(0, Math.round(payload.x * sx)), y: Math.max(0, Math.round(payload.y * sy)),
      width: Math.round(payload.w * sx), height: Math.round(payload.h * sy)
    };
    rect.width = Math.min(rect.width, size.width - rect.x);
    rect.height = Math.min(rect.height, size.height - rect.y);
    if (rect.width < 4 || rect.height < 4) return resolve(null);
    resolve({ image: g.image.crop(rect), scaleFactor: sx });
  }

  cancel() {
    if (!this.active) return;
    const { windows, resolve, tmpDir } = this.active;
    this.active = null;
    for (const w of windows) if (!w.isDestroyed()) w.destroy();
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
    resolve(null);
  }
}

module.exports = { CaptureService };
