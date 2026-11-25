/**
 * Areas of a map (DC-013, Dungeon-Manager T-260/T-262): a named region – a room, part of a cave,
 * a far place – as polygons with holes in map pixels, possibly in several parts, optionally
 * secret. Version 1 files had a rectangle and a kind; `migrateArea` turns them into version 2.
 *
 * Pure.
 */
import { difference, union } from 'polyclip-ts';
import type { Point } from './geometry';
import { rectPolygon } from './fogModel';
import { snapToCorner, type GridConfig } from './grid';
import { ellipseArea } from './poly/shapes';
import { asGeom, fromClip } from './poly/polygon-clip';
import { isInside } from './poly/fog';
import type { Polygon, Ring } from './poly/types';

type Raw = Record<string, unknown>;

function isRecord(x: unknown): x is Raw {
  return typeof x === 'object' && x !== null && !Array.isArray(x);
}

function rectShape(rect: unknown): Polygon[] | null {
  if (!isRecord(rect)) return null;
  const { x, y, w, h } = rect;
  if (typeof x !== 'number' || typeof y !== 'number' || typeof w !== 'number' || typeof h !== 'number') return null;
  return [rectPolygon(x, y, x + w, y + h)];
}

/** A version 1 area (`rect`, `kind`) as version 2 (`shape`, `secret`); other values unchanged. */
export function migrateArea(area: unknown): unknown {
  if (!isRecord(area) || !('rect' in area)) return area;
  const { rect, kind, ...rest } = area;
  const shape = rectShape(rect);
  return { ...rest, ...(shape ? { shape } : { rect }), secret: kind === 'secret' };
}

/** A scene's override of an area, version 1 → 2 (`rect` → `shape`, `kind` → `secret`). */
export function migrateAreaOverride(override: unknown): unknown {
  if (!isRecord(override)) return override;
  const out: Raw = { ...override };
  if ('rect' in out) {
    const shape = rectShape(out['rect']);
    if (shape) {
      delete out['rect'];
      out['shape'] = shape;
    }
  }
  if ('kind' in out) {
    out['secret'] = out['kind'] === 'secret';
    delete out['kind'];
  }
  return out;
}

/** `shape` with `part` added: overlapping or touching parts join. */
export function addShape(shape: readonly Polygon[], part: Polygon): Polygon[] {
  return fromClip(union(asGeom(shape), asGeom([part])));
}

/** `shape` without `part` (a part inside leaves a hole; empty when nothing is left). */
export function subtractShape(shape: readonly Polygon[], part: Polygon): Polygon[] {
  return fromClip(difference(asGeom(shape), asGeom([part])));
}

export function areaContains(shape: readonly Polygon[], p: Point): boolean {
  return isInside(shape, [p.x, p.y]);
}

export interface Bounds {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function areaBounds(shape: readonly Polygon[]): Bounds {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const p of shape)
    for (const [x, y] of p.outer) {
      x0 = Math.min(x0, x);
      y0 = Math.min(y0, y);
      x1 = Math.max(x1, x);
      y1 = Math.max(y1, y);
    }
  return Number.isFinite(x0) ? { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } : { x: 0, y: 0, w: 0, h: 0 };
}

function rings(shape: readonly Polygon[]): Ring[] {
  return shape.flatMap((p) => [p.outer, ...p.holes]);
}

function segmentDistance(p: Point, a: readonly [number, number], b: readonly [number, number]): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len = dx * dx + dy * dy;
  const t = len === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a[0]) * dx + (p.y - a[1]) * dy) / len));
  return Math.hypot(p.x - (a[0] + t * dx), p.y - (a[1] + t * dy));
}

/** 0 inside the area, else the distance to its nearest edge (map pixels). */
export function distanceToArea(shape: readonly Polygon[], p: Point): number {
  if (areaContains(shape, p)) return 0;
  let best = Infinity;
  for (const ring of rings(shape))
    for (let i = 0; i < ring.length; i++) best = Math.min(best, segmentDistance(p, ring[i]!, ring[(i + 1) % ring.length]!));
  return best;
}

/** Where the name goes: near the top left of the area, inside it and never in a hole. */
export function labelPoint(shape: readonly Polygon[], offset = { x: 10, y: 9 }): Point {
  const b = areaBounds(shape);
  const corner = { x: b.x + offset.x, y: b.y + offset.y };
  if (areaContains(shape, corner)) return corner;
  // Scan rows from the top for the first point inside, a little in from the left.
  const step = Math.max(1, Math.min(b.w, b.h) / 40);
  for (let y = b.y + offset.y; y <= b.y + b.h; y += step)
    for (let x = b.x + offset.x; x <= b.x + b.w; x += step) if (areaContains(shape, { x, y })) return { x, y };
  return { x: b.x, y: b.y };
}

/** The shapes "create area" draws with (DC-013). */
export type AreaTool = 'rect' | 'ellipse' | 'polygon' | 'lasso';

/** Smallest side of a part, in map pixels: a click is not a shape. */
const MIN_SIDE = 4;

/**
 * A rectangle or ellipse dragged from `a` to `b`. With a `grid` its corners snap to the grid (an
 * ellipse fills its snapped box); `null` draws freely (Alt held).
 */
export function partFromDrag(tool: 'rect' | 'ellipse', a: Point, b: Point, grid: GridConfig | null): Polygon | null {
  const p = grid ? snapToCorner(grid, a) : a;
  const q = grid ? snapToCorner(grid, b) : b;
  if (Math.abs(q.x - p.x) < MIN_SIDE || Math.abs(q.y - p.y) < MIN_SIDE) return null;
  return tool === 'rect' ? rectPolygon(p.x, p.y, q.x, q.y) : ellipseArea([p.x, p.y], [q.x, q.y]);
}

/**
 * A polygon clicked point by point (snapped to the grid unless `grid` is `null`; points that snap
 * onto the one before are dropped) or a lasso drawn freehand (never snapped).
 */
export function partFromPoints(tool: 'polygon' | 'lasso', points: readonly Point[], grid: GridConfig | null): Polygon | null {
  const snapped = tool === 'polygon' && grid ? points.map((p) => snapToCorner(grid, p)) : [...points];
  const ring: [number, number][] = [];
  for (const p of snapped) {
    const last = ring.at(-1);
    if (!last || last[0] !== p.x || last[1] !== p.y) ring.push([p.x, p.y]);
  }
  if (ring.length > 1 && ring[0]![0] === ring.at(-1)![0] && ring[0]![1] === ring.at(-1)![1]) ring.pop();
  return ring.length >= 3 ? { outer: ring, holes: [] } : null;
}
