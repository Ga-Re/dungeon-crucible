/**
 * Editing walls (DC-014): hit tests, joints and chains. Walls stay single segments; where ends
 * lie on the same point they form a joint, and walls joined end to end form a chain. Pure
 * functions: they return new arrays and never change the walls they get.
 */
import type { Point } from './geometry';
import type { Wall } from './scene';

/** One end of a wall: 1 is (x1, y1), 2 is (x2, y2). */
export interface WallEnd {
  id: string;
  end: 1 | 2;
}

/** Ends closer than this (map px) are one joint. */
const SAME = 0.5;

function endPoint(w: Wall, end: 1 | 2): Point {
  return end === 1 ? { x: w.x1, y: w.y1 } : { x: w.x2, y: w.y2 };
}

function dist(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function distToSegment(p: Point, w: Wall): number {
  const dx = w.x2 - w.x1;
  const dy = w.y2 - w.y1;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - w.x1) * dx + (p.y - w.y1) * dy) / len2));
  return Math.hypot(p.x - (w.x1 + t * dx), p.y - (w.y1 + t * dy));
}

/** The wall nearest to `p` within `tol`, if any (the topmost one on a tie). */
export function wallAt(walls: readonly Wall[], p: Point, tol: number): string | null {
  let best: string | null = null;
  let bestD = tol;
  for (let i = walls.length - 1; i >= 0; i--) {
    const d = distToSegment(p, walls[i]);
    if (d <= bestD && (best === null || d < bestD)) {
      best = walls[i].id;
      bestD = d;
    }
  }
  return best;
}

/** The wall end nearest to `p` within `tol`, as a point (for snapping new walls onto old ones). */
export function nearestEnd(walls: readonly Wall[], p: Point, tol: number): Point | null {
  let best: Point | null = null;
  let bestD = tol;
  for (const w of walls)
    for (const end of [1, 2] as const) {
      const q = endPoint(w, end);
      const d = dist(p, q);
      if (d <= bestD) {
        best = q;
        bestD = d;
      }
    }
  return best;
}

/**
 * The joint at `p`: every wall end on the end point nearest to `p` within `tol`. `only` limits it
 * to some walls (taking just the selected wall's end out of a joint).
 */
export function endsAt(walls: readonly Wall[], p: Point, tol: number, only?: ReadonlySet<string>): WallEnd[] {
  const pool = only ? walls.filter((w) => only.has(w.id)) : walls;
  const at = nearestEnd(pool, p, tol);
  if (!at) return [];
  const out: WallEnd[] = [];
  for (const w of pool)
    for (const end of [1, 2] as const) if (dist(endPoint(w, end), at) <= SAME) out.push({ id: w.id, end });
  return out;
}

/** Moves the given ends to `to`; walls not involved are kept as they are (same objects). */
export function moveEnds(walls: readonly Wall[], ends: readonly WallEnd[], to: Point): Wall[] {
  if (ends.length === 0) return [...walls];
  return walls.map((w) => {
    const mine = ends.filter((e) => e.id === w.id);
    if (mine.length === 0) return w;
    const next = { ...w };
    for (const e of mine) {
      if (e.end === 1) {
        next.x1 = to.x;
        next.y1 = to.y;
      } else {
        next.x2 = to.x;
        next.y2 = to.y;
      }
    }
    return next;
  });
}

/** Walls whose two ends met (after a drag) are gone. */
export function withoutDegenerate(walls: readonly Wall[]): Wall[] {
  return walls.filter((w) => dist(endPoint(w, 1), endPoint(w, 2)) > SAME);
}

/** Every wall joined to `id` end to end, directly or through others (`id` included). */
export function chainOf(walls: readonly Wall[], id: string): string[] {
  const start = walls.find((w) => w.id === id);
  if (!start) return [];
  const found = new Set([id]);
  const queue = [start];
  while (queue.length) {
    const w = queue.pop()!;
    const ends = [endPoint(w, 1), endPoint(w, 2)];
    for (const o of walls) {
      if (found.has(o.id)) continue;
      const touches = ends.some((p) => dist(p, endPoint(o, 1)) <= SAME || dist(p, endPoint(o, 2)) <= SAME);
      if (touches) {
        found.add(o.id);
        queue.push(o);
      }
    }
  }
  return [...found];
}

export function removeWalls(walls: readonly Wall[], ids: ReadonlySet<string>): Wall[] {
  return walls.filter((w) => !ids.has(w.id));
}
