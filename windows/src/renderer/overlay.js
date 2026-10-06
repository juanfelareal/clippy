// Overlay de selección de región (reemplaza a `screencapture -i` de macOS)
const api = window.clippy;
const $shot = document.getElementById('shot');
const $dim = document.getElementById('dim');
const $sel = document.getElementById('sel');
const $size = document.getElementById('size');
const $tip = document.getElementById('tip');
let start = null, rect = null, pxScale = 1, done = false;

api.invoke('overlay:init').then(info => {
  if (!info) return finish(null);
  $shot.src = info.url;
  pxScale = info.width / window.innerWidth;
});

function finish(payload) {
  if (done) return;
  done = true;
  api.send('overlay:done', payload);
}

function draw() {
  if (!rect) return;
  $dim.style.display = 'none';
  Object.assign($sel.style, { display: 'block', left: rect.x + 'px', top: rect.y + 'px', width: rect.w + 'px', height: rect.h + 'px' });
  $size.style.display = 'block';
  $size.textContent = `${Math.round(rect.w * pxScale)} × ${Math.round(rect.h * pxScale)}`;
  $size.style.left = Math.min(rect.x, window.innerWidth - 90) + 'px';
  $size.style.top = (rect.y + rect.h + 6 > window.innerHeight - 22 ? rect.y - 24 : rect.y + rect.h + 6) + 'px';
}

window.addEventListener('mousedown', e => {
  if (e.button !== 0) { finish(null); return; }
  start = { x: e.clientX, y: e.clientY };
  rect = { x: start.x, y: start.y, w: 0, h: 0 };
  $tip.style.display = 'none';
});
window.addEventListener('mousemove', e => {
  if (!start) return;
  rect = { x: Math.min(start.x, e.clientX), y: Math.min(start.y, e.clientY), w: Math.abs(e.clientX - start.x), h: Math.abs(e.clientY - start.y) };
  draw();
});
window.addEventListener('mouseup', () => {
  if (!start) return;
  start = null;
  if (!rect || rect.w < 3 || rect.h < 3) { rect = null; $sel.style.display = 'none'; $size.style.display = 'none'; $dim.style.display = 'block'; return; }
  finish({ x: rect.x, y: rect.y, w: rect.w, h: rect.h, vw: window.innerWidth, vh: window.innerHeight });
});
window.addEventListener('keydown', e => { if (e.key === 'Escape') finish(null); });
window.addEventListener('contextmenu', e => { e.preventDefault(); finish(null); });
