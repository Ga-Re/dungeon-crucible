/**
 * Assets placed on a map (E-27, DC-041): a placement stores the asset's file, its centre, its
 * turn and its scale; its size comes from the asset (cells) and the map's grid, so changing the
 * asset in the Vault changes every placement. Pure.
 */
import type { Point } from './geometry';
import type { GridConfig } from './grid';
import type { MapAssetPlacement } from './scene';

export interface Footprint {
  /** Centre in map pixels. */
  cx: number;
  cy: number;
  /** Width and height before turning, in map pixels. */
  w: number;
  h: number;
  /** Degrees, clockwise. */
  rotation: number;
}

export const ROTATE_STEP = 15;
export const SCALE_MIN = 0.25;
export const SCALE_MAX = 8;

/** Where a placed asset lies: its size in cells (one cell if the asset has none) × cell size × scale. */
export function footprintOf(p: Pick<MapAssetPlacement, 'x' | 'y' | 'rotation' | 'scale'>, sizeCells: { w: number; h: number } | undefined, grid: GridConfig): Footprint {
  const size = sizeCells ?? { w: 1, h: 1 };
  return { cx: p.x, cy: p.y, w: size.w * grid.cellWidth * p.scale, h: size.h * grid.cellHeight * p.scale, rotation: p.rotation };
}

/** Whether `p` lies inside the turned footprint. */
export function hitsPlacement(fp: Footprint, p: Point): boolean {
  const r = (-fp.rotation * Math.PI) / 180;
  const dx = p.x - fp.cx;
  const dy = p.y - fp.cy;
  const x = dx * Math.cos(r) - dy * Math.sin(r);
  const y = dx * Math.sin(r) + dy * Math.cos(r);
  return Math.abs(x) <= fp.w / 2 && Math.abs(y) <= fp.h / 2;
}

/** The centre on one axis: on a grid line for an even number of cells, on a cell centre for an odd one. */
function snapAxis(v: number, origin: number, cell: number, cells: number): number {
  const odd = Math.round(cells) % 2 === 1;
  const off = odd ? cell / 2 : 0;
  return Math.round((v - origin - off) / cell) * cell + origin + off;
}

/**
 * A placement's centre snapped so its footprint lies on the grid (turned by a multiple of 90°:
 * edges on grid lines); at other angles, or with a size that is not whole cells, on a cell centre.
 */
export function snapPlacement(grid: GridConfig, p: Point, sizeCells: { w: number; h: number } | undefined, scale: number, rotation: number): Point {
  const size = sizeCells ?? { w: 1, h: 1 };
  const quarter = ((rotation % 360) + 360) % 360;
  const square = quarter % 90 === 0;
  const across = quarter === 90 || quarter === 270;
  const w = (across ? size.h : size.w) * scale;
  const h = (across ? size.w : size.h) * scale;
  const whole = (n: number) => Math.abs(n - Math.round(n)) < 1e-6;
  if (!square || !whole(w) || !whole(h)) return { x: snapAxis(p.x, grid.originX, grid.cellWidth, 1), y: snapAxis(p.y, grid.originY, grid.cellHeight, 1) };
  return { x: snapAxis(p.x, grid.originX, grid.cellWidth, w), y: snapAxis(p.y, grid.originY, grid.cellHeight, h) };
}

export function rotateBy(rotation: number, delta: number): number {
  return (((rotation + delta) % 360) + 360) % 360;
}

export function scaleBy(scale: number, factor: number): number {
  return Math.min(SCALE_MAX, Math.max(SCALE_MIN, Math.round(scale * factor * 100) / 100));
}

/** The next file of a variant group after `current` (sorted by path; back to the first after the last). */
export function nextVariant(group: readonly string[], current: string): string {
  const sorted = [...group].sort();
  const i = sorted.indexOf(current);
  return sorted.length === 0 ? current : sorted[(i + 1) % sorted.length];
}
