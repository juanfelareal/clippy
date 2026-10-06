// Pruebas end-to-end dentro de la app real (solo desarrollo):
//   CLIPPY_E2E=1 CLIPPY_NO_HOOK=1 npx electron .
// Maneja las ventanas reales con IPC + eventos de teclado/mouse sintéticos y verifica resultados.
const { app, clipboard, ClipboardItem, nativeImage, BrowserWindow } = require('electron');
// API asíncrona del portapapeles (Electron 44+)
async function readImage() {
  const items = await clipboard.read();
  const t = items[0] && items[0].types.find(x => x.startsWith('image/'));
  if (!t) return nativeImage.createEmpty();
  return nativeImage.createFromBuffer(Buffer.from(await (await items[0].getType(t)).arrayBuffer()));
}
const writeImage = img => clipboard.write([new ClipboardItem({ 'image/png': new Blob([img.toPNG()], { type: 'image/png' }) })]);
const fs = require('fs');
const path = require('path');

const sleep = ms => new Promise(r => setTimeout(r, ms));

module.exports = function e2e(c) {
  const results = [];
  const check = (name, ok, detail = '') => { results.push({ name, ok }); c.log(`E2E ${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`); };
  const js = (win, code) => win.webContents.executeJavaScript(code, true);
  const key = (win, keyCode, modifiers = []) => {
    win.webContents.sendInputEvent({ type: 'keyDown', keyCode, modifiers });
    win.webContents.sendInputEvent({ type: 'keyUp', keyCode, modifiers });
  };
  const ready = win => new Promise(r => (win.webContents.isLoading() ? win.webContents.once('did-finish-load', r) : r()));

  async function run() {
    const userClipboard = await clipboard.readText(); // se restaura al final
    await sleep(1200);

    // ---- Monitor del portapapeles ----
    const before = c.history.items.length;
    await clipboard.writeText('externo E2E 123');
    await sleep(1300);
    check('monitor captura texto externo', c.history.items[0] && c.history.items[0].text === 'externo E2E 123');
    await c.monitor.writeTextSilently('escritura propia E2E');
    await sleep(1300);
    check('escrituras propias no entran al historial', !c.history.items.some(i => i.text === 'escritura propia E2E'));
    const img = nativeImage.createFromPath(path.join(__dirname, 'fixtures', 'ocr-es.png'));
    await writeImage(img);
    await sleep(1500);
    check('monitor captura imagen', c.history.items[0] && c.history.items[0].kind === 'image', JSON.stringify(c.history.items[0] && c.history.items[0].kind));
    await clipboard.writeText('externo E2E 123');
    await sleep(1300);
    check('dedup: re-copiar sube el item sin duplicar', c.history.items.filter(i => i.text === 'externo E2E 123').length === 1 && c.history.items[0].text === 'externo E2E 123');
    void before;

    // ---- Calculadora ----
    await ready(c.calcWin);
    c.showCalculator();
    await sleep(400);
    await js(c.calcWin, `(() => { const i = document.getElementById('in'); i.value = '1.500.000 + 19%'; i.dispatchEvent(new Event('input')); })()`);
    const out = await js(c.calcWin, `document.getElementById('out').textContent`);
    check('calculadora muestra 1.785.000', out === '1.785.000', out);
    key(c.calcWin, 'Enter');
    await sleep(500);
    check('Enter copia el resultado', (await clipboard.readText()) === '1.785.000', (await clipboard.readText()));
    check('resultado entra al historial', c.history.items[0] && c.history.items[0].text === '1.785.000');
    check('calculadora se cierra tras Enter', !c.calcWin.isVisible());

    // ---- Historial ----
    c.history.addText('Factura del señor Muñoz');
    await ready(c.historyWin);
    c.showHistory();
    await sleep(500);
    const rows = await js(c.historyWin, `document.querySelectorAll('.row').length`);
    check('panel lista los items', rows === c.history.items.length, `${rows}/${c.history.items.length}`);
    await js(c.historyWin, `(() => { const q = document.getElementById('q'); q.value = 'munoz'; q.dispatchEvent(new Event('input')); })()`);
    await sleep(100);
    const found = await js(c.historyWin, `[...document.querySelectorAll('.row .text')].map(e => e.textContent)`);
    check('búsqueda sin tildes encuentra "Muñoz"', found.length >= 1 && found.every(t => /Muñoz/.test(t)), JSON.stringify(found));
    await js(c.historyWin, `(() => { const q = document.getElementById('q'); q.value = 'fctmz'; q.dispatchEvent(new Event('input')); })()`);
    await sleep(100);
    const fuzzy = await js(c.historyWin, `[...document.querySelectorAll('.row .text')].map(e => e.textContent)`);
    check('búsqueda fuzzy', fuzzy.includes('Factura del señor Muñoz'), JSON.stringify(fuzzy));
    await js(c.historyWin, `(() => { const q = document.getElementById('q'); q.value = ''; q.dispatchEvent(new Event('input')); })()`);
    key(c.historyWin, 'Down');
    key(c.historyWin, 'P', ['alt']);
    await sleep(300);
    const second = c.history.items.find(i => i.pinned);
    check('Alt+P pinea el item seleccionado', !!second, second && (second.text || second.kind));
    check('pineados van primero', c.history.items[0].pinned === true);
    key(c.historyWin, 'Up');
    key(c.historyWin, 'Enter', ['alt']); // solo copiar el primero (pineado)
    await sleep(500);
    check('Alt+Enter copia (sin pegar)', (await clipboard.readText()) === (c.history.items[0].text || ''), (await clipboard.readText()));
    check('panel se oculta tras commit', !c.historyWin.isVisible());
    const pinnedId = c.history.items[0].id;
    c.history.togglePin(pinnedId);
    const countBefore = c.history.items.length;
    c.showHistory();
    await sleep(400);
    key(c.historyWin, 'Backspace', ['alt']);
    await sleep(300);
    check('Alt+Backspace borra', c.history.items.length === countBefore - 1);
    key(c.historyWin, 'Escape');
    await sleep(200);
    check('Esc cierra el panel', !c.historyWin.isVisible());
    // Ctrl+2 (selección rápida → copia el segundo; el pegado se intercepta)
    const origPaste = c.keyboard.pasteShortcut.bind(c.keyboard);
    let pasted = 0;
    c.keyboard.pasteShortcut = () => { pasted++; return true; };
    c.showHistory();
    await sleep(400);
    const secondText = c.history.items[1] && c.history.items[1].text;
    key(c.historyWin, '2', ['control']);
    await sleep(900);
    check('Ctrl+2 copia y pega el segundo item', (await clipboard.readText()) === secondText && pasted === 1, `${pasted}`);
    c.keyboard.pasteShortcut = origPaste;

    // ---- Snippets ----
    c.openSnippets();
    await sleep(300);
    const sw = c.snippetsWin;
    await ready(sw); await sleep(300);
    await js(sw, `(() => { const t = document.getElementById('trigger'); t.value = 'NIT X'; t.dispatchEvent(new Event('input')); const e = document.getElementById('expansion'); e.value = 'algo'; e.dispatchEvent(new Event('input')); document.getElementById('save').click(); })()`);
    await sleep(300);
    const err = await js(sw, `document.getElementById('error').textContent`);
    check('valida atajo inválido', /Atajo inválido/.test(err), err);
    await js(sw, `(() => { const t = document.getElementById('trigger'); t.value = 'nite2e'; t.dispatchEvent(new Event('input')); const e = document.getElementById('expansion'); e.value = 'NIT 900.123.456-7\\nLínea 2'; e.dispatchEvent(new Event('input')); document.getElementById('save').click(); })()`);
    await sleep(400);
    check('crea snippet multilínea', c.snippetStore.snippets.some(s => s.trigger === 'nite2e' && s.expansion.includes('\n')));
    await js(sw, `(() => { const t = document.getElementById('trigger'); t.value = 'nit'; t.dispatchEvent(new Event('input')); const e = document.getElementById('expansion'); e.value = 'x'; e.dispatchEvent(new Event('input')); document.getElementById('save').click(); })()`);
    await sleep(300);
    const err2 = await js(sw, `document.getElementById('error').textContent`);
    check('rechaza atajo que es prefijo de otro', /Choca con \/\/nite2e/.test(err2), err2);
    // Motor: simular //nite2e en distribución española, con reemplazo interceptado
    let replaced = null;
    const origReplace = c.snippetEngine.replace;
    c.snippetEngine.replace = async (n, exp) => { replaced = [n, exp]; };
    const k = (keycode, shiftKey = false) => c.keyboard.emit('key', { keycode, shiftKey, ctrlKey: false, altKey: false, metaKey: false });
    k(53); k(53); [49, 23, 20, 18, 3, 18].forEach(x => k(x)); // "//nite2e" con tecla Slash (layout desconocido en Mac)
    await sleep(50);
    check('motor detecta //nite2e', replaced && replaced[0] === 8 && replaced[1].startsWith('NIT 900'), JSON.stringify(replaced));
    c.snippetEngine.replace = origReplace;
    const sid = c.snippetStore.snippets.find(s => s.trigger === 'nite2e').id;
    c.snippetStore.delete(sid);
    sw.close();

    // ---- Editor de anotaciones ----
    const big = nativeImage.createFromPath(path.join(__dirname, 'fixtures', 'ocr-es-2x.png'));
    const ew = c.openEditor(big, 2);
    await ready(ew); await sleep(800);
    const box = await js(ew, `(() => { const r = document.getElementById('canvas').getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; })()`);
    const drag = async (x1, y1, x2, y2) => {
      ew.webContents.sendInputEvent({ type: 'mouseDown', x: Math.round(x1), y: Math.round(y1), button: 'left', clickCount: 1 });
      for (let i = 1; i <= 6; i++) { ew.webContents.sendInputEvent({ type: 'mouseMove', x: Math.round(x1 + (x2 - x1) * i / 6), y: Math.round(y1 + (y2 - y1) * i / 6), button: 'left' }); await sleep(16); }
      ew.webContents.sendInputEvent({ type: 'mouseUp', x: Math.round(x2), y: Math.round(y2), button: 'left', clickCount: 1 });
      await sleep(60);
    };
    const tool = async id => { await js(ew, `document.querySelector('[data-tool="${id}"]').click()`); };
    await tool('rect'); await drag(box.x + 20, box.y + 20, box.x + 200, box.y + 80);
    await tool('arrow'); await drag(box.x + 300, box.y + 150, box.x + 220, box.y + 60);
    await tool('pen'); await drag(box.x + 40, box.y + 150, box.x + 160, box.y + 170);
    await tool('blur'); await drag(box.x + box.w * 0.5, box.y + 10, box.x + box.w * 0.9, box.y + box.h * 0.4);
    let n = await js(ew, `document.getElementById('undo').disabled`);
    check('anotaciones creadas (deshacer activo)', n === false);
    await tool('text');
    ew.webContents.sendInputEvent({ type: 'mouseDown', x: Math.round(box.x + 30), y: Math.round(box.y + box.h - 40), button: 'left', clickCount: 1 });
    ew.webContents.sendInputEvent({ type: 'mouseUp', x: Math.round(box.x + 30), y: Math.round(box.y + box.h - 40), button: 'left', clickCount: 1 });
    await sleep(200);
    await js(ew, `(() => { const t = document.getElementById('textInput'); t.value = 'Ojo aquí'; })()`);
    key(ew, 'Enter');
    await sleep(100);
    // Ctrl+Z quita el texto, luego se vuelve a poner para el export
    key(ew, 'Z', ['control']);
    await sleep(100);
    await tool('text');
    ew.webContents.sendInputEvent({ type: 'mouseDown', x: Math.round(box.x + 30), y: Math.round(box.y + box.h - 40), button: 'left', clickCount: 1 });
    ew.webContents.sendInputEvent({ type: 'mouseUp', x: Math.round(box.x + 30), y: Math.round(box.y + box.h - 40), button: 'left', clickCount: 1 });
    await sleep(200);
    await js(ew, `document.getElementById('textInput').value = 'Ojo aquí'`);
    key(ew, 'Enter');
    await sleep(100);
    key(ew, 'C', ['control']);
    await sleep(1200);
    const copied = await readImage();
    const sz = copied.getSize();
    check('Ctrl+C exporta a resolución completa', sz.width === 1280 && sz.height === 400, JSON.stringify(sz));
    check('imagen copiada entra al historial', c.history.items[0].kind === 'image' && c.history.items[0].width === 1280);
    fs.writeFileSync(path.join(process.env.CLIPPY_E2E_OUT || app.getPath('temp'), 'e2e-annotated.png'), copied.toPNG());
    const desktop = app.getPath('desktop');
    const beforeFiles = new Set(fs.readdirSync(desktop));
    key(ew, 'S', ['control']);
    await sleep(1200);
    const newFiles = fs.readdirSync(desktop).filter(f => !beforeFiles.has(f) && /^Captura .*\.png$/.test(f));
    check('Ctrl+S guarda PNG en el Escritorio', newFiles.length === 1, newFiles.join(','));
    for (const f of newFiles) { const s = nativeImage.createFromPath(path.join(desktop, f)).getSize(); check('PNG guardado a resolución completa', s.width === 1280, JSON.stringify(s)); fs.unlinkSync(path.join(desktop, f)); }
    key(ew, 'Escape');
    await sleep(400);
    check('Esc cierra el editor', ew.isDestroyed());

    // ---- Overlay de selección (requiere permiso de Grabación de pantalla en macOS) ----
    try {
      const p = c.capture.selectRegion();
      await sleep(1500);
      const overlays = BrowserWindow.getAllWindows().filter(w => !w.isDestroyed() && /overlay\.html/.test(w.webContents.getURL()));
      check('overlay abierto por cada monitor', overlays.length >= 1, `${overlays.length}`);
      if (overlays.length) {
        const ow = overlays[0];
        ow.webContents.sendInputEvent({ type: 'mouseDown', x: 100, y: 100, button: 'left', clickCount: 1 });
        ow.webContents.sendInputEvent({ type: 'mouseMove', x: 300, y: 200, button: 'left' });
        ow.webContents.sendInputEvent({ type: 'mouseUp', x: 300, y: 200, button: 'left', clickCount: 1 });
      }
      const r = await Promise.race([p, sleep(4000).then(() => 'timeout')]);
      if (r === 'timeout') { c.capture.cancel(); check('selección de región devuelve recorte', false, 'timeout'); }
      else check('selección de región devuelve recorte (200×100 css → px nativos)', r && r.image && r.image.getSize().width === Math.round(200 * r.scaleFactor), r && JSON.stringify({ size: r.image.getSize(), scale: r.scaleFactor }));
    } catch (e) { check('captura de pantalla', false, String(e)); }

    // ---- Mantener despierto ----
    c.toggleKeepAwake();
    check('mantener despierto activa', c.isAwake());
    c.toggleKeepAwake();
    check('mantener despierto desactiva', !c.isAwake());

    await clipboard.writeText(userClipboard);
    const failed = results.filter(r => !r.ok);
    c.log(`E2E RESUMEN: ${results.length - failed.length}/${results.length} OK`);
    app.exit(failed.length ? 1 : 0);
  }

  run().catch(err => { c.log('E2E ERROR', String(err && err.stack || err)); app.exit(2); });
};
