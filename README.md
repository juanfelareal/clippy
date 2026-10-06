# Clippy 📎

Suite de utilidades nativa para macOS: portapapeles con historial, capturas anotables, OCR, calculadora natural, snippets y keep-awake. Un solo ícono en la barra de menú. 100% Swift, cero dependencias externas, construido con Swift Package Manager (sin Xcode). Todo local, cero red.

## Features

| Feature | Atajo |
|---|---|
| **Historial del portapapeles** (texto + imágenes, búsqueda, pins) | ⇧⌘C |
| **Captura anotable** (flecha, rectángulo, lápiz, texto, blur) | ⇧⌘1 |
| **OCR de pantalla** → texto al portapapeles (español + inglés) | ⇧⌘2 |
| **Calculadora natural** (formato colombiano, IVA 19%) | ⇧⌘= |
| **Snippets** — escribe `//atajo` en cualquier app y se expande | tecleo global |
| **Mantener despierto** (el Mac no duerme) | menú click derecho |

### Historial del portapapeles
- Texto e imágenes, búsqueda instantánea (substring + fuzzy), 100% por teclado
- Pin de favoritos (⌥P), pegar directo con ⏎/click, solo copiar con ⌥⏎, sin formato ⌥⇧⏎
- Selección rápida ⌘1–⌘9, borrar ⌥⌫
- Dedup, persistencia SQLite en `~/Library/Application Support/Clippy/`, límite 200 items (`defaults write com.juanfe.clippy historyLimit 500`)
- Privacidad: ignora password managers (`org.nspasteboard.ConcealedType`/`TransientType`)

### Captura anotable (⇧⌘1)
Selecciona una región → se abre el editor: **flecha, rectángulo, lápiz, texto, blur** (pixelado), 5 colores, 3 grosores, deshacer (⌘Z). **Copiar** (⌘C, cae al historial) o **Guardar** (⌘S, PNG al Escritorio). Export a resolución Retina completa.

### OCR (⇧⌘2)
Selecciona una región → Vision reconoce el texto (es/en, con tildes y ñ) → queda copiado y en el historial. HUD de confirmación.

### Calculadora (⇧⌘=)
Formato colombiano: `1.500.000` = un millón quinientos mil; coma decimal. Entiende:
- `1.500.000 + 19%` → `1.785.000`
- `2.380.000 - iva` o `2.380.000 sin iva` → `2.000.000`
- `iva de 100.000` → `19.000` · `20% de 250.000` → `50.000`
- `(2+3)*4`, `$`, `cop`, `pesos` se ignoran
- ⏎ copia el resultado (cae al historial) y cierra. Esc cierra.

### Snippets (`//atajo`)
Menú → **Snippets…** para crear atajos (ej. `//nit` → tu NIT completo). Al escribir `//nit` en cualquier app, Clippy borra lo tecleado y lo reemplaza por la expansión. Multilínea usa el portapapeles y **restaura** lo que tenías copiado. El buffer se resetea con clicks, flechas, Esc, cambio de app; en campos de contraseña (secure input) no observa nada.

### Mantener despierto
Menú click derecho → "Mantener despierto". El ícono cambia 📎 → 🌙. Usa `IOPMAssertion` (se libera solo si la app muere). Verifica con `pmset -g assertions`.

## Atajos del panel de historial

| Acción | Atajo |
|---|---|
| Abrir/cerrar panel | **⇧⌘C** o click en el 📎 |
| Buscar | escribir directo |
| Navegar | ↑ / ↓ / Tab |
| Selección rápida | ⌘1 – ⌘9 (pega directo) |
| **Pegar directo** | ⏎ o click (requiere Accesibilidad) |
| Solo copiar | ⌥⏎ (luego ⌘V) |
| Pegar sin formato | ⌥⇧⏎ |
| Pin / unpin | ⌥P |
| Borrar item | ⌥⌫ |
| Cerrar | Esc o click afuera |

## Build e instalación

```bash
make install   # compila universal (arm64 + x86_64), firma y copia a /Applications
make run       # compila y abre el bundle local (build/Clippy.app)
make dmg       # build/Clippy-<versión>-mac.dmg para compartir
make release   # sube el .dmg a un GitHub Release v<versión>
make clean
```

La versión se toma de `CFBundleShortVersionString` en `Resources/Info.plist` (súbela antes de cada release). Guía para quien instala: [INSTALAR-MAC.md](INSTALAR-MAC.md). Versión Windows: [windows/](windows/).

### Firma (por qué los permisos ya no se pierden)
La app se firma con un certificado propio y fijo, **"Clippy Code Signing (Juan Felipe)"**, guardado en el llavero. macOS amarra los permisos a ese certificado, no a cada compilación: recompilar o instalar una versión nueva **conserva** Accesibilidad y Grabación de pantalla, en tu Mac y en el de quien la instale.

- Respaldo: `~/.clippy-signing/` (`clippy-signing.p12` + `p12-password.txt`). **Guárdalo fuera del Mac** (1Password/Drive): si se pierde, la próxima versión saldrá firmada con otro certificado y todos tendrán que volver a dar los permisos.
- Mac nuevo: copia esa carpeta a `~/.clippy-signing/` y corre `make signing-cert`.
- No es un certificado de Apple, así que quien la descargue verá el aviso de Gatekeeper la primera vez (ver INSTALAR-MAC.md). Con un Apple Developer ID (USD 99/año) basta con cambiar `SIGN_ID` en el Makefile y notarizar para quitar ese aviso.

## Permisos

| Permiso | Para qué | Dónde |
|---|---|---|
| **Accesibilidad** | Pegado directo (⌘V simulado) y snippets (event tap) | Ajustes → Privacidad y seguridad → Accesibilidad |
| **Grabación de pantalla** | Captura anotable y OCR | Ajustes → Privacidad y seguridad → Grabación de pantalla y audio del sistema |

Sin Accesibilidad: el historial funciona, pero pegas manual con ⌘V y los snippets no expanden. Sin Grabación de pantalla: `screencapture` devuelve solo el fondo de pantalla — concede el permiso y **relanza Clippy**.

Los permisos se conservan entre versiones gracias a la firma estable (ver *Firma*). Si alguno se atora: `tccutil reset Accessibility com.juanfe.clippy` (o `ScreenCapture`), relanza Clippy y concédelo de nuevo.

## Arquitectura

```
Sources/Clippy/
├── main.swift                      # NSApplication + delegate, sin Dock (accessory)
├── AppDelegate.swift               # status item, menú, hotkeys, wiring de todo
│
│  Portapapeles
├── ClipboardMonitor.swift          # polling de NSPasteboard.changeCount cada 0.5s
├── ClipItem.swift / HistoryStore.swift / Database.swift / ImageStore.swift
├── PanelController.swift           # NSPanel .nonactivatingPanel (no roba foco)
├── HistoryView.swift               # SwiftUI
├── PasteService.swift              # pasteboard write + ⌘V; guard self-write (Set<Int>)
│
│  Captura + OCR + anotación
├── CaptureService.swift            # /usr/sbin/screencapture -i + TCC preflight
├── OCRService.swift                # Vision VNRecognizeTextRequest (es/en)
├── ScreenCaptureCoordinator.swift  # orquesta capture→OCR / capture→editor
├── AnnotationModel/Renderer/EditorView/WindowController.swift
│
│  Calculadora
├── CalculatorEngine.swift          # tokenizer + recursive descent, formato CO, IVA
├── CalculatorPanelController.swift / CalculatorView.swift
│
│  Snippets
├── KeyEventTap.swift               # CGEvent tap activo (pasa TODO sin tocar)
├── SnippetEngine.swift             # buffer rodante + matching //atajo
├── TextInjector.swift              # backspaces + tipeo unicode o paste+restore
├── SnippetStore.swift / SnippetsView.swift / SnippetsWindowController.swift
│
├── KeepAwake.swift                 # IOPMAssertion
├── HUDController.swift             # toasts "✓ Texto copiado"
├── HotKeyManager.swift             # Carbon RegisterEventHotKey multi-hotkey
└── Settings.swift                  # UserDefaults
```

**El truco clave** (igual que Maccy): el panel usa `.nonactivatingPanel`, así puede recibir teclado para buscar **sin activar la app** — la app donde estabas escribiendo sigue siendo la activa, y el pegado directo llega al lugar correcto.

**Snippets sin Input Monitoring:** el event tap es activo (`kCGEventTapOptionDefault`), que solo requiere Accesibilidad (ya concedida), pero **nunca modifica ni bloquea eventos** — todo pasa intacto. Los eventos sintéticos propios van firmados (`userData = 'CLPYSNIP'`) para no re-procesarlos.
