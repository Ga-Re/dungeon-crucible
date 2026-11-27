/**
 * The tool "Stufe" (E-87, Teil B §4.7, §18.3): a stroke sets the support points it covers to one
 * step – its start's step ± 1, or a step picked – however often it passes over them (plateau
 * logic: clean terraces, no stacking); raising never lowers what is higher, lowering never raises
 * what is lower. Brushes: round, square on the grid (or on quarter cells) and a lasso filling its
 * inside. A square covers its cells' support points with their far edges, so a plateau of whole
 * cells is as large on every side. Pure.
 */
import { fromCellSpace, toCellSpace, type GridConfig } from '../../grid';
import type { Point } from '../../geometry';
import { SUBDIVISIONS } from './block';
import { pointOf, setPoints, type TerrainState } from './state';

export type StepMode = 'raise' | 'lower' | 'set';
export type BrushShape = 'round' | 'square' | 'lasso';

/** The steps a map can have (Teil B §7.1). */
export const STEP_MIN = -8;
export const STEP_MAX = 15;

const clamp = (v: number) => Math.max(STEP_MIN, Math.min(STEP_MAX, Math.round(v)));

/** The step a stroke sets: its start's ± 1, or the step picked. */
export function strokeStep(mode: StepMode, startStep: number, picked: number): number {
  return clamp(mode === 'raise' ? startStep + 1 : mode === 'lower' ? startStep - 1 : picked);
}

/** A map point in support points (not rounded). */
const toPoints = (grid: GridConfig, p: Point): Point => {
  const c = toCellSpace(grid, p);
  return { x: c.x * SUBDIVISIONS, y: c.y * SUBDIVISIONS };
};

/** The step at a map point: of the support point nearest to it. */
export function stepAt(t: TerrainState | null, stack: string, grid: GridConfig, p: Point): number {
  if (!t) return 0;
  const s = toPoints(grid, p);
  return pointOf(t, stack, 'step', Math.round(s.x), Math.round(s.y));
}

/**
 * The support points a brush of `sizeCells` covers along `path` (map px). Round: a disc; square:
 * whole cells (quarter cells with `quarter`) about the one under each place, far edges included.
 */
export function brushPoints(path: readonly Point[], shape: 'round' | 'square', sizeCells: number, grid: GridConfig, quarter: boolean): [number, number][] {
  const out = new Map<string, [number, number]>();
  const add = (x: number, y: number) => out.set(`${x},${y}`, [x, y]);
  // Places along the path a quarter cell apart, so no gap opens between them.
  const places: Point[] = [];
  const pts = path.map((p) => toPoints(grid, p));
  pts.forEach((p, i) => {
    if (i === 0) return void places.push(p);
    const a = pts[i - 1]!;
    const n = Math.max(1, Math.ceil(Math.hypot(p.x - a.x, p.y - a.y)));
    for (let k = 1; k <= n; k++) places.push({ x: a.x + ((p.x - a.x) * k) / n, y: a.y + ((p.y - a.y) * k) / n });
  });
  if (shape === 'round') {
    const r = (sizeCells * SUBDIVISIONS) / 2;
    for (const c of places)
      for (let y = Math.ceil(c.y - r); y <= Math.floor(c.y + r); y++)
        for (let x = Math.ceil(c.x - r); x <= Math.floor(c.x + r); x++) if (Math.hypot(x - c.x, y - c.y) <= r) add(x, y);
    return [...out.values()];
  }
  // Square: in units of cells or quarter cells, `size` units wide about the unit under the place.
  const unit = quarter ? 1 : SUBDIVISIONS;
  const size = Math.max(1, Math.round((sizeCells * SUBDIVISIONS) / unit));
  for (const c of places) {
    const u0 = Math.floor(c.x / unit) - Math.floor((size - 1) / 2);
    const v0 = Math.floor(c.y / unit) - Math.floor((size - 1) / 2);
    for (let y = v0 * unit; y <= (v0 + size) * unit; y++) for (let x = u0 * unit; x <= (u0 + size) * unit; x++) add(x, y);
  }
  return [...out.values()];
}

/** A lasso corner snapped to the nearest cell corner (quarter-cell corner with `quarter`). */
export function snapLasso(p: Point, grid: GridConfig, quarter: boolean): Point {
  const c = toCellSpace(grid, p);
  const n = quarter ? SUBDIVISIONS : 1;
  return fromCellSpace(grid, { x: Math.round(c.x * n) / n, y: Math.round(c.y * n) / n });
}

/** The support points inside a lasso (map px; even-odd), its border included. */
export function lassoPoints(polygon: readonly Point[], grid: GridConfig): [number, number][] {
  if (polygon.length < 3) return [];
  const ring = polygon.map((p) => toPoints(grid, p));
  const xs = ring.map((p) => p.x);
  const ys = ring.map((p) => p.y);
  const out: [number, number][] = [];
  const eps = 1e-6;
  for (let y = Math.ceil(Math.min(...ys) - eps); y <= Math.floor(Math.max(...ys) + eps); y++)
    for (let x = Math.ceil(Math.min(...xs) - eps); x <= Math.floor(Math.max(...xs) + eps); x++) if (insideOrOn(ring, x, y, eps)) out.push([x, y]);
  return out;
}

function insideOrOn(ring: readonly Point[], x: number, y: number, eps: number): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i]!;
    const b = ring[j]!;
    // On the border.
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (len > 0) {
      const t = ((x - a.x) * (b.x - a.x) + (y - a.y) * (b.y - a.y)) / (len * len);
      if (t >= -eps && t <= 1 + eps && Math.abs((b.x - a.x) * (y - a.y) - (b.y - a.y) * (x - a.x)) / len < eps) return true;
    }
    if (a.y > y !== b.y > y && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

/** `t` with a stroke over `points` of `stack`'s base: raised, lowered or set to `step`. */
export function applyStroke(t: TerrainState, stack: string, points: readonly (readonly [number, number])[], mode: StepMode, step: number): TerrainState {
  const edits: [number, number, number][] = [];
  for (const [x, y] of points) {
    const now = pointOf(t, stack, 'step', x, y);
    const next = mode === 'raise' ? Math.max(now, step) : mode === 'lower' ? Math.min(now, step) : step;
    if (next !== now) edits.push([x, y, next]);
  }
  return edits.length ? setPoints(t, stack, 'step', edits) : t;
}

/** The outline of the brush at `p` (map px), as it will paint: a disc, or the snapped square. */
export function brushOutline(p: Point, shape: 'round' | 'square', sizeCells: number, grid: GridConfig, quarter: boolean): Point[] {
  if (shape === 'round') {
    const r = (sizeCells * grid.cellWidth) / 2;
    return Array.from({ length: 32 }, (_, i) => ({ x: p.x + Math.cos((i / 32) * Math.PI * 2) * r, y: p.y + Math.sin((i / 32) * Math.PI * 2) * r }));
  }
  const unit = quarter ? 1 : SUBDIVISIONS;
  const size = Math.max(1, Math.round((sizeCells * SUBDIVISIONS) / unit));
  const c = toPoints(grid, p);
  const u0 = (Math.floor(c.x / unit) - Math.floor((size - 1) / 2)) * unit;
  const v0 = (Math.floor(c.y / unit) - Math.floor((size - 1) / 2)) * unit;
  const u1 = u0 + size * unit;
  const v1 = v0 + size * unit;
  return [
    [u0, v0],
    [u1, v0],
    [u1, v1],
    [u0, v1],
  ].map(([x, y]) => fromCellSpace(grid, { x: x! / SUBDIVISIONS, y: y! / SUBDIVISIONS }));
}
