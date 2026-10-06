# Clippy para Windows 📎

Versión para Windows de [Clippy](../README.md): historial del portapapeles, capturas anotables, OCR, calculadora natural, snippets y mantener despierto. Vive en la bandeja del sistema (junto al reloj). **100 % local: no se conecta a internet en ningún momento.**

Construida con Electron + electron-builder. El instalador `.exe` (NSIS, x64) lo genera GitHub Actions.

> Usuario final: mira **[INSTALAR-WINDOWS.md](INSTALAR-WINDOWS.md)**.

## Features

| Feature | Atajo |
|---|---|
| **Historial del portapapeles** (texto + imágenes, búsqueda, pins) | **Ctrl+Shift+C** o click en el ícono de la bandeja |
| **Captura anotable** (flecha, rectángulo, lápiz, texto, censurar) | **Ctrl+Shift+1** |
| **OCR de pantalla** → texto al portapapeles (español + inglés) | **Ctrl+Shift+2** |
| **Calculadora natural** (formato colombiano, IVA 19 %) | **Ctrl+Shift+=** (teclado español: Ctrl+Shift+ la tecla `+`) |
| **Snippets**: escribe `//atajo` en cualquier app y se expande | tecleo global |
| **Mantener despierto** (la pantalla no se apaga) | menú de la bandeja |

Si otra app ya usa uno de los atajos, Clippy muestra una notificación diciendo cuál; la función sigue disponible desde el menú de la bandeja.

### Historial del portapapeles
- Texto e imágenes, búsqueda instantánea (texto sin importar tildes/mayúsculas + fuzzy), 100 % por teclado.
- Dedup (copiar algo repetido lo sube arriba), pins, límite de 200 items (configurable).
- Pegado directo en la app donde estabas: Clippy devuelve el foco a esa ventana y simula **Ctrl+V**.
- Privacidad: ignora lo que los gestores de contraseñas marcan como privado (`ExcludeClipboardContentFromMonitorProcessing`, `CanIncludeInClipboardHistory = 0`, `Clipboard Viewer Ignore`).
- Lo que Clippy escribe por su cuenta (pegar desde el historial, snippets) no vuelve a entrar al historial.

| Acción en el panel | Atajo |
|---|---|
| Buscar | escribir directo |
| Navegar | ↑ / ↓ / Tab (Shift+Tab sube) |
| **Pegar directo** | Enter o click |
| Solo copiar | Alt+Enter (luego Ctrl+V) |
| Pegar sin formato | Alt+Shift+Enter |
| Selección rápida | Ctrl+1 … Ctrl+9 (pega directo) |
| Pin / quitar pin | Alt+P |
| Borrar item | Alt+Backspace |
| Cerrar | Esc o click afuera |

### Captura anotable (Ctrl+Shift+1)
Congela todas las pantallas (multi-monitor, cada una a su resolución nativa y escala de DPI), arrastras para seleccionar y se abre el editor: **flecha, rectángulo, lápiz, texto, censurar** (pixelado), 5 colores, 3 grosores.
- **Ctrl+Z** deshacer · **Ctrl+C** copiar (cae al historial) · **Ctrl+S** guardar PNG en el Escritorio (`Captura dd-mm-aaaa a las hh.mm.ss.png`) · **Esc** cerrar.
- El export es a resolución completa (en pantallas al 150 % o 200 % sale con todos los píxeles reales).

### OCR (Ctrl+Shift+2)
Seleccionas una región → Tesseract (tesseract.js, WASM) reconoce el texto en español + inglés con tildes y ñ → queda copiado y en el historial, con un aviso en pantalla. Los modelos (`tessdata_fast`) van dentro del instalador; nunca se descargan en tiempo de ejecución. En pantallas al 100–150 % la región se amplía ×2 antes de reconocer (mejora mucho la precisión).

### Calculadora (Ctrl+Shift+=)
Port 1:1 del motor de la versión Mac (`CalculatorEngine.swift`), verificado con un test diferencial contra el binario Swift.
- `1.500.000 + 19%` → `1.785.000`
- `2.380.000 - iva` o `2.380.000 sin iva` → `2.000.000`
- `iva de 100.000` → `19.000` · `20% de 250.000` → `50.000`
- `(2+3)*4`, `2 x 3`, `10 más 5`; `$`, `cop`, `pesos` se ignoran
- Formato colombiano: `1.500.000` = un millón quinientos mil, coma decimal.
- **Enter** copia el resultado (cae al historial) y cierra. **Esc** cierra.

### Snippets (`//atajo`)
Menú de la bandeja → **Snippets…** para crear atajos (ej. `//nit` → tu NIT completo; puede ser multilínea). Al escribir `//nit` en cualquier app, Clippy borra lo tecleado y pega la expansión por el portapapeles, y después **restaura** lo que tenías copiado.
- Funciona con teclado **US y español (España y Latinoamérica)**: Clippy detecta la distribución activa (en español `/` es Shift+7). También vale el `/` del teclado numérico.
- El buffer se reinicia con clicks, flechas, Enter, Esc, Tab, espacio y al cambiar de ventana.
- Reglas del atajo: solo `a-z` y `0-9`, máximo 32, y ninguno puede ser prefijo de otro.

### Mantener despierto
Menú de la bandeja → **Mantener despierto**. Evita que la pantalla se apague o el PC se suspenda (`powerSaveBlocker`, se libera solo si Clippy se cierra). El ícono de la bandeja muestra un punto ámbar y el tooltip dice "PC despierto".

### Menú de la bandeja
Historial · Captura · OCR · Calculadora · Snippets… · Mantener despierto · Limpiar historial (conserva pineados) · **Iniciar con Windows** · Abrir carpeta de datos · Acerca de (versión) · Salir.

## Dónde quedan los datos

`%APPDATA%\Clippy\` (por ejemplo `C:\Users\<tú>\AppData\Roaming\Clippy\`):

| Archivo | Contenido |
|---|---|
| `history.json` | historial (texto, pins, fechas) |
| `images\` / `thumbs\` | imágenes copiadas (PNG) y miniaturas (JPG) |
| `snippets.json` | snippets |
| `settings.json` | ajustes, p. ej. `"historyLimit": 500` (reinicia Clippy después de editarlo) |
| `clippy.log` | log de diagnóstico |

## Desarrollo

Requisitos: Node 22+. Funciona en Windows y también arranca en macOS para desarrollo (allí usa una carpeta de datos aparte, `Clippy-Windows-Dev`).

```bash
npm install
node scripts/fetch-ocr-data.js     # descarga spa/eng.traineddata a resources/tessdata (una vez)
npm start                          # abre la app en modo desarrollo
npm test                           # calculadora + mapeo de teclado/snippets
npm run test:ocr                   # OCR local sobre test/fixtures
npm run dist:win                   # instalador en dist/Clippy-Windows.exe
```

Pruebas adicionales:
- `CLIPPY_SWIFT_CALC=<binario> node test/calculator.test.js`: compara la calculadora JS contra el motor Swift original (compila `Sources/Clippy/CalculatorEngine.swift` con un `main.swift` que lee líneas de stdin e imprime el resultado o `nil`).
- `CLIPPY_E2E=1 CLIPPY_NO_HOOK=1 npx electron .`: prueba end-to-end dentro de la app real (monitor del portapapeles, calculadora, panel del historial con teclado, snippets, editor de capturas con export, overlay de selección, mantener despierto). Termina con código 0 si todo pasa. Ojo: usa el portapapeles real y crea/borra un PNG en el Escritorio.
- `CLIPPY_DEV_OPEN=history,calculator,snippets,editor,hud,ocr npx electron .`: abre las ventanas al arrancar para revisarlas.
- `CLIPPY_OCR_SELFTEST=<png> Clippy.exe`: reconoce el PNG y escribe el resultado en `clippy.log` (lo usa el smoke test de CI).
- `node test/winhelper.test.js` (solo Windows): helper de PowerShell.
- `npm run icons`: regenera `build/icon.ico` (16–256 px) desde `../Resources/AppIcon-1024.png` y los íconos monocromos de la bandeja.

### CI
`.github/workflows/windows.yml` (en la raíz del repo) corre en cada push a `main`, en tags `v*` y manualmente: `npm ci` → datos de OCR → tests → `electron-builder --win nsis --x64` → smoke test (lanza `dist/win-unpacked/Clippy.exe`, verifica que siga vivo a los 15 s, que registre el arranque y que el OCR empaquetado funcione) → sube el instalador como artifact. En tags `v*` crea un GitHub Release con el `.exe`.

## Arquitectura

```
windows/
├── src/main/
│   ├── main.js          # bandeja, atajos, ventanas, IPC, flujo de pegado, captura/OCR/editor
│   ├── clipboard.js     # monitor del portapapeles (API async de Electron 44), escrituras propias, snapshot/restore
│   ├── history.js       # historial + imágenes + miniaturas (JSON, sin sqlite nativo)
│   ├── winhelper.js     # PowerShell persistente: secuencia del portapapeles, ventana activa, distribución de teclado, devolver el foco
│   ├── keyboard.js      # uiohook-napi: escucha global + Ctrl+V / Backspace simulados
│   ├── keymap.js        # scancode → carácter (US / español)
│   ├── snippets.js      # store + motor //atajo
│   ├── capture.js       # desktopCapturer multi-monitor + overlays de selección
│   ├── ocr.js           # tesseract.js offline
│   ├── store.js         # JSON atómico + ajustes
│   └── preload.js       # puente contextIsolation (sin nodeIntegration)
├── src/shared/calculator.js   # motor de la calculadora (UMD: renderer + tests)
├── src/renderer/        # history, calculator, overlay, editor, snippets, hud (HTML/CSS/JS)
├── scripts/             # fetch-ocr-data.js, make-icons.js
├── test/                # calculadora, keymap, OCR, helper, e2e + fixtures
├── assets/              # íconos de bandeja (claro/oscuro, normal/despierto)
└── build/               # icon.ico / icon.png (instalador y app)
```

Diferencias con la versión Mac:
- Windows no tiene un "panel que no activa la app" como `NSPanel .nonactivatingPanel`: el panel toma el foco para que puedas escribir y, al pegar, Clippy devuelve el foco a la ventana anterior (helper de PowerShell con `SetForegroundWindow`) antes de simular Ctrl+V.
- Snippets: siempre se insertan por el portapapeles (uiohook no puede teclear Unicode); el portapapeles se restaura completo (texto, HTML, imagen).
- No existe "secure input" en Windows: el buffer de snippets no puede saber si estás en un campo de contraseña (pero solo reacciona a `//atajo`).
- No requiere permisos de Accesibilidad ni Grabación de pantalla.
