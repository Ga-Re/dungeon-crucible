/**
 * Which cells' centres lie in polygons (map px; even-odd, so holes count), worked out by one scan
 * per row of cell centres in the grid's own (turned) space: each edge is met once per row it
 * crosses, instead of testing every cell against every edge. Used where masks of whole areas are
 * needed often – the TV's explored ground at every change of the fog (E-85). Pure.
 */
import { toCellSpace, type GridConfig } from '../../grid';
import type { Polygon } from '../../poly/types';

/** A 0/1 value per cell over a rectangle of cells; outside it, 0. */
export interface CellGrid {
  readonly c0: number;
  readonly r0: number;
  readonly w: number;
  readonly h: number;
  readonly data: Uint8Array;
  get(col: number, row: number): number;
}

export function cellGrid(c0: number, r0: number, w: number, h: number, data = new Uint8Array(Math.max(0, w * h))): CellGrid {
  return {
    c0,
    r0,
    w,
    h,
    data,
    get(col, row) {
      const x = col - c0;
      const y = row - r0;
      return x >= 0 && y >= 0 && x < w && y < h ? data[y * w + x]! : 0;
    },
  };
}

export function cellCentresInside(polygons: readonly Polygon[], grid: GridConfig): CellGrid {
  // Each polygon on its own (its holes even-odd), then joined: overlapping polygons never cancel out.
  const shapes = polygons.map((p) => [p.outer, ...p.holes].map((ring) => ring.map(([x, y]) => toCellSpace(grid, { x, y }))));
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const rings of shapes)
    for (const ring of rings)
      for (const p of ring) {
        minX = Math.min(minX, p.x);
        minY = Math.min(minY, p.y);
        maxX = Math.max(maxX, p.x);
        maxY = Math.max(maxY, p.y);
      }
  if (minX === Infinity) return cellGrid(0, 0, 0, 0);
  const c0 = Math.floor(minX);
  const r0 = Math.floor(minY);
  const w = Math.floor(maxX) - c0 + 1;
  const h = Math.floor(maxY) - r0 + 1;
  const data = new Uint8Array(w * h);
  for (const rings of shapes) {
    // Edges by the rows of centres they cross.
    const byRow: number[][] = Array.from({ length: h }, () => []);
    for (const ring of rings)
      for (let i = 0; i < ring.length; i++) {
        const a = ring[i]!;
        const b = ring[(i + 1) % ring.length]!;
        if (a.y === b.y) continue;
        const lo = Math.min(a.y, b.y);
        const hi = Math.max(a.y, b.y);
        // Rows whose centre y (row + 0.5) lies in [lo, hi): each crossing counted once.
        for (let row = Math.ceil(lo - 0.5); row <= Math.ceil(hi - 0.5) - 1; row++) {
          const y = row + 0.5;
          byRow[row - r0]?.push(a.x + ((y - a.y) * (b.x - a.x)) / (b.y - a.y));
        }
      }
    for (let r = 0; r < h; r++) {
      const xs = byRow[r]!.sort((p, q) => p - q);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        // Cells whose centre (col + 0.5) lies in [xs[k], xs[k+1]).
        const from = Math.max(c0, Math.ceil(xs[k]! - 0.5));
        const to = Math.min(c0 + w - 1, Math.ceil(xs[k + 1]! - 0.5) - 1);
        for (let col = from; col <= to; col++) data[r * w + (col - c0)] = 1;
      }
    }
  }
  return cellGrid(c0, r0, w, h, data);
}
