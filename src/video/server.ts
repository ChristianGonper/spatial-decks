import {
  createReadStream,
  existsSync,
  mkdirSync,
  rmSync,
  statSync,
  writeFileSync,
  copyFileSync,
  linkSync,
} from 'node:fs';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { networkInterfaces } from 'node:os';
import { extname, join, relative, resolve, sep } from 'node:path';
import { spawn } from 'node:child_process';
import type { PathStep } from '../engine/types.ts';
import { dumpMiddleware, isSafeSlug } from './dump.ts';

const FRAME_BODY_LIMIT = 20_000_000;
const EXPORT_FPS = 30;

export type SidecarOpts = {
  root: string;
  distDir: string;
  slug: string;
  holdMs: number;
  flights: number[];
  smokeOnly: boolean;
  bind: string;
  port: number;
};

export type Sidecar = {
  port: number;
  bind: string;
  close: () => Promise<void>;
  done: Promise<{ mp4?: string; smoke: string }>;
};

export function holdCopies(holdMs: number): number {
  return Math.round((holdMs / 1000) * EXPORT_FPS);
}

export function flightFrameCounts(
  path: PathStep[],
  defaultDurationMs: number,
): number[] {
  const out: number[] = [];
  for (let i = 1; i < path.length; i++) {
    const ms = path[i].duration_ms ?? defaultDurationMs;
    out.push(Math.round((ms / 1000) * EXPORT_FPS));
  }
  return out;
}

export function uniqueFrameTotal(flights: number[]): number {
  return flights.length + 1 + flights.reduce((a, n) => a + n, 0);
}

function copiesForUnique(u: number, holdN: number, flights: number[]): number {
  let cur = 0;
  const holds = flights.length + 1;
  for (let h = 0; h < holds; h++) {
    if (u === cur) return holdN;
    cur += 1;
    if (h < flights.length) {
      const nf = flights[h];
      if (u < cur + nf) return 1;
      cur += nf;
    }
  }
  throw new Error('índice de frame fuera de timeline');
}

export function wlanIpv4(): string | null {
  const addrs = networkInterfaces()['wlan0'] ?? [];
  for (const a of addrs) {
    if (a.family === 'IPv4' && !a.internal) return a.address;
  }
  return null;
}

export function bindIsWildcard(bind: string): boolean {
  return bind === '0.0.0.0' || bind === '::';
}

function mimeOf(file: string): string {
  switch (extname(file).toLowerCase()) {
    case '.html':
      return 'text/html; charset=utf-8';
    case '.js':
    case '.mjs':
      return 'text/javascript; charset=utf-8';
    case '.css':
      return 'text/css; charset=utf-8';
    case '.svg':
      return 'image/svg+xml';
    case '.png':
      return 'image/png';
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.woff2':
      return 'font/woff2';
    case '.woff':
      return 'font/woff';
    case '.ttf':
      return 'font/ttf';
    case '.json':
      return 'application/json';
    case '.ico':
      return 'image/x-icon';
    case '.map':
      return 'application/json';
    default:
      return 'application/octet-stream';
  }
}

function safeUnder(root: string, abs: string): boolean {
  const rel = relative(resolve(root), abs);
  return rel === '' || (!rel.startsWith('..') && !rel.split(sep).includes('..'));
}

function resolveStatic(distDir: string, pathname: string): string | null {
  let decoded = pathname;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return null;
  }
  if (!decoded || decoded.includes('\0') || decoded.includes('..')) return null;
  const dist = resolve(distDir);
  const abs = resolve(dist, '.' + decoded);
  if (!safeUnder(dist, abs)) return null;
  if (existsSync(abs) && statSync(abs).isFile()) return abs;
  const idx = join(abs, 'index.html');
  if (existsSync(idx) && statSync(idx).isFile() && safeUnder(dist, idx)) return idx;
  return null;
}

function serveStatic(distDir: string, req: IncomingMessage, res: ServerResponse): void {
  const pathname = (req.url ?? '/').split('?')[0] ?? '/';
  const file = resolveStatic(distDir, pathname);
  if (!file) {
    res.statusCode = 404;
    res.end();
    return;
  }
  res.statusCode = 200;
  res.setHeader('Content-Type', mimeOf(file));
  if (file.endsWith('.html')) res.setHeader('Cache-Control', 'no-store');
  createReadStream(file).pipe(res);
}

function readBodyBuf(req: IncomingMessage, limit: number): Promise<Buffer> {
  return new Promise((resolveP, reject) => {
    const chunks: Buffer[] = [];
    let n = 0;
    req.on('data', (c: Buffer | string) => {
      const buf = typeof c === 'string' ? Buffer.from(c) : c;
      n += buf.length;
      if (n > limit) {
        reject(new Error('cuerpo demasiado grande'));
        req.destroy();
        return;
      }
      chunks.push(buf);
    });
    req.on('end', () => resolveP(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function pngFromDataUrl(data: string): Buffer {
  const m = data.trim().match(/^data:image\/png;base64,(.+)$/s);
  if (m) return Buffer.from(m[1], 'base64');
  throw new Error('no es PNG');
}

function pngFromDataUrlOrJson(raw: Buffer): Buffer {
  const text = raw.toString('utf8').trim();
  if (text.startsWith('{')) {
    const parsed: unknown = JSON.parse(text);
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('json inválido');
    }
    const png = (parsed as { png?: unknown }).png;
    if (typeof png !== 'string') throw new Error('png ausente');
    return pngFromDataUrl(png);
  }
  return pngFromDataUrl(text);
}

function writeHoldCopies(src: string, destDir: string, start: number, copies: number): number {
  if (copies <= 0) return start;
  let disk = start;
  const first = join(destDir, `frame_${String(disk).padStart(5, '0')}.png`);
  if (src !== first) copyFileSync(src, first);
  disk += 1;
  for (let i = 1; i < copies; i++) {
    const dest = join(destDir, `frame_${String(disk).padStart(5, '0')}.png`);
    try {
      linkSync(first, dest);
    } catch {
      copyFileSync(first, dest);
    }
    disk += 1;
  }
  return disk;
}

function runFfmpeg(framesDir: string, mp4: string): Promise<void> {
  return new Promise((resolveP, reject) => {
    const args = [
      '-y',
      '-framerate',
      '30',
      '-i',
      join(framesDir, 'frame_%05d.png'),
      '-c:v',
      'libx264',
      '-pix_fmt',
      'yuv420p',
      '-crf',
      '20',
      mp4,
    ];
    const child = spawn('ffmpeg', args, { stdio: ['ignore', 'inherit', 'inherit'] });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolveP();
      else reject(new Error('ffmpeg exit ' + String(code)));
    });
  });
}

function listenOn(
  server: ReturnType<typeof createServer>,
  bind: string,
  port: number,
): Promise<void> {
  return new Promise((resolveP, reject) => {
    const onErr = (err: Error) => {
      server.off('listening', onListen);
      reject(err);
    };
    const onListen = () => {
      server.off('error', onErr);
      resolveP();
    };
    server.once('error', onErr);
    server.once('listening', onListen);
    server.listen(port, bind);
  });
}

export async function startVideoSidecar(opts: SidecarOpts): Promise<Sidecar> {
  if (!isSafeSlug(opts.slug)) throw new Error('slug inválido');
  const framesDir = join(opts.root, 'output', `${opts.slug}-frames`);
  const smokeDir = join(opts.root, 'output', opts.slug);
  const smokePath = join(smokeDir, 'smoke.png');
  const mp4Path = join(opts.root, 'output', `${opts.slug}.mp4`);
  const measuresPath = join(opts.root, 'output', `${opts.slug}.measures.json`);
  const holdN = holdCopies(opts.holdMs);
  const expectedUnique = uniqueFrameTotal(opts.flights);

  rmSync(framesDir, { recursive: true, force: true });
  mkdirSync(framesDir, { recursive: true });
  mkdirSync(smokeDir, { recursive: true });
  mkdirSync(join(opts.root, 'output'), { recursive: true });

  let nextUnique = 0;
  let nextDisk = 1;
  let gotDump = existsSync(measuresPath);
  let gotSmoke = false;
  let finished = false;

  let resolveDone: (v: { mp4?: string; smoke: string }) => void;
  let rejectDone: (e: Error) => void;
  const done = new Promise<{ mp4?: string; smoke: string }>((res, rej) => {
    resolveDone = res;
    rejectDone = rej;
  });

  const server = createServer((req, res) => {
    const pathname = (req.url ?? '').split('?')[0] ?? '';
    if (req.method === 'POST' && pathname === '/__prezi/dump') {
      const end = res.end.bind(res);
      res.end = ((...args: Parameters<ServerResponse['end']>) => {
        if (res.statusCode === 200) gotDump = true;
        return end(...args);
      }) as ServerResponse['end'];
    }
    dumpMiddleware(req, res, () => {
      void (async () => {
        try {
          if (req.method === 'POST' && pathname === '/__prezi/smoke') {
            const raw = await readBodyBuf(req, FRAME_BODY_LIMIT);
            const ct = String(req.headers['content-type'] ?? '');
            const png = ct.includes('image/png') ? raw : pngFromDataUrlOrJson(raw);
            if (png.length === 0) throw new Error('smoke vacío');
            writeFileSync(smokePath, png);
            gotSmoke = true;
            res.statusCode = 200;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ ok: true }));
            return;
          }
          if (req.method === 'POST' && pathname === '/__prezi/frame') {
            if (opts.smokeOnly) {
              res.statusCode = 400;
              res.end('smokeOnly');
              return;
            }
            const raw = await readBodyBuf(req, FRAME_BODY_LIMIT);
            const parsed: unknown = JSON.parse(raw.toString('utf8'));
            if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
              res.statusCode = 400;
              res.end('cuerpo inválido');
              return;
            }
            const rec = parsed as { index?: unknown; png?: unknown };
            if (typeof rec.index !== 'number' || rec.index !== nextUnique) {
              res.statusCode = 400;
              res.end('index inválido');
              return;
            }
            if (typeof rec.png !== 'string') {
              res.statusCode = 400;
              res.end('png ausente');
              return;
            }
            const png = pngFromDataUrl(rec.png);
            const copies = copiesForUnique(rec.index, holdN, opts.flights);
            const tmp = join(framesDir, `_snap_${String(rec.index).padStart(5, '0')}.png`);
            writeFileSync(tmp, png);
            const from = nextDisk;
            nextDisk = writeHoldCopies(tmp, framesDir, nextDisk, copies);
            rmSync(tmp, { force: true });
            nextUnique += 1;
            if (copies > 1) {
              console.error(
                `vídeo: hold unique=${rec.index} → frame_${String(from).padStart(5, '0')}–${String(nextDisk - 1).padStart(5, '0')}`,
              );
            }
            res.statusCode = 200;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ ok: true }));
            return;
          }
          if (req.method === 'POST' && pathname === '/__prezi/done') {
            if (finished) {
              res.statusCode = 200;
              res.end(JSON.stringify({ ok: true }));
              return;
            }
            const raw = await readBodyBuf(req, 64_000).catch(() => Buffer.alloc(0));
            let smokeOnly = opts.smokeOnly;
            if (raw.length > 0) {
              try {
                const parsed: unknown = JSON.parse(raw.toString('utf8'));
                if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
                  if ((parsed as { smokeOnly?: unknown }).smokeOnly === true) smokeOnly = true;
                }
              } catch {
                // cuerpo vacío o no JSON
              }
            }
            gotDump = gotDump || existsSync(measuresPath);
            if (!gotDump) {
              res.statusCode = 400;
              res.end('falta measures.json');
              rejectDone(new Error('falta measures.json (sin estimador)'));
              return;
            }
            if (!gotSmoke || !existsSync(smokePath) || statSync(smokePath).size === 0) {
              res.statusCode = 400;
              res.end('falta smoke.png');
              rejectDone(new Error('falta smoke.png'));
              return;
            }
            if (smokeOnly) {
              finished = true;
              res.statusCode = 200;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ ok: true, smoke: smokePath }));
              resolveDone({ smoke: smokePath });
              return;
            }
            if (nextUnique !== expectedUnique) {
              res.statusCode = 400;
              res.end('frames incompletos');
              rejectDone(
                new Error(`frames ${nextUnique} ≠ ${expectedUnique} (sin estimador)`),
              );
              return;
            }
            await runFfmpeg(framesDir, mp4Path);
            rmSync(framesDir, { recursive: true, force: true });
            finished = true;
            res.statusCode = 200;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ ok: true, mp4: mp4Path, smoke: smokePath }));
            resolveDone({ mp4: mp4Path, smoke: smokePath });
            return;
          }
          if (req.method === 'GET' || req.method === 'HEAD') {
            serveStatic(opts.distDir, req, res);
            return;
          }
          res.statusCode = 404;
          res.end();
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.error('sidecar:', msg);
          if (pathname === '/__prezi/done' && !finished) {
            rejectDone(err instanceof Error ? err : new Error(msg));
          }
          if (!res.headersSent) {
            res.statusCode = 400;
            res.end(msg);
          }
        }
      })();
    });
  });

  let port = opts.port;
  try {
    await listenOn(server, opts.bind, port);
  } catch (err) {
    const code =
      err && typeof err === 'object' && 'code' in err ? String((err as { code: unknown }).code) : '';
    if (code === 'EADDRINUSE' && port === 4322) {
      port = 4323;
      await listenOn(server, opts.bind, port);
    } else {
      throw err;
    }
  }

  // El dump real pasa por dumpMiddleware (cwd/output). Observamos el archivo.
  const dumpPoll = setInterval(() => {
    if (existsSync(measuresPath)) gotDump = true;
  }, 250);
  done.finally(() => clearInterval(dumpPoll)).catch(() => {});

  return {
    port,
    bind: opts.bind,
    done,
    close: () =>
      new Promise((res) => {
        clearInterval(dumpPoll);
        server.close(() => res());
      }),
  };
}
