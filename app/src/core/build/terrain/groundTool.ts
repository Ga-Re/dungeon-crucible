/**
 * Ground classes and biomes (E-88, Teil B §13): painted are abstract classes – the biome turns
 * each into its own texture. A support point holds up to two classes with weights (0…255); what
 * they leave is Auto, the biome's own ground. A cell holds biome weights against the map's
 * palette (four biomes at most, two mixing at a place). Painting lifts a class (or biome) towards
 * a strength and pushes the others down alike; Auto takes the ground back. Filling takes the
 * connected support points of the same ground mix on the same step – cliffs bound it. Pure.
 */
import { fromCellSpace, toCellSpace, type GridConfig } from '../../grid';
import type { Point } from '../../geometry';
import type { TerrainBiome } from '../terrainKeys';
import { SUBDIVISIONS, type CellChannel } from './block';
import { cellOf, pointOf, setCells, setPoints, type TerrainState } from './state';

export const GROUND_CLASSES = ['grass', 'tallgrass', 'earth', 'rock', 'gravel', 'moss', 'leaves', 'paving', 'snow'] as const;
export type GroundClass = (typeof GROUND_CLASSES)[number];

/** The classes a biome has (Teil B §13.1); elsewhere a class shows as Auto. */
export const BIOME_CLASSES: Record<TerrainBiome, readonly GroundClass[]> = {
  temperate: ['grass', 'tallgrass', 'earth', 'rock', 'gravel', 'moss', 'leaves', 'paving'],
  swamp: ['grass', 'tallgrass', 'earth', 'rock', 'gravel', 'moss', 'leaves', 'paving'],
  desert: ['grass', 'tallgrass', 'earth', 'rock', 'gravel', 'paving'],
  winter: ['grass', 'earth', 'rock', 'gravel', 'moss', 'leaves', 'paving', 'snow'],
  dungeon: ['earth', 'rock', 'gravel', 'moss', 'paving'],
};

/** A class's number in the raster; 0 is Auto. */
export function classId(c: GroundClass): number {
  return GROUND_CLASSES.indexOf(c) + 1;
}

const BIOME_CHANNELS: readonly CellChannel[] = ['biome1', 'biome2', 'biome3', 'biome4'];

/** The classes at a support point, by number, with their weights (0…1); Auto is what they leave. */
export function groundAt(t: TerrainState, stack: string, x: number, y: number): Map<number, number> {
  const out = new Map<number, number>();
  const c1 = pointOf(t, stack, 'ground1Class', x, y);
  const w1 = pointOf(t, stack, 'ground1Weight', x, y);
  const c2 = pointOf(t, stack, 'ground2Class', x, y);
  const w2 = pointOf(t, stack, 'ground2Weight', x, y);
  if (c1 && w1) out.set(c1, w1 / 255);
  if (c2 && w2) out.set(c2, (out.get(c2) ?? 0) + w2 / 255);
  return out;
}

/** `weights` with `id` lifted by `a` towards 1 (0: all lowered towards Auto), the others pushed down alike. */
function lifted(weights: Map<number, number>, id: number, a: number): Map<number, number> {
  const out = new Map<number, number>();
  if (id === 0) {
    for (const [k, w] of weights) out.set(k, w * (1 - a));
    return out;
  }
  const was = weights.get(id) ?? 0;
  const now = was + a * (1 - was);
  const factor = was < 1 ? (1 - now) / (1 - was) : 0;
  for (const [k, w] of weights) if (k !== id) out.set(k, w * factor);
  out.set(id, now);
  return out;
}

/** The two strongest of `weights` (bytes), the rest dropped. */
function topTwo(weights: Map<number, number>): [number, number][] {
  return [...weights]
    .filter(([, w]) => w > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(([k, w]) => [k, Math.round(w * 255)] as [number, number])
    .filter(([, w]) => w > 0);
}

/** `t` with `cls` painted at support points [x, y, strength 0…1] of `stack`'s base ("auto": taken back). */
export function paintGround(t: TerrainState, stack: string, points: readonly (readonly [number, number, number])[], cls: GroundClass | 'auto'): TerrainState {
  const id = cls === 'auto' ? 0 : classId(cls);
  const edits: Record<'ground1Class' | 'ground1Weight' | 'ground2Class' | 'ground2Weight', [number, number, number][]> = { ground1Class: [], ground1Weight: [], ground2Class: [], ground2Weight: [] };
  for (const [x, y, a] of points) {
    if (a <= 0) continue;
    const [first, second] = topTwo(lifted(groundAt(t, stack, x, y), id, Math.min(1, a)));
    edits.ground1Class.push([x, y, first?.[0] ?? 0]);
    edits.ground1Weight.push([x, y, first?.[1] ?? 0]);
    // Rounding may not make the two more than the whole.
    edits.ground2Class.push([x, y, second?.[0] ?? 0]);
    edits.ground2Weight.push([x, y, second ? Math.min(second[1], 255 - first![1]) : 0]);
  }
  let out = t;
  for (const ch of ['ground1Class', 'ground1Weight', 'ground2Class', 'ground2Weight'] as const) if (edits[ch].length) out = setPoints(out, stack, ch, edits[ch]);
  return out;
}

/** A cell's biome weights (0…1) against the palette's four places. */
export function biomeWeightsAt(t: TerrainState, stack: string, cx: number, cy: number): number[] {
  return BIOME_CHANNELS.map((ch) => cellOf(t, stack, ch, cx, cy) / 255);
}

/**
 * `t` with `biome` painted at cells [column, row, strength 0…1]: it joins the palette if new.
 * Null if the palette has four biomes already (E-88).
 */
export function paintBiome(t: TerrainState, stack: string, cells: readonly (readonly [number, number, number])[], biome: TerrainBiome): TerrainState | null {
  let palette = t.biomePalette;
  let slot = palette.indexOf(biome);
  if (slot < 0) {
    if (palette.length >= BIOME_CHANNELS.length) return null;
    palette = [...palette, biome];
    slot = palette.length - 1;
  }
  const edits: [number, number, number][][] = BIOME_CHANNELS.map(() => []);
  for (const [cx, cy, a] of cells) {
    if (a <= 0) continue;
    const weights = new Map(biomeWeightsAt(t, stack, cx, cy).map((w, i) => [i, w] as [number, number]));
    // Two mix at most; together always the whole.
    const [first, second] = topTwo(liftedSlot(weights, slot, Math.min(1, a)));
    const out = [0, 0, 0, 0];
    if (first) out[first[0]] = second ? first[1] : 255;
    if (second) out[second[0]] = 255 - first![1];
    out.forEach((v, i) => edits[i]!.push([cx, cy, v]));
  }
  let out: TerrainState = palette === t.biomePalette ? t : { ...t, biomePalette: palette };
  BIOME_CHANNELS.forEach((ch, i) => {
    if (edits[i]!.length) out = setCells(out, stack, ch, edits[i]!);
  });
  return out;
}

/** Biome weights with palette place `slot` lifted by `a`, the others pushed down alike. */
function liftedSlot(weights: Map<number, number>, slot: number, a: number): Map<number, number> {
  const was = weights.get(slot) ?? 0;
  const now = was + a * (1 - was);
  const factor = was < 1 ? (1 - now) / (1 - was) : 0;
  const out = new Map<number, number>();
  for (const [k, w] of weights) out.set(k, k === slot ? now : w * factor);
  return out;
}

const smooth = (e0: number, e1: number, v: number) => {
  const x = Math.max(0, Math.min(1, (v - e0) / (e1 - e0)));
  return x * x * (3 - 2 * x);
};

/** Distance from `p` to segment a–b. */
function segmentDistance(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = dx * dx + dy * dy;
  const k = len > 0 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len)) : 0;
  return Math.hypot(p.x - (a.x + k * dx), p.y - (a.y + k * dy));
}

/**
 * The strength (0…1) a round brush of `sizeCells` gives along `path` (map px) at the places of a
 * lattice of `per` places per cell: 1 inside, soft over the outer `softness` of its radius; the
 * strongest touch of the path counts.
 */
function brushOn(path: readonly Point[], sizeCells: number, softness: number, grid: GridConfig, per: number, offset: number): [number, number, number][] {
  const pts = path.map((p) => {
    const c = toCellSpace(grid, p);
    return { x: c.x * per - offset, y: c.y * per - offset };
  });
  const r = (sizeCells * per) / 2;
  const inner = r * (1 - Math.max(0, Math.min(1, softness)));
  const out = new Map<string, [number, number, number]>();
  const segments = pts.length === 1 ? [[pts[0]!, pts[0]!]] : pts.slice(1).map((p, i) => [pts[i]!, p]);
  for (const [a, b] of segments) {
    for (let y = Math.ceil(Math.min(a!.y, b!.y) - r); y <= Math.floor(Math.max(a!.y, b!.y) + r); y++)
      for (let x = Math.ceil(Math.min(a!.x, b!.x) - r); x <= Math.floor(Math.max(a!.x, b!.x) + r); x++) {
        const d = segmentDistance({ x, y }, a!, b!);
        if (d > r) continue;
        const s = d <= inner ? 1 : 1 - smooth(0, 1, (d - inner) / Math.max(1e-6, r - inner));
        const key = `${x},${y}`;
        const had = out.get(key);
        if (!had || had[2] < s) out.set(key, [x, y, s]);
      }
  }
  return [...out.values()].filter(([, , s]) => s > 0);
}

/** Support points [x, y, strength] a soft round brush of `sizeCells` covers along `path`. */
export function brushWeights(path: readonly Point[], sizeCells: number, softness: number, grid: GridConfig): [number, number, number][] {
  return brushOn(path, sizeCells, softness, grid, SUBDIVISIONS, 0);
}

/** Cells [column, row, strength] a soft round brush of `sizeCells` covers along `path` (by their centres). */
export function brushCells(path: readonly Point[], sizeCells: number, softness: number, grid: GridConfig): [number, number, number][] {
  return brushOn(path, sizeCells, softness, grid, 1, 0.5);
}

/** How far apart two grounds are (0 the same … 1 nothing alike), Auto counted. */
function groundDistance(a: Map<number, number>, b: Map<number, number>): number {
  const ids = new Set([...a.keys(), ...b.keys()]);
  let sum = 0;
  let autoA = 1;
  let autoB = 1;
  for (const id of ids) {
    const wa = a.get(id) ?? 0;
    const wb = b.get(id) ?? 0;
    autoA -= wa;
    autoB -= wb;
    sum += Math.abs(wa - wb);
  }
  return (sum + Math.abs(autoA - autoB)) / 2;
}

/**
 * The support points connected to (x, y) on the same step whose ground is within `tolerance`
 * (0…1) of its ground, inside `bounds` (support points, inclusive).
 */
export function fillPoints(t: TerrainState, stack: string, x: number, y: number, tolerance: number, bounds: { x0: number; y0: number; x1: number; y1: number }): [number, number][] {
  const inside = (px: number, py: number) => px >= bounds.x0 && py >= bounds.y0 && px <= bounds.x1 && py <= bounds.y1;
  if (!inside(x, y)) return [];
  const step = pointOf(t, stack, 'step', x, y);
  const ground = groundAt(t, stack, x, y);
  const w = bounds.x1 - bounds.x0 + 1;
  const seen = new Uint8Array(w * (bounds.y1 - bounds.y0 + 1));
  const out: [number, number][] = [];
  const queue: [number, number][] = [[x, y]];
  seen[(y - bounds.y0) * w + (x - bounds.x0)] = 1;
  while (queue.length) {
    const [px, py] = queue.pop()!;
    out.push([px, py]);
    for (const [nx, ny] of [[px + 1, py], [px - 1, py], [px, py + 1], [px, py - 1]] as const) {
      if (!inside(nx, ny)) continue;
      const i = (ny - bounds.y0) * w + (nx - bounds.x0);
      if (seen[i]) continue;
      seen[i] = 1;
      if (pointOf(t, stack, 'step', nx, ny) !== step || groundDistance(groundAt(t, stack, nx, ny), ground) > tolerance) continue;
      queue.push([nx, ny]);
    }
  }
  return out;
}

/** A map point in support points, rounded to the nearest. */
export function supportPointAt(grid: GridConfig, p: Point): [number, number] {
  const c = toCellSpace(grid, p);
  return [Math.round(c.x * SUBDIVISIONS), Math.round(c.y * SUBDIVISIONS)];
}

/** A support point as a map point. */
export function supportPointPx(grid: GridConfig, x: number, y: number): Point {
  return fromCellSpace(grid, { x: x / SUBDIVISIONS, y: y / SUBDIVISIONS });
}
