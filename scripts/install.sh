#!/bin/sh
# Unto Browser — one-command installer for Linux
# Usage:  curl -fsSL https://raw.githubusercontent.com/Hernansed/UntoBrowser/main/scripts/install.sh | bash
#
# Detects the distro family, picks the right package (.deb or .rpm) from the
# latest GitHub Release and installs it with the system package manager.
set -e

REPO="Hernansed/UntoBrowser"
API="https://api.github.com/repos/$REPO/releases/latest"

# --- fetch latest release metadata -----------------------------------------
command -v curl >/dev/null 2>&1 || command -v wget >/dev/null 2>&1 || {
  echo "Need curl or wget to download. Install one and retry." >&2; exit 1; }

fetch() { # fetch <url> <outfile>
  if command -v curl >/dev/null 2>&1; then
    curl -fsSL "$1" -o "$2"
  else
    wget -qO "$2" "$1"
  fi
}

META=$(mktemp)
trap 'rm -f "$META" "$PKG"' EXIT
PKG=$(mktemp)

fetch "$API" "$META"
TAG=$(sed -n 's/.*"tag_name": *"\([^"]*\)".*/\1/p' "$META" | head -n1)
[ -n "$TAG" ] || { echo "Could not read the latest release from GitHub." >&2; exit 1; }
VER=${TAG#v}
echo "Latest release: $TAG"

# --- detect package family --------------------------------------------------
DEB=0; RPM=0
if command -v dpkg >/dev/null 2>&1 || command -v apt-get >/dev/null 2>&1; then
  DEB=1
elif command -v rpm >/dev/null 2>&1 || command -v dnf >/dev/null 2>&1 \
  || command -v zypper >/dev/null 2>&1 || command -v yum >/dev/null 2>&1; then
  RPM=1
elif [ -f /etc/os-release ]; then
  # shellcheck disable=SC1091
  . /etc/os-release
  case "${ID:-} ${ID_LIKE:-}" in
    *debian*|*ubuntu*) DEB=1 ;;
    *fedora*|*rhel*|*suse*|*opensuse*|*centos*) RPM=1 ;;
  esac
fi
[ "$DEB" = 1 ] || [ "$RPM" = 1 ] || {
  echo "Unsupported distro: neither dpkg nor rpm found." >&2; exit 1; }

# --- download (stable name first, versioned name as fallback) ---------------
if [ "$DEB" = 1 ]; then
  URLS="https://github.com/$REPO/releases/latest/download/unto-browser-latest.deb
        https://github.com/$REPO/releases/download/$TAG/unto-browser_${VER}_amd64.deb"
else
  URLS="https://github.com/$REPO/releases/latest/download/unto-browser-latest.rpm
        https://github.com/$REPO/releases/download/$TAG/unto-browser-${VER}.x86_64.rpm"
fi

echo "Downloading package…"
OK=0
for u in $URLS; do
  if fetch "$u" "$PKG" && [ -s "$PKG" ]; then OK=1; break; fi
done
[ "$OK" = 1 ] || { echo "Download failed." >&2; exit 1; }

# --- install ----------------------------------------------------------------
echo "Installing (sudo may ask for your password)…"
if [ "$DEB" = 1 ]; then
  if command -v apt-get >/dev/null 2>&1; then
    sudo apt-get install -y "$PKG"
  else
    sudo dpkg -i "$PKG" || sudo apt-get install -y -f
  fi
else
  if command -v dnf >/dev/null 2>&1; then
    sudo dnf install -y "$PKG"
  elif command -v zypper >/dev/null 2>&1; then
    sudo zypper --non-interactive install "$PKG"
  else
    sudo rpm -Uvh --force "$PKG"
  fi
fi

echo ""
echo "Unto Browser $VER installed."
echo "  Launch:  'Unto' in your application menu, or run:  unto"
