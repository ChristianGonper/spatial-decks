# prezi-slides

Presentaciones **espaciales**: un mapa, no una pila de páginas.

En lugar de ir de la diapositiva 1 a la 2, el tema vive en un **lienzo 2D**. Los recuadros (frames) se agrupan en capítulos; presentar es mover la **cámara** (pan y zoom) por un **camino** que tú (o un agente) escribes en texto. Primero ves el mapa, luego un capítulo, luego una ficha, y vuelves a alejarte.

La fuente de verdad no es un `.pptx` ni un editor visual. Es un árbol de archivos en git: Markdown, un manifiesto YAML, y las imágenes al lado. El visor solo pinta. Si cambias un frame, el diff es ese archivo.

Este repositorio es el visor, el validador y dos decks de ejemplo. Corre en local (pensando en una tablet con Termux y el navegador de Android).

## Qué estás viendo

Un **frame** es un recuadro con título, texto, listas, código, fórmulas (LaTeX) e imágenes PNG/SVG. Un padre puede tener Markdown propio **y** hijos: al alejar la cámara lees el grupo; al acercarte, la ficha.

El **path** es la charla: una lista de ids. Puede visitar un padre (overview de un capítulo) y luego sus hojas. Siguiente / anterior recorren ese camino. Overview salta al root y vuelve.

El **layout** no se arrastra a mano. El árbol declara `grid`, `row` o `column`; el motor coloca los recuadros. No hay rotación.

Look: un tema editorial (papel crema, tinta, borgoña), no un dashboard oscuro.

```
decks/<slug>/
  deck.yaml          manifiesto: título, root, path
  frames/<id>.md     un recuadro (el id es el nombre del archivo)
  assets/            PNG o SVG locales
```

## Decks que trae el repo

| Deck | Qué es |
| --- | --- |
| [`golden-tiny`](decks/golden-tiny/) | Mini-mapa de prueba (root + dos fichas). Sirve para validar y para el vídeo. |
| [`quasi-geostrofica`](decks/quasi-geostrofica/) | Mini-clase (~15–20 min) de teoría cuasi-geostrófica: Rossby, geostrofía, QGPV, omega, ondas de Rossby QG. |

En el visor: `/` es el índice, `/d/<slug>` el presentador, `/acerca` una nota corta.

## Uso (humano)

Hace falta Node 24 y `rsync`. En Termux el git vive en almacenamiento compartido (FUSE): **no** ejecutes `npm install` dentro del clone. El setup copia el árbol a `$HOME/.node-projects/prezi-slides` y ahí corre Node.

```bash
pkg install rsync          # Termux; en un escritorio, rsync del sistema
bash scripts/termux-setup.sh
bash run.sh                # visor de desarrollo, puerto 4322
```

En el navegador: `http://127.0.0.1:4322` o, desde la tablet hacia Termux, `http://<IP>:4322`.

| Comando | Efecto |
| --- | --- |
| `bash run.sh` | Desarrollo (recarga). Edita siempre los archivos del **git**, no la copia en `$HOME`. |
| `bash run.sh build` | HTML estático del presentador. |
| `bash run.sh preview` | Sirve ese build (hace falta HTTP; no abras `file://`). |
| `bash run.sh validate` | Comprueba los decks. |
| `bash run.sh video [slug]` | MP4 corto del path (cámara + holds). Chrome en **primer plano** hasta que termine. |
| `bash run.sh site` | Regenera `docs/`: HTML estático con prefijo `/spatial-decks/` para GitHub Pages. |

Controles en el presentador: Anterior, Siguiente, Overview. Teclado: flechas, espacio, `j`/`k`, `Esc`/`o`.

## Prototipo en la web (GitHub Pages)

El directorio [`docs/`](docs/) es el visor **compilado** (HTML, CSS, JS, figuras). No hace falta Node para mirarlo una vez publicado.

Repo: [ChristianGonper/spatial-decks](https://github.com/ChristianGonper/spatial-decks). Hoy es **privado**. En el plan gratuito, GitHub Pages para una URL pública pide el repo **público** (o GitHub Pro si sigue privado).

Cuando quieras el enlace para compañeros:

1. `bash run.sh site` (si cambiaste decks o código) y commit de `docs/`.
2. GitHub → Settings → Pages → Deploy from a branch → `main` / `/docs`.
3. Si el repo es público, la URL será  
   `https://ChristianGonper.github.io/spatial-decks/`  
   Índice, `/d/golden-tiny/`, `/d/quasi-geostrofica/`.

Hasta entonces, `docs/` ya viaja en el git: quien tenga acceso al repo puede servir esa carpeta con cualquier HTTP estático.

El detalle de Termux (FUSE, bucle rsync, `PREZI_VIDEO_BIND`, Pages) está en [`GUIA.md`](GUIA.md). El contrato corto al entrar al repo: [`AGENTS.md`](AGENTS.md).

## Qué no es (aún)

No hay editor visual, ni arrastrar frames, ni rotación, ni path con ramas. No hay PDF. El vídeo no es la charla hablada: es un flythrough de unos minutos. No hay cuentas ni nube: es un sitio estático local.

## Documentación

- [`PRD.md`](PRD.md) — producto y alcance
- [`SDD.md`](SDD.md) — diseño (layout, cámara, captura de vídeo)
- [`AGENTS.md`](AGENTS.md) — contrato de entrada para un agente
- [`GUIA.md`](GUIA.md) — operación: Termux, rsync, vídeo, GitHub Pages
- [`schema/deck.schema.json`](schema/deck.schema.json) — formato de deck y frames
