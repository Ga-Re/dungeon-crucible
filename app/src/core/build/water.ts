/**
 * Drawn water (E-35, DC-107f): a river or stream is a line with a width that flows in its
 * drawing direction; a lake or the sea is a ring. Water is only drawn – it blocks nothing. Where
 * a river crosses a steep cliff from its upper to its lower side, a waterfall forms by itself.
 * Pure.
 */
import type { Point } from '../geometry';
import { cliffEdges, offsetPolyline, type Cliff } from './cliffs';
import { noise2 } from './handDrawn';

export const WATER_KINDS = ['river', 'lake', 'sea'] as const;
export type WaterKind = (typeof WATER_KINDS)[number];

export interface Water {
  id: string;
  kind: WaterKind;
  points: Point[];
  /** Lakes and the sea are rings. */
  closed: boolean;
  /** A river's width (map px). */
  width: number;
  seed: number;
  layer?: string;
}

/** A river's banks: its line moved half its width to its left and to its right. */
export function riverBanks(w: Pick<Water, 'points' | 'width'>): { left: Point[]; right: Point[] } {
  return { left: offsetPolyline(w.points, false, w.width / 2), right: offsetPolyline(w.points, false, -w.width / 2) };
}

/**
 * A line gently displaced across itself (DC-119c): bays and tongues instead of an even offset.
 * The displacement reads the place, not the walked distance, so a closed ring meets itself
 * without a seam and nothing moves when points are added elsewhere. Deterministic per seed.
 */
export function organicLine(points: readonly Point[], closed: boolean, amplitude: number, wavelength: number, seed: number): Point[] {
  if (points.length < 2 || amplitude <= 0 || wavelength <= 0) return [...points];
  // Long segments are split first, so even a dead-straight line can bow.
  const step = Math.max(wavelength / 3, 6);
  const pts: Point[] = [];
  const ring = closed ? [...points, points[0]] : [...points];
  for (let i = 0; i < ring.length - 1; i++) {
    const a = ring[i];
    const b = ring[i + 1];
    const parts = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / step));
    for (let q = 0; q < parts; q++) pts.push({ x: a.x + ((b.x - a.x) * q) / parts, y: a.y + ((b.y - a.y) * q) / parts });
  }
  if (!closed) pts.push(ring[ring.length - 1]);
  const n = pts.length;
  return pts.map((p, i) => {
    const prev = pts[closed ? (i - 1 + n) % n : Math.max(0, i - 1)];
    const next = pts[closed ? (i + 1) % n : Math.min(n - 1, i + 1)];
    const tx = next.x - prev.x;
    const ty = next.y - prev.y;
    const len = Math.hypot(tx, ty) || 1;
    const d = noise2(p.x / wavelength, p.y / wavelength, seed) * amplitude;
    return { x: p.x + (-ty / len) * d, y: p.y + (tx / len) * d };
  });
}

/** The line a river actually flows along: smoothed, wandering a little by its seed. */
export function riverSpine(w: Pick<Water, 'points' | 'width' | 'seed'>): Point[] {
  return organicLine(smoothLine(w.points, false, 3), false, w.width * 0.14, w.width * 3, w.seed * 7 + 1);
}

/**
 * A river's drawn ribbon (DC-119c): the wandering spine and its two banks, each bank with its
 * own small unevenness, so the width breathes. The painted water, the moving water and the
 * shore details all build on this, so they always agree.
 */
export function riverRibbon(w: Pick<Water, 'points' | 'width' | 'seed'>): { spine: Point[]; left: Point[]; right: Point[] } {
  const spine = riverSpine(w);
  const amp = w.width * 0.09;
  const wl = w.width * 1.6;
  return {
    spine,
    left: organicLine(offsetPolyline(spine, false, w.width / 2), false, amp, wl, w.seed * 7 + 2),
    right: organicLine(offsetPolyline(spine, false, -w.width / 2), false, amp, wl, w.seed * 7 + 3),
  };
}

export interface Waterfall {
  water: string;
  x: number;
  y: number;
  /** The direction it falls in (radians, map coordinates). */
  angle: number;
  width: number;
}

function cross(a: Point, b: Point, c: Point, d: Point): { t: number; u: number } | null {
  const rx = b.x - a.x;
  const ry = b.y - a.y;
  const sx = d.x - c.x;
  const sy = d.y - c.y;
  const den = rx * sy - ry * sx;
  if (Math.abs(den) < 1e-9) return null;
  const t = ((c.x - a.x) * sy - (c.y - a.y) * sx) / den;
  const u = ((c.x - a.x) * ry - (c.y - a.y) * rx) / den;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? { t, u } : null;
}

/**
 * Where rivers fall over steep cliffs: a river segment crossing a cliff edge from its upper side
 * (left of the edge's direction) to its lower side. Flowing up a cliff makes no waterfall.
 */
export function waterfalls(waters: readonly Water[], cliffs: readonly Cliff[]): Waterfall[] {
  const out: Waterfall[] = [];
  const edges = cliffs.filter((c) => c.steep && c.kind !== 'scree').flatMap((c) => cliffEdges(c));
  for (const w of waters) {
    if (w.kind !== 'river') continue;
    for (let i = 1; i < w.points.length; i++) {
      const a = w.points[i - 1];
      const b = w.points[i];
      for (const e of edges) {
        const pts = e.closed ? [...e.points, e.points[0]] : e.points;
        for (let k = 1; k < pts.length; k++) {
          const c = pts[k - 1];
          const d = pts[k];
          const hit = cross(a, b, c, d);
          if (!hit) continue;
          // The flow goes from the edge's left (upper) side to its right (lower) side.
          const side = (d.x - c.x) * (b.y - a.y) - (d.y - c.y) * (b.x - a.x);
          if (side <= 0) continue;
          out.push({ water: w.id, x: a.x + (b.x - a.x) * hit.t, y: a.y + (b.y - a.y) * hit.t, angle: Math.atan2(b.y - a.y, b.x - a.x), width: w.width });
        }
      }
    }
  }
  return out;
}

/**
 * Chaikin's corner cutting: a line made round (each round cuts every corner at a quarter and
 * three quarters). An open line keeps its ends.
 */
export function smoothLine(points: readonly Point[], closed: boolean, rounds = 2): Point[] {
  let pts = points.map((p) => ({ ...p }));
  for (let r = 0; r < rounds && pts.length > 2; r++) {
    const out: Point[] = closed ? [] : [pts[0]];
    const n = closed ? pts.length : pts.length - 1;
    for (let i = 0; i < n; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % pts.length];
      out.push({ x: a.x * 0.75 + b.x * 0.25, y: a.y * 0.75 + b.y * 0.25 }, { x: a.x * 0.25 + b.x * 0.75, y: a.y * 0.25 + b.y * 0.75 });
    }
    if (!closed) out.push(pts[pts.length - 1]);
    pts = out;
  }
  return pts;
}

/**
 * The water's outline, rounded: a river's two banks joined into one ring (left bank forwards,
 * right bank back), a lake's or the sea's ring. Shared by the painted map and the moving water.
 */
export function waterOutline(w: Pick<Water, 'kind' | 'points' | 'closed' | 'width'> & { seed?: number }): Point[] {
  const seed = w.seed ?? 0;
  if (w.kind === 'river') {
    const { left, right } = riverRibbon({ points: w.points, width: w.width, seed });
    return [...left, ...right.reverse()];
  }
  // The shore wobbles by the seed (DC-119c): bays and tongues instead of a smooth offset line.
  return organicLine(smoothLine(w.points, true, 3), true, w.width * 0.25, w.width * 2.2, seed * 7 + 5);
}

/** Positive when the ring runs clockwise on the map (y down): its inside lies right of its edges. */
export function ringArea(points: readonly Point[]): number {
  let s = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    s += a.x * b.y - b.x * a.y;
  }
  return s / 2;
}
