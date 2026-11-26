/**
 * The Map Forge's leak check (DC-025, E-43): where sight could slip through walls. Open wall ends,
 * small gaps between walls (counted once, not as two open ends) and doors touching no wall. Cliffs
 * are open lines by nature and are left out. Pure.
 */
import type { Point } from './geometry';
import type { Wall } from './scene';

export interface Leak {
  kind: 'gap' | 'end' | 'door';
  /** Where it is: the open end, the gap's one side, or the door's middle. */
  at: Point;
  /** A gap's other side. */
  to?: Point;
  /** The walls concerned. */
  walls: string[];
}

/** Ends this close count as joined (map pixels): drawing snaps exactly, imports are a bit off. */
const JOINED = 0.5;

const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

/** Distance from `p` to segment `w`. */
function toSegment(p: Point, w: Wall): number {
  const dx = w.x2 - w.x1;
  const dy = w.y2 - w.y1;
  const len = dx * dx + dy * dy;
  const t = len ? Math.max(0, Math.min(1, ((p.x - w.x1) * dx + (p.y - w.y1) * dy) / len)) : 0;
  return Math.hypot(p.x - (w.x1 + t * dx), p.y - (w.y1 + t * dy));
}

/**
 * The leaks of `walls`; `gapPx`: up to this far apart, two open ends are one gap (half a cell is
 * a sensible value).
 */
export function findLeaks(walls: readonly Wall[], gapPx: number): Leak[] {
  const solid = walls.filter((w) => w.kind !== 'cliff');
  const ends = solid.flatMap((w) => [
    { wall: w, p: { x: w.x1, y: w.y1 } },
    { wall: w, p: { x: w.x2, y: w.y2 } },
  ]);
  // An end is joined when it lies on another wall (its end or anywhere along it).
  const joined = (e: (typeof ends)[number]) => solid.some((o) => o !== e.wall && toSegment(e.p, o) <= JOINED);
  const loose = ends.filter((e) => !joined(e));
  const out: Leak[] = [];
  // Doors touching no wall at either end: one finding for the door.
  const lostDoors = new Set(
    solid.filter((w) => (w.kind === 'door' || w.kind === 'secret-door') && loose.filter((e) => e.wall === w).length === 2).map((w) => w.id),
  );
  for (const id of lostDoors) {
    const d = solid.find((w) => w.id === id)!;
    out.push({ kind: 'door', at: { x: (d.x1 + d.x2) / 2, y: (d.y1 + d.y2) / 2 }, walls: [id] });
  }
  const rest = loose.filter((e) => !lostDoors.has(e.wall.id));
  const used = new Set<number>();
  rest.forEach((e, i) => {
    if (used.has(i)) return;
    // The nearest other loose end within reach makes a gap.
    let best = -1;
    let bestD = Infinity;
    rest.forEach((o, j) => {
      if (j === i || used.has(j) || o.wall === e.wall) return;
      const d = dist(e.p, o.p);
      if (d <= gapPx && d < bestD) {
        best = j;
        bestD = d;
      }
    });
    if (best >= 0) {
      used.add(i);
      used.add(best);
      out.push({ kind: 'gap', at: e.p, to: rest[best].p, walls: [e.wall.id, rest[best].wall.id] });
    }
  });
  rest.forEach((e, i) => {
    if (!used.has(i)) out.push({ kind: 'end', at: e.p, walls: [e.wall.id] });
  });
  return out;
}
