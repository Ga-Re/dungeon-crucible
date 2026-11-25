/**
 * The anchor of an asset (E-29, DC-042): a point on its picture, set in the asset editor, that a
 * placed asset turns and scales about and that snaps to the grid – or, if the asset says so, to a
 * near wall, the asset then turned along it (a torch, a shelf, a door). A placement still stores
 * its centre; the anchor only decides where that centre ends up. Pure.
 */
import type { Point, Segment } from './geometry';
import type { GridConfig } from './grid';
import { rotateBy, scaleBy } from './placement';

export interface AnchorSpec {
  sizeCells?: { w: number; h: number };
  /** In cells from the footprint's top left corner (like the cover mask). */
  anchor?: { x: number; y: number; wallSnap: boolean };
}

interface Placed {
  x: number;
  y: number;
  rotation: number;
  scale: number;
}

function turn(v: Point, deg: number): Point {
  const r = (deg * Math.PI) / 180;
  return { x: v.x * Math.cos(r) - v.y * Math.sin(r), y: v.x * Math.sin(r) + v.y * Math.cos(r) };
}

/** From the centre to the anchor, in map pixels, for an asset turned by `rotation` and scaled by `scale`. */
function offset(spec: AnchorSpec, grid: GridConfig, rotation: number, scale: number): Point {
  if (!spec.anchor) return { x: 0, y: 0 };
  const size = spec.sizeCells ?? { w: 1, h: 1 };
  const local = { x: (spec.anchor.x - size.w / 2) * grid.cellWidth * scale, y: (spec.anchor.y - size.h / 2) * grid.cellHeight * scale };
  return turn(local, rotation);
}

/** Where a placement's anchor lies on the map (its centre if the asset has none). */
export function anchorPoint(p: Placed, spec: AnchorSpec, grid: GridConfig): Point {
  const o = offset(spec, grid, p.rotation, p.scale);
  return { x: p.x + o.x, y: p.y + o.y };
}

/** Turned by `delta` degrees about the anchor. */
export function rotateAboutAnchor(p: Placed, spec: AnchorSpec, grid: GridConfig, delta: number): { x: number; y: number; rotation: number } {
  const a = anchorPoint(p, spec, grid);
  const rotation = rotateBy(p.rotation, delta);
  const o = offset(spec, grid, rotation, p.scale);
  return { x: a.x - o.x, y: a.y - o.y, rotation };
}

/** Scaled by `factor` about the anchor (within the scale limits). */
export function scaleAboutAnchor(p: Placed, spec: AnchorSpec, grid: GridConfig, factor: number): { x: number; y: number; scale: number } {
  const a = anchorPoint(p, spec, grid);
  const scale = scaleBy(p.scale, factor);
  const o = offset(spec, grid, p.rotation, scale);
  return { x: a.x - o.x, y: a.y - o.y, scale };
}

/** On the half-cell lattice: cell corners, edge middles and cell centres. */
function snapHalf(grid: GridConfig, p: Point): Point {
  const hx = grid.cellWidth / 2;
  const hy = grid.cellHeight / 2;
  return { x: Math.round((p.x - grid.originX) / hx) * hx + grid.originX, y: Math.round((p.y - grid.originY) / hy) * hy + grid.originY };
}

/** The point of a segment nearest to `p`, and how far `p` is from it. */
function nearestOn(s: Segment, p: Point): { at: Point; dist: number } {
  const dx = s.x2 - s.x1;
  const dy = s.y2 - s.y1;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - s.x1) * dx + (p.y - s.y1) * dy) / len2));
  const at = { x: s.x1 + t * dx, y: s.y1 + t * dy };
  return { at, dist: Math.hypot(p.x - at.x, p.y - at.y) };
}

/**
 * Where an anchored asset dropped with its centre at `p` comes to lie. With wall snapping, a wall
 * within the anchor's distance from the centre plus half a cell takes the anchor (at the point
 * nearest its half-cell snap); the asset is turned along the wall, its body on the side it was dropped on. Otherwise the anchor snaps to the
 * half-cell lattice and the turn stays. Without an anchor: `null` (the footprint snaps as before).
 */
export function snapAnchored(p: Placed, spec: AnchorSpec, grid: GridConfig, walls: readonly Segment[]): { x: number; y: number; rotation: number } | null {
  if (!spec.anchor) return null;
  const a = anchorPoint(p, spec, grid);
  if (spec.anchor.wallSnap) {
    const reach = Math.hypot(a.x - p.x, a.y - p.y) + Math.min(grid.cellWidth, grid.cellHeight) / 2;
    let best: { wall: Segment; dist: number } | null = null;
    for (const w of walls) {
      const { dist } = nearestOn(w, p);
      if (dist <= reach && (!best || dist < best.dist)) best = { wall: w, dist };
    }
    if (best) {
      const w = best.wall;
      // Along the wall on the half-cell lattice too (exactly so for walls along the grid).
      const on = nearestOn(w, snapHalf(grid, a)).at;
      const along = (Math.atan2(w.y2 - w.y1, w.x2 - w.x1) * 180) / Math.PI;
      // The side of the wall the asset was dropped on (sign of the cross product).
      const side = Math.sign((w.x2 - w.x1) * (p.y - w.y1) - (w.y2 - w.y1) * (p.x - w.x1));
      const options = [rotateBy(along, 0), rotateBy(along, 180)].map((rotation) => {
        const o = offset(spec, grid, rotation, p.scale);
        const c = { x: on.x - o.x, y: on.y - o.y };
        const cSide = Math.sign((w.x2 - w.x1) * (c.y - w.y1) - (w.y2 - w.y1) * (c.x - w.x1));
        return { x: c.x, y: c.y, rotation, fits: cSide === side };
      });
      const pick = options.find((o) => o.fits) ?? options.reduce((m, o) => (angleGap(o.rotation, p.rotation) < angleGap(m.rotation, p.rotation) ? o : m));
      return { x: pick.x, y: pick.y, rotation: pick.rotation };
    }
  }
  const s = snapHalf(grid, a);
  return { x: p.x + s.x - a.x, y: p.y + s.y - a.y, rotation: p.rotation };
}

function angleGap(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}
