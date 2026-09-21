#!/usr/bin/env bash
set -euo pipefail
SRC="$(cd "$(dirname "$0")/.." && pwd)"
ROOT="${HOME}/.node-projects/prezi-slides"
RSYNC="${PREZI_RSYNC:-rsync}"
if ! command -v "$RSYNC" >/dev/null 2>&1; then
  echo "instalando rsync (pkg, termux-main)…" >&2
  pkg install -y rsync || {
    echo "no se pudo instalar rsync. Prueba: pkg install rsync" >&2
    exit 1
  }
fi
bash "$SRC/scripts/rsync-to-root.sh"
export npm_config_cache="${HOME}/.npm"
export npm_config_bin_links=true
cd "$ROOT"
npm install
# Lockfile nace/muta en ext4; el git en FUSE es la copia versionada.
cp -f "$ROOT/package-lock.json" "$SRC/package-lock.json"
