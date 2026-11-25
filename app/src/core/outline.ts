/**
 * "Suggest from outline" for an asset's cover mask (DC-109): the outer edge of the largest opaque
 * shape in an image's alpha channel, as a polygon in pixel units, and a simplification for it.
 * Pure: the caller reads the pixels (a canvas in the DM window).
 */

type Pt = [number, number];

/**
 * The outer outline of the largest opaque shape (alpha ≥ `threshold`), along the pixel edges,
 * with straight runs merged into single corners; null when nothing is opaque.
 */
export function outlineFromAlpha(alpha: ArrayLike<number>, w: number, h: number, threshold = 128): Pt[] | null {
  const opaque = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && alpha[y * w + x] >= threshold;
  // Every edge between an opaque and a clear pixel, directed so that the opaque side is on the right.
  const from = new Map<string, Pt[]>();
  const add = (a: Pt, b: Pt) => {
    const k = `${a[0]},${a[1]}`;
    const list = from.get(k);
    if (list) list.push(b);
    else from.set(k, [b]);
  };
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      if (!opaque(x, y)) continue;
      if (!opaque(x, y - 1)) add([x, y], [x + 1, y]);
      if (!opaque(x + 1, y)) add([x + 1, y], [x + 1, y + 1]);
      if (!opaque(x, y + 1)) add([x + 1, y + 1], [x, y + 1]);
      if (!opaque(x - 1, y)) add([x, y + 1], [x, y]);
    }
  let best: Pt[] | null = null;
  let bestArea = 0;
  for (const [key, ends] of from) {
    while (ends.length) {
      // Follow edges end to start until the loop closes.
      const start = key.split(',').map(Number) as Pt;
      const loop: Pt[] = [start];
      let at = ends.pop()!;
      while (`${at[0]},${at[1]}` !== key) {
        loop.push(at);
        const next = from.get(`${at[0]},${at[1]}`);
        if (!next?.length) break;
        at = next.pop()!;
      }
      const a = Math.abs(ringArea(loop));
      if (a > bestArea) {
        best = loop;
        bestArea = a;
      }
    }
  }
  return best ? withoutStraightPoints(best) : null;
}

function ringArea(p: readonly Pt[]): number {
  let a = 0;
  for (let i = 0; i < p.length; i++) {
    const [x1, y1] = p[i];
    const [x2, y2] = p[(i + 1) % p.length];
    a += x1 * y2 - x2 * y1;
  }
  return a / 2;
}

/** Drops points where the outline goes straight on. */
function withoutStraightPoints(p: readonly Pt[]): Pt[] {
  return p.filter((cur, i) => {
    const prev = p[(i - 1 + p.length) % p.length];
    const next = p[(i + 1) % p.length];
    return (cur[0] - prev[0]) * (next[1] - cur[1]) - (cur[1] - prev[1]) * (next[0] - cur[0]) !== 0;
  });
}

function distToSegment(p: Pt, a: Pt, b: Pt): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

/** A closed outline with fewer points: none moves the edge more than `tolerance` (Douglas–Peucker). */
export function simplifyPath(ring: readonly Pt[], tolerance: number): Pt[] {
  if (ring.length <= 3) return [...ring];
  const pts = [...ring, ring[0]];
  const keep = new Array<boolean>(pts.length).fill(false);
  keep[0] = keep[pts.length - 1] = true;
  const stack: [number, number][] = [[0, pts.length - 1]];
  while (stack.length) {
    const [i, j] = stack.pop()!;
    let far = -1;
    let farD = tolerance;
    for (let k = i + 1; k < j; k++) {
      const d = distToSegment(pts[k], pts[i], pts[j]);
      if (d > farD) {
        far = k;
        farD = d;
      }
    }
    if (far >= 0) {
      keep[far] = true;
      stack.push([i, far], [far, j]);
    }
  }
  const out = pts.filter((_, k) => keep[k]).slice(0, -1);
  return out.length >= 3 ? out : [...ring];
}
