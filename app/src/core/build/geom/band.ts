/**
 * The band a cliff shows (E-46, Teil B §11.2): seen from above a wall would be invisible, so the
 * D&D convention draws its face as a band on the lower side. Its top lies on the contour, its
 * foot is offset by the band width to the right of the contour (the lower side, `contours.ts`).
 * Where the line turns away from its lower side the foot runs round the corner at the band's width
 * (Teil B §11.5 „Ecke außen“); where it turns towards it, the foot keeps the band's width along
 * the corner's bisector and feet that would cross merge, so it throws out no spike („Ecke innen“). Texture
 * coordinates run along the arc length (u, seamless; round an outer corner by its arc at half the
 * band's width, so the texture runs on there instead of fanning out from one column) and from top
 * to foot (v); each vertex gets a
 * shade from how its face is turned to the light. An open line may run out to a point at its ends.
 * Map px. Pure.
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
  /** Per top/foot pair: the index of the point it belongs to (a corner has several). */
  at: Uint32Array;
}

/** The step of an outer corner's arc (radians). */
const ARC_STEP = Math.PI / 8;
/** Turns smaller than this stay mitred: a gentle bend needs no arc. */
const ARC_FROM = Math.PI / 12;
/** The sharpest inner turn a band's foot line keeps (radians). */
const FOOT_KINK = (50 * Math.PI) / 180;

/**
 * `pts` evened out: each point the Gaussian mean (σ = `sigma` px of arc length) of the points around
 * it. An open line is mirrored through its ends, so they stay where they are (and a straight end
 * stays straight); a ring is read at most half way round each way.
 */
function smoothed(pts: readonly Pt[], closed: boolean, sigma: number): Pt[] {
  const n = pts.length;
  // A ring repeats its first point at its end: smoothed over the n - 1 distinct ones.
  const m = closed ? n - 1 : n;
  const at = (i: number): Pt => {
    if (closed) return pts[((i % m) + m) % m]!;
    if (i < 0) return { x: 2 * pts[0]!.x - pts[-i]!.x, y: 2 * pts[0]!.y - pts[-i]!.y };
    if (i >= n) return { x: 2 * pts[n - 1]!.x - pts[2 * (n - 1) - i]!.x, y: 2 * pts[n - 1]!.y - pts[2 * (n - 1) - i]!.y };
    return pts[i]!;
  };
  const step = (i: number) => Math.hypot(at(i + 1).x - at(i).x, at(i + 1).y - at(i).y);
  const reach = sigma * 3;
  // How far a mirrored index may go: the line itself once more beyond each end.
  const most = closed ? Math.floor(m / 2) : n - 1;
  const out: Pt[] = [];
  for (let i = 0; i < m; i++) {
    let [sx, sy, sw] = [at(i).x, at(i).y, 1];
    for (const dir of [-1, 1]) {
      let d = 0;
      for (let j = i, k = 0; k < most; k++) {
        const nj = j + dir;
        if (!closed && (nj < -(n - 1) || nj > 2 * (n - 1))) break;
        d += step(dir < 0 ? nj : j);
        if (d > reach) break;
        j = nj;
        const w = Math.exp(-(d * d) / (2 * sigma * sigma));
        sx += at(j).x * w;
        sy += at(j).y * w;
        sw += w;
      }
    }
    out.push({ x: sx / sw, y: sy / sw });
  }
  if (closed) out.push(out[0]!);
  return out;
}

/**
 * The band of a contour (higher ground on its left) of `width` map px. `lightAngle`: the direction
 * the light falls towards (degrees, map coordinates; 45: to the lower right).
 */
export function cliffBand(points: readonly Pt[], closed: boolean, width: number, opts: { textureLength: number; lightAngle: number; widthFactor?: (p: Pt) => number; taper?: number; runOut?: readonly [boolean, boolean]; arcWidth?: (p: Pt) => number; footSmooth?: number }): BandMesh {
  const pts = closed ? [...points, points[0]!] : [...points];
  const n = pts.length;
  const light = { x: Math.cos((opts.lightAngle * Math.PI) / 180), y: Math.sin((opts.lightAngle * Math.PI) / 180) };
  /** The unit normal to the right of segment a → b (towards the lower side). */
  const right = (a: Pt, b: Pt) => {
    const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    return { x: -(b.y - a.y) / len, y: (b.x - a.x) / len };
  };
  // The line the foot hangs from: the line itself, or for a wide band the line evened out over
  // `footSmooth` px, so small wiggles of the edge do not fan its foot out (the top stays on the line).
  const base = opts.footSmooth ? smoothed(pts, closed, opts.footSmooth) : pts;
  // An open line's ends: where a slope ends the cliff, the band runs out to a point (E-89, Teil B §11.5 „Auslauf“).
  const total = closed || !opts.taper ? 0 : pts.reduce((sum, p, i) => (i ? sum + Math.hypot(p.x - pts[i - 1]!.x, p.y - pts[i - 1]!.y) : 0), 0);
  const [fromStart, toEnd] = opts.runOut ?? [true, true];
  const runOut = (along: number) => {
    if (!total) return 1;
    const t = Math.min(1, Math.min(fromStart ? along : Infinity, toEnd ? total - along : Infinity) / opts.taper!);
    return t * t * (3 - 2 * t);
  };
  const pos: number[] = [];
  const uv: number[] = [];
  const lit: number[] = [];
  const at: number[] = [];
  const pair = (i: number, p: Pt, normal: Pt, reach: number, u: number) => {
    const f = base[i]!;
    pos.push(p.x, p.y, f.x + normal.x * reach, f.y + normal.y * reach);
    uv.push(u, 0, u, 1);
    const l = AMBIENT + DIFFUSE * Math.max(0, -(normal.x * light.x + normal.y * light.y));
    lit.push(l, l);
    at.push(i);
  };
  let along = 0;
  /** What outer corners have added to u so far (px). */
  let arcs = 0;
  for (let i = 0; i < n; i++) {
    const p = pts[i]!;
    if (i > 0) along += Math.hypot(p.x - pts[i - 1]!.x, p.y - pts[i - 1]!.y);
    // The segments meeting at this point (a ring's seam joins its last and first segment): of the line
    // itself for its corners and the texture, of the line the foot hangs from for the foot.
    const segments = (line: readonly Pt[]) => [i > 0 ? right(line[i - 1]!, line[i]!) : closed ? right(line[n - 2]!, line[0]!) : null, i < n - 1 ? right(line[i]!, line[i + 1]!) : closed ? right(line[0]!, line[1]!) : null] as const;
    const [prev, next] = segments(pts);
    const [footPrev, footNext] = base === pts ? [prev, next] : segments(base);
    const a = footPrev ?? footNext!;
    const b = footNext ?? footPrev!;
    // A factor read at the point itself, never along the line: an edit at one end moves nothing at the other.
    const w = width * (opts.widthFactor?.(p) ?? 1) * runOut(along);
    const u = (along + arcs) / opts.textureLength;
    // How far the lower side's normal turns here: negative turns away from the lower side (outer corner).
    const turnOf = (c: Pt, d: Pt) => Math.atan2(c.x * d.y - c.y * d.x, c.x * d.x + c.y * d.y);
    const turn = prev && next ? turnOf(prev, next) : 0;
    // The foot's normal turns as the line it hangs from does: with a calmer foot, gently.
    const footTurn = turnOf(a, b);
    if (prev && next && turn < -ARC_FROM) {
      // An outer corner: the foot round it. A ring's seam has its arc at the start; its end only meets it.
      const steps = Math.ceil(-turn / ARC_STEP);
      const last = closed && i === n - 1 ? 0 : steps;
      // The arc measured half way down the band (another band beside it may measure by this one's width).
      const arc = (-turn * (opts.arcWidth ? opts.arcWidth(p) * runOut(along) : w)) / 2;
      for (let k = 0; k <= last; k++) {
        const t = (footTurn * k) / steps;
        pair(i, p, { x: a.x * Math.cos(t) - a.y * Math.sin(t), y: a.x * Math.sin(t) + a.y * Math.cos(t) }, w, u + (arc * k) / steps / opts.textureLength);
      }
      arcs += arc;
      continue;
    }
    const sum = { x: a.x + b.x, y: a.y + b.y };
    const sumLen = Math.hypot(sum.x, sum.y);
    const normal = sumLen < 1e-9 ? a : { x: sum.x / sumLen, y: sum.y / sumLen };
    // No mitre at an inner corner: on short segments its point would jut out past its neighbours as
    // a spike.
    pair(i, p, normal, w, u);
  }
  const pairs = at.length;
  // At an inner corner the feet of the strips beside it would cross: a foot that would run back
  // against the line's direction merges with the one before it.
  for (let k = 1; k < pairs; k++) {
    const [tx, ty, fx, fy] = [pos[k * 4]!, pos[k * 4 + 1]!, pos[k * 4 + 2]!, pos[k * 4 + 3]!];
    const len = Math.hypot(fx - tx, fy - ty);
    if (len < 1e-9) continue;
    const [lx, ly] = [pos[(k - 1) * 4 + 2]!, pos[(k - 1) * 4 + 3]!];
    // The line's direction here: its foot lies to the right of it.
    if ((fx - lx) * ((fy - ty) / len) - (fy - ly) * ((fx - tx) / len) > 0) continue;
    pos[k * 4 + 2] = lx;
    pos[k * 4 + 3] = ly;
  }
  // A ring's last pair repeats its first: so does its foot, or a merge there would leave a sliver at the seam.
  if (closed) {
    pos[(pairs - 1) * 4 + 2] = pos[2]!;
    pos[(pairs - 1) * 4 + 3] = pos[3]!;
  }
  const indices = new Uint32Array((pairs - 1) * 6);
  for (let i = 0; i < pairs - 1; i++) {
    const t = i * 2;
    indices.set([t, t + 1, t + 2, t + 1, t + 3, t + 2], i * 6);
  }
  return { positions: new Float32Array(pos), uvs: new Float32Array(uv), indices, shade: new Float32Array(lit), at: new Uint32Array(at) };
}

/**
 * The foot of a band as a line for what lies along it (gravel, the foot's shadow): its feet, less
 * those an inner corner's mitre threw back against the line's direction – they would loop – and
 * sharp inner kinks bridged. A ring's repeated last point is left out.
 */
export function bandFoot(m: BandMesh, closed: boolean): Pt[] {
  const pairs = m.at.length - (closed ? 1 : 0);
  const out: Pt[] = [];
  for (let k = 0; k < pairs; k++) {
    const top = { x: m.positions[k * 4]!, y: m.positions[k * 4 + 1]! };
    const foot = { x: m.positions[k * 4 + 2]!, y: m.positions[k * 4 + 3]! };
    const last = out[out.length - 1];
    if (last && k < pairs - 1) {
      const len = Math.hypot(foot.x - top.x, foot.y - top.y);
      // The line's direction here: its foot lies to the right of it.
      const along = len > 1e-9 ? { x: (foot.y - top.y) / len, y: -(foot.x - top.x) / len } : null;
      if (along && (foot.x - last.x) * along.x + (foot.y - last.y) * along.y <= 0) continue;
    }
    out.push(foot);
  }
  // A sharp inner kink is bridged: half-transparent strips along the foot would overlap there.
  // A ring keeps at least three points: fewer would draw a strip across it.
  const fewest = closed ? 3 : 2;
  for (let changed = true; changed && out.length > fewest; ) {
    changed = false;
    for (let k = closed ? 0 : 1; k < (closed ? out.length : out.length - 1) && out.length > fewest; k++) {
      const p = out[(k - 1 + out.length) % out.length]!;
      const q = out[k]!;
      const r = out[(k + 1) % out.length]!;
      const turn = Math.atan2((q.x - p.x) * (r.y - q.y) - (q.y - p.y) * (r.x - q.x), (q.x - p.x) * (r.x - q.x) + (q.y - p.y) * (r.y - q.y));
      if (turn <= FOOT_KINK) continue;
      out.splice(k, 1);
      changed = true;
    }
  }
  return out;
}
