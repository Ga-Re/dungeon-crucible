/**
 * The terrain the TV may know (E-61, E-85): only explored cells – revealed or remembered – and two
 * cells around them, so cliff and shore edges come out whole; never an undiscovered secret area
 * nor the cells touching it – a cell counts as secret when its centre lies in the area or an edge
 * of the area runs through it, so thin and slanted areas are caught too. The cells around a secret
 * area inside the explored ground take the values of the nearest cell the TV may know (E-85: no
 * gap shaped like the room, and nothing of it). Patches of active layers are laid in (inactive
 * layers never leave); one stack (the storey shown). Everything else is the channel defaults and
 * lies under the fog. Blocks travel by checksum: the frame names every explored block, a channel
 * of their own brings those the TV does not have; the TV takes a block only whole and with a
 * matching checksum, a block it lacks stays black (fail-closed). Pure.
 */
import type { GridConfig } from '../../grid';
import { toCellSpace } from '../../grid';
import { cellCentresInside, type CellGrid } from '../geom/scanline';
import type { Polygon } from '../../poly/types';
import { BLOCK_CELLS, BLOCK_POINTS, CELL_CHANNELS, newBlock, newPlane, planeKind, POINT_CHANNELS, SUBDIVISIONS, type Channel, type RasterBlock } from './block';
import { shownBlock, type TerrainState } from './state';

/** Cells around the explored area the TV still gets. */
export const TV_MARGIN_CELLS = 2;
/** Cells around an undiscovered secret area the TV does not get. */
const SECRET_MARGIN_CELLS = 1;
/** Steps along an area's edge, in cells: finer than a cell, so the edge touches no cell unmarked. */
const EDGE_STEP = 0.25;

export interface RasterView {
  /** `map` or the storey shown. */
  stack: string;
  /** Active layers with raster patches, lowest first. */
  activeLayers: readonly string[];
  /** Explored: revealed and remembered (map px). */
  shown: readonly Polygon[];
  /** Undiscovered secret areas (map px). */
  hidden: readonly Polygon[];
  grid: GridConfig;
}

const parse = (key: string) => {
  const [bx, by] = key.split('_').map(Number);
  return { bx: bx!, by: by! };
};
const floorDiv = (v: number, d: number) => Math.floor(v / d);

/** The cells the explored area touches, grown by the margin (none: nothing explored). */
function exploredCells(view: RasterView): { c0: number; c1: number; r0: number; r1: number } | null {
  let c0 = Infinity;
  let c1 = -Infinity;
  let r0 = Infinity;
  let r1 = -Infinity;
  for (const poly of view.shown)
    for (const [x, y] of poly.outer) {
      const c = toCellSpace(view.grid, { x, y });
      c0 = Math.min(c0, Math.floor(c.x));
      c1 = Math.max(c1, Math.floor(c.x));
      r0 = Math.min(r0, Math.floor(c.y));
      r1 = Math.max(r1, Math.floor(c.y));
    }
  if (c0 === Infinity) return null;
  const m = TV_MARGIN_CELLS + 1;
  return { c0: c0 - m, c1: c1 + m, r0: r0 - m, r1: r1 + m };
}

/** Every cell an edge of `polys` (outer rings and holes) runs through, as `col_row`. */
function edgeCells(polys: readonly Polygon[], grid: GridConfig): Set<string> {
  const out = new Set<string>();
  for (const poly of polys)
    for (const ring of [poly.outer, ...poly.holes])
      for (let i = 0; i < ring.length; i++) {
        const a = toCellSpace(grid, { x: ring[i]![0], y: ring[i]![1] });
        const b = toCellSpace(grid, { x: ring[(i + 1) % ring.length]![0], y: ring[(i + 1) % ring.length]![1] });
        const steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / EDGE_STEP));
        for (let k = 0; k <= steps; k++) out.add(`${Math.floor(a.x + ((b.x - a.x) * k) / steps)}_${Math.floor(a.y + ((b.y - a.y) * k) / steps)}`);
      }
  return out;
}

/**
 * Per cell of block `key` (32 × 32): the cell whose values the TV gets – itself, the nearest cell
 * it may know (around a secret area, E-85), or -1: unknown (the defaults).
 */
/** The explored cells and the secret ones of a view, worked out once for all its blocks (one scan per row). */
export interface ViewMasks {
  explored: CellGrid;
  /** Centres in an undiscovered secret area, or an edge of one runs through. */
  secret: (col: number, row: number) => boolean;
}

export function viewMasks(view: RasterView): ViewMasks {
  const edges = edgeCells(view.hidden, view.grid);
  const inside = cellCentresInside(view.hidden, view.grid);
  return { explored: cellCentresInside(view.shown, view.grid), secret: (col, row) => inside.get(col, row) === 1 || edges.has(`${col}_${row}`) };
}

export function tvCellSources(key: string, masks: ViewMasks): Int16Array {
  const { bx, by } = parse(key);
  const col0 = bx * BLOCK_CELLS;
  const row0 = by * BLOCK_CELLS;
  const M = TV_MARGIN_CELLS;
  const S = SECRET_MARGIN_CELLS;
  const side = BLOCK_CELLS + 2 * M;
  const explored = new Uint8Array(side * side);
  const secret = new Uint8Array(side * side);
  for (let r = 0; r < side; r++)
    for (let c = 0; c < side; c++) {
      const col = col0 - M + c;
      const row = row0 - M + r;
      explored[r * side + c] = masks.explored.get(col, row);
      secret[r * side + c] = masks.secret(col, row) ? 1 : 0;
    }
  const near = (grid: Uint8Array, c: number, r: number, d: number) => {
    for (let dr = -d; dr <= d; dr++)
      for (let dc = -d; dc <= d; dc++) {
        const x = c + dc;
        const y = r + dr;
        if (x >= 0 && y >= 0 && x < side && y < side && grid[y * side + x]) return true;
      }
    return false;
  };
  const N = BLOCK_CELLS;
  const known = new Uint8Array(N * N);
  const fill: number[] = [];
  for (let r = 0; r < N; r++)
    for (let c = 0; c < N; c++) {
      if (!near(explored, c + M, r + M, M)) continue;
      if (near(secret, c + M, r + M, S)) fill.push(r * N + c);
      else known[r * N + c] = 1;
    }
  const sources = new Int16Array(N * N).fill(-1);
  for (let i = 0; i < N * N; i++) if (known[i]) sources[i] = i;
  // Around a secret area: the nearest known cell of this block, ring by ring (none: unknown).
  for (const i of fill) {
    const c = i % N;
    const r = (i - c) / N;
    search: for (let d = 1; d < N; d++)
      for (let dr = -d; dr <= d; dr++)
        for (let dc = -d; dc <= d; dc++) {
          if (Math.max(Math.abs(dr), Math.abs(dc)) !== d) continue;
          const x = c + dc;
          const y = r + dr;
          if (x >= 0 && y >= 0 && x < N && y < N && known[y * N + x]) {
            sources[i] = y * N + x;
            break search;
          }
        }
  }
  return sources;
}

/**
 * A step the TV does not know (E-85, E-87): below every real step (−8 … +15), so a cliff never
 * runs along the edge of what the TV knows.
 */
export const UNKNOWN_STEP = -128;

/** `block` as the TV gets it: each cell's points and values from its source cell; where none, the defaults – and the step unknown. */
function sourced(block: RasterBlock, sources: Int16Array): RasterBlock {
  // A block the TV may know whole goes as it is: no copy.
  if (sources.every((src, i) => src === i)) return block;
  // Each point's source point (-1: the default), worked out once for all planes.
  const from = new Int32Array(BLOCK_POINTS * BLOCK_POINTS);
  for (let y = 0; y < BLOCK_POINTS; y++) {
    const cy = (y / SUBDIVISIONS) | 0;
    const sy = y % SUBDIVISIONS;
    for (let x = 0; x < BLOCK_POINTS; x++) {
      const src = sources[cy * BLOCK_CELLS + ((x / SUBDIVISIONS) | 0)]!;
      from[y * BLOCK_POINTS + x] = src < 0 ? -1 : (((src / BLOCK_CELLS) | 0) * SUBDIVISIONS + sy) * BLOCK_POINTS + (src % BLOCK_CELLS) * SUBDIVISIONS + (x % SUBDIVISIONS);
    }
  }
  const empty = newBlock();
  const planes = {} as Record<Channel, Int8Array | Int16Array | Uint8Array>;
  for (const ch of POINT_CHANNELS) {
    const src = block.planes[ch];
    const plane = src.slice();
    const d = ch === 'step' ? UNKNOWN_STEP : empty.planes[ch][0]!;
    for (let i = 0; i < from.length; i++) {
      const f = from[i]!;
      plane[i] = f < 0 ? d : src[f]!;
    }
    planes[ch] = plane;
  }
  for (const ch of CELL_CHANNELS) {
    const src = block.planes[ch];
    const plane = src.slice();
    const d = empty.planes[ch][0]!;
    for (let i = 0; i < plane.length; i++) {
      const f = sources[i]!;
      plane[i] = f < 0 ? d : src[f]!;
    }
    planes[ch] = plane;
  }
  return { planes };
}

/** What a block came out as for a mask, by the block (blocks never change) and the mask's fingerprint. */
const sourcedCache = new WeakMap<RasterBlock, Map<string, { block: RasterBlock; checksum: string }>>();

function maskKey(sources: Int16Array): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x2b5d1e3f;
  for (let i = 0; i < sources.length; i++) {
    h1 = Math.imul(h1 ^ (sources[i]! & 0xffff), 0x01000193);
    h2 = Math.imul(h2 ^ (sources[i]! & 0xffff), 0x01000193) ^ (h2 >>> 13);
  }
  return `${h1 >>> 0}_${h2 >>> 0}`;
}

/** The blocks the TV may know of `view` – every block the explored area reaches – as it may know them, with their checksums. */
export function tvRaster(t: TerrainState, view: RasterView): Map<string, { block: RasterBlock; checksum: string }> {
  const out = new Map<string, { block: RasterBlock; checksum: string }>();
  const area = exploredCells(view);
  if (!area) return out;
  const masks = viewMasks(view);
  for (let by = floorDiv(area.r0, BLOCK_CELLS); by <= floorDiv(area.r1, BLOCK_CELLS); by++)
    for (let bx = floorDiv(area.c0, BLOCK_CELLS); bx <= floorDiv(area.c1, BLOCK_CELLS); bx++) {
      const key = `${bx}_${by}`;
      const sources = tvCellSources(key, masks);
      if (!sources.some((s) => s >= 0)) continue;
      const shown = shownBlock(t, view.stack, key, view.activeLayers);
      const mk = maskKey(sources);
      let byMask = sourcedCache.get(shown);
      if (!byMask) sourcedCache.set(shown, (byMask = new Map()));
      let result = byMask.get(mk);
      if (!result) {
        const block = sourced(shown, sources);
        result = { block, checksum: rasterChecksum(block) };
        // A few masks per block are enough: the explored edge moves on, old masks never come back.
        if (byMask.size > 8) byMask.clear();
        byMask.set(mk, result);
      }
      out.set(key, result);
    }
  return out;
}

/* ---------------------------------------------------------------- checksums */

const CHANNELS: readonly Channel[] = [...POINT_CHANNELS, ...CELL_CHANNELS];

const checksums = new WeakMap<RasterBlock, string>();

/** Two 32-bit FNV-1a lanes over every plane in file order, as 16 hex digits (worked out once per block: blocks never change). */
export function rasterChecksum(b: RasterBlock): string {
  const known = checksums.get(b);
  if (known) return known;
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193 ^ 0x5bd1e995;
  for (const ch of CHANNELS) {
    const p = b.planes[ch];
    const bytes = new Uint8Array(p.buffer, p.byteOffset, p.byteLength);
    for (let i = 0; i < bytes.length; i++) {
      h1 = Math.imul(h1 ^ bytes[i]!, 0x01000193);
      h2 = Math.imul(h2 ^ bytes[i]!, 0x01000193) ^ (h2 >>> 15);
    }
  }
  const sum = (h1 >>> 0).toString(16).padStart(8, '0') + (h2 >>> 0).toString(16).padStart(8, '0');
  checksums.set(b, sum);
  return sum;
}

/* ---------------------------------------------------------------- sending */

/** Blocks per message on the raster channel. */
export const RASTER_BATCH = 16;
/** Blocks the DM remembers as sent – fewer than the TV keeps (`RASTER_TV_CAPACITY`), so it always forgets first. */
export const RASTER_SENT_CAPACITY = 224;
/** Blocks the TV keeps (about 220 KB each). */
export const RASTER_TV_CAPACITY = 256;

/**
 * The blocks the TV has been sent, the newest frame's last: what a frame names is touched in its
 * order, as the TV does, and the oldest are forgotten first. Forgotten blocks go again when a
 * frame names them, so a block the TV dropped never stays black. Cleared when the TV (re)loads or closes.
 */
export class SentBlocks {
  private readonly sent = new Set<string>();

  constructor(private readonly capacity: number) {}

  /** The checksums of a frame the TV lacks (in order); from now on counted as sent. */
  take(checksums: Iterable<string>): string[] {
    const missing: string[] = [];
    for (const c of checksums) {
      if (this.sent.has(c)) this.sent.delete(c);
      else missing.push(c);
      this.sent.add(c);
    }
    while (this.sent.size > this.capacity) this.sent.delete(this.sent.values().next().value!);
    return missing;
  }

  clear(): void {
    this.sent.clear();
  }
}

/** The messages for the raster channel: the blocks of a frame the TV lacks, at most `RASTER_BATCH` per message. */
export function rasterBatches(blocks: ReadonlyMap<string, RasterBlock>, sent: SentBlocks): { checksum: string; planes: RasterBlock['planes'] }[][] {
  const out: { checksum: string; planes: RasterBlock['planes'] }[][] = [];
  for (const checksum of sent.take(blocks.keys())) {
    if (!out.length || out[out.length - 1]!.length >= RASTER_BATCH) out.push([]);
    out[out.length - 1]!.push({ checksum, planes: blocks.get(checksum)!.planes });
  }
  return out;
}

/* ---------------------------------------------------------------- the TV side */

const CHECKSUM = /^[0-9a-f]{16}$/;
/** Each channel's plane: its typed array and length, worked out once. */
const SHAPE = Object.fromEntries(CHANNELS.map((ch) => [ch, { kind: planeKind(ch), length: newPlane(ch).length }])) as Record<Channel, { kind: 'i8' | 'i16' | 'u8'; length: number }>;

function plane(value: unknown, ch: Channel): value is Int8Array | Int16Array | Uint8Array {
  const { kind, length } = SHAPE[ch];
  const ok = kind === 'i8' ? value instanceof Int8Array : kind === 'i16' ? value instanceof Int16Array : value instanceof Uint8Array;
  return ok && (value as ArrayLike<number>).length === length;
}

/** The blocks of a message from the raster channel: each only whole and with a fitting checksum; anything else dropped. */
export function parseRasterBatch(data: unknown): Map<string, RasterBlock> {
  const out = new Map<string, RasterBlock>();
  if (!Array.isArray(data) || data.length > RASTER_BATCH) return out;
  for (const item of data) {
    if (!item || typeof item !== 'object') continue;
    const { checksum, planes } = item as { checksum?: unknown; planes?: unknown };
    if (typeof checksum !== 'string' || !CHECKSUM.test(checksum) || !planes || typeof planes !== 'object') continue;
    const p = planes as Record<string, unknown>;
    if (!CHANNELS.every((ch) => plane(p[ch], ch))) continue;
    const block: RasterBlock = { planes: Object.fromEntries(CHANNELS.map((ch) => [ch, p[ch]])) as RasterBlock['planes'] };
    if (rasterChecksum(block) === checksum) out.set(checksum, block);
  }
  return out;
}

/** The blocks the TV holds, by checksum; at most `capacity`, those named by the newest frame kept longest. */
export class RasterCache {
  private readonly blocks = new Map<string, RasterBlock>();

  constructor(private readonly capacity: number) {}

  add(blocks: ReadonlyMap<string, RasterBlock>): void {
    for (const [sum, b] of blocks) {
      this.blocks.delete(sum);
      this.blocks.set(sum, b);
    }
    while (this.blocks.size > this.capacity) this.blocks.delete(this.blocks.keys().next().value!);
  }

  has(checksum: string): boolean {
    return this.blocks.has(checksum);
  }

  /** A frame's blocks by key: the block, or null where the TV lacks it (shown black). */
  resolve(frameBlocks: Readonly<Record<string, string>>): Map<string, RasterBlock | null> {
    const out = new Map<string, RasterBlock | null>();
    for (const [key, sum] of Object.entries(frameBlocks)) {
      const b = this.blocks.get(sum) ?? null;
      if (b) {
        this.blocks.delete(sum);
        this.blocks.set(sum, b);
      }
      out.set(key, b);
    }
    return out;
  }
}
