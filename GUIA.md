# Guía operativa

Leer **cuando** toques Termux/rsync, el CLI de vídeo o el sitio en `docs/`. El contrato de entrada es [AGENTS.md](AGENTS.md). Comandos para humanos: [README.md](README.md#uso-humano). Diseño: [SDD.md](SDD.md). Formato: [schema/deck.schema.json](schema/deck.schema.json).

## Rutas

| Qué | Dónde |
| --- | --- |
| Git | `/storage/emulated/0/Documents/work/projects/prezi-slides` |
| Working copy Node | `$HOME/.node-projects/prezi-slides` |
| Caché Vite | `$HOME/.cache/prezi-slides-vite` |
| MP4 / measures / smoke | `$HOME/.node-projects/prezi-slides/output/` |
| Sitio estático versionado | `docs/` en el git (GitHub Pages) |

`termux-setup.sh` rsync git → ROOT y `npm install` en ROOT; el lockfile vuelve al git.

## Dev y rsync

FUSE no dispara inotify. `run.sh dev` rsync cada 1 s con `--size-only` para que Vite en ext4 vea los saves.

```bash
PREZI_NO_RSYNC_LOOP=1 bash run.sh
```

Con el loop apagado, relanza `run.sh` (o `run.sh sync`) tras cada tanda de edits. Un save del mismo tamaño de bytes no llega a Vite hasta `sync` o restart.

El rsync a ROOT **excluye** `docs/` (el sitio versionado no debe pisar el working copy). Excludes del script: `scripts/rsync-to-root.sh`.

## validate

`run.sh validate` recorre `decks/*/deck.yaml`. Con slug, uno solo. Códigos y semántica: [SDD — JSON Schema y validador](SDD.md).

Overlap de cajas: el CLI solo lo emite si los hermanos tienen `geometry.width` **y** `height`. Los tests de overlap viven en `src/engine/layout.test.ts` (medidas fake).

`classifyAsset` / `rewriteAssetSrc` exigen un único segmento tras `assets/`. Un path que el schema dejara pasar con subcarpeta revienta al pintar: el validador lo rechaza como `asset-type`.

## Vídeo

Flythrough del mismo DOM (`html-to-image` + ffmpeg `libx264`). Hace falta `measures.json` del visor. Contrato de captura: [SDD Key Decision 10](SDD.md) — `toPng(.viewport)`, seek de cámara.

```bash
bash run.sh video --smoke golden-tiny
bash run.sh video golden-tiny
```

Chrome en **primer plano** hasta que el CLI imprima la ruta. Android pausa `toPng` en segundo plano.

Salida en ROOT `output/`:

- `output/<slug>/smoke.png` — encuadre del paso 0
- `output/<slug>.measures.json` — cajas
- `output/<slug>.mp4` — 1280×800, 30 fps

Sidecar: `PREZI_VIDEO_BIND` default `127.0.0.1`, `PREZI_VIDEO_PORT` 4322 (si ocupado, 4323). Siempre imprime `http://127.0.0.1:$PORT/d/<slug>?export=video`. Si el bind es `0.0.0.0` o `::`, imprime también la IP wlan. Si Chrome no trata Termux como localhost:

```bash
PREZI_VIDEO_BIND=0.0.0.0 bash run.sh video golden-tiny
```

Timeout 10 min (`PREZI_VIDEO_TIMEOUT_MS`). Timeline: `hold(0), vuelo, hold(1), …`.

## GitHub Pages (`run.sh site`)

`run.sh build` y `dev` dejan el visor en `/`. Solo `site` pone `PREZI_SITE` (default `https://ChristianGonper.github.io`) y `PREZI_BASE` (default `/spatial-decks`), copia `$ROOT/dist` → git `docs/` y escribe `docs/.nojekyll`.

Los hashes de `docs/_astro/` salen del build: cámbialos regenerando con `site`. Cómo publicar: [README — Prototipo en la web](README.md#prototipo-en-la-web-github-pages).

## Lienzo (al tocar Presenter / captura)

Preorden del DOM, siblings y `client:*`: [AGENTS.md](AGENTS.md). Layout, cámara, medida: [SDD.md](SDD.md).

Al editar el boot o el cliente:

- `.world.is-pending` usa `visibility: hidden`.
- JSON de boot: `JSON.stringify(boot).replace(/</g, '\\u003c')` en `Presenter.astro`; el script de boot no se cierra a sí mismo.
- `present.ts` / `measure.ts` / `capture.ts` no importan `load` / `validate` / `markdown`.
- `boot.frames` sale de `preorderFrameIds` en `src/pages/d/[slug].astro` (el snippet del SDD con `Object.values(ir.frames)` deja al padre encima de los hijos).
