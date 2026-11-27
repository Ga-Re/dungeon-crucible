/**
 * Raster blocks of the procedural Map Forge (E-55, E-56, Plan A.6, Teil B §8.1): a block covers
 * 32 × 32 cells; its rasters lie on the support points of the quarter-cell grid, 128 × 128 per
 * block (a block's right and bottom edge points are its neighbour's first ones), the biome
 * weights per cell. Each channel is a plane of its own. Blocks never change: an edit makes a new
 * block that shares every plane it did not touch, so snapshots for undo share blocks and planes
 * (copy-on-write). Patches of a layer (E-58) set chosen channels at chosen points over a block.
 * Pure.
 */

/** Cells along a block's side; support points per cell side; support points along a block's side. */
export const BLOCK_CELLS = 32;
export const SUBDIVISIONS = 4;
export const BLOCK_POINTS = BLOCK_CELLS * SUBDIVISIONS;

const POINTS = BLOCK_POINTS * BLOCK_POINTS;
const CELLS = BLOCK_CELLS * BLOCK_CELLS;

type Plane = Int8Array | Int16Array | Uint8Array;

/**
 * The channels in file order: on support points – step (int8), relief (int16, 1/16 ft), slope,
 * solid rock, rock style, water, the two strongest ground classes with their weights, the density
 * of plants and rocks (128: normal); per cell – the weights of the four palette biomes.
 */
export const POINT_CHANNELS = ['step', 'relief', 'slope', 'solid', 'solidStyle', 'water', 'ground1Class', 'ground1Weight', 'ground2Class', 'ground2Weight', 'densityPlants', 'densityRocks'] as const;
export const CELL_CHANNELS = ['biome1', 'biome2', 'biome3', 'biome4'] as const;
export type PointChannel = (typeof POINT_CHANNELS)[number];
export type CellChannel = (typeof CELL_CHANNELS)[number];
export type Channel = PointChannel | CellChannel;

const KIND: Record<Channel, 'i8' | 'i16' | 'u8'> = {
  step: 'i8', relief: 'i16', slope: 'u8', solid: 'u8', solidStyle: 'u8', water: 'u8',
  ground1Class: 'u8', ground1Weight: 'u8', ground2Class: 'u8', ground2Weight: 'u8', densityPlants: 'u8', densityRocks: 'u8',
  biome1: 'u8', biome2: 'u8', biome3: 'u8', biome4: 'u8',
};
const DEFAULT: Partial<Record<Channel, number>> = { densityPlants: 128, densityRocks: 128, biome1: 255 };

/** The groups a patch sets together (one mask bit each): a ground or density pair, or the biome weights, is never mixed. */
const POINT_GROUPS: readonly (readonly PointChannel[])[] = [['step'], ['relief'], ['slope'], ['solid'], ['solidStyle'], ['water'], ['ground1Class', 'ground1Weight', 'ground2Class', 'ground2Weight'], ['densityPlants', 'densityRocks']];
const groupBit = (ch: PointChannel) => 1 << POINT_GROUPS.findIndex((g) => g.includes(ch));

export interface RasterBlock {
  readonly planes: Readonly<Record<Channel, Plane>>;
}

/** A patch of a layer: values, and which point groups (bits) and cells (1) it sets. */
export interface RasterPatch {
  readonly values: RasterBlock;
  readonly pointMask: Uint8Array;
  readonly cellMask: Uint8Array;
}

export function isPointChannel(ch: Channel): ch is PointChannel {
  return (POINT_CHANNELS as readonly string[]).includes(ch);
}

/** A plane of a channel, filled with its default. */
export function newPlane(ch: Channel): Plane {
  const n = isPointChannel(ch) ? POINTS : CELLS;
  const plane = KIND[ch] === 'i8' ? new Int8Array(n) : KIND[ch] === 'i16' ? new Int16Array(n) : new Uint8Array(n);
  const d = DEFAULT[ch];
  if (d) plane.fill(d);
  return plane;
}

export function planeKind(ch: Channel): 'i8' | 'i16' | 'u8' {
  return KIND[ch];
}

/** Planes of an empty block are shared: none is ever written to. */
let empty: RasterBlock | null = null;

/** A flat, open block of the first palette biome. */
export function newBlock(): RasterBlock {
  empty ??= { planes: Object.fromEntries([...POINT_CHANNELS, ...CELL_CHANNELS].map((ch) => [ch, newPlane(ch)])) as Record<Channel, Plane> };
  return empty;
}

function index(x: number, y: number, side: number): number {
  if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= side || y >= side) throw new Error(`raster position ${x}, ${y} lies outside the block`);
  return y * side + x;
}

export function pointAt(b: RasterBlock, ch: PointChannel, x: number, y: number): number {
  return b.planes[ch][index(x, y, BLOCK_POINTS)]!;
}

export function cellAt(b: RasterBlock, ch: CellChannel, x: number, y: number): number {
  return b.planes[ch][index(x, y, BLOCK_CELLS)]!;
}

const RANGE = { i8: [-128, 127], i16: [-32768, 32767], u8: [0, 255] } as const;

function clamp(ch: Channel, v: number): number {
  const [lo, hi] = RANGE[KIND[ch]];
  return Math.max(lo, Math.min(hi, Math.round(v)));
}

function written(b: RasterBlock, ch: Channel, side: number, edits: Iterable<readonly [number, number, number]>): RasterBlock {
  const plane = b.planes[ch].slice();
  for (const [x, y, v] of edits) plane[index(x, y, side)] = clamp(ch, v);
  return { planes: { ...b.planes, [ch]: plane } };
}

/** The block with `edits` ([x, y, value] on support points) in channel `ch`; other planes are shared. */
export function withPoints(b: RasterBlock, ch: PointChannel, edits: Iterable<readonly [number, number, number]>): RasterBlock {
  return written(b, ch, BLOCK_POINTS, edits);
}

/** The block with `edits` ([x, y, value] on cells) in channel `ch`. */
export function withCells(b: RasterBlock, ch: CellChannel, edits: Iterable<readonly [number, number, number]>): RasterBlock {
  return written(b, ch, BLOCK_CELLS, edits);
}

/* ---------------------------------------------------------------- global points */

const floorDiv = (v: number, d: number) => Math.floor(v / d);

/** The key of the block a global support point lies in (signed, A.4). */
export function blockKeyOf(px: number, py: number): string {
  return `${floorDiv(px, BLOCK_POINTS)}_${floorDiv(py, BLOCK_POINTS)}`;
}

/** A global support point's place inside its block. */
export function localPoint(px: number, py: number): { x: number; y: number } {
  return { x: px - floorDiv(px, BLOCK_POINTS) * BLOCK_POINTS, y: py - floorDiv(py, BLOCK_POINTS) * BLOCK_POINTS };
}

/* ---------------------------------------------------------------- patches */

export function emptyPatch(): RasterPatch {
  return { values: newBlock(), pointMask: new Uint8Array(POINTS), cellMask: new Uint8Array(CELLS) };
}

/** The patch setting `edits` in channel `ch` too – with the rest of its group as the patch has it. */
export function patchPoints(p: RasterPatch, ch: PointChannel, edits: Iterable<readonly [number, number, number]>): RasterPatch {
  const list = [...edits];
  const pointMask = p.pointMask.slice();
  for (const [x, y] of list) pointMask[index(x, y, BLOCK_POINTS)]! |= groupBit(ch);
  return { ...p, values: withPoints(p.values, ch, list), pointMask };
}

/** The patch setting `edits` of a biome weight too – all four weights of those cells go together. */
export function patchCells(p: RasterPatch, ch: CellChannel, edits: Iterable<readonly [number, number, number]>): RasterPatch {
  const list = [...edits];
  const cellMask = p.cellMask.slice();
  for (const [x, y] of list) cellMask[index(x, y, BLOCK_CELLS)] = 1;
  return { ...p, values: withCells(p.values, ch, list), cellMask };
}

/** `base` with the patches laid over it in order (later ones win); `base` itself without patches. */
export function applyPatches(base: RasterBlock, patches: readonly RasterPatch[]): RasterBlock {
  if (!patches.length) return base;
  const planes = { ...base.planes } as Record<Channel, Plane>;
  const copied = new Set<Channel>();
  const own = (ch: Channel) => {
    if (!copied.has(ch)) {
      planes[ch] = planes[ch].slice();
      copied.add(ch);
    }
    return planes[ch];
  };
  for (const p of patches) {
    POINT_GROUPS.forEach((group, bit) => {
      const flag = 1 << bit;
      if (!p.pointMask.some((m) => (m & flag) !== 0)) return;
      for (const ch of group) {
        const target = own(ch);
        const from = p.values.planes[ch];
        for (let i = 0; i < POINTS; i++) if (p.pointMask[i]! & flag) target[i] = from[i]!;
      }
    });
    if (!p.cellMask.some((m) => m !== 0)) continue;
    for (const ch of CELL_CHANNELS) {
      const target = own(ch);
      const from = p.values.planes[ch];
      for (let i = 0; i < CELLS; i++) if (p.cellMask[i]) target[i] = from[i]!;
    }
  }
  return { planes };
}
