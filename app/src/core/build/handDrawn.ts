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

/** A floor after a wall style, or the natural ground of the biome (far from walls, E-34). */
export type FloorStyle = MasonryStyle | 'ground';

/** The style of the nearest wall on a grid of samples over `area`: the floor follows it. */
export interface FloorField {
  cols: number;
  rows: number;
  step: number;
  styles: FloorStyle[];
}

/**
 * Each sample takes the style of its nearest wall. The walls are first marked along their length
 * on the grid, then the nearest mark is passed on to the neighbours, forwards and backwards over
 * the grid (a sweep of nearest points): linear in the number of samples, whatever the walls.
 * With a `reach`, samples farther from every wall are natural ground – unless they lie inside a
 * closed ring of walls (a hall keeps its floor however large it is).
 */
export function floorField(masonry: readonly Masonry[], area: Bounds, step: number, reach = Infinity): FloorField {
  const cols = Math.max(1, Math.ceil(area.w / step));
  const rows = Math.max(1, Math.ceil(area.h / step));
  const n = cols * rows;
  const styles: FloorStyle[] = new Array<FloorStyle>(n).fill(Number.isFinite(reach) ? 'ground' : 'dungeon-stone');
  const sx = new Float64Array(n).fill(NaN);
  const sy = new Float64Array(n).fill(NaN);
  const dist = new Float64Array(n).fill(Infinity);
  const cx = (c: number) => area.x + (c + 0.5) * step;
  const cy = (r: number) => area.y + (r + 0.5) * step;
  const take = (i: number, x: number, y: number, style: FloorStyle) => {
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
  if (Number.isFinite(reach)) {
    const inside = insideRings(masonry, area, step, cols, rows);
    for (let i = 0; i < n; i++) if (dist[i] >= reach && !inside[i]) styles[i] = 'ground';
  }
  return { cols, rows, step, styles };
}

/** Which samples lie inside a closed ring of walls (even-odd, scanned row by row). */
function insideRings(masonry: readonly Masonry[], area: Bounds, step: number, cols: number, rows: number): Uint8Array {
  const inside = new Uint8Array(cols * rows);
  for (const w of masonry) {
    if (!w.closed || w.points.length < 3) continue;
    const pts = w.points;
    const ys = pts.map((p) => p.y);
    const r0 = Math.max(0, Math.floor((Math.min(...ys) - area.y) / step));
    const r1 = Math.min(rows - 1, Math.ceil((Math.max(...ys) - area.y) / step));
    for (let r = r0; r <= r1; r++) {
      const y = area.y + (r + 0.5) * step;
      const xs: number[] = [];
      for (let i = 0; i < pts.length; i++) {
        const a = pts[i];
        const b = pts[(i + 1) % pts.length];
        if (a.y <= y !== b.y <= y) xs.push(a.x + ((y - a.y) / (b.y - a.y)) * (b.x - a.x));
      }
      xs.sort((p, q) => p - q);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        const c0 = Math.max(0, Math.ceil((xs[k] - area.x) / step - 0.5));
        const c1 = Math.min(cols - 1, Math.floor((xs[k + 1] - area.x) / step - 0.5));
        for (let c = c0; c <= c1; c++) inside[r * cols + c] ^= 1;
      }
    }
  }
  return inside;
}
