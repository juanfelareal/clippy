// Historial del portapapeles (port de HistoryStore.swift + Database.swift + ImageStore.swift).
// Persistencia: history.json + carpeta images/ (PNG completo) + thumbs/ (JPG 192px).
const { EventEmitter } = require('events');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { pathToFileURL } = require('url');
const { readJSON, debouncedWriter } = require('./store');

const sha256 = buf => crypto.createHash('sha256').update(buf).digest('hex');

class History extends EventEmitter {
  constructor({ dir, settings, nativeImage }) {
    super();
    this.dir = dir;
    this.settings = settings;
    this.nativeImage = nativeImage;
    this.imagesDir = path.join(dir, 'images');
    this.thumbsDir = path.join(dir, 'thumbs');
    fs.mkdirSync(this.imagesDir, { recursive: true });
    fs.mkdirSync(this.thumbsDir, { recursive: true });
    this.file = path.join(dir, 'history.json');
    const saved = readJSON(this.file, { nextId: 1, items: [] });
    this.items = Array.isArray(saved.items) ? saved.items : [];
    this.nextId = saved.nextId || (this.items.reduce((m, i) => Math.max(m, i.id), 0) + 1);
    this.sort();
    this.writer = debouncedWriter(this.file, () => ({ version: 1, nextId: this.nextId, items: this.items }));
  }

  static textHash(str) { return sha256(Buffer.from(str, 'utf8')); }
  static imageHash(img) { const s = img.getSize(); return sha256(Buffer.concat([Buffer.from(`${s.width}x${s.height}`), img.toBitmap()])); }

  sort() {
    // Pineados primero, luego por último uso descendente
    this.items.sort((a, b) => (b.pinned - a.pinned) || (b.lastUsedAt - a.lastUsedAt));
  }

  changed() { this.sort(); this.writer.schedule(); this.emit('changed'); }

  bumpExisting(hash) {
    const item = this.items.find(i => i.hash === hash);
    if (!item) return false;
    item.lastUsedAt = Date.now();
    this.changed();
    return true;
  }

  addText(str, hash = History.textHash(str)) {
    if (this.bumpExisting(hash)) return;
    const now = Date.now();
    const preview = str.trim().slice(0, 200);
    this.items.push({ id: this.nextId++, kind: 'text', text: str, preview, hash, createdAt: now, lastUsedAt: now, pinned: false });
    this.purge();
    this.changed();
  }

  addImage(img, hash = History.imageHash(img)) {
    if (this.bumpExisting(hash)) return;
    const now = Date.now();
    const file = `${hash}.png`;
    try {
      fs.writeFileSync(path.join(this.imagesDir, file), img.toPNG());
      const { width, height } = img.getSize();
      const scale = Math.min(1, 192 / Math.max(width, height));
      const thumb = img.resize({ width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)), quality: 'good' });
      fs.writeFileSync(path.join(this.thumbsDir, `${hash}.jpg`), thumb.toJPEG(80));
    } catch (e) { this.emit('error', e); return; }
    const { width, height } = img.getSize();
    this.items.push({ id: this.nextId++, kind: 'image', image: file, width, height, preview: '', hash, createdAt: now, lastUsedAt: now, pinned: false });
    this.purge();
    this.changed();
  }

  get(id) { return this.items.find(i => i.id === id); }

  touch(id) { const it = this.get(id); if (it) { it.lastUsedAt = Date.now(); this.changed(); } }

  togglePin(id) { const it = this.get(id); if (it) { it.pinned = !it.pinned; this.changed(); } }

  removeFiles(item) {
    if (item.kind !== 'image' || !item.image) return;
    const hash = item.image.replace(/\.png$/, '');
    try { fs.unlinkSync(path.join(this.imagesDir, item.image)); } catch {}
    try { fs.unlinkSync(path.join(this.thumbsDir, `${hash}.jpg`)); } catch {}
  }

  delete(id) {
    const idx = this.items.findIndex(i => i.id === id);
    if (idx < 0) return;
    const [item] = this.items.splice(idx, 1);
    this.removeFiles(item);
    this.changed();
  }

  clearUnpinned() {
    for (const it of this.items) if (!it.pinned) this.removeFiles(it);
    this.items = this.items.filter(i => i.pinned);
    this.changed();
  }

  purge() {
    const limit = this.settings.historyLimit;
    this.sort();
    const unpinned = this.items.filter(i => !i.pinned);
    if (unpinned.length <= limit) return;
    const drop = new Set(unpinned.slice(limit).map(i => i.id));
    for (const it of this.items) if (drop.has(it.id)) this.removeFiles(it);
    this.items = this.items.filter(i => !drop.has(i.id));
  }

  imagePath(item) { return path.join(this.imagesDir, item.image); }

  // Vista para el renderer (sin el texto completo si es enorme)
  toView() {
    return this.items.map(i => ({
      id: i.id,
      kind: i.kind,
      preview: i.kind === 'text' ? i.preview : '',
      search: i.kind === 'text' ? (i.text || '').slice(0, 20000) : 'imagen image',
      pinned: !!i.pinned,
      thumb: i.kind === 'image' ? pathToFileURL(path.join(this.thumbsDir, i.image.replace(/\.png$/, '.jpg'))).href : null,
      size: i.kind === 'image' ? `${i.width}×${i.height}` : null
    }));
  }

  flush() { this.writer.flush(); }
}

module.exports = { History };
