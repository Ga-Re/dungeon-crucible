/**
 * The DM window's view of the map (DC-022, E-42): zoom, offset and the map's turn in 90° steps.
 * screen = turn(map point) · zoom + offset, turning as the renderer's camera does (the same matrix
 * as `cssTransform`). Pure.
 */
import type { Point } from '../core/geometry';

export type Turn = 0 | 90 | 180 | 270;

export interface View {
  zoom: number;
  x: number;
  y: number;
  /** The map's turn (degrees, clockwise on screen). */
  rot: Turn;
}

const COS: Record<Turn, number> = { 0: 1, 90: 0, 180: -1, 270: 0 };
const SIN: Record<Turn, number> = { 0: 0, 90: 1, 180: 0, 270: -1 };

export function turn(p: Point, rot: Turn): Point {
  return { x: COS[rot] * p.x - SIN[rot] * p.y, y: SIN[rot] * p.x + COS[rot] * p.y };
}

export function unturn(p: Point, rot: Turn): Point {
  return { x: COS[rot] * p.x + SIN[rot] * p.y, y: -SIN[rot] * p.x + COS[rot] * p.y };
}

export function toScreen(v: View, p: Point): Point {
  const q = turn(p, v.rot);
  return { x: q.x * v.zoom + v.x, y: q.y * v.zoom + v.y };
}

export function toMap(v: View, s: Point): Point {
  return unturn({ x: (s.x - v.x) / v.zoom, y: (s.y - v.y) / v.zoom }, v.rot);
}

/** The view showing map point `p` at screen point `s`, at `zoom`. */
export function viewAt(p: Point, s: Point, zoom: number, rot: Turn): View {
  const q = turn(p, rot);
  return { zoom, x: s.x - q.x * zoom, y: s.y - q.y * zoom, rot };
}

/** The view fitting `box` (map px) into `size` with `margin` around, turned by `rot`. */
export function fitView(box: { x: number; y: number; w: number; h: number }, size: { width: number; height: number }, rot: Turn, margin = 20): View {
  const sideways = rot === 90 || rot === 270;
  const w = sideways ? box.h : box.w;
  const h = sideways ? box.w : box.h;
  const zoom = Math.min((size.width - margin * 2) / w, (size.height - margin * 2) / h);
  return viewAt({ x: box.x + box.w / 2, y: box.y + box.h / 2 }, { x: size.width / 2, y: size.height / 2 }, zoom, rot);
}
