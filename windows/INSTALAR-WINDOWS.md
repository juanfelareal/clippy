# Instalar Clippy en Windows 📎

Clippy es una utilidad que vive junto al reloj de Windows: guarda todo lo que copias, hace capturas con flechas y textos, copia el texto de cualquier parte de la pantalla (OCR), trae una calculadora con IVA y expande atajos de texto. Funciona sin internet.

Requisitos: Windows 10 u 11 de 64 bits.

## 1. Descargar
Descarga el archivo **`Clippy-Windows.exe`** (te lo envían por enlace, o desde la sección *Releases* / *Actions → Artifacts* del repositorio).

## 2. Instalar
1. Haz doble click en `Clippy-Windows.exe`.
2. Es probable que aparezca la pantalla azul **"Windows protegió su PC"** (SmartScreen). Sale porque la app no tiene firma digital de pago, no porque tenga algún problema. Para continuar:
   - Haz click en **Más información**.
   - Luego en **Ejecutar de todas formas**.
3. Sigue el asistente (puedes cambiar la carpeta de instalación). Al final Clippy se abre solo.
4. Busca el ícono del clip 📎 junto al reloj. Si no lo ves, haz click en la flechita **^** de la bandeja; puedes arrastrarlo a la barra para dejarlo siempre visible.

> Si el antivirus pregunta, permite Clippy: escucha el teclado solo para detectar los atajos `//snippet` y simula Ctrl+V para pegar.

## 3. Usarlo

| Para… | Haz esto |
|---|---|
| Ver el historial del portapapeles | **Ctrl+Shift+C** (o click en el clip). Escribe para buscar, ↑/↓ y **Enter** para pegar |
| Captura con flechas, cuadros, texto o censura | **Ctrl+Shift+1**, arrastra sobre la zona. **Ctrl+C** copia, **Ctrl+S** guarda en el Escritorio |
| Copiar el texto que aparece en pantalla | **Ctrl+Shift+2**, arrastra sobre el texto. Queda copiado |
| Calculadora (ej. `1.500.000 + iva`) | **Ctrl+Shift+=** (en teclado español: Ctrl+Shift+ la tecla **+**). **Enter** copia el resultado |
| Crear atajos de texto | Click derecho en el clip → **Snippets…**. Luego escribe `//atajo` en cualquier programa |
| Que la pantalla no se apague | Click derecho en el clip → **Mantener despierto** |
| Que Clippy arranque al prender el PC | Click derecho en el clip → **Iniciar con Windows** |

Otros atajos del historial: **Alt+Enter** solo copia · **Alt+Shift+Enter** pega sin formato · **Ctrl+1…9** pega el item 1–9 · **Alt+P** fija (pin) · **Alt+Backspace** borra · **Esc** cierra.

Si un atajo no funciona porque otro programa ya lo usa, Clippy te muestra un aviso; usa la opción desde el menú del clip.

## 4. ¿Dónde quedan mis datos?
Todo queda solo en tu PC, en:

```
%APPDATA%\Clippy
```

(pega eso en la barra de direcciones del Explorador de archivos, o usa click derecho en el clip → **Abrir carpeta de datos**). Ahí están el historial, las imágenes copiadas y tus snippets. Las capturas guardadas con Ctrl+S quedan en tu **Escritorio**.

Para borrar el historial: click derecho en el clip → **Limpiar historial** (conserva los fijados con pin).

## 5. Actualizar
Instala el `.exe` nuevo encima del anterior. Tu historial y tus snippets se conservan.

## 6. Desinstalar
1. **Configuración → Aplicaciones → Aplicaciones instaladas** (en Windows 10: *Aplicaciones y características*).
2. Busca **Clippy** → **Desinstalar**.
3. Opcional: para borrar también el historial y los snippets, borra la carpeta `%APPDATA%\Clippy`.

Antes de desinstalar, cierra Clippy: click derecho en el clip → **Salir de Clippy**.
