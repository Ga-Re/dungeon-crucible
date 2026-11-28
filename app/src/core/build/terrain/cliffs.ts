/**
 * Cliffs from the step raster as shown (E-46, E-87, Teil B §11.1): marching squares over the
 * support points finds every step change in one pass per block; where the same corners are high
 * for several thresholds the change is one cliff of that many steps, else terraces. Lines run with
 * the higher ground on their left (`contours.ts`), are smoothed and offset by noise read at the
 * world position, so an edit never moves the far end and the DM and the TV, given the same
 * blocks, draw the same cliffs. A block's segments are kept until it or a neighbour it reads
 * changes. Their top edges are the one-way walls of sight (E-34): from above one sees down, from
 * below not up. Map px; pure.
 */
import { fromCellSpace, type GridConfig } from '../../grid';
import type { Wall } from '../../scene';
import { chaikin, stitch, type Pt } from '../geom/contours';
import { noise2 } from '../handDrawn';
import { BLOCK_POINTS, SUBDIVISIONS, type RasterBlock } from './block';
import { UNKNOWN_STEP } from './tvRaster';

/** The blocks of one stack as shown (base and active layers' patches), by key. */
export interface CliffSource {
  readonly blocks: ReadonlyMap<string, RasterBlock>;
  /** The TV knows only what it was sent: a missing block is unknown and gives no edge. Else it is flat (step 0). */
  readonly missingIsUnknown: boolean;
}

export interface CliffLine {
  /** Map px: the top edge, higher ground on the left. */
  readonly points: readonly Pt[];
  readonly closed: boolean;
  /** Steps it drops. */
  readonly drop: number;
}

/** From this slope mask on (half of 255) a step is a ramp, not a cliff (E-89, Teil B §7.2). */
export const SLOPE_RAMP = 128;

/** How far a cliff's edge wanders (cells): rock, as accepted in the look spike (DC-127, Teil B §11.1). */
export const CLIFF_NOISE_CELLS = 0.15;

export interface CliffOptions {
  readonly grid: GridConfig;
  /** How far the edge wanders (cells; Teil B §11.1: rock 0.15, earth 0.08); 0: straight. */
  readonly noiseCells: number;
  /** Erosion edges instead of cliffs: drops of the fine height in steep places (E-89); `drop` counts levels of 2 ft. */
  readonly erosion?: boolean;
}

/** Segments [ax, ay, bx, by, drop] in global support points. */
type Segments = readonly number[];

interface Kept {
  readonly refs: readonly (RasterBlock | undefined)[];
  readonly unknown: boolean;
  readonly erosion: boolean;
  readonly segments: Segments;
}

/** Each block's segments with the blocks they were read from; one per stack shown. */
export class CliffCache {
  readonly byBlock = new Map<string, Kept>();
  /** Blocks worked out so far (for tests and measuring). */
  computed = 0;
}

/** Corners of a cell clockwise from its top left; edge i runs from corner i to corner i + 1. */
const CX = [0, 1, 1, 0];
const CY = [0, 0, 1, 1];

const parseKey = (key: string) => key.split('_').map(Number) as [number, number];

export function cliffLines(source: CliffSource, opts: CliffOptions, cache = new CliffCache()): CliffLine[] {
  // A block's cells read its right and lower neighbours' first points, so a painted block also
  // needs the blocks left of and above it worked out – unless missing ones are unknown.
  const keys = new Set<string>();
  for (const key of source.blocks.keys()) {
    keys.add(key);
    if (source.missingIsUnknown) continue;
    const [bx, by] = parseKey(key);
    keys.add(`${bx - 1}_${by}`).add(`${bx}_${by - 1}`).add(`${bx - 1}_${by - 1}`);
  }
  const all: number[] = [];
  for (const key of [...keys].sort()) {
    const [bx, by] = parseKey(key);
    const refs = [key, `${bx + 1}_${by}`, `${bx}_${by + 1}`, `${bx + 1}_${by + 1}`].map((k) => source.blocks.get(k));
    let kept = cache.byBlock.get(key);
    const erosion = !!opts.erosion;
    if (!kept || kept.unknown !== source.missingIsUnknown || kept.erosion !== erosion || kept.refs.some((r, i) => r !== refs[i])) {
      kept = { refs, unknown: source.missingIsUnknown, erosion, segments: blockSegments(bx, by, refs, source.missingIsUnknown, opts.erosion) };
      cache.byBlock.set(key, kept);
      cache.computed++;
    }
    for (const v of kept.segments) all.push(v);
  }
  for (const key of cache.byBlock.keys()) if (!keys.has(key)) cache.byBlock.delete(key);
  // Stitched per drop: a line keeps one height along it.
  const byDrop = new Map<number, [Pt, Pt][]>();
  for (let i = 0; i < all.length; i += 5) {
    const drop = all[i + 4]!;
    let list = byDrop.get(drop);
    if (!list) byDrop.set(drop, (list = []));
    list.push([{ x: all[i]!, y: all[i + 1]! }, { x: all[i + 2]!, y: all[i + 3]! }]);
  }
  const out: CliffLine[] = [];
  for (const drop of [...byDrop.keys()].sort((a, b) => a - b))
    for (const c of stitch(byDrop.get(drop)!)) out.push({ points: shaped(c.points, c.closed, opts), closed: c.closed, drop });
  return out;
}

/**
 * The segments of the cells of block (bx, by): its points and the first ones of its right and lower
 * neighbours. `erosion`: not the steps but the fine height in levels of 2 ft, and only in cells
 * steeper than 45° (E-89, Teil B §7.2, S9).
 */
function blockSegments(bx: number, by: number, refs: readonly (RasterBlock | undefined)[], missingIsUnknown: boolean, erosion = false): number[] {
  const n = BLOCK_POINTS + 1;
  const v = new Float32Array(n * n);
  const relief = new Float32Array(n * n);
  const missing = missingIsUnknown ? NaN : 0;
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      const b = refs[(x === BLOCK_POINTS ? 1 : 0) + (y === BLOCK_POINTS ? 2 : 0)];
      const i = (y % BLOCK_POINTS) * BLOCK_POINTS + (x % BLOCK_POINTS);
      const s = b ? b.planes.step[i]! : missing;
      relief[y * n + x] = b ? b.planes.relief[i]! : 0;
      // A point the TV was not sent is unknown like a missing block (E-85); from half a slope mask
      // on the step runs out as a ramp there (E-89): no edge either.
      if (erosion) v[y * n + x] = s === UNKNOWN_STEP || Number.isNaN(s) ? NaN : Math.floor(relief[y * n + x]! / EROSION_LEVEL);
      else v[y * n + x] = s === UNKNOWN_STEP || (b && b.planes.slope[i]! >= SLOPE_RAMP) ? NaN : s;
    }
  const steep = (x: number, y: number) => {
    const r = [relief[y * n + x]!, relief[y * n + x + 1]!, relief[(y + 1) * n + x + 1]!, relief[(y + 1) * n + x]!];
    return Math.max(...r.map((a, i) => Math.abs(a - r[(i + 1) % 4]!))) > EROSION_STEEP;
  };
  return marchLevels(v, n, bx * BLOCK_POINTS, by * BLOCK_POINTS, erosion ? steep : undefined);
}

/** Relief between two neighbouring support points (1.25 ft apart) beyond which ground is steeper than 45°. */
const EROSION_STEEP = 1.25 * 16;
/** Erosion edges come at every 2 ft of fine height (relief in 1/16 ft). */
const EROSION_LEVEL = 2 * 16;

/** Marching squares over levels `v` (n × n, NaN: no edge there) of cells kept by `keep`: segments [ax, ay, bx, by, levels]. */
function marchLevels(v: Float32Array, n: number, ox: number, oy: number, keep?: (x: number, y: number) => boolean): number[] {
  const out: number[] = [];
  const c = [0, 0, 0, 0];
  const high = [false, false, false, false];
  const pairs = new Map<number, number>();
  for (let y = 0; y < n - 1; y++)
    for (let x = 0; x < n - 1; x++) {
      c[0] = v[y * n + x]!;
      c[1] = v[y * n + x + 1]!;
      c[2] = v[(y + 1) * n + x + 1]!;
      c[3] = v[(y + 1) * n + x]!;
      if (c.some(Number.isNaN)) continue;
      const lo = Math.min(c[0], c[1], c[2], c[3]);
      const hi = Math.max(c[0], c[1], c[2], c[3]);
      if (lo === hi || (keep && !keep(x, y))) continue;
      pairs.clear();
      for (let k = lo; k < hi; k++) {
        const t = k + 0.5;
        for (let i = 0; i < 4; i++) high[i] = c[i]! > t;
        const enter: number[] = [];
        const leave: number[] = [];
        for (let i = 0; i < 4; i++) if (high[i] !== high[(i + 1) % 4]) (high[i] ? leave : enter).push(i);
        if (enter.length === 1) pairs.set(enter[0]! * 4 + leave[0]!, (pairs.get(enter[0]! * 4 + leave[0]!) ?? 0) + 1);
        else if (enter.length === 2) {
          // A saddle: the centre decides which corners are cut off (as `stepContours`).
          const centreHigh = (c[0]! + c[1]! + c[2]! + c[3]!) / 4 > t;
          const edges = high[1] !== centreHigh ? [[0, 1], [2, 3]] : [[1, 2], [3, 0]];
          for (const [a, b] of edges) {
            const [from, to] = enter.includes(a!) ? [a!, b!] : [b!, a!];
            pairs.set(from * 4 + to, (pairs.get(from * 4 + to) ?? 0) + 1);
          }
        }
      }
      for (const [pair, drop] of pairs) {
        const a = Math.floor(pair / 4);
        const b = pair % 4;
        out.push(ox + x + (CX[a]! + CX[(a + 1) % 4]!) / 2, oy + y + (CY[a]! + CY[(a + 1) % 4]!) / 2, ox + x + (CX[b]! + CX[(b + 1) % 4]!) / 2, oy + y + (CY[b]! + CY[(b + 1) % 4]!) / 2, drop);
      }
    }
  return out;
}

/** A line of support points in map px, smoothed and wandering by noise read at the world position. */
function shaped(points: readonly Pt[], closed: boolean, opts: CliffOptions): Pt[] {
  const cell = opts.grid.cellWidth;
  const px = chaikin(points.map((p) => fromCellSpace(opts.grid, { x: p.x / SUBDIVISIONS, y: p.y / SUBDIVISIONS })), closed, 2);
  if (!opts.noiseCells) return px;
  return px.map((p, i) => {
    const a = px[closed ? (i - 1 + px.length) % px.length : Math.max(0, i - 1)]!;
    const b = px[closed ? (i + 1) % px.length : Math.min(px.length - 1, i + 1)]!;
    const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    const n = noise2(p.x / (cell * 0.6), p.y / (cell * 0.6), 11) * opts.noiseCells * cell;
    return { x: p.x + (-(b.y - a.y) / len) * n, y: p.y + ((b.x - a.x) / len) * n };
  });
}

/** Walls of one-way sight along the cliffs' top edges, simplified to a twentieth of a cell. */
export function cliffWalls(lines: readonly CliffLine[], grid: GridConfig): Wall[] {
  const walls: Wall[] = [];
  lines.forEach((line, n) => {
    const pts = simplify(line.closed ? [...line.points, line.points[0]!] : [...line.points], grid.cellWidth / 20);
    for (let i = 0; i + 1 < pts.length; i++) walls.push({ id: `terrain:${n}:${i}`, kind: 'cliff', x1: pts[i]!.x, y1: pts[i]!.y, x2: pts[i + 1]!.x, y2: pts[i + 1]!.y });
  });
  return walls;
}

/** Douglas–Peucker: the points a line needs to stay within `tolerance` of itself. */
function simplify(points: readonly Pt[], tolerance: number): Pt[] {
  if (points.length < 3) return [...points];
  const keep = new Uint8Array(points.length);
  keep[0] = keep[points.length - 1] = 1;
  const stack: [number, number][] = [[0, points.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop()!;
    const pa = points[a]!;
    const pb = points[b]!;
    const len = Math.hypot(pb.x - pa.x, pb.y - pa.y);
    let worst = -1;
    let at = -1;
    for (let i = a + 1; i < b; i++) {
      const p = points[i]!;
      const d = len < 1e-9 ? Math.hypot(p.x - pa.x, p.y - pa.y) : Math.abs((pb.x - pa.x) * (pa.y - p.y) - (pa.x - p.x) * (pb.y - pa.y)) / len;
      if (d > worst) {
        worst = d;
        at = i;
      }
    }
    if (worst > tolerance) {
      keep[at] = 1;
      stack.push([a, at], [at, b]);
    }
  }
  return points.filter((_, i) => keep[i]);
}
