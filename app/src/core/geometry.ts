/** 2D geometry helpers and line-of-sight (visibility polygon) computation. */

export interface Point {
  x: number;
  y: number;
}

/** A wall-like segment that may block sight. Coordinates are in map pixels. */
export interface Segment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface VisibilityPoint extends Point {
  angle: number;
}

const EPS = 1e-4;

function segmentInBox(s: Segment, minX: number, minY: number, maxX: number, maxY: number): boolean {
  return (
    Math.max(s.x1, s.x2) >= minX &&
    Math.min(s.x1, s.x2) <= maxX &&
    Math.max(s.y1, s.y2) >= minY &&
    Math.min(s.y1, s.y2) <= maxY
  );
}

/** Distance along a ray (origin + t·dir) to a segment, or Infinity when it misses. */
export function raySegmentDistance(origin: Point, dirX: number, dirY: number, s: Segment): number {
  const sx = s.x2 - s.x1;
  const sy = s.y2 - s.y1;
  const den = dirX * sy - dirY * sx;
  if (Math.abs(den) < 1e-12) return Infinity;
  const qx = s.x1 - origin.x;
  const qy = s.y1 - origin.y;
  const t = (qx * sy - qy * sx) / den;
  const u = (qx * dirY - qy * dirX) / den;
  if (t > 0 && u >= -1e-9 && u <= 1 + 1e-9) return t;
  return Infinity;
}

/**
 * Computes the area visible from `origin` within a square of half-size `radius`
 * around it, blocked by `segments`. Callers clip the result to a circle when
 * they want a round sight radius.
 */
export function visibilityPolygon(origin: Point, radius: number, segments: readonly Segment[]): VisibilityPoint[] {
  const minX = origin.x - radius - 2;
  const minY = origin.y - radius - 2;
  const maxX = origin.x + radius + 2;
  const maxY = origin.y + radius + 2;
  const segs: Segment[] = segments.filter((s) => segmentInBox(s, minX, minY, maxX, maxY));
  segs.push(
    { x1: minX, y1: minY, x2: maxX, y2: minY },
    { x1: maxX, y1: minY, x2: maxX, y2: maxY },
    { x1: maxX, y1: maxY, x2: minX, y2: maxY },
    { x1: minX, y1: maxY, x2: minX, y2: minY },
  );

  const angles: number[] = [];
  for (const s of segs) {
    for (const [px, py] of [
      [s.x1, s.y1],
      [s.x2, s.y2],
    ] as const) {
      const a = Math.atan2(py - origin.y, px - origin.x);
      angles.push(a - EPS, a, a + EPS);
    }
  }
  // Extra rays keep curved clipping smooth in open areas.
  for (let i = 0; i < 64; i++) angles.push(-Math.PI + (i / 64) * Math.PI * 2);

  const out: VisibilityPoint[] = [];
  for (const angle of angles) {
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);
    let best = Infinity;
    for (const s of segs) {
      const t = raySegmentDistance(origin, dx, dy, s);
      if (t < best) best = t;
    }
    if (best < Infinity) out.push({ angle, x: origin.x + dx * best, y: origin.y + dy * best });
  }
  out.sort((a, b) => a.angle - b.angle);
  return out;
}

export function pointInPolygon(p: Point, poly: readonly Point[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

export function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** True when `p` is inside the visibility polygon and within the round sight radius. */
export function isVisibleFrom(origin: Point, radius: number, poly: readonly Point[], p: Point): boolean {
  return distance(origin, p) <= radius && pointInPolygon(p, poly);
}
