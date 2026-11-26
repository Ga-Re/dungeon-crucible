/**
 * Drawn cliffs and slopes (E-34, DC-107d): a line or a ring with a kind (rock, earth, scree,
 * chasm) and a form – an edge, a ring (a pit when its inside is low, a plateau when high), a
 * ravine (two edges a width apart, both looking into it) or terraces (steps side by side). Each
 * edge's upper side is left of its direction, as for the cliffs of DC-014: a steep one blocks
 * sight from below and not from above; a flat slope and scree block nothing. Pure.
 */
import type { Point } from '../geometry';
import type { Wall } from '../scene';

export const CLIFF_KINDS = ['rock', 'earth', 'scree', 'chasm'] as const;
export type CliffKind = (typeof CLIFF_KINDS)[number];
export const CLIFF_FORMS = ['edge', 'ring', 'ravine', 'terraces'] as const;
export type CliffForm = (typeof CLIFF_FORMS)[number];

export interface Cliff {
  id: string;
  points: Point[];
  /** A ring (form "ring"). */
  closed: boolean;
  kind: CliffKind;
  form: CliffForm;
  /** Blocks sight from below (one way); off: a flat slope, only drawn. */
  steep: boolean;
  /** Map px: a ravine's width, the distance between terraces. */
  width: number;
  /** How many terraces. */
  steps: number;
  /** A ring's inside: low (a pit) or high (a plateau). */
  inside: 'low' | 'high';
  /** Grass, bushes or moss at the upper edge, after the biome. */
  growth: boolean;
  seed: number;
  layer?: string;
}

/** One edge of a cliff: its upper side is left of its direction. */
export interface CliffEdge {
  points: Point[];
  closed: boolean;
}

/** The polyline moved by `d` to its left (negative: to its right), corners mitred. */
export function offsetPolyline(points: readonly Point[], closed: boolean, d: number): Point[] {
  const n = points.length;
  const normal = (a: Point, b: Point) => {
    const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    return { x: (b.y - a.y) / len, y: -(b.x - a.x) / len };
  };
  return points.map((p, i) => {
    const prev = i > 0 ? points[i - 1] : closed ? points[n - 1] : null;
    const next = i < n - 1 ? points[i + 1] : closed ? points[0] : null;
    const n1 = prev ? normal(prev, p) : null;
    const n2 = next ? normal(p, next) : null;
    if (!n1 || !n2) {
      const m = (n1 ?? n2)!;
      return { x: p.x + m.x * d, y: p.y + m.y * d };
    }
    // The mitre: along the mean of both normals, long enough that both sides keep distance d
    // (at most four times d at very sharp corners).
    const mx = n1.x + n2.x;
    const my = n1.y + n2.y;
    const len = Math.hypot(mx, my);
    if (len < 1e-9) return { x: p.x + n1.x * d, y: p.y + n1.y * d };
    const ux = mx / len;
    const uy = my / len;
    const along = Math.min(4, 1 / Math.max(0.25, ux * n1.x + uy * n1.y)) * d;
    return { x: p.x + ux * along, y: p.y + uy * along };
  });
}

function signedArea(points: readonly Point[]): number {
  let s = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    s += a.x * b.y - b.x * a.y;
  }
  return s / 2;
}

/** The edges of a cliff, each with its upper side to its left. */
export function cliffEdges(c: Cliff): CliffEdge[] {
  if (c.points.length < 2) return [];
  switch (c.form) {
    case 'ring': {
      if (c.points.length < 3) return [];
      // With a positive area (map y down) the inside lies below the edges.
      const insideBelow = signedArea(c.points) > 0;
      const points = insideBelow === (c.inside === 'low') ? c.points : [...c.points].reverse();
      return [{ points: [...points], closed: true }];
    }
    case 'ravine': {
      const half = c.width / 2;
      // Both edges look down into the middle: the far one runs the other way.
      return [
        { points: offsetPolyline(c.points, false, half), closed: false },
        { points: offsetPolyline(c.points, false, -half).reverse(), closed: false },
      ];
    }
    case 'terraces':
      return Array.from({ length: Math.max(1, c.steps) }, (_, k) => ({ points: k === 0 ? [...c.points] : offsetPolyline(c.points, false, -k * c.width), closed: false }));
    default:
      return [{ points: [...c.points], closed: false }];
  }
}

/** The one-way sight lines of steep cliffs (scree and flat slopes block nothing). */
export function cliffSightWalls(cliffs: readonly Cliff[]): Wall[] {
  const out: Wall[] = [];
  for (const c of cliffs) {
    if (!c.steep || c.kind === 'scree') continue;
    cliffEdges(c).forEach((e, k) => {
      const pts = e.closed ? [...e.points, e.points[0]] : e.points;
      for (let i = 1; i < pts.length; i++)
        out.push({ id: `${c.id}#e${k}#${i - 1}`, kind: 'cliff', x1: pts[i - 1].x, y1: pts[i - 1].y, x2: pts[i].x, y2: pts[i].y, ...(c.layer ? { layer: c.layer } : {}) });
    });
  }
  return out;
}
