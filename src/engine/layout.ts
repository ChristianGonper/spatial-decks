import { debugLayout } from './debug.ts';
import type { DeckIR, FrameIR, Geometry, LayoutMap, Rect, Size } from './types.ts';

export const CONTENT_MAX_WIDTH = 440;
export const FRAME_PAD_X = 24;
export const FRAME_PAD_Y = 20;
export const FRAME_GAP = 40;
export const PARENT_BODY_GAP = 16;
/** Igual que el CSS de `.frame`; `border-box` — no se suma al outer. */
export const BORDER = 1;
export const EPS = 0.5;

export class LayoutError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'LayoutError';
    this.code = code;
  }
}

function geoOf(frame: FrameIR): Geometry {
  return frame.geometry ?? {};
}

function hasNum(geo: Geometry, key: keyof Geometry): boolean {
  return typeof geo[key] === 'number';
}

function getFrame(ir: DeckIR, id: string): FrameIR {
  if (Object.prototype.hasOwnProperty.call(ir.frames, id)) {
    return ir.frames[id];
  }
  for (const fr of Object.values(ir.frames)) {
    if (fr.id === id) return fr;
  }
  throw new LayoutError('child-missing', `frame ${id} no existe`);
}

function inflate(r: Rect, delta: number): Rect {
  return {
    x: r.x - delta,
    y: r.y - delta,
    width: r.width + 2 * delta,
    height: r.height + 2 * delta,
  };
}

function intersectArea(a: Rect, b: Rect): number {
  const x1 = Math.max(a.x, b.x);
  const y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.width, b.x + b.width);
  const y2 = Math.min(a.y + a.height, b.y + b.height);
  const w = x2 - x1;
  const h = y2 - y1;
  if (w <= 0 || h <= 0) return 0;
  return w * h;
}

/** Toque de borde exacto no cuenta: se infla −EPS y el área interior debe ser > 0. */
export function boxesOverlap(a: Rect, b: Rect): boolean {
  return intersectArea(inflate(a, -EPS), inflate(b, -EPS)) > 0;
}

export function packSiblings(
  sizes: readonly Size[],
  mode: string,
): Array<{ x: number; y: number }> {
  const n = sizes.length;
  if (n === 0) return [];
  if (mode === 'row') {
    const out: Array<{ x: number; y: number }> = [];
    let x = 0;
    for (let i = 0; i < n; i++) {
      out.push({ x, y: 0 });
      x += sizes[i].width + FRAME_GAP;
    }
    return out;
  }
  if (mode === 'column') {
    const out: Array<{ x: number; y: number }> = [];
    let y = 0;
    for (let i = 0; i < n; i++) {
      out.push({ x: 0, y });
      y += sizes[i].height + FRAME_GAP;
    }
    return out;
  }

  const cols = Math.max(1, Math.ceil(Math.sqrt(n)));
  const rows = Math.ceil(n / cols);
  const colW = Array.from({ length: cols }, () => 0);
  const rowH = Array.from({ length: rows }, () => 0);
  for (let i = 0; i < n; i++) {
    const c = i % cols;
    const r = Math.floor(i / cols);
    colW[c] = Math.max(colW[c], sizes[i].width);
    rowH[r] = Math.max(rowH[r], sizes[i].height);
  }
  const colX: number[] = [];
  let accX = 0;
  for (let c = 0; c < cols; c++) {
    colX[c] = accX;
    accX += colW[c] + FRAME_GAP;
  }
  const rowY: number[] = [];
  let accY = 0;
  for (let r = 0; r < rows; r++) {
    rowY[r] = accY;
    accY += rowH[r] + FRAME_GAP;
  }
  const out: Array<{ x: number; y: number }> = [];
  for (let i = 0; i < n; i++) {
    const c = i % cols;
    const r = Math.floor(i / cols);
    out.push({ x: colX[c], y: rowY[r] });
  }
  return out;
}

type Placed = { id: string; x: number; y: number; width: number; height: number };

function bodyOf(measures: Record<string, Size>, id: string): Size {
  const m = measures[id];
  if (m && typeof m.width === 'number' && typeof m.height === 'number') return m;
  return { width: 0, height: 0 };
}

function layoutFrame(
  ir: DeckIR,
  measures: Record<string, Size>,
  id: string,
  locals: Map<string, Placed>,
  sizes: Map<string, Size>,
  bodies: Map<string, Size>,
): Size {
  const frame = getFrame(ir, id);
  const geo = geoOf(frame);
  const body = bodyOf(measures, id);
  bodies.set(id, body);

  const childBoxes: Size[] = [];
  for (const childId of frame.children) {
    const sub = layoutFrame(ir, measures, childId, locals, sizes, bodies);
    const cg = geoOf(getFrame(ir, childId));
    childBoxes.push({
      width: hasNum(cg, 'width') ? cg.width! : sub.width,
      height: hasNum(cg, 'height') ? cg.height! : sub.height,
    });
  }

  const slots = packSiblings(childBoxes, frame.layout);
  const placed: Placed[] = [];
  for (let i = 0; i < frame.children.length; i++) {
    const childId = frame.children[i];
    const cg = geoOf(getFrame(ir, childId));
    const w = childBoxes[i].width;
    const h = childBoxes[i].height;
    // 0 es valor; no usar cg.x || slot
    const x = hasNum(cg, 'x') ? cg.x! : slots[i].x;
    const y = hasNum(cg, 'y') ? cg.y! : slots[i].y;
    if (x < 0 || y < 0) {
      throw new LayoutError(
        'geometry-negative',
        `${childId}: geometry x/y < 0 (${x}, ${y})`,
      );
    }
    const box: Placed = { id: childId, x, y, width: w, height: h };
    placed.push(box);
    locals.set(childId, box);
    sizes.set(childId, { width: w, height: h });
  }

  for (let i = 0; i < placed.length; i++) {
    for (let j = i + 1; j < placed.length; j++) {
      const a = placed[i];
      const b = placed[j];
      if (
        boxesOverlap(
          { x: a.x, y: a.y, width: a.width, height: a.height },
          { x: b.x, y: b.y, width: b.width, height: b.height },
        )
      ) {
        debugLayout('overlap', a.id, b.id);
        throw new LayoutError('overlap', `${a.id} solapa ${b.id}`);
      }
    }
  }

  let areaW = 0;
  let areaH = 0;
  for (const p of placed) {
    areaW = Math.max(areaW, p.x + p.width);
    areaH = Math.max(areaH, p.y + p.height);
  }

  const n = frame.children.length;
  const innerW = Math.max(body.width, areaW);
  const innerH = body.height + (n > 0 ? PARENT_BODY_GAP + areaH : 0);
  const outerW = hasNum(geo, 'width') ? geo.width! : innerW + 2 * FRAME_PAD_X;
  const outerH = hasNum(geo, 'height') ? geo.height! : innerH + 2 * FRAME_PAD_Y;
  const size = { width: outerW, height: outerH };
  sizes.set(id, size);
  return size;
}

function placeWorld(
  ir: DeckIR,
  id: string,
  worldX: number,
  worldY: number,
  locals: Map<string, Placed>,
  sizes: Map<string, Size>,
  bodies: Map<string, Size>,
  out: LayoutMap,
): void {
  const size = sizes.get(id) ?? { width: 0, height: 0 };
  const rect: Rect = { x: worldX, y: worldY, width: size.width, height: size.height };
  out[id] = rect;
  const frame = getFrame(ir, id);
  if (frame.id !== id) out[frame.id] = rect;

  const n = frame.children.length;
  const body = bodies.get(id) ?? { width: 0, height: 0 };
  const ox = worldX + FRAME_PAD_X;
  const oy = worldY + FRAME_PAD_Y + body.height + (n > 0 ? PARENT_BODY_GAP : 0);
  for (const childId of frame.children) {
    const loc = locals.get(childId);
    if (!loc) continue;
    placeWorld(ir, childId, ox + loc.x, oy + loc.y, locals, sizes, bodies, out);
  }
}

export function layoutTree(ir: DeckIR, measures: Record<string, Size>): LayoutMap {
  const locals = new Map<string, Placed>();
  const sizes = new Map<string, Size>();
  const bodies = new Map<string, Size>();
  layoutFrame(ir, measures, ir.root, locals, sizes, bodies);
  const out: LayoutMap = {};
  // root ignora geometry.x/y
  placeWorld(ir, ir.root, 0, 0, locals, sizes, bodies, out);
  debugLayout('layoutTree', ir.slug, Object.keys(out).length);
  return out;
}
