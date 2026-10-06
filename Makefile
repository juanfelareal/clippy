APP      = Clippy
BUNDLE   = build/$(APP).app
VERSION  = $(shell /usr/libexec/PlistBuddy -c 'Print CFBundleShortVersionString' Resources/Info.plist)
DMG      = build/$(APP)-$(VERSION)-mac.dmg
ARM      = .build/arm64-apple-macosx/release/$(APP)
X86      = .build/x86_64-apple-macosx/release/$(APP)

# Identidad de firma ESTABLE. macOS amarra los permisos (Accesibilidad,
# Grabación de pantalla) a este certificado: mientras firmes siempre con el
# mismo, los permisos sobreviven a recompilar y a actualizar (en tu Mac y en
# el de quien la instale). Crearlo/restaurarlo: `make signing-cert`.
# Si algún día hay Apple Developer ID, basta con cambiar esta variable.
SIGN_ID ?= Clippy Code Signing (Juan Felipe)

.PHONY: build bundle install run dmg release signing-cert check-sign clean

build:
	swift build -c release --triple arm64-apple-macosx14.0
	swift build -c release --triple x86_64-apple-macosx14.0

check-sign:
	@security find-identity -p codesigning | grep -q "$(SIGN_ID)" || { \
	  echo "❌ No encuentro el certificado \"$(SIGN_ID)\" en el llavero."; \
	  echo "   Corre: make signing-cert   (crea uno o restaura el respaldo de ~/.clippy-signing)"; \
	  echo "   Firmar con otro certificado hace que macOS pida los permisos otra vez a todos."; \
	  exit 1; }

bundle: build check-sign
	rm -rf $(BUNDLE)
	mkdir -p $(BUNDLE)/Contents/MacOS $(BUNDLE)/Contents/Resources
	lipo -create $(ARM) $(X86) -output $(BUNDLE)/Contents/MacOS/$(APP)
	cp Resources/Info.plist $(BUNDLE)/Contents/Info.plist
	cp Resources/AppIcon.icns $(BUNDLE)/Contents/Resources/AppIcon.icns
	printf 'APPL????' > $(BUNDLE)/Contents/PkgInfo
	codesign --force --options runtime --timestamp=none --sign "$(SIGN_ID)" $(BUNDLE)
	codesign --verify --strict $(BUNDLE)
	@codesign -d -r- $(BUNDLE) 2>&1 | grep designated

install: bundle
	@pkill -x $(APP) 2>/dev/null || true
	rm -rf /Applications/$(APP).app
	cp -R $(BUNDLE) /Applications/
	@echo "✅ Instalado en /Applications/$(APP).app (firmado con \"$(SIGN_ID)\": los permisos se conservan)"

run: bundle
	open $(BUNDLE)

# Instalador para compartir: arrastrar Clippy a Aplicaciones.
dmg: bundle
	rm -rf build/dmg $(DMG)
	mkdir -p build/dmg
	cp -R $(BUNDLE) build/dmg/
	ln -s /Applications build/dmg/Aplicaciones
	cp INSTALAR-MAC.md "build/dmg/Léeme - Cómo instalar.md"
	hdiutil create -volname "$(APP) $(VERSION)" -srcfolder build/dmg -ov -format UDZO $(DMG) >/dev/null
	codesign --force --timestamp=none --sign "$(SIGN_ID)" $(DMG)
	rm -rf build/dmg
	@echo "✅ $(DMG) ($$(du -h $(DMG) | cut -f1))"

# Publica el .dmg en el GitHub Release v$(VERSION) con nombre fijo
# (Clippy-mac.dmg) para que el link .../releases/latest/download/Clippy-mac.dmg
# de la landing siempre sirva la última versión.
release: dmg
	cp $(DMG) build/Clippy-mac.dmg
	gh release view v$(VERSION) >/dev/null 2>&1 \
	  || gh release create v$(VERSION) --title "Clippy $(VERSION)" --notes "Descarga e instrucciones: https://juanfelareal.github.io/clippy/"
	gh release upload v$(VERSION) build/Clippy-mac.dmg --clobber

signing-cert:
	bash scripts/signing-cert.sh

clean:
	rm -rf .build build
