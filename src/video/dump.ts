import { mkdirSync, writeFileSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { join } from 'node:path';

const SLUG_RE = /^[a-z][a-z0-9-]{0,63}$/;
const BODY_LIMIT = 2_000_000;

type Next = (err?: unknown) => void;

export function isSafeSlug(slug: string): boolean {
  return SLUG_RE.test(slug);
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let n = 0;
    req.on('data', (c: Buffer | string) => {
      const buf = typeof c === 'string' ? Buffer.from(c) : c;
      n += buf.length;
      if (n > BODY_LIMIT) {
        reject(new Error('cuerpo demasiado grande'));
        req.destroy();
        return;
      }
      chunks.push(buf);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

export function writeMeasuresJson(
  slug: string,
  payload: unknown,
  root = process.cwd(),
): string {
  if (!isSafeSlug(slug)) throw new Error('slug inválido');
  const dir = join(root, 'output');
  mkdirSync(dir, { recursive: true });
  const dest = join(dir, `${slug}.measures.json`);
  writeFileSync(dest, JSON.stringify(payload, null, 2) + '\n', 'utf8');
  return dest;
}

/** POST /__prezi/dump → ROOT/output/<slug>.measures.json (dev y sidecar). */
export function dumpMiddleware(
  req: IncomingMessage,
  res: ServerResponse,
  next: Next,
): void {
  const pathname = (req.url ?? '').split('?')[0] ?? '';
  if (req.method !== 'POST' || pathname !== '/__prezi/dump') {
    next();
    return;
  }
  void (async () => {
    try {
      const raw = await readBody(req);
      const data: unknown = JSON.parse(raw);
      if (data === null || typeof data !== 'object' || Array.isArray(data)) {
        res.statusCode = 400;
        res.end('cuerpo inválido');
        return;
      }
      const rec = data as { slug?: unknown; measures?: unknown };
      const slug = typeof rec.slug === 'string' ? rec.slug : '';
      if (!isSafeSlug(slug) || rec.measures === null || typeof rec.measures !== 'object') {
        res.statusCode = 400;
        res.end('slug o measures inválidos');
        return;
      }
      writeMeasuresJson(slug, { slug, measures: rec.measures });
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ ok: true }));
    } catch {
      if (!res.headersSent) {
        res.statusCode = 400;
        res.end();
      }
    }
  })();
}
