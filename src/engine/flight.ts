import { easeInOutCubic, fitCamera, lerpCam, type Camera, type ViewportSize } from './camera.ts';
import type { DeckIR, LayoutMap, PathStep } from './types.ts';

export function commonGroup(ir: Pick<DeckIR, 'frames' | 'root'>, from: string, to: string): string {
  const parents = new Map<string, string>();
  for (const frame of Object.values(ir.frames)) for (const child of frame.children) parents.set(child, frame.id);
  const ancestors = new Set<string>();
  for (let id: string | undefined = from; id; id = parents.get(id)) ancestors.add(id);
  for (let id: string | undefined = to; id; id = parents.get(id)) if (ancestors.has(id)) return id;
  return ir.root;
}

export function flightCameras(
  ir: Pick<DeckIR, 'frames' | 'root'>,
  cards: LayoutMap,
  groups: LayoutMap,
  from: string,
  to: PathStep,
  viewport: ViewportSize,
): Camera[] {
  const start = fitCamera(cards[from] ?? groups[ir.root], viewport);
  const end = fitCamera(cards[to.id] ?? groups[ir.root], viewport);
  if (to.transition !== 'via-group') return [start, end];
  const groupId = commonGroup(ir, from, to.id);
  return [start, fitCamera(groups[groupId], viewport), end];
}

/** t normalizado en el vuelo completo; cada tramo consume la misma fracción. */
export function cameraOnFlight(cameras: Camera[], t: number): Camera {
  const progress = Math.max(0, Math.min(1, t)) * (cameras.length - 1);
  const segment = Math.min(cameras.length - 2, Math.floor(progress));
  if (progress === segment) return cameras[segment];
  if (progress === cameras.length - 1) return cameras[cameras.length - 1];
  return lerpCam(cameras[segment], cameras[segment + 1], easeInOutCubic(progress - segment));
}
