# AGENTS.md — prezi-slides

Contrato de entrada. Grok carga este archivo entero al abrir el repo: aquí solo lo que hace falta para no romper el árbol ni el visor.

Producto: [README.md](README.md). Formato: [schema/deck.schema.json](schema/deck.schema.json). Diseño: [SDD.md](SDD.md). Operación (rsync, vídeo, Pages, trampas del CLI): [GUIA.md](GUIA.md). Alcance de producto: [PRD.md](PRD.md).

La API del agente es el archivo: lees el schema, escribes `decks/` y `src/`, corres `validate`. No hay MCP ni `add-frame`.

## Entorno

Git (FUSE): `/storage/emulated/0/Documents/work/projects/prezi-slides`.
Node (ext4): `$HOME/.node-projects/prezi-slides`. Puerto **4322**.

Edita **siempre** el git. `run.sh` hace rsync git → ROOT. El rsync pisa `src/` en ROOT.

- npm, `node_modules/` y `dist/` solo en ROOT.
- Rsync: `scripts/rsync-to-root.sh` (el script lleva excludes y `--delete`).
- Setup: `pkg install rsync` y `bash scripts/termux-setup.sh`.

## Comandos

`bash ~/work/projects/prezi-slides/run.sh [dev|build|preview|validate|video|test|sync|site]` — el cwd da igual. Qué hace cada uno: [README — Uso](README.md#uso-humano). Flags y trampas: [GUIA.md](GUIA.md).

Tras cambiar un deck: `validate` y recargar el visor. Tras `preview`, hace falta `build` otra vez.

## Decks

```
decks/<slug>/deck.yaml
decks/<slug>/frames/<id>.md    # id ≡ basename
decks/<slug>/assets/<file>.png|svg
```

Manifiesto, frontmatter y Markdown: schema + [SDD — Formato en disco](SDD.md). Ejemplos vivos: `decks/golden-tiny/`, `decks/quasi-geostrofica/`. Fixtures rotas: `tests/fixtures/` (`validate` recorre solo `decks/`).

Imágenes: un solo segmento tras `assets/`, solo `.png`/`.svg`.

## Código del visor

En componentes `.astro` el presentador es un `<script>` procesado, sin `client:*`. Padres y hijos son siblings en `.world`; el DOM sale en preorden (`src/pages/d/[slug].astro`). Layout, cámara, captura: [SDD.md](SDD.md). Módulos Node vs cliente: SDD «Módulos: de qué lado corren».

## Qué leer según la tarea

| Tarea | Dónde |
| --- | --- |
| Editar o crear un deck | schema + un ejemplo en `decks/` + `run.sh validate` |
| Motor, layout, cámara, captura | [SDD.md](SDD.md) |
| Termux, rsync, vídeo MP4, GitHub Pages | [GUIA.md](GUIA.md) |
| Producto y fuera de v1 | [README.md](README.md), [PRD.md](PRD.md) |
