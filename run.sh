#!/usr/bin/env bash
# bash ~/work/projects/prezi-slides/run.sh dev|build|preview|sync|validate|video|test
set -euo pipefail
SRC="$(cd "$(dirname "$0")" && pwd)"
ROOT="${HOME}/.node-projects/prezi-slides"
PIDFILE="$ROOT/.rsync-loop.pid"

if ! command -v "${PREZI_RSYNC:-rsync}" >/dev/null 2>&1; then
  bash "$SRC/scripts/termux-setup.sh"
fi
bash "$SRC/scripts/rsync-to-root.sh"
if [[ ! -x "$ROOT/node_modules/.bin/astro" ]]; then
  bash "$SRC/scripts/termux-setup.sh"
fi
cd "$ROOT"
cmd="${1:-dev}"
shift || true
export npm_config_cache="${HOME}/.npm"

if [[ "$cmd" == "sync" ]]; then
  exit 0   # solo rsync-to-root
fi

loop_pid=""
stop_loop() {
  local pid="$1" sid
  [[ -z "$pid" ]] && return 0
  # SID==PID → setsid (líder de sesión): kill -- -pid recorta sleep/rsync.
  # Si no, NO usar kill -- -pid (es el PGID del TTY y tumba npm/run.sh).
  sid=$(ps -o sid= -p "$pid" 2>/dev/null | tr -d '[:space:]' || true)
  if [[ "$sid" == "$pid" ]]; then
    kill -- -"$pid" 2>/dev/null || kill "$pid" 2>/dev/null || true
  else
    kill "$pid" 2>/dev/null || true
    kill $(pgrep -P "$pid" 2>/dev/null) 2>/dev/null || true
  fi
  wait "$pid" 2>/dev/null || true
}
cleanup() {
  # Solo el loop de este proceso. Un build/preview paralelo no debe
  # matar el rsync de un `run.sh dev` ni borrar su pidfile.
  stop_loop "$loop_pid"
  if [[ -n "$loop_pid" && -f "$PIDFILE" ]]; then
    old=$(cat "$PIDFILE" || true)
    [[ "$old" == "$loop_pid" ]] && rm -f "$PIDFILE"
  fi
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

# Dev: FUSE no dispara inotify. Un rsync 1s hace que Vite (ext4) vea los saves.
# Desactivar: PREZI_NO_RSYNC_LOOP=1 (entonces relanzar run.sh tras editar).
# --size-only en el tick: mtimes de sdcardfs a veces «siempre viejos» y -a
# reescribe src/+public/ cada segundo → HMR storm. Un save del mismo tamaño
# de bytes no se verá hasta run.sh sync / restart; es el trade-off.
if [[ "$cmd" == "dev" && "${PREZI_NO_RSYNC_LOOP:-}" != "1" ]]; then
  if [[ -f "$PIDFILE" ]]; then
    stop_loop "$(cat "$PIDFILE" || true)"
    rm -f "$PIDFILE"
  fi
  loop_cmd='export PREZI_RSYNC_FLAGS="${PREZI_RSYNC_LOOP_FLAGS:---size-only}"
    while true; do sleep 1; bash "$1" || true; done'
  if command -v setsid >/dev/null 2>&1; then
    setsid bash -c "$loop_cmd" bash "$SRC/scripts/rsync-to-root.sh" &
  else
    bash -c "$loop_cmd" bash "$SRC/scripts/rsync-to-root.sh" &
  fi
  loop_pid=$!
  echo "$loop_pid" > "$PIDFILE"
fi

# NO exec: exec salta el trap EXIT y el bucle rsync --delete queda de huérfano
# (hijo de npm/node o de init). npm en primer plano; al salir corre cleanup.
npm run "$cmd" -- "$@"
