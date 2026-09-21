import { toPng } from 'html-to-image';
import {
  easeInOutCubic,
  fitCamera,
  lerpCam,
  worldTransform,
  type Camera,
} from '../engine/camera.ts';
import type { LayoutMap, PathStep } from '../engine/types.ts';

export const EXPORT_WIDTH = 1280;
export const EXPORT_HEIGHT = 800;
export const EXPORT_FPS = 30;

const VP = { width: EXPORT_WIDTH, height: EXPORT_HEIGHT };

export type CaptureOpts = {
  path: PathStep[];
  root: string;
  holdMs: number;
  defaultDurationMs: number;
  layout: LayoutMap;
  worldEl: HTMLElement;
  viewportEl: HTMLElement;
  smokeOnly: boolean;
  setActive: (id: string) => void;
};

function framesForMs(ms: number): number {
  return Math.round((ms / 1000) * EXPORT_FPS);
}

function stepsOf(path: PathStep[], root: string): PathStep[] {
  return path.length > 0 ? path : [{ id: root }];
}

function rectFor(layout: LayoutMap, id: string, root: string) {
  return layout[id] ?? layout[root];
}

async function snap(viewportEl: HTMLElement): Promise<string> {
  await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));
  return toPng(viewportEl, {
    pixelRatio: 1,
    cacheBust: true,
    width: EXPORT_WIDTH,
    height: EXPORT_HEIGHT,
  });
}

async function postJson(url: string, body: unknown): Promise<void> {
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    throw new Error(`${url} → ${r.status}`);
  }
}

function progressEl(): HTMLElement {
  let el = document.querySelector('.export-progress');
  if (el instanceof HTMLElement) return el;
  const created = document.createElement('div');
  created.className = 'export-progress';
  created.setAttribute('aria-live', 'polite');
  document.body.appendChild(created);
  return created;
}

function setProgress(msg: string): void {
  progressEl().textContent = msg;
}

/** Seek de cámara + toPng(.viewport). Nunca .world ni sleep(hold_ms). */
export async function runCapture(opts: CaptureOpts): Promise<void> {
  document.documentElement.classList.add('is-export');
  const steps = stepsOf(opts.path, opts.root);
  const { worldEl, viewportEl, layout, root } = opts;
  let unique = 0;

  function applyCamera(cam: Camera): void {
    worldEl.style.transform = worldTransform(cam, VP);
  }

  async function postFrame(png: string, copies: number): Promise<void> {
    const index = unique;
    unique += 1;
    await postJson('/__prezi/frame', { index, png, copies });
  }

  const holdN = Math.max(1, framesForMs(opts.holdMs));
  setProgress('export: hold 0');
  opts.setActive(steps[0].id);
  applyCamera(fitCamera(rectFor(layout, steps[0].id, root), VP));
  const png0 = await snap();
  await postJson('/__prezi/smoke', { png: png0 });

  if (opts.smokeOnly) {
    setProgress('export: smoke listo');
    await postJson('/__prezi/done', { smokeOnly: true });
    return;
  }

  await postFrame(png0, holdN);

  for (let i = 1; i < steps.length; i++) {
    const nFlight = framesForMs(steps[i].duration_ms ?? opts.defaultDurationMs);
    const cam0 = fitCamera(rectFor(layout, steps[i - 1].id, root), VP);
    const cam1 = fitCamera(rectFor(layout, steps[i].id, root), VP);
    opts.setActive(steps[i].id);
    setProgress(`export: vuelo ${i - 1}→${i}`);
    for (let k = 1; k <= nFlight; k++) {
      applyCamera(lerpCam(cam0, cam1, easeInOutCubic(k / nFlight)));
      await postFrame(await snap(), 1);
    }
    applyCamera(cam1);
    setProgress(`export: hold ${i}`);
    await postFrame(await snap(), holdN);
  }

  setProgress('export: ffmpeg');
  await postJson('/__prezi/done', { smokeOnly: false });
  setProgress('export: listo');
}
