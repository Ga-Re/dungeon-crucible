import { describe, expect, it } from 'vitest';
import { BLOCK_POINTS, newBlock, withPoints } from './block';
import { blockHeights, HEIGHT_HALO, HEIGHT_SIDE } from './heightField';

/** A block's height for shading (E-89): step · step height + fine height, ramps where sloped, a halo from its neighbours. */
const at = (h: Float32Array, x: number, y: number) => h[(y + HEIGHT_HALO) * HEIGHT_SIDE + x + HEIGHT_HALO]!;

describe('a block\'s heights', () => {
  it('steps and fine height add up; the halo reads the neighbours', () => {
    const own = withPoints(withPoints(newBlock(), 'step', [[5, 5, 2]]), 'relief', [[5, 5, 48]]);
    const left = withPoints(newBlock(), 'relief', [[BLOCK_POINTS - 3, 5, 160]]);
    const { heights } = blockHeights(0, 0, new Map([['0_0', own], ['-1_0', left]]), 10);
    expect(at(heights, 5, 5)).toBe(23);
    expect(at(heights, -3, 5)).toBe(10);
    expect(at(heights, 50, 50)).toBe(0);
  });

  it('where sloped, a step runs out as a ramp', () => {
    const edits: [number, number, number][] = [];
    for (let y = 0; y < BLOCK_POINTS; y++) for (let x = 0; x < 64; x++) edits.push([x, y, 1]);
    const stepped = withPoints(newBlock(), 'step', edits);
    const slopeEdits: [number, number, number][] = [];
    for (let y = 0; y < BLOCK_POINTS; y++) for (let x = 56; x < 72; x++) slopeEdits.push([x, y, 255]);
    const sloped = withPoints(stepped, 'slope', slopeEdits);
    const hard = blockHeights(0, 0, new Map([['0_0', stepped]]), 10).heights;
    const soft = blockHeights(0, 0, new Map([['0_0', sloped]]), 10).heights;
    expect([at(hard, 62, 60), at(hard, 65, 60)]).toEqual([10, 0]);
    // Across the edge the height falls in steps of about a ninth of the drop.
    expect(at(soft, 62, 60)).toBeLessThan(10);
    expect(at(soft, 65, 60)).toBeGreaterThan(0);
    expect(at(soft, 63, 60) - at(soft, 64, 60)).toBeLessThan(2);
  });
});
