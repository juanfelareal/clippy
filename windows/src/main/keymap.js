// Traducción keycode (uiohook = scancode físico) → carácter tecleado, para detectar //atajos.
// Solo importa reconocer con exactitud: a–z, 0–9 y "/". El resto se marca como OTHER
// (rompe la secuencia) o como acción (reset/backspace).
//
// "/" depende de la distribución:
//   - US / Internacional: tecla Slash (scancode 53) sin Shift.
//   - Español (ES y Latinoamérica), alemán, italiano, portugués, nórdicos…: Shift+7.
//   - Teclado numérico "/" en todas.
// Si no se conoce la distribución (helper no disponible), se aceptan ambas formas.

const K = {
  Backspace: 14, Tab: 15, Enter: 28, Escape: 1, Space: 57,
  PageUp: 3657, PageDown: 3665, End: 3663, Home: 3655,
  ArrowLeft: 57419, ArrowUp: 57416, ArrowRight: 57421, ArrowDown: 57424,
  Insert: 3666, Delete: 3667, Slash: 53, NumpadDivide: 3637, NumpadEnter: 3612,
  Ctrl: 29, CtrlRight: 3613, Alt: 56, AltRight: 3640, Shift: 42, ShiftRight: 54,
  Meta: 3675, MetaRight: 3676, CapsLock: 58, NumLock: 69, ScrollLock: 70
};

const LETTERS = { 30: 'a', 48: 'b', 46: 'c', 32: 'd', 18: 'e', 33: 'f', 34: 'g', 35: 'h', 23: 'i', 36: 'j', 37: 'k', 38: 'l', 50: 'm', 49: 'n', 24: 'o', 25: 'p', 16: 'q', 19: 'r', 31: 's', 20: 't', 22: 'u', 47: 'v', 17: 'w', 45: 'x', 21: 'y', 44: 'z' };
const DIGITS = { 11: '0', 2: '1', 3: '2', 4: '3', 5: '4', 6: '5', 7: '6', 8: '7', 9: '8', 10: '9' };
const NUMPAD = { 82: '0', 79: '1', 80: '2', 81: '3', 75: '4', 76: '5', 77: '6', 71: '7', 72: '8', 73: '9' };

const MODIFIERS = new Set([K.Ctrl, K.CtrlRight, K.Alt, K.AltRight, K.Shift, K.ShiftRight, K.Meta, K.MetaRight, K.CapsLock, K.NumLock, K.ScrollLock]);
const RESET_KEYS = new Set([K.Enter, K.NumpadEnter, K.Tab, K.Escape, K.Space, K.ArrowLeft, K.ArrowRight, K.ArrowUp, K.ArrowDown, K.Home, K.End, K.PageUp, K.PageDown, K.Insert, K.Delete]);

// Idiomas principales (LANGID & 0x3FF) cuya distribución pone "/" en Shift+7
const SHIFT7_SLASH_LANGS = new Set([0x0A /* es */, 0x07 /* de */, 0x10 /* it */, 0x16 /* pt */, 0x1D /* sv */, 0x14 /* nb/nn */, 0x06 /* da */, 0x0B /* fi */, 0x0E /* hu */, 0x05 /* cs */, 0x1B /* sk */, 0x24 /* sl */, 0x1A /* hr/sr */, 0x13 /* nl */]);

/// hkl: identificador de distribución de Windows (número). null = desconocida.
function layoutKind(hkl) {
  if (hkl === null || hkl === undefined || Number.isNaN(hkl)) return 'unknown';
  const primaryLang = (hkl & 0xFFFF) & 0x3FF;
  return SHIFT7_SLASH_LANGS.has(primaryLang) ? 'shift7' : 'us';
}

/// Devuelve { type: 'char', char } | { type: 'backspace' } | { type: 'reset' } | { type: 'ignore' }
function classify(e, kind = 'unknown') {
  const code = e.keycode;
  if (MODIFIERS.has(code)) return { type: 'ignore' };
  // Ctrl / Alt / Win + tecla = atajo (incluye AltGr = Ctrl+Alt) → reinicia, como en Mac
  if (e.ctrlKey || e.altKey || e.metaKey) return { type: 'reset' };
  if (code === K.Backspace) return { type: 'backspace' };
  if (RESET_KEYS.has(code)) return { type: 'reset' };

  if (code === K.NumpadDivide) return { type: 'char', char: '/' };
  if (NUMPAD[code]) return { type: 'char', char: NUMPAD[code] };
  if (LETTERS[code]) return { type: 'char', char: e.shiftKey ? LETTERS[code].toUpperCase() : LETTERS[code] };

  if (DIGITS[code]) {
    if (!e.shiftKey) return { type: 'char', char: DIGITS[code] };
    if (code === 8 && kind !== 'us') return { type: 'char', char: '/' }; // Shift+7
    return { type: 'char', char: '•' }; // símbolo cualquiera (!, @, #, …)
  }
  if (code === K.Slash) {
    if (!e.shiftKey && kind !== 'shift7') return { type: 'char', char: '/' };
    return { type: 'char', char: '•' }; // en español esta tecla es "-" / "_"
  }
  // Cualquier otra tecla imprimible o desconocida rompe la secuencia sin reiniciar
  if (code >= 59 && code <= 107 && !(code >= 71 && code <= 83)) return { type: 'reset' }; // F1–F24
  return { type: 'char', char: '•' };
}

module.exports = { K, classify, layoutKind };
