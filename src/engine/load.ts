import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { load as yamlLoad } from 'js-yaml';
import type { DeckIR, FrameIR, Geometry, PathStep } from './types.ts';

const FRONTMATTER_RE = /^---\n([\s\S]*?)\n---(?:\n|$)/;

export class LoadError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'LoadError';
    this.code = code;
  }
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function parseYamlObject(text: string, filename: string): Record<string, unknown> {
  let doc: unknown;
  try {
    doc = yamlLoad(text, { filename });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new LoadError('schema', `${filename}: YAML inválido (${msg})`);
  }
  if (!isPlainObject(doc)) {
    throw new LoadError('schema', `${filename}: se esperaba un objeto YAML`);
  }
  return doc;
}

function splitFrontmatter(raw: string, filename: string): {
  fm: Record<string, unknown>;
  body: string;
} {
  const text = raw.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const m = text.match(FRONTMATTER_RE);
  if (!m) {
    throw new LoadError('schema', `${filename}: falta frontmatter ---`);
  }
  const fm = parseYamlObject(m[1], filename);
  return { fm, body: text.slice(m[0].length) };
}

function asString(v: unknown, fallback: string): string {
  return typeof v === 'string' ? v : fallback;
}

function asNumber(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

function normalizePath(raw: unknown): PathStep[] {
  if (!Array.isArray(raw)) return [];
  const out: PathStep[] = [];
  for (const item of raw) {
    if (typeof item === 'string') {
      out.push({ id: item });
      continue;
    }
    if (isPlainObject(item) && typeof item.id === 'string') {
      const step: PathStep = { id: item.id };
      if (typeof item.duration_ms === 'number') step.duration_ms = item.duration_ms;
      out.push(step);
    }
  }
  return out;
}

function pickGeometry(raw: unknown): Geometry | undefined {
  if (!isPlainObject(raw)) return undefined;
  const g: Geometry = {};
  for (const key of ['x', 'y', 'width', 'height'] as const) {
    if (key in raw && typeof raw[key] === 'number') g[key] = raw[key];
  }
  return g;
}

function loadFrameFile(abs: string): FrameIR {
  const filename = basename(abs);
  const rawText = readFileSync(abs, 'utf8');
  const { fm, body } = splitFrontmatter(rawText, filename);
  const children = Array.isArray(fm.children)
    ? fm.children.filter((c): c is string => typeof c === 'string')
    : [];
  const layout = asString(fm.layout, 'grid');
  const id = asString(fm.id, '');
  const geometry = pickGeometry(fm.geometry);
  const frame: FrameIR = {
    id,
    layout,
    children,
    markdown: body,
    raw: fm,
  };
  if (geometry && Object.keys(geometry).length > 0) frame.geometry = geometry;
  else if (isPlainObject(fm.geometry)) frame.geometry = {};
  return frame;
}

export function deckDir(slug: string, rootDir = 'decks'): string {
  return resolve(rootDir, slug);
}

export function loadDeck(dir: string): DeckIR {
  const abs = resolve(dir);
  const manifestPath = join(abs, 'deck.yaml');
  if (!existsSync(manifestPath)) {
    throw new LoadError('schema', `${abs}: falta deck.yaml`);
  }
  const rawManifest = parseYamlObject(readFileSync(manifestPath, 'utf8'), 'deck.yaml');
  const framesDir = join(abs, 'frames');
  const frames: Record<string, FrameIR> = {};
  if (existsSync(framesDir)) {
    const names = readdirSync(framesDir)
      .filter((n) => n.endsWith('.md'))
      .sort();
    for (const name of names) {
      const fileId = name.slice(0, -3);
      frames[fileId] = loadFrameFile(join(framesDir, name));
    }
  }
  const cameraRaw = isPlainObject(rawManifest.camera) ? rawManifest.camera : {};
  const videoRaw = isPlainObject(rawManifest.video) ? rawManifest.video : {};
  return {
    slug: asString(rawManifest.slug, basename(abs)),
    title: asString(rawManifest.title, ''),
    lang: asString(rawManifest.lang, 'es'),
    theme: asString(rawManifest.theme, 'editorial'),
    root: asString(rawManifest.root, ''),
    camera: { duration_ms: asNumber(cameraRaw.duration_ms, 1000) },
    video: { hold_ms: asNumber(videoRaw.hold_ms, 3000) },
    path: normalizePath(rawManifest.path),
    frames,
    deckDir: abs,
    rawManifest,
  };
}

export function loadAllDecks(rootDir = 'decks'): DeckIR[] {
  const abs = resolve(rootDir);
  if (!existsSync(abs)) return [];
  return readdirSync(abs, { withFileTypes: true })
    .filter((d) => d.isDirectory() && existsSync(join(abs, d.name, 'deck.yaml')))
    .map((d) => d.name)
    .sort()
    .map((name) => loadDeck(join(abs, name)));
}
