import { describe, expect, it } from 'vitest';
import { rectPolygon } from '../../fogModel';
import { DEFAULT_GRID } from '../../grid';
import { emptyPatch, newBlock, patchPoints, pointAt, withPoints, type RasterBlock } from './block';
import { emptyTerrain, setPoints, type TerrainState } from './state';
import { parseRasterBatch, RASTER_BATCH, rasterBatches, rasterChecksum, RasterCache, SentBlocks, tvRaster, type RasterView } from './tvRaster';

/**
 * What of the terrain the TV may know (E-61, decided 2026-11-27): only what is explored – revealed
 * or remembered – plus two cells around it, never an undiscovered secret area, the patches of
 * active layers laid in, only the storey shown.
 */
const grid = { ...DEFAULT_GRID, cellWidth: 70, cellHeight: 70, originX: 0, originY: 0, rotationDeg: 0 };
const cells = (x0: number, y0: number, x1: number, y1: number) => rectPolygon(x0 * 70, y0 * 70, x1 * 70, y1 * 70);

/** Rock everywhere in the first two blocks of the map (and on a storey), so every point carries a value. */
function rocky(): TerrainState {
  const all: [number, number, number][] = [];
  for (let y = 0; y < 128; y++) for (let x = 0; x < 256; x++) all.push([x, y, 255]);
  return setPoints(setPoints(emptyTerrain(['temperate']), 'map', 'solid', all), 'storey-up', 'solid', all);
}

const view = (over: Partial<RasterView> = {}): RasterView => ({ stack: 'map', activeLayers: [], shown: [cells(0, 0, 4, 4)], hidden: [], grid, ...over });
const solidAtCell = (b: RasterBlock, cx: number, cy: number) => pointAt(b, 'solid', cx * 4 + 1, cy * 4 + 1);

describe('the TV raster', () => {
  it('holds only explored cells and two cells around them; other blocks are not sent', () => {
    const r = tvRaster(rocky(), view());
    // The margin reaches into the blocks left and above.
    expect([...r.keys()].sort()).toEqual(['-1_-1', '-1_0', '0_-1', '0_0']);
    expect(tvRaster(rocky(), view({ shown: [cells(40, 40, 44, 44)] })).has('0_0')).toBe(false);
    const b = r.get('0_0')!.block;
    expect(solidAtCell(b, 3, 3)).toBe(255);
    expect(solidAtCell(b, 5, 5)).toBe(255);
    expect(solidAtCell(b, 6, 3)).toBe(0);
    expect(solidAtCell(b, 20, 20)).toBe(0);
  });

  it('nothing explored: nothing sent', () => {
    expect(tvRaster(rocky(), view({ shown: [] })).size).toBe(0);
  });

  it('an undiscovered secret area tells nothing, also not inside the margin', () => {
    const shown = [cells(0, 0, 10, 10)];
    // Water only in the secret area (cells 4–5): none of it may reach the TV.
    const water: [number, number, number][] = [];
    for (let y = 16; y < 24; y++) for (let x = 16; x < 24; x++) water.push([x, y, 255]);
    const b = tvRaster(setPoints(rocky(), 'map', 'water', water), view({ shown, hidden: [cells(4, 4, 6, 6)] })).get('0_0')!.block;
    for (let y = 0; y < 128; y++) for (let x = 0; x < 128; x++) expect(pointAt(b, 'water', x, y), `${x},${y}`).toBe(0);
    // Its cells and the ring take the rock beside them; far cells keep theirs.
    expect(solidAtCell(b, 5, 5)).toBe(255);
    expect(solidAtCell(b, 1, 1)).toBe(255);
  });

  it('a thin or slanted secret area is caught along its whole length (review DC-125)', () => {
    const shown = [cells(0, 0, 12, 12)];
    /** Rock everywhere, water only on the points inside `secret` (what must never reach the TV). */
    const leaky = (inside: (cx: number, cy: number) => boolean) => {
      const water: [number, number, number][] = [];
      for (let y = 0; y < 48; y++) for (let x = 0; x < 48; x++) if (inside(x / 4, y / 4)) water.push([x, y, 255]);
      return setPoints(rocky(), 'map', 'water', water);
    };
    const noWater = (b: RasterBlock) => {
      for (let y = 0; y < 128; y++) for (let x = 0; x < 128; x++) expect(pointAt(b, 'water', x, y), `${x},${y}`).toBe(0);
    };
    // A slanted band under a cell wide (x + y between 10.1 and 10.6 cells): no cell centre or corner lies in it.
    const band = { outer: [[2 * 70, 8.1 * 70], [8.1 * 70, 2 * 70], [8.6 * 70, 2.1 * 70], [2.5 * 70, 8.1 * 70]] as [number, number][], holes: [] };
    const inBand = (cx: number, cy: number) => cx + cy > 10.1 && cx + cy < 10.6 && cx > 2.1 && cy > 2.1 && cx < 8 && cy < 8;
    const b = tvRaster(leaky(inBand), view({ shown, hidden: [band] })).get('0_0')!.block;
    noWater(b);
    // Filled from beside: rock stays rock.
    expect(pointAt(b, 'solid', 21, 21)).toBe(255);
    // A thin strip between cell lines (y 5.1 – 5.4 cells).
    const strip = rectPolygon(2 * 70, 5.1 * 70, 8 * 70, 5.4 * 70);
    noWater(tvRaster(leaky((cx, cy) => cx > 2 && cx < 8 && cy > 5.1 && cy < 5.4), view({ shown, hidden: [strip] })).get('0_0')!.block);
    // A thin tail running off a room.
    const tail = { outer: [[3 * 70, 3 * 70], [5 * 70, 3 * 70], [5 * 70, 4.2 * 70], [10 * 70, 4.2 * 70], [10 * 70, 4.4 * 70], [3 * 70, 4.4 * 70]] as [number, number][], holes: [] };
    noWater(tvRaster(leaky((cx, cy) => cx > 5.1 && cx < 9.9 && cy > 4.22 && cy < 4.38), view({ shown, hidden: [tail] })).get('0_0')!.block);
  });

  it('cells around a secret room take what lies beside them – the wall in front stays a wall, nothing of the room comes out', () => {
    // A corridor (open) left of a wall column (rock) at cell x 4, the secret room behind it at x 5–7.
    let t = emptyTerrain(['temperate']);
    const rock: [number, number, number][] = [];
    for (let y = 0; y < 40; y++) for (let x = 16; x < 20; x++) rock.push([x, y, 255]);
    t = setPoints(t, 'map', 'solid', rock);
    const roomWater: [number, number, number][] = [];
    for (let y = 0; y < 40; y++) for (let x = 20; x < 32; x++) roomWater.push([x, y, 255]);
    t = setPoints(t, 'map', 'water', roomWater);
    const b = tvRaster(t, view({ shown: [cells(0, 0, 5, 10)], hidden: [cells(5, 0, 8, 10)] })).get('0_0')!.block;
    // The wall column touches the room: it is filled from the nearest cell the TV may know – the corridor.
    expect(solidAtCell(b, 1, 2)).toBe(0);
    // Not a single drop of the room's water reaches the TV.
    for (let x = 0; x < 128; x++) for (let y = 0; y < 128; y++) expect(pointAt(b, 'water', x, y)).toBe(0);
  });

  it('an explored block nobody painted is named too: unknown and empty are never confused', () => {
    const r = tvRaster(emptyTerrain(['temperate']), view({ shown: [cells(-3, 3, 4, 6)] }));
    expect([...r.keys()].sort()).toEqual(['-1_0', '0_0']);
    expect(r.get('-1_0')!.checksum).toBe(r.get('0_0')!.checksum);
  });

  it('lays in the patches of active layers only', () => {
    const t = rocky();
    const flood = patchPoints(emptyPatch(), 'water', [[1, 1, 255]]);
    const stack = t.stacks.get('map')!;
    const withLayer: TerrainState = { ...t, stacks: new Map([...t.stacks, ['map', { ...stack, layers: new Map([['flood', new Map([['0_0', flood]])]]) }]]) };
    expect(pointAt(tvRaster(withLayer, view()).get('0_0')!.block, 'water', 1, 1)).toBe(0);
    expect(pointAt(tvRaster(withLayer, view({ activeLayers: ['flood'] })).get('0_0')!.block, 'water', 1, 1)).toBe(255);
  });

  it('a block made only by an active layer is sent too; a storey only on its own', () => {
    const t = emptyTerrain(['temperate']);
    const flood = patchPoints(emptyPatch(), 'water', [[1, 1, 255]]);
    const layered: TerrainState = { ...t, stacks: new Map([['map', { base: new Map(), layers: new Map([['flood', new Map([['0_0', flood]])]]) }]]) };
    expect(tvRaster(layered, view({ activeLayers: ['flood'] })).has('0_0')).toBe(true);
    expect(solidAtCell(tvRaster(rocky(), view({ stack: 'storey-up' })).get('0_0')!.block, 1, 1)).toBe(255);
    // A storey without terrain: its explored blocks are named, empty.
    expect(solidAtCell(tvRaster(rocky(), view({ stack: 'storey-gone' })).get('0_0')!.block, 1, 1)).toBe(0);
  });

  it('a turned grid: the explored area follows the grid', () => {
    const turned = { ...grid, rotationDeg: 90 };
    // Cell (0, 0) of a grid turned 90° lies left of the origin in map px.
    const r = tvRaster(rocky(), view({ grid: turned, shown: [rectPolygon(-70, 0, 0, 70)] }));
    expect(solidAtCell(r.get('0_0')!.block, 0, 0)).toBe(255);
    expect(solidAtCell(r.get('0_0')!.block, 6, 0)).toBe(0);
  });
});

describe('checksums and sending (E-61)', () => {
  it('the same content has the same checksum, any change another', () => {
    const a = withPoints(newBlock(), 'step', [[1, 1, 2]]);
    expect(rasterChecksum(a)).toMatch(/^[0-9a-f]{16}$/);
    expect(rasterChecksum(withPoints(newBlock(), 'step', [[1, 1, 2]]))).toBe(rasterChecksum(a));
    expect(rasterChecksum(withPoints(a, 'relief', [[127, 127, 1]]))).not.toBe(rasterChecksum(a));
  });

  it('the DM sends what the TV lacks and forgets before the TV does, so nothing stays black (review DC-125)', () => {
    const sent = new SentBlocks(2);
    expect(sent.take(['a', 'b'])).toEqual(['a', 'b']);
    expect(sent.take(['b', 'a'])).toEqual([]);
    expect(sent.take(['c'])).toEqual(['c']);
    // `b` was the oldest: forgotten, it goes again when a frame names it.
    expect(sent.take(['b'])).toEqual(['b']);
    sent.clear();
    expect(sent.take(['a'])).toEqual(['a']);
  });

  it('what goes out: blocks the TV lacks, in messages of at most 16, each passing the TV\'s check', () => {
    const blocks = new Map(Array.from({ length: 20 }, (_, i) => withPoints(newBlock(), 'step', [[0, 0, i]])).map((b) => [rasterChecksum(b), b] as const));
    const sent = new SentBlocks(100);
    sent.take([[...blocks.keys()][0]!]);
    const batches = rasterBatches(blocks, sent);
    expect(batches.map((b) => b.length)).toEqual([RASTER_BATCH, 3]);
    expect(rasterBatches(blocks, sent)).toEqual([]);
    expect(parseRasterBatch(batches[1]).size).toBe(3);
  });

  it('the TV takes only complete blocks whose checksum fits', () => {
    const a = withPoints(newBlock(), 'step', [[1, 1, 2]]);
    const good = { checksum: rasterChecksum(a), planes: a.planes };
    const wrongSum = { checksum: '0000000000000000', planes: a.planes };
    const short = { checksum: rasterChecksum(a), planes: { ...a.planes, step: new Int8Array(10) } };
    const wrongKind = { checksum: rasterChecksum(a), planes: { ...a.planes, relief: new Uint8Array(16384) } };
    const parsed = parseRasterBatch([good, wrongSum, short, wrongKind, 'junk', null]);
    expect([...parsed.keys()]).toEqual([good.checksum]);
    expect(parseRasterBatch('not a batch').size).toBe(0);
  });

  it('the TV resolves a frame\'s blocks from what it holds; a missing one stays unknown (black)', () => {
    const a = withPoints(newBlock(), 'step', [[1, 1, 2]]);
    const sum = rasterChecksum(a);
    const cache = new RasterCache(4);
    cache.add(new Map([[sum, a]]));
    const shown = cache.resolve({ '0_0': sum, '1_0': 'ffffffffffffffff' });
    expect(shown.get('0_0')).toBe(a);
    expect(shown.get('1_0')).toBeNull();
  });

  it('the TV keeps a limited number of blocks, those of the newest frame last', () => {
    const blocks = [1, 2, 3].map((v) => withPoints(newBlock(), 'step', [[0, 0, v]]));
    const sums = blocks.map(rasterChecksum);
    const cache = new RasterCache(2);
    cache.add(new Map([[sums[0]!, blocks[0]!], [sums[1]!, blocks[1]!]]));
    cache.resolve({ a: sums[0]! });
    cache.add(new Map([[sums[2]!, blocks[2]!]]));
    expect(cache.has(sums[0]!)).toBe(true);
    expect(cache.has(sums[1]!)).toBe(false);
    expect(cache.has(sums[2]!)).toBe(true);
  });
});

describe('speed (review DC-125)', () => {
  it('16 blocks under a ragged fog of 2000 points and a secret area of 200 points', () => {
    let t = emptyTerrain(['temperate']);
    const edits: [number, number, number][] = [];
    for (let y = 0; y < 512; y += 3) for (let x = 0; x < 512; x += 3) edits.push([x, y, (x + y) % 3]);
    t = setPoints(t, 'map', 'step', edits);
    const ring = (cx: number, cy: number, r: number, n: number, wobble: number) => ({
      outer: Array.from({ length: n }, (_, i) => {
        const a = (i / n) * Math.PI * 2;
        const rr = r * (1 + wobble * Math.sin(a * 37));
        return [cx + Math.cos(a) * rr, cy + Math.sin(a) * rr] as [number, number];
      }),
      holes: [],
    });
    const shown = [ring(64 * 70, 64 * 70, 60 * 70, 2000, 0.08)];
    const hidden = [ring(40 * 70, 40 * 70, 6 * 70, 200, 0.2)];
    const t0 = performance.now();
    const r = tvRaster(t, view({ shown, hidden }));
    const ms = performance.now() - t0;
    expect(r.size).toBeGreaterThanOrEqual(16);
    expect(ms).toBeLessThan(250);
  });
});
