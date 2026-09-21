# PRD — prezi-slides

Sistema personal de presentaciones espaciales (estilo Prezi): un lienzo
2D de frames anidados, una cámara que recorre un path, y un archivo de
texto como API para humanos y para agentes. Código en
`~/work/projects/prezi-slides/`.

Este documento fija producto y alcance. No elige sintaxis del deck, stack
concreto ni algoritmo numérico de layout: eso es el SDD.

## 1. Problema

Las herramientas de diapositivas lineales (una página detrás de otra) no
encajan con cómo se explica un tema jerárquico: primero el mapa, luego un
capítulo, luego una ficha, luego otra vez el mapa. Prezi resuelve eso con
un lienzo y una cámara, pero el artefacto es hostil a git y a un agente:
no hay un esquema que se pueda leer, validar y reescribir con confianza.

Hace falta un sistema **mío**, en la tablet, con dos frentes y una sola
fuente de verdad:

- Interactivo: ver y presentar en el navegador, avanzar/retroceder,
  overview.
- Agente-friendly: el deck es texto en git. Un agente (o yo en el
  editor) puede montar una presentación entera.

El trabajo nº 1 de la v1 no es el editor visual. Es que el agente genere
y edite decks de forma fiable, y que ese archivo se vea y se presente.

## 2. Objetivos

- Lienzo 2D infinito de **frames anidados**. Presentar = la cámara hace
  pan + zoom (easing) por un **path**. El overview es un destino (frame
  padre o root), no un truco de transición entre páginas sueltas.
- Fuente de verdad: **texto en git**. La UI renderiza. No hay write-back
  espacial en v1 (no se arrastran frames para persistir coordenadas).
- Contenido de frame: Markdown (título, texto, listas, código, imagen
  local PNG/SVG) y **LaTeX** inline y en bloque.
- Layout automático a partir del árbol. Cada padre declara
  `layout: grid | row | column` (default `grid`). Coordenadas explícitas
  son override, no el default.
- Visor web local, tablet-first (Galaxy Tab S10+), mismo patrón de uso
  que revista-laboratorio: Termux sirve, Chrome/Samsung Internet abre.
- Índice de decks + un deck real: mini-clase de **teoría
  cuasi-geostrófica** (15–20 min).
- Tema editorial único (papel crema, no dashboard). UI del visor en
  español; el contenido de un deck puede ser es o en.
- Contrato de agente v1: **schema + validador + deck de ejemplo**.
  Comandos para validar, desarrollar, construir el HTML estático y
  exportar el vídeo del path.
- Export v1: (1) **HTML estático** con el presentador entero; (2)
  **vídeo flythrough** corto del path.
- Norte (no todo es v1): el agente puede montar una presentación
  completa (texto, estilo del tema, orden, cámara). Yo también edito a
  mano el texto cuando quiera.

## 3. Fuera de alcance (v1)

- Editor visual; round-trip de posiciones con el dedo o el ratón.
- Rotación de frames o de cámara. Path con ramas. Exploración libre
  (pinch/pan off-path) en modo presentar.
- El agente dirige la cámara en vivo (copresentar, websocket, MCP de
  “ve al frame X”).
- Notas de presentador en el visor. Mermaid. Excalidraw. HTML/CSS por
  frame. Temas múltiples. CSS puntual por recuadro.
- PDF. Vídeo a tiempo real de la charla. Narración. Exigir `file://`.
- Cuentas, nube, collab, CMS, búsqueda, autenticación.
- MCP tools de CRUD (`add_frame`, etc.) por encima del archivo.
- Despliegue público (GitHub Pages, Netlify, …).
- Tema oscuro. WebGL / Three.js como requisito (el SDD puede usar
  canvas 2D o DOM; no 3D).

## 4. Usuario y flujos

El usuario eres tú, en la tablet (Termux + navegador). El segundo
operador es un agente que solo toca archivos y comandos.

### 4.1 Autoría (humano o agente)

1. Se edita el árbol de texto del deck (editor o parche del agente).
2. `validate` comprueba schema, IDs, path, assets, Markdown/TeX
   referenciados.
3. `dev` sirve el visor. Recargar el navegador muestra el cambio.

No hay GUI de autoría. El ciclo es archivo → validador → visor.

### 4.2 Presentar

1. Se abre el deck en el visor (`/d/<slug>` o la ruta que fije el SDD).
2. Siguiente / anterior recorren el path (tap o tecla).
3. Overview salta al root y, al repetir o “volver”, reanuda el paso del
   path donde se estaba.
4. No hay pinch-explore en v1: el path está cerrado.

### 4.3 Export

- **HTML estático:** un build (carpeta) con el presentador entero (path,
  next/prev, overview, cámara). Se sirve con cualquier estático; no hace
  falta el `dev` de Termux. No se exige abrir `file://`.
- **Vídeo:** flythrough del path, ~2–4 s de hold por paso más el vuelo
  de cámara. Duración total de pocos minutos, no la clase hablada de
  15–20 min.

### 4.4 Agente (v1)

El archivo **es** la API. El agente lee el schema, escribe frames y
path, corre el validador, y usa el visor/build/vídeo como prueba. No hay
herramientas MCP de mutación en v1.

## 5. Modelo del lienzo

### 5.1 Frame

Un frame es un recuadro en el plano, con:

- Identificador estable (el path y el agente lo citan).
- Hijos (árbol; un padre puede ser vacío de hijos).
- Markdown propio — **también los padres**. Un padre no es solo un
  rótulo: puede ser una hoja completa (título + cuerpo + fórmulas +
  figura) y además contener fichas.
- `layout` si tiene hijos: `grid` | `row` | `column`. Default `grid`.
- Override opcional de geometría (el SDD nombra los campos). En v1 el
  caso normal es no poner geometría.

No hay rotación. Ejes alineados al lienzo.

### 5.2 Path

Lista ordenada de IDs. Puede visitar **cualquier** frame, incluidos
padres (overview de un grupo) y el root. Puede repetir un ID si la
charla vuelve a un mapa. No hay ramas.

Next / prev son el único avance en modo presentar, más el salto
Overview ↔ root descrito en §4.2.

### 5.3 Cámara

Solo pan y zoom, con easing. Un vuelo va del encuadre del paso actual
al encuadre del siguiente (el recuadro entero del frame destino).

- Duración por defecto global, en el entorno 800–1200 ms (el SDD fija el
  número).
- Override opcional por paso del path (`duration_ms` o el nombre que
  fije el SDD).

El agente casi nunca toca tiempos.

### 5.4 Tamaño

El frame **crece con el contenido**. El layout aparta a los hermanos.
No hay scroll interno. No hay recorte silencioso. Si una ficha es
enorme, es un problema editorial (partir el frame), no un viewport
dentro del recuadro.

El SDD puede añadir un **aviso** del validador (convención: fichas
cortas, ~8–12 líneas + un bloque math o una figura) sin convertir el
aviso en fallo duro de v1.

## 6. Fuente de verdad (requisitos, no sintaxis)

El SDD propone el formato concreto. Este PRD exige:

- Diffable en git. Un cambio de un frame no debe reescribir el deck
  entero si se puede evitar (carpeta con un archivo por frame es
  *aceptable y probable*; un solo archivo también lo es si el SDD lo
  justifica).
- IDs explícitos, no posiciones de array como identidad.
- Assets (PNG/SVG) junto al deck, rutas relativas.
- Un manifiesto de deck: slug, título, idioma, tema (en v1 solo
  `editorial`), path, duración default de cámara.
- Parseable sin ejecutar código del deck (no hay JS embebido como
  fuente).
- El visor no es la fuente: si el JSON/YAML generado en memoria no se
  puede reconstruir desde disco, el diseño está mal.

## 7. Contenido de un frame

Markdown, subconjunto cerrado:

| Bloque | v1 |
| --- | --- |
| Título / headings | sí |
| Párrafos, énfasis, listas | sí |
| Código con resaltado de lenguaje | sí (el SDD elige highlighter) |
| Imagen local PNG o SVG | sí; ruta relativa al deck |
| Math inline `$...$` y bloque `$$...$$` | sí |
| HTML crudo, iframes, vídeo en el frame | no |
| Mermaid, Excalidraw | no |
| Notas de presentador | no (ni campo ni UI) |

Figuras: un `![]()` (o el bloque que el SDD unifique) apunta a un
archivo. El visor no genera diagramas.

## 8. Layout (contrato)

Entrada: árbol + `layout` por padre + tamaños intrínsecos del contenido
ya maquetado (Markdown + math + imagen).

Salida: rectángulos eje-alineados, sin solapes, con padding constante
que el SDD cifra. Orden espacial = orden de los hijos en el archivo:

- `row`: izquierda → derecha.
- `column`: arriba → abajo.
- `grid`: izquierda → derecha, arriba → abajo, número de columnas que
  el SDD fija (regla determinista: p. ej. `ceil(sqrt(n))` o `min(n, 3)`).
  La regla va en el SDD y en tests, no es “lo que quede bonito”.

Padres más profundos quedan **dentro** del rectángulo del ancestro (el
chrome del padre envuelve a los hijos). Un zoom-out al padre enseña el
grupo.

Overrides de geometría: si están, ganan sobre el motor para ese frame;
el resto se relayouta. El SDD define si un override es posición, escala
o caja completa, y qué pasa si rompe el no-solape (validador vs clamp).

## 9. Modo presentar

- Arranque: primer paso del path (si el path está vacío, encuadre del
  root y no hay next).
- Siguiente / anterior: un paso del path. En los extremos, no hay wrap
  (el SDD puede mostrar estado disabled).
- Overview: encuadre del root. Segunda activación (o control “volver”)
  restaura el paso del path previo.
- Teclado: al menos flechas o `[` `]` / `j` `k` / espacio — el SDD
  fija el mapa. Tablet: controles táctiles visibles (no depender solo
  de teclado).
- Recarga del documento: se vuelve al primer paso (no hay persistencia
  de posición de cámara en v1).
- Deep link a un frame: deseable; el SDD decide si entra en v1. No es
  criterio de hecho.

## 10. Dirección de arte

Un tema, **editorial**, alineado con revista-laboratorio / simulador
`config/estilos/editorial.matplotlibrc`.

| Token | Valor | Uso |
| --- | --- | --- |
| Papel | `#F6F1E7` | Fondo del visor y del lienzo |
| Tinta | `#2C241C` | Texto, filetes de frame |
| Borgoña | `#7A2E3A` | Énfasis, frame activo, kicker |
| Filete | `#D9CDB8` / `#E0D4C2` | Bordes de frame, no sombras gordas |
| Pane | `#EFE6D6` | Relleno de recuadro si hace falta |

Tipografía: serif de sistema para el cuerpo del frame (`Georgia`,
`"Noto Serif"`, `ui-serif`); sans de sistema para chrome (índice,
botones). Sin webfonts pesadas en v1.

Composición:

- El lienzo es papel, no un editor oscuro.
- Frames con filete fino; el activo se marca con borgoña (anillo o
  filete), no con glow.
- Sin glassmorphism, sin degradados de dashboard, sin modo oscuro.
- Tablet: comprobar ~1280×800 y ~800×1280. Controles de presentar no
  tapan el encuadre útil.

KaTeX (o el renderer que fije el SDD) debe leerse sobre el papel crema,
no con el tema default de documentación oscura.

## 11. Visor y rutas

Pequeña app de decks, no un único HTML suelto.

Rutas mínimas (nombres exactos: SDD):

| Ruta | Qué es |
| --- | --- |
| `/` | Índice. Lista de decks (en v1, el de cuasi-geostrofía). Título, slug, una línea. |
| `/d/<slug>` | Presentador a pantalla de lienzo. |
| (opcional) `/acerca` | Qué es el sistema, que el archivo es la API. No bloquea v1. |

Chrome del presentador: corto, en español: **Anterior · Siguiente ·
Overview**. El índice no carga el motor de cámara.

## 12. Export

### 12.1 HTML estático

`build` genera una carpeta servible: índice + presentador + assets +
runtime JS necesario para cámara y math. Mismo comportamiento de path
que en `dev`. Cualquier servidor estático (incluido `astro preview` o
equivalente) basta. Termux no es requisito en la máquina que *abre* el
build, sí puede serlo en la que lo *compila*.

### 12.2 Vídeo flythrough

Un comando produce un MP4 del path:

- Hold ~2–4 s por paso (configurable en el manifiesto del deck o en el
  comando; default en ese rango).
- Vuelo de cámara interpolado entre pasos, misma geometría que el
  visor.
- Resolución y fps: el SDD los cifra (orientación: 1280×800 o 1920×1080,
  24 o 30 fps). Pipeline esperado en Termux: captura del lienzo +
  ffmpeg (ya hay ffmpeg en el dispositivo).
- Salida bajo algo tipo `output/<slug>.mp4` (nombre exacto: SDD).
- Si el render headless se vuelve inviable en Android, el SDD debe
  decir el plan B (p. ej. grabar frames PNG y concatenar) **sin**
  recortar el requisito: el MP4 es criterio de v1.

## 13. API del agente (v1)

Superficie mínima:

| Pieza | Rol |
| --- | --- |
| Schema | Documento o archivo de esquema (JSON Schema o equivalente) versionado en el repo. |
| Validador | CLI: exit ≠ 0 si IDs duplicados, path huérfano, asset faltante, Markdown ilegible, layout desconocido. |
| Ejemplo | El deck QG, válido. |
| `dev` | Sirve el visor. |
| `build` | HTML estático. |
| `video` | MP4 flythrough. |

No hay `add-frame` ni MCP en v1. El agente edita archivos. Un README
corto describe el contrato para otro agente: dónde está el schema, cómo
se valida, cómo se previsualiza.

## 14. Fixture: teoría cuasi-geostrófica

Ancla de v1. No es lorem.

| Campo | Valor |
| --- | --- |
| Tema | Teoría cuasi-geostrófica |
| Duración de charla (hablada) | 15–20 min |
| Público | Tú / un colega que ya sabe fluidos geofísicos |
| Idioma | español |
| Tamaño | ~4–7 temas (padres), ~15–25 frames, path con overviews de grupo y al menos un paso en el root |
| Ciencia | Contenido completo al implementar (un subagente lo redacta; tú picas). El PRD no escribe la clase. |

El árbol **debe** cubrir, como mínimo, estos destinos (agrupación exacta:
quien redacte el deck, coherente con un curso corto):

1. Motivación y número de Rossby (por qué no Navier–Stokes a palo seco).
2. Equilibrio geostrófico y sus límites.
3. Vorticidad potencial cuasi-geostrófica (QGPV).
4. Movimiento vertical / ecuación omega (o el diagnóstico que se elija,
   pero tiene que haber un frame de “cómo sube el aire”).
5. Un corolario usable (ondas de Rossby QG, o filtrado de gravedad, o
   inversión de PV — uno, no el temario de un semestre).

Fórmulas reales en LaTeX, no Unicode de consuelo. Figuras: esquemas
PNG/SVG locales (el agente o un humano las pone en el deck; el visor no
las dibuja). Al menos **una** imagen en el fixture.

El path visita padres (overview de capítulo) y hojas. No es una lista
plana de fichas.

## 15. Entorno

- Tablet Samsung Galaxy Tab S10+ Wi‑Fi, Android, Termux.
- Código y git: `~/work/projects/prezi-slides/` (FUSE:
  `/storage/emulated/0/Documents/work/...`). **No** ejecutar binarios ni
  crear `node_modules` / venvs / symlinks dentro de `~/work`.
- Node 24 de Termux si el visor es JS; Python 3.14 de Termux (`uv`,
  venv en `$HOME/.venvs/…`) si hay CLI Python. El SDD elige el stack y
  el patrón rsync-a-ext4 ya usado en revista-laboratorio si hay npm.
- ffmpeg de Termux para el MP4.
- Navegador: Chrome o Samsung Internet, abriendo `http://<IP-de-Termux>:<puerto>`.

## 16. Criterios de hecho (v1)

- El validador acepta el deck QG y rechaza al menos: ID duplicado, path
  que apunta a un ID inexistente, imagen referenciada ausente, `layout`
  que no es `grid|row|column`.
- `/` lista el deck QG; `/d/<slug>` (o la ruta SDD) abre el presentador.
- Next / prev recorren el path; Overview va al root y vuelve al paso
  previo.
- Un frame padre con Markdown se lee al detener el path en él; sus
  hijos se ven al hacer zoom-out a ese padre (encuadre del padre).
- `$...$` y `$$...$$` se renderizan sobre el papel crema.
- Cambiar texto en el archivo y recargar el visor muestra el cambio
  (ciclo de autoría).
- `build` produce un presentador servible con next/prev/overview/cámara.
- `video` produce un MP4 que recorre el path (hold + vuelo), reproducible
  en el dispositivo.
- Paleta crema/tinta/borgoña; sin rotación; sin scroll dentro de un
  frame.
- Nada de esto exige un editor visual ni red.

## 17. Qué no decide este PRD

El SDD baja esto a implementación:

- Sintaxis en disco (Markdown+frontmatter vs YAML vs carpeta vs un
  archivo) cumpliendo §6.
- Stack del visor (Astro/isla JS, Vite SPA, u otro) y del validador
  (JS vs Python). Preferencia de contexto: reutilizar el patrón
  revista-laboratorio (Astro estático, rsync a ext4) **si** encaja con
  canvas + KaTeX + captura de vídeo; si no, justificar la alternativa.
- Algoritmo de layout (medición de contenido, padding, columnas del
  grid, encuadre de cámara, overrides).
- Renderer de math, highlighter de código, si el lienzo es DOM
  transformado o canvas 2D.
- Mapa de teclado, deep links, puerto, nombres de comandos, fps/dpi del
  MP4, plan B de captura en Android.
- Schema formal y tests.
- Plan de PRs incrementales.

## 18. Flujo SDD (después de aceptar este PRD)

1. **PRD** — este archivo (producto y alcance).
2. **Design / spec** — documento técnico con Key Decisions y PR Plan
   (bucle writer/reviewer).
3. **Implementación** — PRs en el orden del plan, commits pequeños.

No se escribe código de producto hasta que el spec esté cerrado. El
texto científico del fixture QG se redacta en el PR de contenido, no
en el SDD.
