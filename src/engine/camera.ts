import type { Rect } from './types.ts';

export const CAMERA_PAD_RATIO = 0.12;
export const CAMERA_DURATION_MS = 1000;

export type Camera = { cx: number; cy: number; s: number };
export type ViewportSize = { width: number; height: number };

export function fitCamera(r: Rect, vp: ViewportSize): Camera {
  const rw = r.width * (1 + 2 * CAMERA_PAD_RATIO);
  const rh = r.height * (1 + 2 * CAMERA_PAD_RATIO);
  let s = Math.min(vp.width / rw, vp.height / rh);
  if (!Number.isFinite(s) || s <= 0) s = 1;
  return {
    cx: r.x + r.width / 2,
    cy: r.y + r.height / 2,
    s,
  };
}

export function easeInOutCubic(t: number): number {
  const x = t < 0 ? 0 : t > 1 ? 1 : t;
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function lerpCam(a: Camera, b: Camera, t: number): Camera {
  const s0 = Math.max(a.s, Number.MIN_VALUE);
  const s1 = Math.max(b.s, Number.MIN_VALUE);
  return {
    cx: lerp(a.cx, b.cx, t),
    cy: lerp(a.cy, b.cy, t),
    s: Math.exp(lerp(Math.log(s0), Math.log(s1), t)),
  };
}

/** Un solo transform en `.world`; origin 0 0. */
export function worldTransform(cam: Camera, vp: ViewportSize): string {
  return (
    `translate(${vp.width / 2}px, ${vp.height / 2}px) ` +
    `scale(${cam.s}) ` +
    `translate(${-cam.cx}px, ${-cam.cy}px)`
  );
}
