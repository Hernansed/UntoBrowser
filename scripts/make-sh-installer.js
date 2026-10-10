#!/usr/bin/env node
// scripts/make-sh-installer.js
//
// Wraps the electron-builder "dir" output (linux-unpacked) into a single
// self-extracting POSIX shell installer: dist/Unto-Browser-<version>.sh
//
// The .sh file = shell stub (extract & install logic) + base64 payload.
// POSIX-ish, needs only: sh, base64, tar, gzip, mkdir, printf.

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const dist = path.join(root, 'dist');
const unpacked = path.join(dist, 'linux-unpacked');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

const APP_NAME = pkg.productName || pkg.name;
const VERSION = pkg.version;
const INSTALL_DIR = '$HOME/.local/opt/unto';
const OUT = path.join(dist, `Unto-Browser-${VERSION}.sh`);

if (!fs.existsSync(path.join(unpacked, 'unto'))) {
  console.error(`\nMissing ${path.relative(root, unpacked)}.\nRun first:  npm run dist:linux:sh  (electron-builder --linux dir)\n`);
  process.exit(1);
}

console.log('Packing', unpacked, '->', path.basename(OUT));

// 1. tar+gzip the unpacked app (deterministic-ish; no owner info needed).
const payloadFile = path.join(dist, '.unto-payload.tar.gz');
execSync(
  `tar -C "${dist}" -czf "${payloadFile}" linux-unpacked`,
  { stdio: 'inherit' }
);

const stub = `#!/bin/sh
# ${APP_NAME} ${VERSION} — self-extracting installer for Linux
# Installs to ${INSTALL_DIR} and adds a desktop entry.
set -e

APP_NAME="${APP_NAME}"
VERSION="${VERSION}"
INSTALL_DIR="${INSTALL_DIR}"
DESKTOP_FILE="$HOME/.local/share/applications/unto.desktop"
MARKER='____CLEARBROWSER_PAY''LOAD_BELOW____'   # split so awk only matches the payload line below

# ---- extract --------------------------------------------------------------
TMPDIR_X="\$(mktemp -d)"
trap 'rm -rf "\$TMPDIR_X"' EXIT
AWK_PROG='/'"\$MARKER"'/{found=1;next} found{print}'
awk "\$AWK_PROG" "\$0" | base64 -d | tar -xzf - -C "\$TMPDIR_X"

# ---- install --------------------------------------------------------------
mkdir -p "\$INSTALL_DIR"
rm -rf "\$INSTALL_DIR/linux-unpacked"
cp -r "\$TMPDIR_X/linux-unpacked" "\$INSTALL_DIR/"
chmod +x "\$INSTALL_DIR/linux-unpacked/unto"

BIN="\$INSTALL_DIR/linux-unpacked/unto"

# ---- desktop entry --------------------------------------------------------
mkdir -p "\$HOME/.local/share/applications"
cat > "\$DESKTOP_FILE" <<EOF
[Desktop Entry]
Type=Application
Name=\${APP_NAME}
Comment=A Chromium-based browser
Exec=\${BIN}
Icon=\$INSTALL_DIR/linux-unpacked/resources/app.png
Terminal=false
Categories=Network;WebBrowser;
EOF
chmod +x "\$DESKTOP_FILE"

echo ""
echo "\${APP_NAME} \${VERSION} installed successfully."
echo "  Binary:  \$BIN"
echo "  Menu:    look for '\${APP_NAME}' in your application launcher"
echo "  Run now: \$BIN"
exit 0                     # everything below is payload, never executed
`;

fs.writeFileSync(OUT, stub + '\n' + '____CLEARBROWSER_PAYLOAD_BELOW____\n');
// Stream base64 straight into the file (no in-memory buffering).
execSync(`base64 "${payloadFile}" >> "${OUT}"`);
fs.chmodSync(OUT, 0o755);
fs.unlinkSync(payloadFile);

console.log('Created', OUT);
