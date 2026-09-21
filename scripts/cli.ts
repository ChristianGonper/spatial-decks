import { existsSync, readdirSync, statSync } from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { LoadError, loadAllDecks, loadDeck } from '../src/engine/load.ts';
import { validate } from '../src/engine/validate.ts';
import type { DeckIR, PathStep, ValidationResult } from '../src/engine/types.ts';
import {
  bindIsWildcard,
  flightFrameCounts,
  startVideoSidecar,
  wlanIpv4,
} from '../src/video/server.ts';

function printResult(slug: string, result: ValidationResult): void {
  if (result.ok) {
    console.log(`${slug}: ok`);
  } else {
    console.log(`${slug}: error`);
    for (const e of result.errors) {
      console.log(`  [${e.code}] ${e.message}`);
    }
  }
  for (const w of result.warnings) {
    console.log(`  aviso [${w.code}] ${w.message}`);
  }
}

function runValidate(slug: string | undefined): number {
  let decks: DeckIR[];
  try {
    if (slug) {
      const dir = resolve('decks', slug);
      if (!existsSync(join(dir, 'deck.yaml'))) {
        console.error(`no hay decks/${slug}/deck.yaml`);
        return 1;
      }
      decks = [loadDeck(dir)];
    } else {
      decks = loadAllDecks('decks');
    }
  } catch (err) {
    if (err instanceof LoadError) {
      console.error(`[${err.code}] ${err.message}`);
      return 1;
    }
    throw err;
  }

  let failed = false;
  for (const ir of decks) {
    const result = validate(ir);
    printResult(ir.slug, result);
    if (!result.ok) failed = true;
  }
  if (decks.length === 0) {
    console.log('ningún deck en decks/*/deck.yaml');
  }
  return failed ? 1 : 0;
}

function maxMtime(root: string): number {
  let max = 0;
  const walk = (p: string): void => {
    let st;
    try {
      st = statSync(p);
    } catch {
      return;
    }
    if (st.isDirectory()) {
      let names: string[] = [];
      try {
        names = readdirSync(p);
      } catch {
        return;
      }
      for (const n of names) {
        if (n === 'node_modules' || n === 'dist' || n === 'output' || n === '.git' || n === '.astro') {
          continue;
        }
        walk(join(p, n));
      }
      return;
    }
    if (st.mtimeMs > max) max = st.mtimeMs;
  };
  walk(root);
  return max;
}

function distStale(root: string, slug: string): boolean {
  const page = join(root, 'dist', 'd', slug, 'index.html');
  if (!existsSync(page)) return true;
  const distTime = statSync(page).mtimeMs;
  const srcTime = Math.max(
    maxMtime(join(root, 'src')),
    maxMtime(join(root, 'decks')),
    existsSync(join(root, 'public')) ? maxMtime(join(root, 'public')) : 0,
    existsSync(join(root, 'astro.config.mjs')) ? statSync(join(root, 'astro.config.mjs')).mtimeMs : 0,
  );
  return srcTime > distTime;
}

function runSpawn(cmd: string, args: string[]): Promise<number> {
  return new Promise((resolveP, reject) => {
    const child = spawn(cmd, args, { stdio: 'inherit' });
    child.on('error', reject);
    child.on('close', (code) => resolveP(code ?? 1));
  });
}

function parseVideoArgs(argv: string[]): { slug: string; smoke: boolean } {
  let smoke = false;
  const rest: string[] = [];
  for (const a of argv) {
    if (a === '--smoke') smoke = true;
    else rest.push(a);
  }
  return { slug: rest[0] ?? 'golden-tiny', smoke };
}

function openInBrowser(url: string): void {
  const child = spawn('termux-open-url', [url], { stdio: 'ignore', detached: true });
  child.on('error', () => {});
  child.unref();
}

function hasFfmpeg(): boolean {
  const r = spawnSync('ffmpeg', ['-version'], { stdio: 'ignore' });
  return r.status === 0;
}

function videoSteps(ir: DeckIR): PathStep[] {
  return ir.path.length > 0 ? ir.path : [{ id: ir.root }];
}

async function runVideo(argv: string[]): Promise<number> {
  const { slug, smoke } = parseVideoArgs(argv);
  const dir = resolve('decks', slug);
  if (!existsSync(join(dir, 'deck.yaml'))) {
    console.error(`no hay decks/${slug}/deck.yaml`);
    return 1;
  }
  let ir: DeckIR;
  try {
    ir = loadDeck(dir);
  } catch (err) {
    if (err instanceof LoadError) {
      console.error(`[${err.code}] ${err.message}`);
      return 1;
    }
    throw err;
  }
  const result = validate(ir);
  printResult(ir.slug, result);
  if (!result.ok) return 1;

  if (!smoke && !hasFfmpeg()) {
    console.error('falta ffmpeg (libx264) en PATH');
    return 1;
  }

  const root = process.cwd();
  if (distStale(root, slug)) {
    console.error('astro build (dist stale o ausente)…');
    const code = await runSpawn('npm', ['run', 'build']);
    if (code !== 0) return code;
  }

  const bind = process.env.PREZI_VIDEO_BIND || '127.0.0.1';
  const preferred = Number(process.env.PREZI_VIDEO_PORT) || 4322;
  const timeoutMs = Number(process.env.PREZI_VIDEO_TIMEOUT_MS) || 600_000;
  const steps = videoSteps(ir);
  const sidecar = await startVideoSidecar({
    root,
    distDir: join(root, 'dist'),
    slug: ir.slug,
    holdMs: ir.video.hold_ms,
    flights: flightFrameCounts(steps, ir.camera.duration_ms),
    smokeOnly: smoke,
    bind,
    port: preferred,
  });

  const exp = smoke ? 'smoke' : 'video';
  const local = `http://127.0.0.1:${sidecar.port}/d/${ir.slug}?export=${exp}`;
  console.error(`vídeo: abre Chrome en primer plano: ${local}`);
  if (bindIsWildcard(bind)) {
    const ip = wlanIpv4();
    if (ip) {
      console.error(`vídeo: wlan: http://${ip}:${sidecar.port}/d/${ir.slug}?export=${exp}`);
    }
  } else {
    console.error(
      'si Chrome no abre Termux, PREZI_VIDEO_BIND=0.0.0.0 (solo entonces se imprime URL wlan)',
    );
  }
  openInBrowser(local);

  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, rej) => {
    timer = setTimeout(() => {
      rej(
        new Error(
          'timeout: Chrome en primer plano hasta done; Samsung Internet es plan B',
        ),
      );
    }, timeoutMs);
  });

  try {
    const out = await Promise.race([sidecar.done, timeout]);
    if (timer) clearTimeout(timer);
    console.log(out.smoke);
    if (out.mp4) console.log(out.mp4);
    await sidecar.close();
    return 0;
  } catch (err) {
    if (timer) clearTimeout(timer);
    const msg = err instanceof Error ? err.message : String(err);
    console.error(msg);
    await sidecar.close();
    return 1;
  }
}

const [cmd, ...rest] = process.argv.slice(2);
if (cmd === 'validate') {
  process.exit(runValidate(rest[0]));
}
if (cmd === 'video') {
  runVideo(rest).then((code) => process.exit(code), (err) => {
    console.error(err);
    process.exit(1);
  });
} else {
  console.error('uso: cli.ts validate [slug] | video [--smoke] [slug]');
  process.exit(2);
}
