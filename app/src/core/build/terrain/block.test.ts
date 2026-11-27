import { describe, expect, it } from 'vitest';
import { BLOCK_CELLS, BLOCK_POINTS, applyPatches, blockKeyOf, cellAt, emptyPatch, localPoint, newBlock, patchPoints, pointAt, withCells, withPoints } from './block';

/** Raster blocks (E-55, Plan A.6): 32 × 32 cells, 128 × 128 support points, planes per channel. */
describe('a block', () => {
  it('has 128 × 128 points and 32 × 32 cells', () => {
    expect(BLOCK_POINTS).toBe(128);
    expect(BLOCK_CELLS).toBe(32);
  });

  it('starts flat and open: step, relief, rock and water 0, normal density, all of the first biome', () => {
    const b = newBlock();
    for (const ch of ['step', 'relief', 'slope', 'solid', 'solidStyle', 'water', 'ground1Class', 'ground1Weight'] as const) expect(pointAt(b, ch, 5, 7)).toBe(0);
    expect(pointAt(b, 'densityPlants', 0, 0)).toBe(128);
    expect(pointAt(b, 'densityRocks', 127, 127)).toBe(128);
    expect([cellAt(b, 'biome1', 3, 3), cellAt(b, 'biome2', 3, 3)]).toEqual([255, 0]);
  });

  it('a change makes a new block and copies only the plane it touches', () => {
    const a = newBlock();
    const b = withPoints(a, 'step', [[1, 2, 3], [127, 127, -2]]);
    expect(b).not.toBe(a);
    expect(pointAt(a, 'step', 1, 2)).toBe(0);
    expect([pointAt(b, 'step', 1, 2), pointAt(b, 'step', 127, 127)]).toEqual([3, -2]);
    expect(b.planes.water).toBe(a.planes.water);
    expect(b.planes.step).not.toBe(a.planes.step);
    const c = withCells(b, 'biome2', [[0, 31, 200]]);
    expect(cellAt(c, 'biome2', 0, 31)).toBe(200);
    expect(c.planes.step).toBe(b.planes.step);
  });

  it('values are kept within their channel: relief in 1/16 ft as int16, steps as int8', () => {
    const b = withPoints(newBlock(), 'relief', [[0, 0, 40000], [1, 0, -320]]);
    expect([pointAt(b, 'relief', 0, 0), pointAt(b, 'relief', 1, 0)]).toEqual([32767, -320]);
    expect(pointAt(withPoints(b, 'water', [[0, 0, 300]]), 'water', 0, 0)).toBe(255);
  });

  it('a point outside the block is refused', () => {
    expect(() => withPoints(newBlock(), 'step', [[128, 0, 1]])).toThrow();
    expect(() => pointAt(newBlock(), 'step', -1, 0)).toThrow();
  });
});

describe('global points and block keys', () => {
  it('a point lies in exactly one block; the area grows left and up too', () => {
    expect(blockKeyOf(0, 0)).toBe('0_0');
    expect(blockKeyOf(127, 128)).toBe('0_1');
    expect(blockKeyOf(-1, -128)).toBe('-1_-1');
    expect(blockKeyOf(-129, 0)).toBe('-2_0');
    expect(localPoint(-1, 130)).toEqual({ x: 127, y: 2 });
  });
});

describe('patches of a layer (E-58)', () => {
  it('set only the points and channels their mask names, in layer order', () => {
    const base = withPoints(newBlock(), 'step', [[0, 0, 1], [1, 0, 1]]);
    const flood = patchPoints(emptyPatch(), 'water', [[0, 0, 255]]);
    const rise = patchPoints(patchPoints(emptyPatch(), 'step', [[0, 0, 4]]), 'water', [[0, 0, 0]]);
    const out = applyPatches(base, [flood, rise]);
    expect([pointAt(out, 'step', 0, 0), pointAt(out, 'step', 1, 0)]).toEqual([4, 1]);
    // The later patch decides; a patch without the channel leaves it.
    expect(pointAt(out, 'water', 0, 0)).toBe(0);
    expect(pointAt(applyPatches(base, [flood]), 'water', 0, 0)).toBe(255);
    expect(applyPatches(base, [])).toBe(base);
  });

  it('the ground and density pairs and the biome weights go as one group each', () => {
    const p = patchPoints(emptyPatch(), 'ground1Class', [[2, 2, 7]]);
    const out = applyPatches(withPoints(newBlock(), 'ground2Weight', [[2, 2, 90]]), [p]);
    // Ground is one group: the patch's whole ground (its second weight 0) replaces the base's.
    expect([pointAt(out, 'ground1Class', 2, 2), pointAt(out, 'ground2Weight', 2, 2)]).toEqual([7, 0]);
  });
});
