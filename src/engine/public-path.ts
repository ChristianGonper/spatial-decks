/** Prefijo de sitio: `/` en local, `/spatial-decks/` en GitHub Pages. */
export function withBase(pathFromRoot: string): string {
  const env = import.meta.env as { BASE_URL?: string } | undefined;
  const raw = env?.BASE_URL ?? '/';
  const base = raw.endsWith('/') ? raw : `${raw}/`;
  return `${base}${pathFromRoot.replace(/^\//, '')}`;
}
