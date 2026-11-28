/**
 * A map's terrain at run time (E-55, E-56): its rasters decoded, per stack (`map` for the map
 * itself, else a storey's id) the base blocks and per layer the patches over them. A state never
 * changes: an edit gives a new state that shares every stack, block and plane it did not touch,
 * so undo snapshots hold states by reference and cost only what changed. Encoding for the file
 * reuses the encoding of every block it has seen before – from reading or an earlier save – so a
 * save encodes only what changed. Pure apart from the platform's (de)compression streams.
 */
import { applyPatches, BLOCK_CELLS, blockKeyOf, cellAt, localPoint, newBlock, pointAt, SUBDIVISIONS, withCells, withPoints, type CellChannel, type PointChannel, type RasterBlock, type RasterPatch } from './block';
import { decodeBlock, decodePatch, encodeBlock, encodePatch } from './codec';
import type { Terrain, TerrainBiome } from '../intent';

export interface TerrainStack {
  readonly base: ReadonlyMap<string, RasterBlock>;
  /** Per layer id, its patches by block key. */
  readonly layers: ReadonlyMap<string, ReadonlyMap<string, RasterPatch>>;
}

export interface TerrainState {
  readonly stepFt: Terrain['stepFt'];
  readonly biomePalette: readonly TerrainBiome[];
  readonly stacks: ReadonlyMap<string, TerrainStack>;
}

type EncodedBlock = Terrain['stacks'][string]['base'][string];
type EncodedPatch = NonNullable<Terrain['stacks'][string]['layers']>[string][string];

/** The file form of every block and patch seen, by the object itself (dropped with it). */
export class EncodeCache {
  readonly blocks = new WeakMap<RasterBlock, EncodedBlock>();
  readonly patches = new WeakMap<RasterPatch, EncodedPatch>();
}

const EMPTY_STACK: TerrainStack = { base: new Map(), layers: new Map() };

export function emptyTerrain(biomePalette: readonly TerrainBiome[], stepFt: Terrain['stepFt'] = 10): TerrainState {
  return { stepFt, biomePalette: [...biomePalette], stacks: new Map() };
}

/** A support point's value in a stack's base raster (map coordinates in support points). */
export function pointOf(t: TerrainState, stack: string, ch: PointChannel, px: number, py: number): number {
  const block = t.stacks.get(stack)?.base.get(blockKeyOf(px, py)) ?? newBlock();
  const { x, y } = localPoint(px, py);
  return pointAt(block, ch, x, y);
}

/** The state with `edits` ([x, y, value] in global support points) in a stack's base raster. */
export function setPoints(t: TerrainState, stack: string, ch: PointChannel, edits: readonly (readonly [number, number, number])[]): TerrainState {
  const byBlock = new Map<string, [number, number, number][]>();
  for (const [px, py, v] of edits) {
    const key = blockKeyOf(px, py);
    const { x, y } = localPoint(px, py);
    let list = byBlock.get(key);
    if (!list) byBlock.set(key, (list = []));
    list.push([x, y, v]);
  }
  const old = t.stacks.get(stack) ?? EMPTY_STACK;
  const base = new Map(old.base);
  for (const [key, list] of byBlock) base.set(key, withPoints(base.get(key) ?? newBlock(), ch, list));
  const stacks = new Map(t.stacks);
  stacks.set(stack, { ...old, base });
  return { ...t, stacks };
}

/** A cell's value in a stack's base raster (global cells: column, row). */
export function cellOf(t: TerrainState, stack: string, ch: CellChannel, cx: number, cy: number): number {
  const block = t.stacks.get(stack)?.base.get(blockKeyOf(cx * SUBDIVISIONS, cy * SUBDIVISIONS)) ?? newBlock();
  return cellAt(block, ch, cx - Math.floor(cx / BLOCK_CELLS) * BLOCK_CELLS, cy - Math.floor(cy / BLOCK_CELLS) * BLOCK_CELLS);
}

/** The state with `edits` ([column, row, value] in global cells) in a stack's base raster. */
export function setCells(t: TerrainState, stack: string, ch: CellChannel, edits: readonly (readonly [number, number, number])[]): TerrainState {
  const byBlock = new Map<string, [number, number, number][]>();
  for (const [cx, cy, v] of edits) {
    const key = blockKeyOf(cx * SUBDIVISIONS, cy * SUBDIVISIONS);
    let list = byBlock.get(key);
    if (!list) byBlock.set(key, (list = []));
    list.push([cx - Math.floor(cx / BLOCK_CELLS) * BLOCK_CELLS, cy - Math.floor(cy / BLOCK_CELLS) * BLOCK_CELLS, v]);
  }
  const old = t.stacks.get(stack) ?? EMPTY_STACK;
  const base = new Map(old.base);
  for (const [key, list] of byBlock) base.set(key, withCells(base.get(key) ?? newBlock(), ch, list));
  const stacks = new Map(t.stacks);
  stacks.set(stack, { ...old, base });
  return { ...t, stacks };
}

/** A block as shown: its base with the patches of `activeLayers` (lowest first) laid over it. */
export function shownBlock(t: TerrainState, stack: string, key: string, activeLayers: readonly string[]): RasterBlock {
  const s = t.stacks.get(stack) ?? EMPTY_STACK;
  const patches = activeLayers.flatMap((id) => {
    const p = s.layers.get(id)?.get(key);
    return p ? [p] : [];
  });
  return applyPatches(s.base.get(key) ?? newBlock(), patches);
}

/** Every block of a stack as shown: its base blocks and those only active layers' patches reach. */
export function shownStack(t: TerrainState, stack: string, activeLayers: readonly string[]): Map<string, RasterBlock> {
  const s = t.stacks.get(stack) ?? EMPTY_STACK;
  const keys = new Set(s.base.keys());
  for (const id of activeLayers) for (const key of s.layers.get(id)?.keys() ?? []) keys.add(key);
  return new Map([...keys].map((key) => [key, shownBlock(t, stack, key, activeLayers)]));
}

/** The terrain of a map file, decoded; a broken block refuses the whole of it. */
export async function decodeTerrain(file: Terrain, cache: EncodeCache): Promise<TerrainState> {
  const stacks = new Map<string, TerrainStack>();
  for (const [stackKey, stack] of Object.entries(file.stacks)) {
    const base = new Map<string, RasterBlock>();
    for (const [key, enc] of Object.entries(stack.base)) {
      const block = await decodeBlock(enc);
      cache.blocks.set(block, enc);
      base.set(key, block);
    }
    const layers = new Map<string, Map<string, RasterPatch>>();
    for (const [layer, patches] of Object.entries(stack.layers ?? {})) {
      const m = new Map<string, RasterPatch>();
      for (const [key, enc] of Object.entries(patches)) {
        const patch = await decodePatch(enc);
        cache.patches.set(patch, enc);
        m.set(key, patch);
      }
      layers.set(layer, m);
    }
    stacks.set(stackKey, { base, layers });
  }
  return { stepFt: file.stepFt, biomePalette: [...file.biomePalette], stacks };
}

/** The terrain for the map file: blocks seen before keep their encoding, only new ones are encoded. */
export async function encodeTerrain(t: TerrainState, cache: EncodeCache, encode: (b: RasterBlock) => Promise<EncodedBlock> = encodeBlock): Promise<Terrain> {
  const blockOf = async (b: RasterBlock) => {
    let enc = cache.blocks.get(b);
    if (!enc) cache.blocks.set(b, (enc = await encode(b)));
    return enc;
  };
  const patchOf = async (p: RasterPatch) => {
    let enc = cache.patches.get(p);
    if (!enc) cache.patches.set(p, (enc = await encodePatch(p)));
    return enc;
  };
  const stacks: Terrain['stacks'] = {};
  for (const [stackKey, stack] of t.stacks) {
    const base: Record<string, EncodedBlock> = {};
    for (const [key, b] of stack.base) base[key] = await blockOf(b);
    const layers: Record<string, Record<string, EncodedPatch>> = {};
    for (const [layer, patches] of stack.layers) {
      layers[layer] = {};
      for (const [key, p] of patches) layers[layer][key] = await patchOf(p);
    }
    stacks[stackKey] = { base, ...(stack.layers.size ? { layers } : {}) };
  }
  return { stepFt: t.stepFt, biomePalette: [...t.biomePalette], stacks };
}
