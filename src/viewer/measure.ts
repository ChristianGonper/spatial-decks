import type { Size } from '../engine/types.ts';

export type MeasureFrame = { id: string; html: string };

export type MeasureSession = {
  measures: Record<string, Size>;
  remeasure: () => Promise<Record<string, Size>>;
  dispose: () => void;
};

function decodeImages(root: ParentNode): Promise<void[]> {
  const imgs = [...root.querySelectorAll('img')];
  return Promise.all(imgs.map((img) => img.decode().catch(() => {})));
}

function readSizes(nodes: Map<string, HTMLElement>): Record<string, Size> {
  const measures: Record<string, Size> = {};
  for (const [id, el] of nodes) {
    measures[id] = { width: el.scrollWidth, height: el.scrollHeight };
  }
  return measures;
}

/** Medidor clonado fuera de `.world`; no usa `display:none`. */
export async function startMeasure(
  frames: readonly MeasureFrame[],
): Promise<MeasureSession> {
  const host = document.createElement('div');
  host.setAttribute('aria-hidden', 'true');
  document.body.appendChild(host);

  const nodes = new Map<string, HTMLElement>();
  for (const f of frames) {
    const el = document.createElement('div');
    el.className = 'frame-body measuring';
    el.dataset.id = f.id;
    el.innerHTML = f.html;
    host.appendChild(el);
    nodes.set(f.id, el);
  }

  async function take(): Promise<Record<string, Size>> {
    await document.fonts.ready;
    await decodeImages(host);
    return readSizes(nodes);
  }

  const measures = await take();
  return {
    measures,
    remeasure: take,
    dispose: () => {
      host.remove();
    },
  };
}

export function sizesDiffer(
  a: Record<string, Size>,
  b: Record<string, Size>,
): boolean {
  const ids = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const id of ids) {
    const x = a[id];
    const y = b[id];
    if (!x || !y) return true;
    if (Math.abs(x.width - y.width) > 0.5 || Math.abs(x.height - y.height) > 0.5) {
      return true;
    }
  }
  return false;
}
