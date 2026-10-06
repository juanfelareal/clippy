# Cómo instalar Clippy en tu Mac 📎

Requisitos: macOS 14 (Sonoma) o más nuevo. Funciona en Mac con Apple Silicon (M1–M4) y con Intel.

## 1. Copiar la app
1. Abre `Clippy-x.y.z-mac.dmg`.
2. Arrastra **Clippy** a la carpeta **Aplicaciones**.
3. Expulsa el disco "Clippy".

## 2. Abrirla la primera vez
Clippy no viene de la App Store, así que la primera vez macOS la bloquea con un aviso como *"Apple no pudo verificar que Clippy no contenga malware"*. Es normal. Para abrirla:

1. Abre Clippy desde Aplicaciones. Cuando salga el aviso, dale **Listo** (o **OK**).
2. Ve a  → **Ajustes del Sistema** → **Privacidad y seguridad**.
3. Baja hasta el final: verás *"Se bloqueó el uso de Clippy…"*. Dale **Abrir igualmente** y confirma con tu contraseña.

Esto se hace **una sola vez**. Aparece un 📎 en la barra de menú, arriba a la derecha.

> Atajo para quien use Terminal: `xattr -dr com.apple.quarantine /Applications/Clippy.app`

## 3. Dar los permisos (una sola vez)
| Permiso | Para qué | Dónde |
|---|---|---|
| **Accesibilidad** | Pegar directo donde estás escribiendo y expandir snippets | Ajustes → Privacidad y seguridad → Accesibilidad → activa **Clippy** |
| **Grabación de pantalla** | Capturas anotables (⇧⌘1) y OCR (⇧⌘2) | Ajustes → Privacidad y seguridad → Grabación de pantalla y audio del sistema → activa **Clippy** |

Clippy te los pide la primera vez que usas cada función. **Después de activar un permiso, cierra Clippy (click derecho en el 📎 → Salir) y vuelve a abrirla.**

Cuando instales una versión nueva, los permisos se conservan: no hay que volver a darlos.

## Atajos
| Qué | Atajo |
|---|---|
| Historial del portapapeles | ⇧⌘C |
| Captura anotable | ⇧⌘1 |
| Texto de la pantalla (OCR) | ⇧⌘2 |
| Calculadora | ⇧⌘= |
| Snippets | escribe `//atajo` en cualquier app (se crean en el menú del 📎 → Snippets…) |
| Mantener el Mac despierto | click derecho en el 📎 |

## Privacidad
Todo queda en tu Mac (`~/Library/Application Support/Clippy/`). Clippy no se conecta a internet y no envía nada a ningún lado. Ignora lo que copies desde gestores de contraseñas.

## Desinstalar
Cierra Clippy, borra `Clippy` de Aplicaciones y, si quieres borrar el historial, la carpeta `~/Library/Application Support/Clippy/`.
