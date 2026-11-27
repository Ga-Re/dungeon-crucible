/**
 * Editing lines point by point (E-33, E-35): snapping, hit tests, points (insert, move, remove),
 * split and join – for wall lines and the other line tools to come (E-48). Openings are anchored by
 * their place (A.4), so an edit moves nothing else. Pure: new arrays, nothing changed.
 */
import type { Point } from '../geometry';
import { snapToCorner, type GridConfig } from '../grid';

/** What can be edited point by point. */
export interface Line {
  id: string;
  points: Point[];
  closed: boolean;
  /** How far a click may lie off the line and still hit it (half of it). */
  thickness?: number;
}

export type BuildSnap = 'grid' | 'half' | 'angle' | 'free';

export interface SnapOptions {
  mode: BuildSnap;
  grid: GridConfig;
  /** The point drawn last (angle mode turns from it). */
  from?: Point | null;
  /** Points of other lines a new point snaps onto first. */
  magnets: readonly Point[];
  /** Map px within which a magnet catches. */
  tol: number;
}

const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

export function snapBuildPoint(p: Point, o: SnapOptions): Point {
  let best: Point | null = null;
  for (const m of o.magnets) if (dist(m, p) <= o.tol && (!best || dist(m, p) < dist(best, p))) best = m;
  if (best) return { x: best.x, y: best.y };
  switch (o.mode) {
    case 'free':
      return { x: p.x, y: p.y };
    case 'half':
      return snapToCorner({ ...o.grid, cellWidth: o.grid.cellWidth / 2, cellHeight: o.grid.cellHeight / 2 }, p);
    case 'angle': {
      if (!o.from) return snapToCorner(o.grid, p);
      const step = Math.PI / 4;
      const angle = Math.round(Math.atan2(p.y - o.from.y, p.x - o.from.x) / step) * step;
      const ux = Math.cos(angle);
      const uy = Math.sin(angle);
      const len = Math.max(0, (p.x - o.from.x) * ux + (p.y - o.from.y) * uy);
      return { x: o.from.x + ux * len, y: o.from.y + uy * len };
    }
    default:
      return snapToCorner(o.grid, p);
  }
}

/** Every point of the lines (what new points snap onto), but those of `skip`. */
export function linePoints(lines: readonly Line[], skip?: string): Point[] {
  return lines.filter((w) => w.id !== skip).flatMap((w) => w.points);
}

function segments(w: Line): [Point, Point][] {
  const out: [Point, Point][] = [];
  for (let i = 1; i < w.points.length; i++) out.push([w.points[i - 1], w.points[i]]);
  if (w.closed && w.points.length > 2) out.push([w.points[w.points.length - 1], w.points[0]]);
  return out;
}

/** Where `p` falls on line `w`: the distance along it, how far off it is, the point and segment. */
export function projectOnto(w: Line, p: Point): { at: number; dist: number; point: Point; segment: number } {
  let best = { at: 0, dist: Infinity, point: w.points[0] ?? p, segment: 0 };
  let start = 0;
  segments(w).forEach(([a, b], i) => {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const l2 = dx * dx + dy * dy;
    const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2));
    const q = { x: a.x + dx * t, y: a.y + dy * t };
    const d = dist(p, q);
    if (d < best.dist) best = { at: start + Math.sqrt(l2) * t, dist: d, point: q, segment: i };
    start += Math.sqrt(l2);
  });
  return best;
}

export function hitVertex(lines: readonly Line[], p: Point, tol: number): { line: string; index: number } | null {
  let best: { line: string; index: number; d: number } | null = null;
  for (const w of lines)
    w.points.forEach((q, index) => {
      const d = dist(p, q);
      if (d <= tol && (!best || d < best.d)) best = { line: w.id, index, d };
    });
  return best ? { line: (best as { line: string }).line, index: (best as { index: number }).index } : null;
}

export function hitLine(lines: readonly Line[], p: Point, tol: number): { line: string; at: number; point: Point; segment: number } | null {
  let best: { line: string; at: number; point: Point; segment: number; dist: number } | null = null;
  for (const w of lines) {
    const h = projectOnto(w, p);
    if (h.dist <= Math.max(tol, (w.thickness ?? 0) / 2) && (!best || h.dist < best.dist)) best = { line: w.id, ...h };
  }
  if (!best) return null;
  const { dist: _d, ...hit } = best;
  return hit;
}

function replace<T extends Line>(lines: readonly T[], id: string, next: readonly T[]): T[] {
  return lines.flatMap((w) => (w.id === id ? [...next] : [w]));
}

/** A point on line `id` at `p` (projected onto it); `index` is the new point's. */
export function insertPoint<T extends Line>(lines: readonly T[], id: string, p: Point): { lines: T[]; index: number } {
  const w = lines.find((x) => x.id === id);
  if (!w) return { lines: [...lines], index: -1 };
  const h = projectOnto(w, p);
  const index = h.segment + 1;
  const points = [...w.points.slice(0, index), h.point, ...w.points.slice(index)];
  return { lines: replace(lines, id, [{ ...w, points }]), index };
}

export function movePoint<T extends Line>(lines: readonly T[], id: string, index: number, p: Point): T[] {
  const w = lines.find((x) => x.id === id);
  if (!w) return [...lines];
  return replace(lines, id, [{ ...w, points: w.points.map((q, i) => (i === index ? { x: p.x, y: p.y } : q)) }]);
}

/** Removes a point: a ring below three points opens, a line below two points goes. */
export function removePoint<T extends Line>(lines: readonly T[], id: string, index: number): T[] {
  const w = lines.find((x) => x.id === id);
  if (!w) return [...lines];
  const points = w.points.filter((_, i) => i !== index);
  if (points.length < 2) return lines.filter((x) => x.id !== id);
  return replace(lines, id, [{ ...w, points, closed: w.closed && points.length >= 3 }]);
}

/** Splits line `id` at point `index`: an open line into two (the second gets `newId`), a ring opens there. */
export function splitAt<T extends Line>(lines: readonly T[], id: string, index: number, newId: string): T[] {
  const w = lines.find((x) => x.id === id);
  if (!w) return [...lines];
  if (w.closed) return replace(lines, id, [{ ...w, points: [...w.points.slice(index), ...w.points.slice(0, index), w.points[index]], closed: false }]);
  if (index <= 0 || index >= w.points.length - 1) return [...lines];
  return replace(lines, id, [{ ...w, points: w.points.slice(0, index + 1) }, { ...w, id: newId, points: w.points.slice(index) }]);
}

export interface LineEnd {
  line: string;
  end: 'first' | 'last';
}

/**
 * Joins two line ends: two lines become one (the first's look and id), a line's own two ends
 * close it into a ring. Where both ends lie on one point, it is kept once.
 */
export function joinEnds<T extends Line>(lines: readonly T[], a: LineEnd, b: LineEnd): T[] {
  const wa = lines.find((x) => x.id === a.line);
  const wb = lines.find((x) => x.id === b.line);
  if (!wa || !wb || wa.closed || wb.closed) return [...lines];
  if (wa.id === wb.id) {
    if (a.end === b.end || wa.points.length < 3) return [...lines];
    const pts = wa.points;
    const points = dist(pts[0], pts[pts.length - 1]) < 0.5 ? pts.slice(0, -1) : pts;
    if (points.length < 3) return [...lines];
    return replace(lines, wa.id, [{ ...wa, points, closed: true }]);
  }
  // Both run towards the joint: a's end last, b's end first.
  const pa = a.end === 'last' ? wa.points : [...wa.points].reverse();
  const pb = b.end === 'first' ? wb.points : [...wb.points].reverse();
  const points = dist(pa[pa.length - 1], pb[0]) < 0.5 ? [...pa, ...pb.slice(1)] : [...pa, ...pb];
  return replace(lines, wa.id, [{ ...wa, points }]).filter((w) => w.id !== wb.id);
}
