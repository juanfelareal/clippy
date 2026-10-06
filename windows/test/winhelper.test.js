// Test del helper de PowerShell (solo Windows; en otros sistemas se omite).
// Verifica: arranque (READY), líneas de estado, aviso de cambio del portapapeles y comando focus.
const { execFileSync } = require('child_process');
const { WinHelper } = require('../src/main/winhelper');

if (process.platform !== 'win32') { console.log('winhelper: omitido (no es Windows)'); process.exit(0); }

const helper = new WinHelper(m => console.log('[helper]', m));
const fail = msg => { console.error('FALLA:', msg); helper.stop(); process.exit(1); };
const timer = setTimeout(() => fail('timeout'), 45000);

helper.once('ready', () => console.log('READY ok'));
helper.start();

(async () => {
  const waitFor = (ev, ms) => new Promise((res, rej) => { const t = setTimeout(() => rej(new Error('sin evento ' + ev)), ms); helper.once(ev, v => { clearTimeout(t); res(v); }); });
  const first = await waitFor('clipboard', 30000).catch(e => fail(e.message));
  console.log('estado inicial', JSON.stringify(helper.state), 'seq', first);
  if (!helper.state || !Number.isFinite(helper.state.seq)) fail('estado inválido');
  const changed = waitFor('clipboard', 8000);
  execFileSync('powershell.exe', ['-NoProfile', '-Command', 'Set-Clipboard -Value "clippy-test"']);
  const seq = await changed.catch(e => fail(e.message));
  if (!(seq > first)) fail(`la secuencia no aumentó (${first} → ${seq})`);
  console.log('cambio de portapapeles detectado', first, '→', seq);
  const ok = await helper.focus(helper.state.hwnd, 3000);
  console.log('focus respondió', ok);
  console.log('winhelper OK');
  clearTimeout(timer);
  helper.stop();
  process.exit(0);
})();
