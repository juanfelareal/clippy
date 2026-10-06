#!/bin/bash
# Crea (o restaura) el certificado de firma estable de Clippy en el llavero.
# Respaldo en ~/.clippy-signing/ (clippy-signing.p12 + p12-password.txt).
# ⚠️ Guarda ese .p12 en un lugar seguro (1Password/Drive). Si se pierde, la
# siguiente versión firmada con otro certificado pedirá permisos a todos otra vez.
set -euo pipefail
NAME="Clippy Code Signing (Juan Felipe)"
D="$HOME/.clippy-signing"
KC="$HOME/Library/Keychains/login.keychain-db"

if security find-identity -p codesigning | grep -q "$NAME"; then
  echo "✅ Ya está en el llavero: $NAME"; exit 0
fi

mkdir -p "$D"; chmod 700 "$D"
if [[ ! -f "$D/clippy-signing.p12" ]]; then
  echo "→ Creando certificado nuevo…"
  TMP=$(mktemp -d); trap 'rm -rf "$TMP"' EXIT
  cat > "$TMP/cert.cnf" <<CNF
[req]
distinguished_name=dn
prompt=no
x509_extensions=ext
[dn]
CN=$NAME
O=Juan Felipe
[ext]
basicConstraints=critical,CA:false
keyUsage=critical,digitalSignature
extendedKeyUsage=critical,codeSigning
subjectKeyIdentifier=hash
CNF
  openssl req -x509 -newkey rsa:2048 -nodes -keyout "$TMP/key.pem" -out "$TMP/cert.pem" -days 3650 -config "$TMP/cert.cnf" 2>/dev/null
  openssl rand -hex 16 > "$D/p12-password.txt"
  openssl pkcs12 -export -legacy -inkey "$TMP/key.pem" -in "$TMP/cert.pem" -out "$D/clippy-signing.p12" \
    -name "$NAME" -passout "pass:$(cat "$D/p12-password.txt")"
  chmod 600 "$D"/*
fi

echo "→ Importando al llavero…"
security import "$D/clippy-signing.p12" -k "$KC" -P "$(cat "$D/p12-password.txt")" -T /usr/bin/codesign -T /usr/bin/security
security find-identity -p codesigning | grep "$NAME"
echo "✅ Listo. Respalda $D/ fuera de este Mac."
