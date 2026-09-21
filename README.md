# prezi-slides

Visor espacial de decks (lienzo 2D, cámara, texto en git). Sitio estático
Astro (`output: 'static'`). Código y git en
`~/work/projects/prezi-slides/`. npm y el proceso Node corren en una
working copy rsync en ext4:

`$HOME/.node-projects/prezi-slides`

`~/work` es FUSE: no admite symlinks y no ejecuta binarios. **Nunca**
`npm install` en este directorio. No uses `cp -a` en lugar de rsync.
Puerto **4322** (revista-laboratorio usa 4321).

## Primera vez

Node 24 de Termux y `rsync` (paquete `rsync` en termux-main, no rclone):

```bash
pkg install rsync
bash ~/work/projects/prezi-slides/scripts/termux-setup.sh
```

`termux-setup.sh` instala `rsync` si falta, rsync del git → ROOT, y
`npm install` **en ROOT**. El lockfile se copia de vuelta al git.

## Uso

Editar **siempre** el git en `~/work`. No editar
`$HOME/.node-projects/prezi-slides/src` (el bucle rsync lo pisa).

```bash
bash ~/work/projects/prezi-slides/scripts/termux-setup.sh
bash ~/work/projects/prezi-slides/run.sh          # rsync + astro dev --host 0.0.0.0
bash ~/work/projects/prezi-slides/run.sh build
bash ~/work/projects/prezi-slides/run.sh preview  # sirve $ROOT/dist
bash ~/work/projects/prezi-slides/run.sh sync
```

`run.sh preview` sirve `$ROOT/dist`, no un `dist/` del checkout git.

En el navegador de la tablet: `http://<IP-wlan0>:4322`. IP:
`ifconfig wlan0` o `ip -4 addr`. El proceso debe seguir vivo en Termux.

Rutas v1: `/` (índice), `/d/<slug>` (presentador), `/acerca`.

## Bucle rsync (dev)

FUSE no dispara inotify. En `run.sh dev` un bucle rsync 1 s (tick
`--size-only`) hace que Vite en ext4 vea los saves. Si Chrome recarga
solo cada segundo o Termux se pone a 100 % CPU:

```bash
PREZI_NO_RSYNC_LOOP=1 bash ~/work/projects/prezi-slides/run.sh
```

y relanzar `run.sh` tras cada tanda de edits. Un save del mismo tamaño
de bytes no se verá hasta `run.sh sync` / restart.

## Qué no hacer

- `npm install` / `npm run` en el checkout FUSE
- `pnpm`
- `cp -a` en lugar de `scripts/rsync-to-root.sh`
- crear `node_modules/` o `dist/` dentro del repo
