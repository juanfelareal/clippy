// Persistencia JSON sencilla y atómica (tmp + rename) + ajustes.
const fs = require('fs');
const path = require('path');

function readJSON(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}

function writeJSONAtomic(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, file);
}

// Escritura con debounce (el historial cambia seguido)
function debouncedWriter(file, getData, ms = 400) {
  let timer = null;
  const flush = () => { clearTimeout(timer); timer = null; try { writeJSONAtomic(file, getData()); } catch (e) { console.error('write', file, e); } };
  return { schedule() { clearTimeout(timer); timer = setTimeout(flush, ms); }, flush };
}

const DEFAULT_SETTINGS = { historyLimit: 200 };

class Settings {
  constructor(dir) {
    this.file = path.join(dir, 'settings.json');
    this.data = { ...DEFAULT_SETTINGS, ...readJSON(this.file, {}) };
    // Se escribe para que el usuario vea las claves disponibles (p. ej. historyLimit)
    try { writeJSONAtomic(this.file, this.data); } catch {}
  }
  get(key) { return this.data[key]; }
  set(key, value) { this.data[key] = value; writeJSONAtomic(this.file, this.data); }
  get historyLimit() {
    const v = parseInt(this.data.historyLimit, 10);
    return v > 0 ? v : 200;
  }
}

module.exports = { readJSON, writeJSONAtomic, debouncedWriter, Settings };
