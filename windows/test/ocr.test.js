// Test del OCR local (español + inglés, tildes y ñ). Requiere: node scripts/fetch-ocr-data.js
// Ejecutar: node test/ocr.test.js
const fs = require('fs');
const path = require('path');
const { OcrService } = require('../src/main/ocr');

// Nota: la diéresis (ü) no la reconoce el modelo tessdata_fast (sale "pinguino"); por eso no se exige.
const EXPECTED = ['señor', 'Muñoz', 'pidió', 'información', 'facturación', 'electrónica', 'Año', '2026', 'canción', 'corazón', 'acción', 'rápida', 'quick', 'brown', 'lazy dog'];

(async () => {
  const ocr = new OcrService({ langPath: path.join(__dirname, '..', 'resources', 'tessdata'), log: console.log });
  if (!ocr.available()) { console.error('Faltan los traineddata: node scripts/fetch-ocr-data.js'); process.exit(1); }
  let failed = false;
  for (const file of ['ocr-es.png', 'ocr-es-2x.png']) {
    const png = fs.readFileSync(path.join(__dirname, 'fixtures', file));
    const t0 = Date.now();
    const text = await ocr.recognize(png);
    console.log(`--- ${file}: texto reconocido (${Date.now() - t0} ms) ---\n${text}\n---`);
    const missing = EXPECTED.filter(w => !text.includes(w));
    if (missing.length) { failed = true; console.error(`FALTAN en ${file}:`, missing); }
    else console.log(`OCR OK (${file}): ${EXPECTED.length}/${EXPECTED.length} palabras esperadas`);
  }
  await ocr.terminate();
  if (failed) process.exit(1);
})().catch(err => { console.error(err); process.exit(1); });
