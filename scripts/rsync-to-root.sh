#!/usr/bin/env bash
set -euo pipefail
SRC="${PREZI_SRC:-$(cd "$(dirname "$0")/.." && pwd)}"
ROOT="${PREZI_ROOT:-$HOME/.node-projects/prezi-slides}"
RSYNC="${PREZI_RSYNC:-rsync}"
if ! command -v "$RSYNC" >/dev/null 2>&1; then
  echo "falta rsync en PATH. En Termux: pkg install rsync" >&2
  echo "(paquete 'rsync' en termux-main, no rclone/librsync)" >&2
  exit 1
fi
mkdir -p "$ROOT" "${HOME}/.cache/prezi-slides-vite"
# Árbol regular en ext4. --delete limpia fuentes viejas; los exclude
# impiden borrar node_modules/, dist/, .astro/, output/ y el pidfile del loop.
# Flags extra: PREZI_RSYNC_FLAGS (p.ej. --size-only en el bucle dev).
# No usar cp -a: pierde --delete y los exclude.
# shellcheck disable=SC2086
"$RSYNC" -a --delete ${PREZI_RSYNC_FLAGS:-} \
  --exclude node_modules/ \
  --exclude dist/ \
  --exclude .astro/ \
  --exclude .git/ \
  --exclude .gitignore \
  --exclude .rsync-loop.pid \
  --exclude output/ \
  --exclude docs/ \
  "$SRC/" "$ROOT/"
