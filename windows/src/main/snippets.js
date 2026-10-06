// Snippets: //atajo → expansión (port de SnippetStore.swift + SnippetEngine.swift + TextInjector.swift)
const { EventEmitter } = require('events');
const path = require('path');
const crypto = require('crypto');
const { readJSON, writeJSONAtomic } = require('./store');
const { classify, layoutKind } = require('./keymap');

class SnippetStore extends EventEmitter {
  constructor(dir) {
    super();
    this.file = path.join(dir, 'snippets.json');
    const data = readJSON(this.file, []);
    this.snippets = Array.isArray(data) ? data.filter(s => s && s.trigger && typeof s.expansion === 'string') : [];
    this.rebuild();
  }

  static isValidTrigger(t) { return typeof t === 'string' && t.length > 0 && t.length <= 32 && /^[a-z0-9]+$/.test(t); }

  /// Un atajo no puede ser prefijo de otro (igual que en Mac)
  prefixConflict(trigger, excludingId) {
    return this.snippets.find(o => o.id !== excludingId && (o.trigger.startsWith(trigger) || trigger.startsWith(o.trigger))) || null;
  }

  rebuild() { this.byLength = [...this.snippets].sort((a, b) => b.trigger.length - a.trigger.length); }

  save() {
    writeJSONAtomic(this.file, this.snippets);
    this.rebuild();
    this.emit('changed');
  }

  list() { return [...this.snippets].sort((a, b) => a.trigger.localeCompare(b.trigger)); }

  /// Crea o actualiza. Devuelve { ok } o { error } con mensaje en español.
  upsert({ id, trigger, expansion }) {
    const t = String(trigger || '').trim();
    if (!SnippetStore.isValidTrigger(t)) return { error: 'Atajo inválido: solo a-z y 0-9, sin espacios, máximo 32 caracteres.' };
    if (!expansion) return { error: 'El texto a insertar no puede estar vacío.' };
    const conflict = this.prefixConflict(t, id || null);
    if (conflict) return { error: `Choca con //${conflict.trigger}: un atajo no puede ser prefijo de otro.` };
    if (id) {
      const s = this.snippets.find(x => x.id === id);
      if (!s) return { error: 'El snippet ya no existe.' };
      s.trigger = t; s.expansion = expansion;
    } else {
      this.snippets.push({ id: crypto.randomUUID(), trigger: t, expansion, createdAt: new Date().toISOString() });
    }
    this.save();
    return { ok: true };
  }

  delete(id) { this.snippets = this.snippets.filter(s => s.id !== id); this.save(); }
}

const BUFFER_CAP = 64;

class SnippetEngine {
  /// replace(deleteCount, expansion) → Promise: borra lo tecleado y pega la expansión
  constructor({ store, keyboard, getLayout, replace, log = () => {} }) {
    this.store = store;
    this.keyboard = keyboard;
    this.getLayout = getLayout;
    this.replace = replace;
    this.log = log;
    this.buffer = '';
    this.busy = false;
    keyboard.on('key', e => this.onKey(e));
    keyboard.on('mouse', () => this.reset());
  }

  reset() { this.buffer = ''; }

  onKey(e) {
    if (this.busy) return;
    const r = classify(e, layoutKind(this.getLayout()));
    switch (r.type) {
      case 'ignore': return;
      case 'reset': this.buffer = ''; return;
      case 'backspace': this.buffer = this.buffer.slice(0, -1); return;
      case 'char':
        this.buffer += r.char;
        if (this.buffer.length > BUFFER_CAP) this.buffer = this.buffer.slice(-BUFFER_CAP);
        this.check();
    }
  }

  check() {
    if (!this.buffer.includes('/')) return;
    for (const s of this.store.byLength) {
      const full = '//' + s.trigger;
      if (this.buffer.endsWith(full)) { this.expand(s, full.length); return; }
    }
  }

  async expand(snippet, typedLength) {
    this.buffer = '';
    this.busy = true;
    try {
      await this.replace(typedLength, snippet.expansion);
      this.log('snippet expanded', snippet.trigger);
    } catch (err) {
      this.log('snippet error', String(err));
    } finally {
      this.busy = false;
      this.buffer = '';
    }
  }
}

module.exports = { SnippetStore, SnippetEngine };
