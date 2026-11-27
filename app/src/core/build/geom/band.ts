/**
 * The band a cliff shows (E-46, Teil B §11.2): seen from above a wall would be invisible, so the
 * D&D convention draws its face as a band on the lower side. Its top lies on the contour, its
 * foot is offset by the band width to the right of the contour (the lower side, `contours.ts`),
 * mitred at corners and held to twice the width in sharp turns so it never folds over. Texture
 * coordinates run along the arc length (u, seamless) and from top to foot (v); each vertex gets a
 * shade from how its face is turned to the light. Map px. Pure.
 */
import type { Pt } from './contours';

/** Perspective factor (Teil B §11.2): a 10 ft drop shows as 0.45 cell. */
export const BAND_PER_10_FT = 0.45;
const MAX_BAND_CELLS = 2.5;
const AMBIENT = 0.55;
const DIFFUSE = 0.45;

/** The band width (map px) of a drop of `dropFt` on cells of `cellPx`. */
export function bandWidth(dropFt: number, cellPx: number): number {
  return Math.min(MAX_BAND_CELLS, (dropFt / 10) * BAND_PER_10_FT) * cellPx;
}

export interface BandMesh {
  /** x, y per vertex: top then foot, for each contour point. */
  positions: Float32Array;
  /** u, v per vertex. */
  uvs: Float32Array;
  /** Two triangles per segment. */
  indices: Uint32Array;
  /** Brightness per vertex, ambient … 1. */
  shade: Float32Array;
}

/**
 * The band of a contour (higher ground on its left) of `width` map px. `lightAngle`: the direction
 * the light falls towards (degrees, map coordinates; 45: to the lower right).
 */
export function cliffBand(points: readonly Pt[], closed: boolean, width: number, opts: { textureLength: number; lightAngle: number }): BandMesh {
  const pts = closed ? [...points, points[0]!] : [...points];
  const n = pts.length;
  const positions = new Float32Array(n * 4);
  const uvs = new Float32Array(n * 4);
  const shade = new Float32Array(n * 2);
  const light = { x: Math.cos((opts.lightAngle * Math.PI) / 180), y: Math.sin((opts.lightAngle * Math.PI) / 180) };
  /** The unit normal to the right of segment a → b (towards the lower side). */
  const right = (a: Pt, b: Pt) => {
    const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    return { x: -(b.y - a.y) / len, y: (b.x - a.x) / len };
  };
  let along = 0;
  for (let i = 0; i < n; i++) {
    const p = pts[i]!;
    if (i > 0) along += Math.hypot(p.x - pts[i - 1]!.x, p.y - pts[i - 1]!.y);
    // The segments meeting at this point (a ring's seam joins its last and first segment).
    const prev = i > 0 ? right(pts[i - 1]!, p) : closed ? right(pts[n - 2]!, pts[0]!) : null;
    const next = i < n - 1 ? right(p, pts[i + 1]!) : closed ? right(pts[0]!, pts[1]!) : null;
    const a = prev ?? next!;
    const b = next ?? prev!;
    const sum = { x: a.x + b.x, y: a.y + b.y };
    const sumLen = Math.hypot(sum.x, sum.y);
    const normal = sumLen < 1e-9 ? a : { x: sum.x / sumLen, y: sum.y / sumLen };
    // The mitre: longer at corners, at most twice the width.
    const cos = Math.max(1e-9, normal.x * a.x + normal.y * a.y);
    const reach = Math.min(width / cos, 2 * width);
    positions.set([p.x, p.y, p.x + normal.x * reach, p.y + normal.y * reach], i * 4);
    const u = along / opts.textureLength;
    uvs.set([u, 0, u, 1], i * 4);
    const lit = AMBIENT + DIFFUSE * Math.max(0, -(normal.x * light.x + normal.y * light.y));
    shade.set([lit, lit], i * 2);
  }
  const indices = new Uint32Array((n - 1) * 6);
  for (let i = 0; i < n - 1; i++) {
    const t = i * 2;
    indices.set([t, t + 1, t + 2, t + 1, t + 3, t + 2], i * 6);
  }
  return { positions, uvs, indices, shade };
}
