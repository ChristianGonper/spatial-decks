import type { AstroIntegration } from 'astro';
import { createReadStream, existsSync, readdirSync, statSync, cpSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dumpMiddleware } from '../video/dump.ts';

const PREFIX = '/deck-assets/';

function decksRoot(): string {
  return resolve('decks');
}

function mimeOf(file: string): string {
  const lower = file.toLowerCase();
  if (lower.endsWith('.svg')) return 'image/svg+xml';
  if (lower.endsWith('.png')) return 'image/png';
  return 'application/octet-stream';
}

/** Resuelve `decks/<slug>/assets/<resto>`; rechaza `..` y salidas del dir de assets. */
function safeAssetPath(slug: string, rest: string): string | null {
  if (!slug || slug.includes('..') || slug.includes('/') || slug.includes('\\') || slug.includes('\0')) {
    return null;
  }
  let decoded = rest;
  try {
    decoded = decodeURIComponent(rest);
  } catch {
    return null;
  }
  if (!decoded || decoded.includes('\0') || decoded.includes('..')) return null;
  const base = resolve(decksRoot(), slug, 'assets');
  const abs = resolve(base, decoded);
  const rel = relative(base, abs);
  if (!rel || rel.startsWith('..') || rel.split(sep).includes('..')) return null;
  return abs;
}

export default function deckAssets(): AstroIntegration {
  return {
    name: 'deck-assets',
    hooks: {
      'astro:server:setup': ({ server }) => {
        server.middlewares.use(dumpMiddleware);
        server.middlewares.use((req, res, next) => {
          const raw = req.url ?? '';
          const pathname = raw.split('?')[0] ?? '';
          if (req.method !== 'GET' || !pathname.startsWith(PREFIX)) {
            next();
            return;
          }
          const rest = pathname.slice(PREFIX.length);
          const slash = rest.indexOf('/');
          if (slash <= 0) {
            res.statusCode = 404;
            res.end();
            return;
          }
          const slug = rest.slice(0, slash);
          const file = rest.slice(slash + 1);
          const abs = safeAssetPath(slug, file);
          if (!abs || !existsSync(abs) || !statSync(abs).isFile()) {
            res.statusCode = 404;
            res.end();
            return;
          }
          res.statusCode = 200;
          res.setHeader('Content-Type', mimeOf(abs));
          createReadStream(abs).pipe(res);
        });
      },
      'astro:build:done': ({ dir }) => {
        const dist = fileURLToPath(dir);
        const root = decksRoot();
        if (!existsSync(root)) return;
        for (const ent of readdirSync(root, { withFileTypes: true })) {
          if (!ent.isDirectory()) continue;
          const assetsDir = join(root, ent.name, 'assets');
          if (!existsSync(assetsDir) || !statSync(assetsDir).isDirectory()) continue;
          cpSync(assetsDir, join(dist, 'deck-assets', ent.name), { recursive: true });
        }
      },
    },
  };
}
