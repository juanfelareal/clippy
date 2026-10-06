// Tests del mapeo keycode → carácter para snippets (US vs español) y del motor de snippets.
const assert = require('assert');
const { EventEmitter } = require('events');
const { classify, layoutKind } = require('../src/main/keymap');
const { SnippetEngine } = require('../src/main/snippets');

const US = 0x04090409, ES = 0x040A040A, LATAM = 0x080A080A, ESMX = 0x080A080A;
assert.strictEqual(layoutKind(US), 'us');
assert.strictEqual(layoutKind(ES), 'shift7');
assert.strictEqual(layoutKind(LATAM), 'shift7');
assert.strictEqual(layoutKind(null), 'unknown');

const key = (keycode, mods = {}) => ({ keycode, shiftKey: false, ctrlKey: false, altKey: false, metaKey: false, ...mods });
const SLASH = 53, SEVEN = 8;
// "/" en US: tecla Slash; en español: Shift+7; teclado numérico: siempre
assert.deepStrictEqual(classify(key(SLASH), 'us'), { type: 'char', char: '/' });
assert.deepStrictEqual(classify(key(SEVEN, { shiftKey: true }), 'shift7'), { type: 'char', char: '/' });
assert.notStrictEqual(classify(key(SEVEN, { shiftKey: true }), 'us').char, '/');   // & en US
assert.notStrictEqual(classify(key(SLASH), 'shift7').char, '/');                   // - en español
assert.deepStrictEqual(classify(key(3637), 'us'), { type: 'char', char: '/' });
assert.deepStrictEqual(classify(key(SEVEN, { shiftKey: true }), 'unknown'), { type: 'char', char: '/' });
assert.deepStrictEqual(classify(key(SLASH), 'unknown'), { type: 'char', char: '/' });
// letras, dígitos, mayúsculas
assert.deepStrictEqual(classify(key(49), 'us'), { type: 'char', char: 'n' });
assert.deepStrictEqual(classify(key(49, { shiftKey: true }), 'us'), { type: 'char', char: 'N' });
assert.deepStrictEqual(classify(key(2), 'shift7'), { type: 'char', char: '1' });
assert.deepStrictEqual(classify(key(SEVEN), 'shift7'), { type: 'char', char: '7' });
// reset / backspace / ignorar
assert.strictEqual(classify(key(57), 'us').type, 'reset');           // espacio
assert.strictEqual(classify(key(28), 'us').type, 'reset');           // enter
assert.strictEqual(classify(key(57416), 'us').type, 'reset');        // flecha
assert.strictEqual(classify(key(1), 'us').type, 'reset');            // esc
assert.strictEqual(classify(key(14), 'us').type, 'backspace');
assert.strictEqual(classify(key(42), 'us').type, 'ignore');          // shift solo
assert.strictEqual(classify(key(47, { ctrlKey: true }), 'us').type, 'reset'); // Ctrl+V
assert.strictEqual(classify(key(16, { ctrlKey: true, altKey: true }), 'shift7').type, 'reset'); // AltGr+Q (@)

// Motor: buffer + matching por sufijo, más largo primero
function engineFor(layout, triggers) {
  const kb = new EventEmitter();
  const calls = [];
  const store = { byLength: triggers.map(t => ({ trigger: t, expansion: 'X-' + t })).sort((a, b) => b.trigger.length - a.trigger.length) };
  const eng = new SnippetEngine({ store, keyboard: kb, getLayout: () => layout, replace: async (n, exp) => calls.push([n, exp]) });
  return { kb, calls, eng };
}
const typeUS = { '/': key(SLASH) };
const typeES = { '/': key(SEVEN, { shiftKey: true }) };
const CODES = { n: 49, i: 23, t: 20, a: 30, b: 48, '1': 2, '2': 3, ' ': 57 };
function typeStr(kb, s, map) { for (const ch of s) kb.emit('key', map[ch] || key(CODES[ch])); }

(async () => {
  let t = engineFor(US, ['nit']);
  typeStr(t.kb, 'hola //nit', typeUS); await new Promise(r => setImmediate(r));
  assert.deepStrictEqual(t.calls, [[5, 'X-nit']]);

  t = engineFor(ES, ['nit', 'ab12']);
  typeStr(t.kb, '//ab12', typeES); await new Promise(r => setImmediate(r));
  assert.deepStrictEqual(t.calls, [[6, 'X-ab12']]);

  t = engineFor(US, ['nit']);
  typeStr(t.kb, '//n it', typeUS); // espacio rompe
  assert.deepStrictEqual(t.calls, []);

  t = engineFor(US, ['nit']);
  typeStr(t.kb, '//ni', typeUS); t.kb.emit('mouse', {}); typeStr(t.kb, 't', typeUS); // click reinicia
  assert.deepStrictEqual(t.calls, []);

  t = engineFor(US, ['nit']);
  typeStr(t.kb, '//nii', typeUS); t.kb.emit('key', key(14)); typeStr(t.kb, 't', typeUS); // backspace corrige
  await new Promise(r => setImmediate(r));
  assert.deepStrictEqual(t.calls, [[5, 'X-nit']]);

  t = engineFor(ES, ['nit']);
  typeStr(t.kb, '//nit', typeUS); // en español la tecla Slash es "-": no expande
  assert.deepStrictEqual(t.calls, []);

  console.log('Tests de keymap y motor de snippets: OK');
})().catch(e => { console.error(e); process.exit(1); });
