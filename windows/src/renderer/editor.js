// Editor de capturas (port de AnnotationModel/Renderer/EditorView/WindowController.swift).
// Toda la geometría se guarda en píxeles de la imagen; la vista se escala para caber y el export
// se hace a resolución completa.
const api = window.clippy;

const TOOLS = [
  { id: 'arrow', label: 'Flecha', svg: '<path d="M5 19 19 5M10 5h9v9"/>' },
  { id: 'rect', label: 'Rectángulo', svg: '<rect x="4" y="6" width="16" height="12" rx="1.5"/>' },
  { id: 'pen', label: 'Lápiz', svg: '<path d="M4 20c3-1 4-4 7-7l6-6 2 2-6 6c-3 3-6 4-9 5z"/>' },
  { id: 'text', label: 'Texto', svg: '<path d="M5 6h14M12 6v13M9 19h6"/>' },
  { id: 'blur', label: 'Censurar', svg: '<path d="M3 12s3.5-6 9-6 9 6 9 6-3.5 6-9 6-9-6-9-6z"/><path d="M4 20 20 4"/>' }
];
// Mismos colores de sistema que en macOS: rojo, naranja, verde, azul, negro
const PALETTE = ['#ff3b30', '#ff9500', '#34c759', '#007aff', '#000000'];
const NOMINAL_WIDTHS = [2, 4, 7];

const $canvas = document.getElementById('canvas');
const $stage = document.getElementById('stage');
const $text = document.getElementById('textInput');
const ctx = $canvas.getContext('2d');

const doc = {
  image: null, width: 0, height: 0, density: 1,
  annotations: [], inProgress: null, pendingText: null,
  tool: 'arrow', color: PALETTE[0], strokeIndex: 1,
  blurPatches: new Map()
};
let view = { scale: 1, x: 0, y: 0, dpr: 1 };
let nextId = 1;

const lineWidth = () => NOMINAL_WIDTHS[doc.strokeIndex] * doc.density;
const fontSize = () => 18 * doc.density;

// ---------- Toolbar ----------
function buildToolbar() {
  const $tools = document.getElementById('tools');
  for (const t of TOOLS) {
    const b = document.createElement('button');
    b.className = 'tool'; b.title = t.label; b.dataset.tool = t.id;
    b.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">${t.svg}</svg>`;
    b.onclick = () => { commitPendingText(); doc.tool = t.id; syncToolbar(); };
    $tools.appendChild(b);
  }
  const $colors = document.getElementById('colors');
  PALETTE.forEach(c => {
    const b = document.createElement('button');
    b.className = 'swatch'; b.style.background = c; b.dataset.color = c; b.title = c;
    b.onclick = () => { doc.color = c; if (doc.pendingText) $text.style.color = c; syncToolbar(); };
    $colors.appendChild(b);
  });
  const $strokes = document.getElementById('strokes');
  [0, 1, 2].forEach(i => {
    const b = document.createElement('button');
    b.className = 'stroke'; b.dataset.stroke = String(i); b.title = ['Delgado', 'Medio', 'Grueso'][i];
    const s = 6 + i * 3;
    b.innerHTML = `<span style="width:${s}px;height:${s}px"></span>`;
    b.onclick = () => { doc.strokeIndex = i; syncToolbar(); };
    $strokes.appendChild(b);
  });
  document.getElementById('undo').onclick = undo;
  document.getElementById('copy').onclick = () => exportImage('copy');
  document.getElementById('save').onclick = () => exportImage('save');
  syncToolbar();
}

function syncToolbar() {
  document.querySelectorAll('.tool').forEach(b => b.classList.toggle('on', b.dataset.tool === doc.tool));
  document.querySelectorAll('.swatch').forEach(b => b.classList.toggle('on', b.dataset.color === doc.color));
  document.querySelectorAll('.stroke').forEach(b => b.classList.toggle('on', Number(b.dataset.stroke) === doc.strokeIndex));
  document.getElementById('undo').disabled = doc.annotations.length === 0;
  $canvas.classList.toggle('text', doc.tool === 'text');
}

// ---------- Geometría (igual que AnnotationRenderer.swift) ----------
function normalizedRect(a) {
  if (a.points.length < 2) return { x: 0, y: 0, w: 0, h: 0 };
  const p = a.points[0], q = a.points[a.points.length - 1];
  return { x: Math.min(p.x, q.x), y: Math.min(p.y, q.y), w: Math.abs(q.x - p.x), h: Math.abs(q.y - p.y) };
}

function clampRect(r) {
  const x0 = Math.max(0, r.x), y0 = Math.max(0, r.y);
  const x1 = Math.min(doc.width, r.x + r.w), y1 = Math.min(doc.height, r.y + r.h);
  return { x: x0, y: y0, w: Math.max(0, x1 - x0), h: Math.max(0, y1 - y0) };
}

function arrowGeometry(start, end, width) {
  const headLength = Math.max(12, width * 4);
  const angle = Math.atan2(end.y - start.y, end.x - start.x);
  const headAngle = Math.PI / 7;
  const back1 = { x: end.x - headLength * Math.cos(angle - headAngle), y: end.y - headLength * Math.sin(angle - headAngle) };
  const back2 = { x: end.x - headLength * Math.cos(angle + headAngle), y: end.y - headLength * Math.sin(angle + headAngle) };
  const lineEnd = { x: end.x - headLength * 0.6 * Math.cos(angle), y: end.y - headLength * 0.6 * Math.sin(angle) };
  return { lineEnd, back1, back2 };
}

function penPath(c, pts) {
  c.beginPath();
  if (!pts.length) return;
  c.moveTo(pts[0].x, pts[0].y);
  if (pts.length <= 2) { for (const p of pts.slice(1)) c.lineTo(p.x, p.y); return; }
  for (let i = 1; i < pts.length - 1; i++) {
    const mid = { x: (pts[i].x + pts[i + 1].x) / 2, y: (pts[i].y + pts[i + 1].y) / 2 };
    c.quadraticCurveTo(pts[i].x, pts[i].y, mid.x, mid.y);
  }
  const last = pts[pts.length - 1];
  c.lineTo(last.x, last.y);
}

// Parche pixelado del área (equivalente a CIPixellate con escala max(10, lado menor / 8))
function pixellatePatch(rect) {
  const r = clampRect(rect);
  if (r.w < 2 || r.h < 2) return null;
  const block = Math.max(10, Math.min(r.w, r.h) / 8);
  const sw = Math.max(1, Math.round(r.w / block)), sh = Math.max(1, Math.round(r.h / block));
  const small = document.createElement('canvas');
  small.width = sw; small.height = sh;
  const sc = small.getContext('2d');
  sc.imageSmoothingEnabled = true;
  sc.imageSmoothingQuality = 'high';
  sc.drawImage(doc.image, r.x, r.y, r.w, r.h, 0, 0, sw, sh);
  const patch = document.createElement('canvas');
  patch.width = Math.round(r.w); patch.height = Math.round(r.h);
  const pc = patch.getContext('2d');
  pc.imageSmoothingEnabled = false;
  pc.drawImage(small, 0, 0, sw, sh, 0, 0, patch.width, patch.height);
  return { canvas: patch, rect: r };
}

// ---------- Dibujo (coordenadas en píxeles de imagen; el contexto ya viene escalado) ----------
function drawAnnotation(c, a) {
  c.save();
  c.strokeStyle = a.color; c.fillStyle = a.color;
  c.lineWidth = a.lineWidth; c.lineCap = 'round'; c.lineJoin = 'round';
  switch (a.tool) {
    case 'arrow': {
      if (a.points.length < 2) break;
      const s = a.points[0], e = a.points[a.points.length - 1];
      const g = arrowGeometry(s, e, a.lineWidth);
      c.beginPath(); c.moveTo(s.x, s.y); c.lineTo(g.lineEnd.x, g.lineEnd.y); c.stroke();
      c.beginPath(); c.moveTo(e.x, e.y); c.lineTo(g.back1.x, g.back1.y); c.lineTo(g.back2.x, g.back2.y); c.closePath(); c.fill();
      break;
    }
    case 'rect': { const r = normalizedRect(a); c.strokeRect(r.x, r.y, r.w, r.h); break; }
    case 'pen': penPath(c, a.points); c.stroke(); break;
    case 'text': {
      if (!a.text) break;
      const p = a.points[0];
      c.font = `700 ${a.fontSize}px "Segoe UI Variable Text", "Segoe UI", system-ui, sans-serif`;
      c.textBaseline = 'top';
      a.text.split('\n').forEach((line, i) => c.fillText(line, p.x, p.y + i * a.fontSize * 1.2));
      break;
    }
  }
  c.restore();
}

function drawBlur(c, a, preview) {
  const patch = doc.blurPatches.get(a.id);
  const r = clampRect(normalizedRect(a));
  if (patch) c.drawImage(patch.canvas, patch.rect.x, patch.rect.y, patch.rect.w, patch.rect.h);
  else if (preview) { c.fillStyle = 'rgba(0,0,0,0.85)'; c.fillRect(r.x, r.y, r.w, r.h); }
}

function renderInto(c, { preview }) {
  c.drawImage(doc.image, 0, 0, doc.width, doc.height);
  for (const a of doc.annotations) if (a.tool === 'blur') drawBlur(c, a, preview);
  for (const a of doc.annotations) if (a.tool !== 'blur') drawAnnotation(c, a);
  if (preview && doc.inProgress) {
    const live = doc.inProgress;
    if (live.tool === 'blur') { const r = normalizedRect(live); c.fillStyle = 'rgba(0,0,0,0.35)'; c.fillRect(r.x, r.y, r.w, r.h); }
    else drawAnnotation(c, live);
  }
}

function layout() {
  if (!doc.image) return;
  const aw = $stage.clientWidth, ah = $stage.clientHeight;
  const scale = Math.min(aw / doc.width, ah / doc.height);
  const w = doc.width * scale, h = doc.height * scale;
  const dpr = window.devicePixelRatio || 1;
  view = { scale, x: (aw - w) / 2, y: (ah - h) / 2, dpr };
  Object.assign($canvas.style, { left: view.x + 'px', top: view.y + 'px', width: w + 'px', height: h + 'px' });
  $canvas.width = Math.max(1, Math.round(w * dpr));
  $canvas.height = Math.max(1, Math.round(h * dpr));
  repaint();
  positionTextInput();
}

function repaint() {
  if (!doc.image) return;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, $canvas.width, $canvas.height);
  ctx.setTransform(view.scale * view.dpr, 0, 0, view.scale * view.dpr, 0, 0);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  renderInto(ctx, { preview: true });
}

// ---------- Interacción ----------
function pixelPoint(e) {
  const r = $canvas.getBoundingClientRect();
  const x = (e.clientX - r.left) / view.scale, y = (e.clientY - r.top) / view.scale;
  return { x: Math.min(Math.max(x, 0), doc.width), y: Math.min(Math.max(y, 0), doc.height) };
}

let dragStart = null;
$canvas.addEventListener('pointerdown', e => {
  if (e.button !== 0 || !doc.image) return;
  const p = pixelPoint(e);
  if (doc.tool === 'text') {
    if (doc.pendingText) commitPendingText();
    else startText(p);
    e.preventDefault();
    return;
  }
  if (doc.pendingText) commitPendingText();
  $canvas.setPointerCapture(e.pointerId);
  dragStart = p;
  doc.inProgress = { id: nextId++, tool: doc.tool, points: [p, p], color: doc.color, lineWidth: lineWidth(), fontSize: fontSize() };
  repaint();
});
$canvas.addEventListener('pointermove', e => {
  if (!dragStart || !doc.inProgress) return;
  const p = pixelPoint(e);
  if (doc.inProgress.tool === 'pen') doc.inProgress.points.push(p);
  else doc.inProgress.points = [dragStart, p];
  repaint();
});
$canvas.addEventListener('pointerup', e => {
  if (!dragStart || !doc.inProgress) return;
  const p = pixelPoint(e);
  const live = doc.inProgress;
  doc.inProgress = null;
  const distance = Math.hypot(p.x - dragStart.x, p.y - dragStart.y);
  dragStart = null;
  const keep = live.tool === 'pen' ? live.points.length > 2 : distance > 3 * doc.density;
  if (keep) commit(live);
  repaint();
});

function commit(a) {
  if (a.tool === 'blur') {
    const patch = pixellatePatch(normalizedRect(a));
    if (patch) doc.blurPatches.set(a.id, patch);
  }
  doc.annotations.push(a);
  syncToolbar();
}

function undo() {
  const removed = doc.annotations.pop();
  if (removed) doc.blurPatches.delete(removed.id);
  syncToolbar();
  repaint();
}

// ---------- Texto ----------
function startText(p) {
  doc.pendingText = { anchor: p };
  $text.value = '';
  $text.style.color = doc.color;
  $text.style.display = 'block';
  positionTextInput();
  setTimeout(() => $text.focus(), 0);
}

function positionTextInput() {
  if (!doc.pendingText) return;
  const px = Math.max(12, fontSize() * view.scale);
  $text.style.fontSize = px + 'px';
  $text.style.left = (view.x + doc.pendingText.anchor.x * view.scale - 7) + 'px';
  $text.style.top = (view.y + doc.pendingText.anchor.y * view.scale - 3) + 'px';
}

function commitPendingText() {
  if (!doc.pendingText) return;
  const text = $text.value;
  if (text.trim()) {
    commit({ id: nextId++, tool: 'text', points: [doc.pendingText.anchor], color: doc.color, lineWidth: lineWidth(), text, fontSize: fontSize() });
  }
  cancelText();
  repaint();
}

function cancelText() {
  doc.pendingText = null;
  $text.style.display = 'none';
  $text.blur();
}

$text.addEventListener('keydown', e => {
  if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); commitPendingText(); }
  else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); cancelText(); }
});

// ---------- Export a resolución completa ----------
let exporting = false;
async function exportImage(action) {
  if (exporting || !doc.image) return;
  commitPendingText();
  exporting = true;
  try {
    const out = document.createElement('canvas');
    out.width = doc.width; out.height = doc.height;
    const c = out.getContext('2d');
    renderInto(c, { preview: false });
    const blob = await new Promise(r => out.toBlob(r, 'image/png'));
    const buf = await blob.arrayBuffer();
    await api.invoke('editor:export', action, buf);
  } finally { exporting = false; }
}

// ---------- Teclado ----------
document.addEventListener('keydown', e => {
  if (document.activeElement === $text) return;
  const ctrl = e.ctrlKey || e.metaKey;
  if (e.key === 'Escape') { e.preventDefault(); if (doc.pendingText) cancelText(); else api.send('editor:close'); }
  else if (ctrl && e.code === 'KeyZ') { e.preventDefault(); undo(); }
  else if (ctrl && e.code === 'KeyC') { e.preventDefault(); exportImage('copy'); }
  else if (ctrl && e.code === 'KeyS') { e.preventDefault(); exportImage('save'); }
  else if (ctrl && e.code === 'KeyW') { e.preventDefault(); api.send('editor:close'); }
});

window.addEventListener('resize', layout);

// ---------- Init ----------
buildToolbar();
api.invoke('editor:init').then(info => {
  if (!info) return;
  const img = new Image();
  img.onload = () => {
    doc.image = img; doc.width = info.width; doc.height = info.height; doc.density = info.density || 1;
    layout();
  };
  img.onerror = () => console.error('No se pudo cargar la captura');
  img.src = info.url;
});
