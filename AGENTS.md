# AGENTS.md — prezi-slides

Contrato operativo para agentes (y para humanos que editan el mismo árbol). El README es la página del producto; aquí está el cómo.

No hay MCP ni `add-frame`. La API es el archivo: lees el schema, escribes frames y path, corres `validate`.

## Entorno (Termux / FUSE)

Código y git: `~/work/projects/prezi-slides/` (FUSE: `/storage/emulated/0/Documents/work/...`).

npm y Node **solo** en `$HOME/.node-projects/prezi-slides` (ext4). `~/work` no ejecuta binarios ni admite symlinks.

- Nunca `npm install` / `npm run` / `node_modules/` / `dist/` en el checkout git.
- Nunca `pnpm`. Nunca `cp -a` en lugar de `scripts/rsync-to-root.sh`.
- Editar **siempre** el git. No editar `$HOME/.node-projects/prezi-slides/src` (el rsync lo pisa).
- Puerto **4322**.

```bash
pkg install rsync
bash scripts/termux-setup.sh
```

`termux-setup.sh` rsync git → ROOT y `npm install` en ROOT. El lockfile se copia de vuelta al git.

## Comandos

Cwd irrelevante si usas `bash ~/work/projects/prezi-slides/run.sh …`.

| Comando | Qué hace |
| --- | --- |
| `run.sh` / `run.sh dev` | rsync + `astro dev --host 0.0.0.0` |
| `run.sh build` | HTML estático en `$ROOT/dist` (no un `dist/` del FUSE) |
| `run.sh preview` | sirve ese `dist/` |
| `run.sh validate [slug]` | Ajv2020 + semántica; exit ≠ 0 si falla. Sin slug: todos los de `decks/` |
| `run.sh video [--smoke] [slug]` | MP4 flythrough (mismo DOM del presentador) |
| `run.sh test` | `node --test --experimental-strip-types` |
| `run.sh sync` | un rsync git → ROOT sin arrancar el server |

Tras cambiar un deck, `validate` y recargar el visor. Tras `preview`, hay que `build` otra vez.

## Schema y formato

- Schema: `schema/deck.schema.json` (Draft 2020-12, `$comment: version 1`).
- Un YAML monolítico se rechaza.

```
decks/<slug>/
  deck.yaml
  frames/<id>.md     # id ≡ basename, sin .md
  assets/<file>.png|svg
```

`deck.yaml` exige `slug` (igual al directorio), `title`, `root`, `path`. Opcional: `lang` (`es`\|`en`), `theme` (`editorial` en v1), `camera.duration_ms` (default 1000), `video.hold_ms` (default 3000). Path: ids o `{id, duration_ms}`. Puede repetir un id y visitar padres.

Frontmatter de frame: `id` obligatorio y **igual al filename**. `layout` ∈ `grid`\|`row`\|`column` (default `grid`). `children` (el árbol se declara solo aquí, no hay campo `parent`). `geometry` parcial `{x,y,width,height}` es override; el caso normal es no ponerla. `0` es un valor (clave ausente vs presente).

Markdown: títulos, texto, listas, código, `![alt](assets/foo.svg)` (un solo segmento tras `assets/`, solo `.png`/`.svg`, no URLs). Math: `$...$` y `$$...$$` (KaTeX en Node, `throwOnError`). Sin HTML crudo, Mermaid, notes, ni CSS por frame.

Ejemplos: `decks/golden-tiny/` (fixture) y `decks/quasi-geostrofica/` (clase). Fixtures rotas de test: `tests/fixtures/` — `validate` **no** las recorre.

## Validador

`run.sh validate` recorre `decks/*/deck.yaml` (o un slug). Rechaza al menos:

- ID duplicado (dos files con el mismo `id` en frontmatter)
- `id` ≠ basename (`id-filename`)
- path a un id inexistente
- imagen referenciada ausente
- `layout` que no es `grid|row|column` (`schema` y/o `layout-unknown`)
- asset remoto, sin extensión, o con subcarpeta
- HTML crudo, fence sin cerrar, TeX inválido

Overlap de cajas: el CLI **no** lo emite sin `geometry.width` y `height` en hermanos. Los tests de overlap viven en `src/engine/layout.test.ts` con medidas fake.

## Layout y cámara (no reinventar)

- Hijos: orden del archivo = orden espacial. Grid: `cols = max(1, ceil(sqrt(n)))`, row-major.
- Frames son siblings absolutos en `.world`; pintar padres **antes** que hijos (preorden al armar `boot.frames`).
- Cámara: pan + zoom, sin rotación. Default 1000 ms, `easeInOutCubic`, lerp de `log(scale)`.
- Presentar: next/prev por el path; Overview → root y vuelta. Next/prev **en** overview salen y van a `i±1`. Recarga → paso 0. Sin deep links v1.
- Prohibido `client:*` en componentes `.astro`. El presentador es un `<script>` procesado sin atributos.

## Vídeo

Flythrough del **mismo DOM** (`html-to-image` + ffmpeg `libx264`). No hay estimador: hace falta `measures.json` del visor. No fabricar un MP4 a mano si Chrome no POST.

```bash
bash run.sh video --smoke golden-tiny
bash run.sh video golden-tiny
```

Chrome **en primer plano** hasta que el CLI imprima la ruta. Android pausa `toPng` en segundo plano.

Salida en ROOT (`$HOME/.node-projects/prezi-slides/output/`):

- `output/<slug>/smoke.png` — encuadre del paso 0
- `output/<slug>.measures.json` — cajas (obligatorio)
- `output/<slug>.mp4` — 1280×800, 30 fps

Sidecar: `PREZI_VIDEO_BIND` default `127.0.0.1`, `PREZI_VIDEO_PORT` 4322 (si ocupado, 4323). Siempre imprime `http://127.0.0.1:$PORT/d/<slug>?export=video`. **Solo si** el bind es `0.0.0.0` o `::` imprime también la IP wlan. Si Chrome no trata Termux como localhost:

```bash
PREZI_VIDEO_BIND=0.0.0.0 bash run.sh video golden-tiny
```

Timeout 10 min (`PREZI_VIDEO_TIMEOUT_MS`). Timeline: `hold(0), vuelo, hold(1), …`. Captura = `toPng(.viewport)`, nunca `.world`; seek de cámara, no `sleep(hold_ms)`.

## Bucle rsync (dev)

FUSE no dispara inotify. `run.sh dev` rsync 1 s (`--size-only`) para que Vite en ext4 vea los saves.

```bash
PREZI_NO_RSYNC_LOOP=1 bash run.sh
```

y relanzar tras cada tanda de edits. Un save del mismo tamaño de bytes no se verá hasta `run.sh sync` o restart.

## Alcance v1 (no implementar)

Editor visual, write-back espacial, rotación, pinch-explore, path con ramas, MCP CRUD, notas de presentador, Mermaid, temas múltiples, PDF, narración, `file://`.
