// Teclado global con uiohook-napi: escucha (snippets), estado de modificadores y
// simulación de teclas (Ctrl+V para pegar, Backspace para borrar el //atajo).
const { EventEmitter } = require('events');

const MOD_CODES = new Set([29, 3613, 56, 3640, 42, 54, 3675, 3676]);

class Keyboard extends EventEmitter {
  constructor(log = () => {}) {
    super();
    this.log = log;
    this.hook = null;
    this.Key = null;
    this.down = new Set();
    this.injectingUntil = 0;
    this.injectDepth = 0;
    this.started = false;
  }

  start() {
    if (this.started) return true;
    try {
      const { uIOhook, UiohookKey } = require('uiohook-napi');
      this.hook = uIOhook;
      this.Key = UiohookKey;
      uIOhook.on('keydown', e => this._down(e));
      uIOhook.on('keyup', e => this.down.delete(e.keycode));
      uIOhook.on('mousedown', e => { if (!this.isInjecting) this.emit('mouse', e); });
      uIOhook.start();
      this.started = true;
      this.log('uiohook started');
      return true;
    } catch (err) {
      this.log('uiohook failed', String(err && err.stack || err));
      this.emit('error', err);
      return false;
    }
  }

  stop() { if (this.started) { try { this.hook.stop(); } catch {} this.started = false; } }

  get isInjecting() { return this.injectDepth > 0 || Date.now() < this.injectingUntil; }

  _down(e) {
    this.down.add(e.keycode);
    if (this.isInjecting) return; // nuestras propias teclas sintéticas
    this.emit('key', e);
  }

  modifiersHeld() { for (const c of this.down) if (MOD_CODES.has(c)) return true; return false; }

  /// Espera a que el usuario suelte Ctrl/Alt/Shift/Win (máx. timeout) para que no se mezclen con Ctrl+V
  waitModifiersReleased(timeout = 1500) {
    return new Promise(resolve => {
      const t0 = Date.now();
      const tick = () => {
        if (!this.modifiersHeld() || Date.now() - t0 > timeout) return resolve();
        setTimeout(tick, 25);
      };
      tick();
    });
  }

  /// Ejecuta fn marcando las teclas resultantes como propias (no alimentan el buffer de snippets)
  async injecting(fn, tailMs = 250) {
    this.injectDepth++;
    try { return await fn(); }
    finally { this.injectDepth--; this.injectingUntil = Date.now() + tailMs; }
  }

  pasteShortcut() {
    if (!this.started) return false;
    const K = this.Key;
    if (process.platform === 'darwin') this.hook.keyTap(K.V, [K.Meta]);
    else this.hook.keyTap(K.V, [K.Ctrl]);
    return true;
  }

  backspaces(n) {
    if (!this.started) return false;
    for (let i = 0; i < n; i++) this.hook.keyTap(this.Key.Backspace);
    return true;
  }
}

module.exports = { Keyboard };
