/**
 * Editing drawn walls (E-33, tab "Build"): snapping, hit tests, points (insert, move, remove),
 * split and join, doors placed on and slid along walls. Doors keep their place: after an edit
 * each door's centre is projected onto the changed wall again. Pure: new arrays, nothing changed.
 */
import type { Point } from '../geometry';
import { snapToCell, snapToCorner, type GridConfig } from '../grid';
import { pointAt, polylineLength, type BuildDoor, type Masonry } from './masonry';

/** What can be edited point by point: a drawn wall or a cliff (E-33, E-34). */
export interface Line {
  id: string;
  points: Point[];
  closed: boolean;
  /** Walls: how far a click may lie off the line and still hit it (half of it). */
  thickness?: number;
}

export type BuildSnap = 'grid' | 'half' | 'angle' | 'free';

export interface SnapOptions {
  mode: BuildSnap;
  grid: GridConfig;
  /** The point drawn last (angle mode turns from it). */
  from?: Point | null;
  /** Points of other walls a new point snaps onto first. */
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

/** Every point of the walls (what new points snap onto), but those of `skip`. */
export function masonryPoints(masonry: readonly Line[], skip?: string): Point[] {
  return masonry.filter((w) => w.id !== skip).flatMap((w) => w.points);
}

function segments(w: Line): [Point, Point][] {
  const out: [Point, Point][] = [];
  for (let i = 1; i < w.points.length; i++) out.push([w.points[i - 1], w.points[i]]);
  if (w.closed && w.points.length > 2) out.push([w.points[w.points.length - 1], w.points[0]]);
  return out;
}

/** Where `p` falls on wall `w`: the distance along it, how far off it is, the point and segment. */
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

export function hitVertex(masonry: readonly Line[], p: Point, tol: number): { wall: string; index: number } | null {
  let best: { wall: string; index: number; d: number } | null = null;
  for (const w of masonry)
    w.points.forEach((q, index) => {
      const d = dist(p, q);
      if (d <= tol && (!best || d < best.d)) best = { wall: w.id, index, d };
    });
  return best ? { wall: (best as { wall: string }).wall, index: (best as { index: number }).index } : null;
}

export function hitMasonry(masonry: readonly Line[], p: Point, tol: number): { wall: string; at: number; point: Point; segment: number } | null {
  let best: { wall: string; at: number; point: Point; segment: number; dist: number } | null = null;
  for (const w of masonry) {
    const h = projectOnto(w, p);
    if (h.dist <= Math.max(tol, (w.thickness ?? 0) / 2) && (!best || h.dist < best.dist)) best = { wall: w.id, ...h };
  }
  if (!best) return null;
  const { dist: _d, ...hit } = best;
  return hit;
}

export function hitDoor(masonry: readonly Masonry[], doors: readonly BuildDoor[], p: Point, tol: number): string | null {
  const byId = new Map(masonry.map((w) => [w.id, w]));
  let best: { id: string; d: number } | null = null;
  for (const d of doors) {
    const w = byId.get(d.wall);
    if (!w) continue;
    const h = projectOnto(w, p);
    if (h.dist <= Math.max(tol, w.thickness / 2) && Math.abs(h.at - d.at) <= d.width / 2 && (!best || h.dist < best.d)) best = { id: d.id, d: h.dist };
  }
  return best?.id ?? null;
}

/**
 * Doors of wall `before`, moved onto `after` (the walls it became): each door's centre is
 * projected onto the nearest of them; a door farther off than twice the wall's thickness goes.
 */
function refit(before: Line, after: readonly Line[], doors: readonly BuildDoor[]): BuildDoor[] {
  return doors.flatMap((d) => {
    if (d.wall !== before.id) return [d];
    const centre = pointAt(before.points, before.closed, d.at);
    let best: { wall: string; at: number; dist: number } | null = null;
    for (const w of after) {
      const h = projectOnto(w, centre);
      if (!best || h.dist < best.dist) best = { wall: w.id, at: h.at, dist: h.dist };
    }
    return best && best.dist <= (before.thickness ?? 0) * 2 ? [{ ...d, wall: best.wall, at: best.at }] : [];
  });
}

export interface Edit<T extends Line = Masonry> {
  masonry: T[];
  doors: BuildDoor[];
}

function replace<T extends Line>(masonry: readonly T[], id: string, next: readonly T[]): T[] {
  return masonry.flatMap((w) => (w.id === id ? [...next] : [w]));
}

/** A point on the line of wall `id` at `p` (projected onto it); `index` is the new point's. */
export function insertPoint<T extends Line>(masonry: readonly T[], id: string, p: Point): { masonry: T[]; index: number } {
  const w = masonry.find((x) => x.id === id);
  if (!w) return { masonry: [...masonry], index: -1 };
  const h = projectOnto(w, p);
  const index = h.segment + 1;
  const points = [...w.points.slice(0, index), h.point, ...w.points.slice(index)];
  return { masonry: replace(masonry, id, [{ ...w, points }]), index };
}

export function movePoint<T extends Line>(masonry: readonly T[], doors: readonly BuildDoor[], id: string, index: number, p: Point): Edit<T> {
  const w = masonry.find((x) => x.id === id);
  if (!w) return { masonry: [...masonry], doors: [...doors] };
  const next = { ...w, points: w.points.map((q, i) => (i === index ? { x: p.x, y: p.y } : q)) };
  return { masonry: replace(masonry, id, [next]), doors: refit(w, [next], doors) };
}

/** Removes a point: a ring below three points opens, a wall below two points goes (with its doors). */
export function removePoint<T extends Line>(masonry: readonly T[], doors: readonly BuildDoor[], id: string, index: number): Edit<T> {
  const w = masonry.find((x) => x.id === id);
  if (!w) return { masonry: [...masonry], doors: [...doors] };
  const points = w.points.filter((_, i) => i !== index);
  if (points.length < 2) return removeWall(masonry, doors, id);
  const next = { ...w, points, closed: w.closed && points.length >= 3 };
  return { masonry: replace(masonry, id, [next]), doors: refit(w, [next], doors) };
}

export function removeWall<T extends Line>(masonry: readonly T[], doors: readonly BuildDoor[], id: string): Edit<T> {
  return { masonry: masonry.filter((w) => w.id !== id), doors: doors.filter((d) => d.wall !== id) };
}

/** Splits wall `id` at point `index`: an open wall into two (the second gets `newId`), a ring opens there. */
export function splitAt<T extends Line>(masonry: readonly T[], doors: readonly BuildDoor[], id: string, index: number, newId: string): Edit<T> {
  const w = masonry.find((x) => x.id === id);
  if (!w) return { masonry: [...masonry], doors: [...doors] };
  if (w.closed) {
    const points = [...w.points.slice(index), ...w.points.slice(0, index), w.points[index]];
    const next = { ...w, points, closed: false };
    return { masonry: replace(masonry, id, [next]), doors: refit(w, [next], doors) };
  }
  if (index <= 0 || index >= w.points.length - 1) return { masonry: [...masonry], doors: [...doors] };
  const first = { ...w, points: w.points.slice(0, index + 1) };
  const second = { ...w, id: newId, points: w.points.slice(index) };
  return { masonry: replace(masonry, id, [first, second]), doors: refit(w, [first, second], doors) };
}

export interface WallEnd {
  wall: string;
  end: 'first' | 'last';
}

/**
 * Joins two wall ends: two walls become one (the first's style and id), a wall's own two ends
 * close it into a ring. Where both ends lie on one point, it is kept once.
 */
export function joinEnds<T extends Line>(masonry: readonly T[], doors: readonly BuildDoor[], a: WallEnd, b: WallEnd): Edit<T> {
  const wa = masonry.find((x) => x.id === a.wall);
  const wb = masonry.find((x) => x.id === b.wall);
  if (!wa || !wb || wa.closed || wb.closed) return { masonry: [...masonry], doors: [...doors] };
  if (wa.id === wb.id) {
    if (a.end === b.end || wa.points.length < 3) return { masonry: [...masonry], doors: [...doors] };
    const pts = wa.points;
    const points = dist(pts[0], pts[pts.length - 1]) < 0.5 ? pts.slice(0, -1) : pts;
    if (points.length < 3) return { masonry: [...masonry], doors: [...doors] };
    const next = { ...wa, points, closed: true };
    return { masonry: replace(masonry, wa.id, [next]), doors: refit(wa, [next], doors) };
  }
  // Both run towards the joint: a's end last, b's end first.
  const pa = a.end === 'last' ? wa.points : [...wa.points].reverse();
  const pb = b.end === 'first' ? wb.points : [...wb.points].reverse();
  const points = dist(pa[pa.length - 1], pb[0]) < 0.5 ? [...pa, ...pb.slice(1)] : [...pa, ...pb];
  const next = { ...wa, points };
  const moved = refit(wb, [next], refit(wa, [next], doors));
  return { masonry: replace(masonry, wa.id, [next]).filter((w) => w.id !== wb.id), doors: moved };
}

/** Where a door clicked at `p` goes: on the nearest wall, its centre on a cell's middle (with a grid). */
export function doorPlacement(masonry: readonly Masonry[], p: Point, grid: GridConfig | null, tol: number): { wall: string; at: number } | null {
  const hit = hitMasonry(masonry, p, tol);
  if (!hit) return null;
  const w = masonry.find((x) => x.id === hit.wall)!;
  if (!grid) return { wall: w.id, at: hit.at };
  return { wall: w.id, at: projectOnto(w, snapToCell(grid, hit.point)).at };
}

/** A door slid along its wall towards `p` (centred on a cell with a grid). */
export function slideDoor(masonry: readonly Masonry[], door: BuildDoor, p: Point, grid: GridConfig | null): BuildDoor {
  const w = masonry.find((x) => x.id === door.wall);
  if (!w) return door;
  const h = projectOnto(w, p);
  const at = grid ? projectOnto(w, snapToCell(grid, h.point)).at : h.at;
  return { ...door, at: Math.max(0, Math.min(polylineLength(w.points, w.closed), at)) };
}
