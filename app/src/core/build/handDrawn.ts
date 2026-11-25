/**
 * The hand-drawn look of drawn walls (E-33): outlines that waver a little, and floors that follow
 * the nearest wall. Everything depends only on the place (and a seed per style), never on the
 * order of walls, so editing one wall changes nothing elsewhere – nothing flickers. Pure.
 */
import type { Bounds, Masonry, MasonryStyle } from './masonry';

function hash(x: number, y: number, seed: number): number {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(seed | 0, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

const smooth = (t: number) => t * t * (3 - 2 * t);

/** Smooth value noise in -1…1. */
export function noise2(x: number, y: number, seed: number): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = smooth(x - x0);
  const fy = smooth(y - y0);
  const v = (i: number, j: number) => hash(x0 + i, y0 + j, seed) * 2 - 1;
  const top = v(0, 0) + (v(1, 0) - v(0, 0)) * fx;
  const bottom = v(0, 1) + (v(1, 1) - v(0, 1)) * fx;
  return top + (bottom - top) * fy;
}

export interface Jitter {
  /** Edges are cut into pieces of about this length (map px). */
  step: number;
  /** How far points move off the edge at most (map px). */
  amplitude: number;
  /** Size of the waves (map px). */
  scale: number;
  seed: number;
}

/** A ring whose edges waver: corners stay, points in between move across the edge with the noise at their place. */
export function jitterRing(ring: readonly (readonly [number, number])[], j: Jitter): [number, number][] {
  if (j.amplitude <= 0) return ring.map(([x, y]) => [x, y]);
  const out: [number, number][] = [];
  for (let i = 0; i < ring.length; i++) {
    const [ax, ay] = ring[i];
    const [bx, by] = ring[(i + 1) % ring.length];
    out.push([ax, ay]);
    const len = Math.hypot(bx - ax, by - ay);
    const n = Math.floor(len / j.step);
    if (n < 2) continue;
    const nx = -(by - ay) / len;
    const ny = (bx - ax) / len;
    for (let k = 1; k < n; k++) {
      const t = k / n;
      const x = ax + (bx - ax) * t;
      const y = ay + (by - ay) * t;
      // Fades out towards the corners, so they stay sharp and joins meet.
      const fade = Math.min(1, Math.min(t, 1 - t) * n * 0.5);
      const d = noise2(x / j.scale, y / j.scale, j.seed) * j.amplitude * fade;
      out.push([x + nx * d, y + ny * d]);
    }
  }
  return out;
}

/** The style of the nearest wall on a grid of samples over `area`: the floor follows it. */
export interface FloorField {
  cols: number;
  rows: number;
  step: number;
  styles: MasonryStyle[];
}

/**
 * Each sample takes the style of its nearest wall. The walls are first marked along their length
 * on the grid, then the nearest mark is passed on to the neighbours, forwards and backwards over
 * the grid (a sweep of nearest points): linear in the number of samples, whatever the walls.
 */
export function floorField(masonry: readonly Masonry[], area: Bounds, step: number): FloorField {
  const cols = Math.max(1, Math.ceil(area.w / step));
  const rows = Math.max(1, Math.ceil(area.h / step));
  const n = cols * rows;
  const styles: MasonryStyle[] = new Array<MasonryStyle>(n).fill('dungeon-stone');
  const sx = new Float64Array(n).fill(NaN);
  const sy = new Float64Array(n).fill(NaN);
  const dist = new Float64Array(n).fill(Infinity);
  const cx = (c: number) => area.x + (c + 0.5) * step;
  const cy = (r: number) => area.y + (r + 0.5) * step;
  const take = (i: number, x: number, y: number, style: MasonryStyle) => {
    const d = Math.hypot(cx(i % cols) - x, cy(Math.floor(i / cols)) - y);
    if (d < dist[i]) {
      dist[i] = d;
      sx[i] = x;
      sy[i] = y;
      styles[i] = style;
    }
  };
  // Mark the walls: points along each segment, closer than a sample apart.
  for (const w of masonry) {
    const pts = w.closed ? [...w.points, w.points[0]] : w.points;
    for (let k = 1; k < pts.length; k++) {
      const a = pts[k - 1];
      const b = pts[k];
      const parts = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / (step / 2)));
      for (let q = 0; q <= parts; q++) {
        const x = a.x + ((b.x - a.x) * q) / parts;
        const y = a.y + ((b.y - a.y) * q) / parts;
        // A point on (or just beyond) the area's edge is marked in the nearest cell, at its true place.
        const c = Math.min(cols - 1, Math.max(0, Math.floor((x - area.x) / step)));
        const r = Math.min(rows - 1, Math.max(0, Math.floor((y - area.y) / step)));
        take(r * cols + c, x, y, w.style);
      }
    }
  }
  const pass = (i: number, j: number) => {
    if (!Number.isNaN(sx[j])) take(i, sx[j], sy[j], styles[j]);
  };
  for (let round = 0; round < 2; round++) {
    for (let r = 0; r < rows; r++)
      for (let c = 0; c < cols; c++) {
        const i = r * cols + c;
        if (c > 0) pass(i, i - 1);
        if (r > 0) {
          pass(i, i - cols);
          if (c > 0) pass(i, i - cols - 1);
          if (c < cols - 1) pass(i, i - cols + 1);
        }
      }
    for (let r = rows - 1; r >= 0; r--)
      for (let c = cols - 1; c >= 0; c--) {
        const i = r * cols + c;
        if (c < cols - 1) pass(i, i + 1);
        if (r < rows - 1) {
          pass(i, i + cols);
          if (c < cols - 1) pass(i, i + cols + 1);
          if (c > 0) pass(i, i + cols - 1);
        }
      }
  }
  return { cols, rows, step, styles };
}
