// Puente seguro (contextIsolation): solo canales con prefijos conocidos.
const { contextBridge, ipcRenderer } = require('electron');

const ALLOWED = /^(history|calc|overlay|editor|snippets|hud|app):/;
const check = ch => { if (!ALLOWED.test(ch)) throw new Error('Canal no permitido: ' + ch); return ch; };

contextBridge.exposeInMainWorld('clippy', {
  platform: process.platform,
  invoke: (ch, ...args) => ipcRenderer.invoke(check(ch), ...args),
  send: (ch, ...args) => ipcRenderer.send(check(ch), ...args),
  on: (ch, fn) => {
    const listener = (_e, ...args) => fn(...args);
    ipcRenderer.on(check(ch), listener);
    return () => ipcRenderer.removeListener(ch, listener);
  }
});
