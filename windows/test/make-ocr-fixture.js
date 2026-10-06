// Genera test/fixtures/ocr-es.png renderizando texto como se vería en pantalla (1x).
// Ejecutar: npx electron test/make-ocr-fixture.js
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');
async function render(scale, file) {
  const win = new BrowserWindow({ width: 640 * scale, height: 200 * scale, show: false, useContentSize: true, webPreferences: { offscreen: true } });
  const html = `<html><body style="margin:0;padding:${18*scale}px ${20*scale}px;background:#fff;color:#1c1c1e;font:${16*scale}px 'Segoe UI',Helvetica,Arial,sans-serif;line-height:1.5">
  <div>El señor Muñoz pidió información sobre la facturación electrónica.</div>
  <div>Año 2026: canción, corazón, pingüino y acción rápida.</div>
  <div>The quick brown fox jumps over the lazy dog.</div></body></html>`;
  await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
  await new Promise(r => setTimeout(r, 400));
  const img = await win.webContents.capturePage();
  fs.writeFileSync(path.join(__dirname, 'fixtures', file), img.toPNG());
  console.log(file, img.getSize());
  win.destroy();
}
// 1x = pantalla normal; 2x = pantalla HiDPI o la captura 1x reescalada x2 (lo que hace la app antes del OCR)
app.on('window-all-closed', () => {});
app.whenReady().then(async () => { await render(1, 'ocr-es.png'); await render(2, 'ocr-es-2x.png'); app.quit(); });
