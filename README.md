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
bash ~/work/projects/prezi-slides/run.sh validate [slug]
bash ~/work/projects/prezi-slides/run.sh video [--smoke] [slug]
bash ~/work/projects/prezi-slides/run.sh test
bash ~/work/projects/prezi-slides/run.sh sync
```

`validate` (Ajv2020 + chequeos semánticos) recorre `decks/*/deck.yaml`.
El schema está en `schema/deck.schema.json`. Fixture de prueba:
`decks/golden-tiny/`.


`run.sh preview` sirve `$ROOT/dist`, no un `dist/` del checkout git.

En el navegador de la tablet: `http://<IP-wlan0>:4322`. IP:
`ifconfig wlan0` o `ip -4 addr`. El proceso debe seguir vivo en Termux.

Rutas v1: `/` (índice), `/d/<slug>` (presentador), `/acerca`.

## Vídeo (`run.sh video`)

Flythrough MP4 del **mismo DOM** del presentador (html-to-image en Chrome +
ffmpeg `libx264`). No hay estimador: hace falta `measures.json` del visor.

```bash
bash ~/work/projects/prezi-slides/run.sh video --smoke golden-tiny
bash ~/work/projects/prezi-slides/run.sh video golden-tiny
```

**Dejar Chrome en primer plano** hasta que el CLI imprima la ruta del MP4.
Android pausa `toPng` si la pestaña queda en segundo plano.

Salida (en ROOT, `$HOME/.node-projects/prezi-slides/output/`):

- `output/<slug>/smoke.png` — encuadre del paso 0 (`--smoke` termina aquí)
- `output/<slug>.measures.json` — cajas del visor (obligatorio)
- `output/<slug>.mp4` — 1280×800, 30 fps, hold + vuelos

El sidecar escucha `PREZI_VIDEO_BIND` (default **`127.0.0.1`**) y
`PREZI_VIDEO_PORT` (4322; si ocupado, 4323). Siempre imprime
`http://127.0.0.1:$PORT/d/<slug>?export=video` (o `export=smoke`) y abre esa
URL con `termux-open-url`. **Solo si** el bind es `0.0.0.0` o `::` imprime
también `http://<wlan0>:$PORT/…`. Si Chrome no trata Termux como localhost:

```bash
PREZI_VIDEO_BIND=0.0.0.0 bash ~/work/projects/prezi-slides/run.sh video golden-tiny
```

Timeout 10 min (`PREZI_VIDEO_TIMEOUT_MS`). Los PNG de hold se duplican en
disco bajo `output/<slug>-frames/` (ext4 ROOT; se borran tras el encode).
Disco peor caso ~0,5 GiB temporales en un deck grande.

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
