// Descarga los modelos de OCR (tessdata_fast: español + inglés) a resources/tessdata.
// Se ejecuta en CI y en local antes de empaquetar. En tiempo de ejecución la app NUNCA usa red:
// tesseract.js lee estos archivos desde disco (langPath local, gzip:false, cacheMethod:'none').
const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, '..', 'resources', 'tessdata');
const BASE = 'https://raw.githubusercontent.com/tesseract-ocr/tessdata_fast/main';
const LANGS = ['spa', 'eng'];

async function download(lang) {
  const dest = path.join(OUT, `${lang}.traineddata`);
  if (fs.existsSync(dest) && fs.statSync(dest).size > 500000) {
    console.log(`= ${lang}.traineddata ya existe (${fs.statSync(dest).size} bytes)`);
    return;
  }
  const url = `${BASE}/${lang}.traineddata`;
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const res = await fetch(url, { redirect: 'follow' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length < 500000) throw new Error(`archivo demasiado pequeño (${buf.length} bytes)`);
      fs.writeFileSync(dest + '.tmp', buf);
      fs.renameSync(dest + '.tmp', dest);
      console.log(`+ ${lang}.traineddata (${buf.length} bytes)`);
      return;
    } catch (err) {
      console.warn(`! ${lang} intento ${attempt}: ${err.message}`);
      if (attempt === 4) throw err;
      await new Promise(r => setTimeout(r, 2000 * attempt));
    }
  }
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  for (const lang of LANGS) await download(lang);
})().catch(err => { console.error(err); process.exit(1); });
