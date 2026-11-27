import { describe, expect, it } from 'vitest';
import { Generations, byDistance, dirtyBlocks, haloBlocks } from './scheduler';

/** Which blocks to derive again after an edit, in which order, and which results are stale (E-53). */
describe('dirty blocks with a halo', () => {
  it('a halo in cells reaches as many blocks as it needs', () => {
    expect(haloBlocks(0)).toBe(0);
    expect(haloBlocks(2)).toBe(1);
    expect(haloBlocks(32)).toBe(1);
    expect(haloBlocks(33)).toBe(2);
  });

  it('every changed block and its neighbours within the halo, also below zero', () => {
    expect([...dirtyBlocks(['0_0'], 0)]).toEqual(['0_0']);
    expect([...dirtyBlocks(['0_0'], 1)].sort()).toEqual(['-1_-1', '-1_0', '-1_1', '0_-1', '0_0', '0_1', '1_-1', '1_0', '1_1'].sort());
    expect(dirtyBlocks(['0_0', '1_0'], 1).size).toBe(12);
  });
});

describe('order', () => {
  it('blocks nearest the focus come first', () => {
    expect(byDistance(['5_5', '0_0', '-1_0', '2_0'], { bx: 0, by: 0 })).toEqual(['0_0', '-1_0', '2_0', '5_5']);
  });
});

describe('generations', () => {
  it('only the newest job of a block may deliver', () => {
    const g = new Generations();
    const first = g.begin('0_0');
    const second = g.begin('0_0');
    const other = g.begin('1_0');
    expect(g.current('0_0', first)).toBe(false);
    expect(g.current('0_0', second)).toBe(true);
    expect(g.current('1_0', other)).toBe(true);
    g.drop('1_0');
    expect(g.current('1_0', other)).toBe(false);
  });
});
