import { describe, expect, it } from 'vitest';
import { DEFAULT_GRID } from '../../grid';
import { BLOCK_POINTS, newBlock, withCells, withPoints } from './block';
import { biomeWeightsAtPx, blockGround, CELL_SIDE, POINT_SIDE } from './groundSample';

/** A block's ground for the splat drawing (E-88): class weights and biome weights, neighbours' first row and column included. */
const grid = { ...DEFAULT_GRID, cellWidth: 70, cellHeight: 70, originX: 0, originY: 0, rotationDeg: 0 };

describe('a block\'s ground for drawing', () => {
  it('names only the classes present; weights per point, the neighbours\' first points at the far edge', () => {
    const own = withPoints(withPoints(newBlock(), 'ground1Class', [[3, 4, 4]]), 'ground1Weight', [[3, 4, 200]]);
    const right = withPoints(withPoints(newBlock(), 'ground1Class', [[0, 7, 2]]), 'ground1Weight', [[0, 7, 90]]);
    const g = blockGround(0, 0, new Map([['0_0', own], ['1_0', right]]));
    expect([...g.classes.keys()].sort()).toEqual([2, 4]);
    expect(g.classes.get(4)![(4 * POINT_SIDE + 3) * 4]).toBe(200);
    expect(g.classes.get(2)![(7 * POINT_SIDE + BLOCK_POINTS) * 4]).toBe(90);
    // G: the weights up to and with the class (Auto first): rock (4) at 200 has Auto 55 below it.
    expect(g.classes.get(4)![(4 * POINT_SIDE + 3) * 4 + 1]).toBe(255);
    expect(g.classes.get(2)![(4 * POINT_SIDE + 3) * 4 + 1]).toBe(55);
  });

  it('biome weights per cell; places beyond the first are named where they have weight; missing blocks are the first biome', () => {
    const b = withCells(withCells(newBlock(), 'biome1', [[5, 6, 100]]), 'biome2', [[5, 6, 155]]);
    const g = blockGround(0, 0, new Map([['0_0', b]]));
    expect([...g.slots]).toEqual([1]);
    // A ring of the neighbours' cells around its own: cell (5, 6) is texel (6, 7).
    const o = (7 * CELL_SIDE + 6) * 4;
    expect([...g.biomes.slice(o, o + 4)]).toEqual([100, 155, 0, 0]);
    // The neighbours are missing: the first biome.
    const edge = (0 * CELL_SIDE + CELL_SIDE - 1) * 4;
    expect([...g.biomes.slice(edge, edge + 4)]).toEqual([255, 0, 0, 0]);
    // The left neighbour's last column is the first texel column.
    const left = withCells(newBlock(), 'biome2', [[31, 6, 255]]);
    const ring = blockGround(0, 0, new Map([['0_0', b], ['-1_0', withCells(left, 'biome1', [[31, 6, 0]])]]));
    expect(ring.biomes[(7 * CELL_SIDE + 0) * 4 + 1]).toBe(255);
    expect(biomeWeightsAtPx(new Map([['0_0', b]]), grid, { x: 5.5 * 70, y: 6.5 * 70 })).toEqual([100 / 255, 155 / 255, 0, 0]);
    expect(biomeWeightsAtPx(new Map(), grid, { x: 5.5 * 70, y: 6.5 * 70 })).toEqual([1, 0, 0, 0]);
  });
});
