// OCR 100% local con tesseract.js (español + inglés).
// Sin red: langPath apunta a una carpeta local con *.traineddata sin comprimir (tessdata_fast),
// gzip:false, cacheMethod:'none'. En Node, tesseract.js carga el core WASM desde node_modules
// (tesseract.js-core) — empaquetado y desempaquetado del asar en el instalador.
const path = require('path');
const fs = require('fs');

// Fuera del asar: worker_threads necesita archivos reales en disco
const unpacked = p => p.replace(/app\.asar([\\/])/, 'app.asar.unpacked$1');

function tesseractPaths() {
  const pkgDir = unpacked(path.dirname(require.resolve('tesseract.js/package.json')));
  return {
    workerPath: path.join(pkgDir, 'src', 'worker-script', 'node', 'index.js')
  };
}

class OcrService {
  constructor({ langPath, log = () => {}, idleMs = 90000 }) {
    this.langPath = langPath;
    this.log = log;
    this.idleMs = idleMs;
    this.workerPromise = null;
    this.idleTimer = null;
    this.queue = Promise.resolve();
  }

  available() {
    return ['spa', 'eng'].every(l => fs.existsSync(path.join(this.langPath, `${l}.traineddata`)));
  }

  async _worker() {
    if (!this.workerPromise) {
      const { createWorker, OEM } = require('tesseract.js');
      const { workerPath } = tesseractPaths();
      this.workerPromise = createWorker(['spa', 'eng'], OEM.LSTM_ONLY, {
        langPath: this.langPath,
        workerPath,
        gzip: false,
        cacheMethod: 'none',
        errorHandler: err => this.log('ocr worker error', String(err))
      }).then(async w => {
        // PSM 3 = segmentación automática de página (bloques/párrafos)
        await w.setParameters({ tessedit_pageseg_mode: '3', preserve_interword_spaces: '1' });
        return w;
      }).catch(err => { this.workerPromise = null; throw err; });
    }
    return this.workerPromise;
  }

  _scheduleIdle() {
    clearTimeout(this.idleTimer);
    this.idleTimer = setTimeout(() => this.terminate(), this.idleMs);
    if (this.idleTimer.unref) this.idleTimer.unref();
  }

  async terminate() {
    clearTimeout(this.idleTimer);
    const p = this.workerPromise;
    this.workerPromise = null;
    if (p) { try { (await p).terminate(); } catch {} }
  }

  /// Reconoce texto en un PNG (Buffer). Devuelve string limpio ('' si no hay texto).
  recognize(pngBuffer) {
    const run = async () => {
      const worker = await this._worker();
      const { data } = await worker.recognize(pngBuffer);
      this._scheduleIdle();
      return OcrService.clean(data.text || '');
    };
    const result = this.queue.then(run, run);
    this.queue = result.catch(() => {});
    return result;
  }

  static clean(text) {
    return text
      .replace(/\r/g, '')
      .split('\n').map(l => l.replace(/[ \t]+$/g, '').replace(/ {2,}/g, ' ')).join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }
}

module.exports = { OcrService, tesseractPaths };
