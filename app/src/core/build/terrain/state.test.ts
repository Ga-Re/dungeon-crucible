import { describe, expect, it } from 'vitest';
import { emptyPatch, newBlock, patchPoints, pointAt, withPoints } from './block';
import { encodeBlock } from './codec';
import { EncodeCache, decodeTerrain, encodeTerrain, emptyTerrain, pointOf, setPoints, shownBlock } from './state';

/** The terrain of a map at run time (E-55, E-56): decoded, never changed in place. */
describe('terrain state', () => {
  it('a new terrain starts with its biome and no blocks; points without a block have the defaults', () => {
    const t = emptyTerrain(['dungeon']);
    expect(t.stepFt).toBe(10);
    expect(t.stacks.size).toBe(0);
    expect(pointOf(t, 'map', 'step', 500, -3)).toBe(0);
    expect(pointOf(t, 'map', 'densityPlants', 0, 0)).toBe(128);
  });

  it('setting points makes the blocks they lie in, across block borders and below zero', () => {
    const t = setPoints(emptyTerrain(['temperate']), 'map', 'step', [[127, 0, 2], [128, 0, 3], [-1, -1, -4]]);
    expect([...t.stacks.get('map')!.base.keys()].sort()).toEqual(['-1_-1', '0_0', '1_0']);
    expect([pointOf(t, 'map', 'step', 127, 0), pointOf(t, 'map', 'step', 128, 0), pointOf(t, 'map', 'step', -1, -1)]).toEqual([2, 3, -4]);
  });

  it('an edit shares every block it did not touch with the state before (undo snapshots, E-56)', () => {
    const a = setPoints(emptyTerrain(['temperate']), 'map', 'water', [[0, 0, 255], [300, 0, 255]]);
    const b = setPoints(a, 'map', 'water', [[1, 0, 255]]);
    expect(b).not.toBe(a);
    expect(b.stacks.get('map')!.base.get('2_0')).toBe(a.stacks.get('map')!.base.get('2_0'));
    expect(b.stacks.get('map')!.base.get('0_0')).not.toBe(a.stacks.get('map')!.base.get('0_0'));
    expect(pointOf(a, 'map', 'water', 1, 0)).toBe(0);
    // Another stack (a storey) is shared whole.
    const c = setPoints(b, 'storey-up', 'step', [[0, 0, 1]]);
    expect(c.stacks.get('map')).toBe(b.stacks.get('map'));
  });

  it('shows a block with the patches of the active layers over it, in their order (E-58)', () => {
    const base = setPoints(emptyTerrain(['temperate']), 'map', 'step', [[0, 0, 1]]);
    const flood = patchPoints(emptyPatch(), 'water', [[0, 0, 255]]);
    const t = { ...base, stacks: new Map([['map', { ...base.stacks.get('map')!, layers: new Map([['flood', new Map([['0_0', flood]])]]) }]]) };
    expect(pointAt(shownBlock(t, 'map', '0_0', []), 'water', 0, 0)).toBe(0);
    expect(pointAt(shownBlock(t, 'map', '0_0', ['flood']), 'water', 0, 0)).toBe(255);
    // A layer's patch without a base block lies over an empty one.
    expect(pointAt(shownBlock(t, 'map', '5_5', ['flood']), 'water', 0, 0)).toBe(0);
  });
});

describe('terrain in the file', () => {
  it('round-trips; only blocks changed since reading are encoded again', async () => {
    const block = withPoints(newBlock(), 'step', [[3, 3, 2]]);
    const file = { stepFt: 5 as const, biomePalette: ['winter' as const], stacks: { map: { base: { '0_0': await encodeBlock(block), '4_-2': await encodeBlock(newBlock()) }, layers: { flood: { '0_0': { v: 1 as const, data: '', mask: '' } } } } } };
    // A real patch for the layer.
    const { encodePatch } = await import('./codec');
    file.stacks.map.layers.flood['0_0'] = await encodePatch(patchPoints(emptyPatch(), 'water', [[1, 1, 9]]));
    const cache = new EncodeCache();
    const t = await decodeTerrain(file, cache);
    expect(pointOf(t, 'map', 'step', 3, 3)).toBe(2);
    let encoded = 0;
    const counting = async (b: Parameters<typeof encodeBlock>[0]) => {
      encoded++;
      return encodeBlock(b);
    };
    expect(await encodeTerrain(t, cache, counting)).toEqual(file);
    expect(encoded).toBe(0);
    const edited = setPoints(t, 'map', 'step', [[600, -200, 1]]);
    const out = await encodeTerrain(edited, cache, counting);
    expect(encoded).toBe(1);
    expect(out.stacks.map.base['0_0']).toBe(file.stacks.map.base['0_0']);
    expect(pointOf(await decodeTerrain(out, new EncodeCache()), 'map', 'step', 600, -200)).toBe(1);
  });

  it('a broken block refuses the whole terrain', async () => {
    const file = { stepFt: 10 as const, biomePalette: ['temperate' as const], stacks: { map: { base: { '0_0': { v: 1 as const, data: 'AAAA' } } } } };
    await expect(decodeTerrain(file, new EncodeCache())).rejects.toThrow(/raster block/);
  });
});
