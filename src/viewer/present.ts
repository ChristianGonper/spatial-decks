import {
  CAMERA_DURATION_MS,
  fitCamera,
  worldTransform,
  type Camera,
} from '../engine/camera.ts';
import { cameraOnFlight, flightCameras } from '../engine/flight.ts';
import { layoutScene } from '../engine/layout.ts';
import type {
  DeckIR,
  FrameIR,
  Geometry,
  LayoutMap,
  PathStep,
  Rect,
  Size,
} from '../engine/types.ts';
import { sizesDiffer, startMeasure } from './measure.ts';

export type BootFrame = {
  id: string;
  layout: string;
  direction?: FrameIR['direction'];
  children: string[];
  geometry: Geometry | null;
  html: string;
};

export type PresenterBoot = {
  slug: string;
  root: string;
  path: PathStep[] | unknown;
  camera: { duration_ms?: number } | unknown;
  video: unknown;
  frames: BootFrame[];
};

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function geometryOf(raw: unknown): Geometry | undefined {
  if (!isPlainObject(raw)) return undefined;
  const g: Geometry = {};
  for (const key of ['x', 'y', 'width', 'height'] as const) {
    if (key in raw && typeof raw[key] === 'number') g[key] = raw[key];
  }
  return g;
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
      if (item.transition === 'via-group' || item.transition === 'direct') step.transition = item.transition;
      out.push(step);
    }
  }
  return out;
}

function irFromBoot(boot: PresenterBoot): DeckIR {
  const frames: Record<string, FrameIR> = {};
  for (const f of boot.frames) {
    const fr: FrameIR = {
      id: f.id,
      layout: f.layout,
      children: f.children,
      direction: f.direction,
      markdown: '',
      raw: { id: f.id },
    };
    const geo = geometryOf(f.geometry);
    if (geo) fr.geometry = geo;
    frames[f.id] = fr;
  }
  const cam = isPlainObject(boot.camera) ? boot.camera : {};
  const vid = isPlainObject(boot.video) ? boot.video : {};
  return {
    slug: boot.slug,
    title: '',
    lang: 'es',
    theme: 'editorial',
    root: boot.root,
    camera: {
      duration_ms:
        typeof cam.duration_ms === 'number' ? cam.duration_ms : CAMERA_DURATION_MS,
    },
    video: {
      hold_ms: typeof vid.hold_ms === 'number' ? vid.hold_ms : 3000,
    },
    path: normalizePath(boot.path),
    frames,
    deckDir: '',
    rawManifest: {},
  };
}

function isTypingTarget(t: EventTarget | null): boolean {
  if (!(t instanceof HTMLElement)) return false;
  if (t.isContentEditable) return true;
  const tag = t.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
}

function dumpMeasures(slug: string, measures: Record<string, Size>): Promise<void> {
  return fetch('/__prezi/dump', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ slug, measures }),
  }).then((r) => {
    if (!r.ok) throw new Error('dump measures falló');
  });
}

export async function bootPresenter(boot: PresenterBoot): Promise<void> {
  const worldEl = document.getElementById('world');
  const viewportEl = worldEl?.closest('.viewport');
  if (!(worldEl instanceof HTMLElement) || !(viewportEl instanceof HTMLElement)) {
    return;
  }

  const exp = new URLSearchParams(location.search).get('export');
  if (exp === 'video' || exp === 'smoke') {
    document.documentElement.classList.add('is-export');
  }

  worldEl.classList.add('is-pending');

  const ir = irFromBoot(boot);
  const path = ir.path;
  const defaultMs = ir.camera.duration_ms;

  const session = await startMeasure(boot.frames);
  let measures = session.measures;
  let scene = layoutScene(ir, measures);
  applyBoxes(worldEl, boot.frames, scene, measures);

  const again = await session.remeasure();
  if (sizesDiffer(measures, again)) {
    measures = again;
    scene = layoutScene(ir, measures);
    applyBoxes(worldEl, boot.frames, scene, measures);
  }
  session.dispose();

  let i = 0;
  let overview = false;
  let rafId = 0;

  function vp(): { width: number; height: number } {
    return { width: viewportEl.clientWidth, height: viewportEl.clientHeight };
  }

  function rectNow(): Rect {
    if (overview || path.length === 0) return scene.groups[boot.root];
    return scene.cards[path[i].id] ?? scene.groups[boot.root];
  }

  function applyCam(c: Camera): void {
    worldEl.style.transform = worldTransform(c, vp());
  }

  function fitNow(): Camera {
    const c = fitCamera(rectNow(), vp());
    applyCam(c);
    return c;
  }

  let cam: Camera = fitNow();

  function flyTo(cameras: Camera[], durationMs: number): void {
    if (rafId !== 0) {
      cancelAnimationFrame(rafId);
      rafId = 0;
    }
    if (durationMs <= 0) {
      cam = cameras[cameras.length - 1];
      applyCam(cam);
      return;
    }
    cameras[0] = cam;
    const t0 = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - t0) / durationMs);
      cam = cameraOnFlight(cameras, t);
      applyCam(cam);
      if (t < 1) rafId = requestAnimationFrame(tick);
      else rafId = 0;
    };
    rafId = requestAnimationFrame(tick);
  }

  function durationTo(stepIndex: number): number {
    const step = path[stepIndex];
    if (step && typeof step.duration_ms === 'number') return step.duration_ms;
    return defaultMs;
  }

  function activeId(): string {
    if (overview || path.length === 0) return boot.root;
    return path[i].id;
  }

  function syncActive(): void {
    const id = activeId();
    for (const el of worldEl.querySelectorAll('.frame.is-active')) {
      el.classList.remove('is-active');
    }
    const sel = '.frame[data-id="' + CSS.escape(id) + '"]';
    worldEl.querySelector(sel)?.classList.add('is-active');
  }

  const btnPrev = document.querySelector<HTMLButtonElement>('[data-act="prev"]');
  const btnNext = document.querySelector<HTMLButtonElement>('[data-act="next"]');
  const btnOverview = document.querySelector<HTMLButtonElement>('[data-act="overview"]');

  function syncChrome(): void {
    const n = path.length;
    const empty = n === 0;
    if (btnPrev) btnPrev.disabled = empty || i <= 0;
    if (btnNext) btnNext.disabled = empty || i >= n - 1;
    if (btnOverview) {
      btnOverview.disabled = empty;
      btnOverview.textContent = overview ? 'Volver' : 'Overview';
    }
  }

  function show(opts: { instant?: boolean; durationMs?: number; cameras?: Camera[] }): void {
    const target = fitCamera(rectNow(), vp());
    if (opts.instant) {
      cam = target;
      applyCam(cam);
    } else {
      flyTo(opts.cameras ?? [cam, target], opts.durationMs ?? defaultMs);
    }
    syncActive();
    syncChrome();
  }

  function goNext(): void {
    if (path.length === 0 || i >= path.length - 1) return;
    const dest = i + 1;
    if (overview) overview = false;
    const cameras = flightCameras(ir, scene.cards, scene.groups, path[i].id, path[dest], vp());
    i = dest;
    show({ durationMs: durationTo(i), cameras });
  }

  function goPrev(): void {
    if (path.length === 0 || i <= 0) return;
    const dest = i - 1;
    if (overview) overview = false;
    const reverse: PathStep = { id: path[dest].id, transition: path[i].transition };
    const cameras = flightCameras(ir, scene.cards, scene.groups, path[i].id, reverse, vp());
    i = dest;
    show({ durationMs: durationTo(i + 1), cameras });
  }

  function toggleOverview(): void {
    if (path.length === 0) return;
    overview = !overview;
    show({ durationMs: defaultMs });
  }

  syncActive();
  syncChrome();
  worldEl.classList.remove('is-pending');
  const dumped = dumpMeasures(boot.slug, measures);

  if (exp === 'video' || exp === 'smoke') {
    try {
      await dumped;
      const { runCapture } = await import('./capture.ts');
      await runCapture({
        path,
        root: boot.root,
        holdMs: ir.video.hold_ms,
        defaultDurationMs: defaultMs,
        scene,
        ir,
        worldEl,
        viewportEl,
        smokeOnly: exp === 'smoke',
        setActive: (id: string) => {
          for (const el of worldEl.querySelectorAll('.frame.is-active')) {
            el.classList.remove('is-active');
          }
          const sel = '.frame[data-id="' + CSS.escape(id) + '"]';
          worldEl.querySelector(sel)?.classList.add('is-active');
        },
      });
    } catch (err) {
      console.error(err);
      const el = document.createElement('div');
      el.className = 'export-progress';
      el.textContent = err instanceof Error ? err.message : String(err);
      document.body.appendChild(el);
    }
    return;
  }

  void dumped.catch(() => {});

  document.querySelector('.present-chrome')?.addEventListener('click', (ev) => {
    const t = ev.target;
    const btn = t instanceof Element ? t.closest('[data-act]') : null;
    if (!btn) return;
    const act = btn.getAttribute('data-act');
    if (act === 'next') goNext();
    else if (act === 'prev') goPrev();
    else if (act === 'overview') toggleOverview();
  });

  window.addEventListener('keydown', (ev) => {
    if (isTypingTarget(ev.target)) return;
    const k = ev.key;
    let handled = false;
    if (k === 'ArrowRight' || k === ' ' || k === 'j' || k === ']') {
      goNext();
      handled = true;
    } else if (k === 'ArrowLeft' || k === 'Backspace' || k === 'k' || k === '[') {
      goPrev();
      handled = true;
    } else if (k === 'Escape' || k === 'o' || k === 'O') {
      toggleOverview();
      handled = true;
    }
    if (handled) ev.preventDefault();
  });

  window.addEventListener('resize', () => {
    cam = fitNow();
  });
}

function applyBoxes(
  worldEl: HTMLElement,
  frames: BootFrame[],
  scene: { groups: LayoutMap; cards: LayoutMap },
  measures: Record<string, Size>,
): void {
  for (const f of frames) {
    const article = worldEl.querySelector(
      ':scope > .frame[data-id="' + CSS.escape(f.id) + '"]',
    );
    if (!(article instanceof HTMLElement)) continue;
    const r = scene.groups[f.id];
    if (r) {
      article.style.left = r.x + 'px';
      article.style.top = r.y + 'px';
      article.style.width = r.width + 'px';
      article.style.height = r.height + 'px';
    }
    const body = article.querySelector('[data-frame-body]');
    if (!(body instanceof HTMLElement)) continue;
    const m = measures[f.id];
    if (!m) continue;
    if (f.children.length) {
      article.classList.add('has-children');
      const card = scene.cards[f.id];
      body.style.left = card.x - r.x + 'px';
      body.style.top = card.y - r.y + 'px';
      body.style.height = card.height + 'px';
    }
    body.style.width = f.children.length ? scene.cards[f.id].width + 'px' : m.width + 'px';
    body.style.maxWidth = 'none';
  }
}
