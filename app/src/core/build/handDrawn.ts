/**
 * The hand-drawn look (E-33): smooth noise and outlines that waver a little. Everything depends
 * only on the place and a seed, never on the order of elements, so editing one changes nothing
 * elsewhere – nothing flickers. Pure.
 */

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
