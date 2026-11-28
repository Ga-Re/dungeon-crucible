import { describe, expect, it } from 'vitest';
import { DEFAULT_GRID, fromCellSpace } from '../../core/grid';
import { bakeLevel, bakeTransform, blocksCovering } from './terrainBake';

/** Detail levels of the terrain (Teil B §22.3, E-90): baked per block at about the screen's scale. */
const grid = { ...DEFAULT_GRID, cellWidth: 70, cellHeight: 70, originX: 0, originY: 0, rotationDeg: 0 };

describe('terrain bake', () => {
  it('bakes at the scale rounded up to a power of two, 1/16 … 1/4', () => {
    expect(bakeLevel(0.25)).toBe(0.25);
    expect(bakeLevel(0.2)).toBe(0.25);
    expect(bakeLevel(0.12)).toBe(0.125);
    expect(bakeLevel(0.01)).toBe(1 / 16);
  });

  it('bakes every block the map covers, also on a turned grid', () => {
    expect(blocksCovering(grid, { x: 0, y: 0, width: 64 * 70, height: 40 * 70 })).toEqual(['0_0', '1_0', '2_0', '0_1', '1_1', '2_1']);
    const turned = { ...grid, rotationDeg: 30, originX: 100 };
    const keys = blocksCovering(turned, { x: 0, y: 0, width: 64 * 70, height: 64 * 70 });
    for (const [cx, cy] of [[0, 0], [64, 0], [0, 64], [64, 64]] as const) {
      const p = fromCellSpace(turned, { x: cx * 0.999, y: cy * 0.999 });
      if (p.x >= 0 && p.y >= 0 && p.x <= 64 * 70 && p.y <= 64 * 70) expect(keys).toContain(`${Math.floor((cx * 0.999) / 32)}_${Math.floor((cy * 0.999) / 32)}`);
    }
  });

  it("a block's corners land on its texture's corners, the grid turned or not", () => {
    for (const g of [grid, { ...grid, rotationDeg: 30, originX: 100, originY: -40 }]) {
      const m = bakeTransform(g, 1, 2, 560, 560);
      for (const [u, v] of [[0, 0], [1, 0], [0, 1], [1, 1]] as const) {
        const p = m.apply(fromCellSpace(g, { x: (1 + u) * 32, y: (2 + v) * 32 }));
        expect(p.x).toBeCloseTo(u * 560, 3);
        expect(p.y).toBeCloseTo(v * 560, 3);
      }
    }
  });
});
