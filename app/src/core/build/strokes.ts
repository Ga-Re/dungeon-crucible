/**
 * Hand-drawn strokes (E-35, DC-107e): what the pointer drew while dragging becomes a line of few
 * points that can be edited – the wobble of the hand smoothed away, bends kept, the exact ends
 * kept so they can join other lines. Pure.
 */
import type { Point } from '../geometry';

function distToSegment(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const l2 = dx * dx + dy * dy;
  const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/** Ramer–Douglas–Peucker: the fewest points that stay within `tolerance` of the path. */
export function simplifyPath(points: readonly Point[], tolerance: number): Point[] {
  if (points.length <= 2) return points.map((p) => ({ ...p }));
  const keep = new Array<boolean>(points.length).fill(false);
  keep[0] = keep[points.length - 1] = true;
  const stack: [number, number][] = [[0, points.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop()!;
    let worst = -1;
    let at = -1;
    for (let i = a + 1; i < b; i++) {
      const d = distToSegment(points[i], points[a], points[b]);
      if (d > worst) {
        worst = d;
        at = i;
      }
    }
    if (worst > tolerance) {
      keep[at] = true;
      stack.push([a, at], [at, b]);
    }
  }
  return points.filter((_, i) => keep[i]).map((p) => ({ ...p }));
}

/** A moving average over neighbours (the ends stay where they are). */
function smooth(points: readonly Point[], reach: number): Point[] {
  return points.map((p, i) => {
    if (i === 0 || i === points.length - 1) return { ...p };
    let x = 0;
    let y = 0;
    let n = 0;
    for (let k = Math.max(0, i - reach); k <= Math.min(points.length - 1, i + reach); k++) {
      x += points[k].x;
      y += points[k].y;
      n++;
    }
    return { x: x / n, y: y / n };
  });
}

/**
 * A stroke as an editable line: smoothed, then reduced to the points that matter (within an
 * eighth of a cell). Empty when the stroke is shorter than a quarter cell.
 */
export function strokeToLine(stroke: readonly Point[], cell: number): Point[] {
  let length = 0;
  for (let i = 1; i < stroke.length; i++) length += Math.hypot(stroke[i].x - stroke[i - 1].x, stroke[i].y - stroke[i - 1].y);
  if (stroke.length < 2 || length < cell / 4) return [];
  return simplifyPath(smooth(stroke, 3), cell / 8);
}

/** Whether a stroke ends where it began (within `tol`) after going round: drawn as a ring. */
export function closesRing(stroke: readonly Point[], tol: number): boolean {
  if (stroke.length < 3) return false;
  const first = stroke[0];
  const last = stroke[stroke.length - 1];
  // Far enough away somewhere in between: not just a short scribble.
  const away = stroke.reduce((m, p) => Math.max(m, Math.hypot(p.x - first.x, p.y - first.y)), 0);
  return Math.hypot(last.x - first.x, last.y - first.y) <= tol && away > tol * 4;
}
