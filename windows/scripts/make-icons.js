// Genera los íconos de Clippy para Windows. Ejecutar con Electron (usa nativeImage):
//   npx electron scripts/make-icons.js
// - build/icon.ico (16–256) y build/icon.png a partir del ícono oficial ../Resources/AppIcon-1024.png
// - assets/tray-*.ico / .png: clip monocromo (claro/oscuro, normal/despierto) dibujado aquí
const { app, nativeImage } = require('electron');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SOURCE_ICON = path.join(ROOT, '..', 'Resources', 'AppIcon-1024.png');
const BUILD = path.join(ROOT, 'build');
const ASSETS = path.join(ROOT, 'assets');

// ---------- ICO (entradas PNG, válido desde Windows Vista) ----------
function makeIco(pngs) { // [{size, buf}]
  const header = Buffer.alloc(6 + 16 * pngs.length);
  header.writeUInt16LE(0, 0); header.writeUInt16LE(1, 2); header.writeUInt16LE(pngs.length, 4);
  let offset = header.length;
  pngs.forEach(({ size, buf }, i) => {
    const e = 6 + i * 16;
    header.writeUInt8(size >= 256 ? 0 : size, e);
    header.writeUInt8(size >= 256 ? 0 : size, e + 1);
    header.writeUInt8(0, e + 2); header.writeUInt8(0, e + 3);
    header.writeUInt16LE(1, e + 4); header.writeUInt16LE(32, e + 6);
    header.writeUInt32LE(buf.length, e + 8); header.writeUInt32LE(offset, e + 12);
    offset += buf.length;
  });
  return Buffer.concat([header, ...pngs.map(p => p.buf)]);
}

// ---------- Clip (glifo) por distancia a una polilínea ----------
function clipPolyline() {
  const pts = [];
  const line = (x1, y1, x2, y2) => { for (let t = 0; t <= 1; t += 0.02) pts.push([x1 + (x2 - x1) * t, y1 + (y2 - y1) * t]); };
  const arc = (cx, cy, r, a0, a1) => { const n = 40; for (let k = 0; k <= n; k++) { const a = a0 + (a1 - a0) * k / n; pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]); } };
  // Clip vertical (y hacia abajo): tres tramos rectos unidos por semicírculos
  line(0.55, 0.32, 0.55, 0.68);
  arc(0.475, 0.68, 0.075, 0, Math.PI);
  line(0.40, 0.68, 0.40, 0.22);
  arc(0.525, 0.22, 0.125, Math.PI, 2 * Math.PI);
  line(0.65, 0.22, 0.65, 0.76);
  arc(0.475, 0.76, 0.175, 0, Math.PI);
  line(0.30, 0.76, 0.30, 0.36);
  // Rotar 40° alrededor del centro y centrar
  const ang = 40 * Math.PI / 180, c = Math.cos(ang), s = Math.sin(ang);
  const rot = pts.map(([x, y]) => [0.5 + (x - 0.5) * c - (y - 0.5) * s, 0.5 + (x - 0.5) * s + (y - 0.5) * c]);
  const xs = rot.map(p => p[0]), ys = rot.map(p => p[1]);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const scale = 0.84 / Math.max(maxX - minX, maxY - minY);
  return rot.map(([x, y]) => [0.5 + (x - (minX + maxX) / 2) * scale, 0.5 + (y - (minY + maxY) / 2) * scale]);
}

function distToSeg(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const len2 = dx * dx + dy * dy || 1e-12;
  let t = ((px - ax) * dx + (py - ay) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  const qx = ax + t * dx - px, qy = ay + t * dy - py;
  return Math.sqrt(qx * qx + qy * qy);
}

// Devuelve nativeImage RGBA (bitmap BGRA) del clip; badge = punto de "despierto"
function renderGlyph(size, rgb, { badge = null } = {}) {
  const poly = clipPolyline().map(([x, y]) => [x * size, y * size]);
  const stroke = Math.max(1.35, size * 0.095);
  const buf = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const px = x + 0.5, py = y + 0.5;
      let d = Infinity;
      for (let i = 1; i < poly.length; i++) {
        const dd = distToSeg(px, py, poly[i - 1][0], poly[i - 1][1], poly[i][0], poly[i][1]);
        if (dd < d) d = dd;
      }
      let a = Math.max(0, Math.min(1, stroke / 2 - d + 0.5));
      let col = rgb;
      if (badge) {
        const r = size * 0.24, cx = size - r - 0.2, cy = size - r - 0.2;
        const db = Math.hypot(px - cx, py - cy);
        const ring = Math.max(0, Math.min(1, r + 1.2 - db)); // borde transparente que separa
        if (ring > 0) a = a * (1 - ring);
        const ab = Math.max(0, Math.min(1, r - db + 0.5));
        if (ab > 0) { a = Math.max(a, ab); col = badge; }
      }
      const o = (y * size + x) * 4;
      buf[o] = col[2]; buf[o + 1] = col[1]; buf[o + 2] = col[0]; buf[o + 3] = Math.round(a * 255);
    }
  }
  return nativeImage.createFromBitmap(buf, { width: size, height: size });
}

app.whenReady().then(() => {
  fs.mkdirSync(BUILD, { recursive: true });
  fs.mkdirSync(ASSETS, { recursive: true });

  // 1) Ícono de la app desde el PNG oficial (no se modifica el original)
  const src = nativeImage.createFromPath(SOURCE_ICON);
  if (src.isEmpty()) throw new Error('No se pudo leer ' + SOURCE_ICON);
  const sizes = [16, 20, 24, 32, 40, 48, 64, 128, 256];
  const appPngs = sizes.map(size => ({ size, buf: src.resize({ width: size, height: size, quality: 'best' }).toPNG() }));
  fs.writeFileSync(path.join(BUILD, 'icon.ico'), makeIco(appPngs));
  fs.writeFileSync(path.join(BUILD, 'icon.png'), src.resize({ width: 512, height: 512, quality: 'best' }).toPNG());
  fs.writeFileSync(path.join(ASSETS, 'icon.png'), src.resize({ width: 256, height: 256, quality: 'best' }).toPNG());

  // 2) Bandeja: glifo monocromo. "dark" = barra de tareas oscura → clip blanco.
  const variants = {
    'tray-dark': { rgb: [255, 255, 255] },
    'tray-light': { rgb: [28, 28, 30] },
    'tray-dark-awake': { rgb: [255, 255, 255], badge: [251, 191, 36] },
    'tray-light-awake': { rgb: [28, 28, 30], badge: [217, 119, 6] }
  };
  const traySizes = [16, 20, 24, 32, 40, 48];
  for (const [name, v] of Object.entries(variants)) {
    const pngs = traySizes.map(size => ({ size, buf: renderGlyph(size, v.rgb, { badge: v.badge }).toPNG() }));
    fs.writeFileSync(path.join(ASSETS, name + '.ico'), makeIco(pngs));
  }
  // macOS (solo desarrollo): plantillas
  for (const [name, badge] of [['trayTemplate', null], ['trayAwakeTemplate', [0, 0, 0]]]) {
    fs.writeFileSync(path.join(ASSETS, name + '.png'), renderGlyph(16, [0, 0, 0], { badge }).toPNG());
    fs.writeFileSync(path.join(ASSETS, name + '@2x.png'), renderGlyph(32, [0, 0, 0], { badge }).toPNG());
  }
  console.log('Íconos generados en build/ y assets/');
  app.quit();
}).catch(err => { console.error(err); process.exit(1); });
