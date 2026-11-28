import { describe, expect, it } from 'vitest';
import { DEFAULT_GRID } from '../../grid';
import { rectPolygon } from '../../fogModel';
import { cellCentresInside } from './scanline';

/** Which cells' centres lie in polygons (even-odd, holes count), by one scan per row. */
const grid = { ...DEFAULT_GRID, cellWidth: 70, cellHeight: 70, originX: 0, originY: 0, rotationDeg: 0 };
const cells = (x0: number, y0: number, x1: number, y1: number) => rectPolygon(x0 * 70, y0 * 70, x1 * 70, y1 * 70);

describe('cell centres inside polygons', () => {
  it('a rectangle of cells', () => {
    const g = cellCentresInside([cells(2, 3, 5, 4)], grid);
    expect(g.get(2, 3)).toBe(1);
    expect(g.get(4, 3)).toBe(1);
    expect(g.get(5, 3)).toBe(0);
    expect(g.get(2, 4)).toBe(0);
    expect(g.get(-50, 99)).toBe(0);
  });

  it('a hole leaves its cells out; two polygons add up', () => {
    const ring = { outer: cells(0, 0, 6, 6).outer, holes: [cells(2, 2, 4, 4).outer] };
    const g = cellCentresInside([ring, cells(10, 0, 11, 1)], grid);
    expect(g.get(1, 1)).toBe(1);
    expect(g.get(3, 3)).toBe(0);
    expect(g.get(10, 0)).toBe(1);
  });

  it('overlapping polygons never cancel each other out (secret areas may overlap)', () => {
    const g = cellCentresInside([cells(0, 0, 4, 4), cells(2, 2, 6, 6)], grid);
    expect(g.get(3, 3)).toBe(1);
    expect(g.get(5, 5)).toBe(1);
  });

  it('follows a turned grid', () => {
    const turned = { ...grid, rotationDeg: 90 };
    // Cell (0, 0) of a grid turned 90° lies left of the origin in map px.
    const g = cellCentresInside([rectPolygon(-70, 0, 0, 70)], turned);
    expect(g.get(0, 0)).toBe(1);
    expect(g.get(-1, 0)).toBe(0);
  });

  it('nothing: an empty grid', () => {
    expect(cellCentresInside([], grid).get(0, 0)).toBe(0);
  });

  it('a large ragged fog (2000 points) over 150 × 150 cells takes well under 50 ms', () => {
    const outer: [number, number][] = [];
    for (let i = 0; i < 2000; i++) {
      const a = (i / 2000) * Math.PI * 2;
      const r = 70 * (60 + 10 * Math.sin(a * 37));
      outer.push([75 * 70 + Math.cos(a) * r, 75 * 70 + Math.sin(a) * r]);
    }
    const t0 = performance.now();
    const g = cellCentresInside([{ outer, holes: [] }], grid);
    expect(performance.now() - t0).toBeLessThan(50);
    expect(g.get(75, 75)).toBe(1);
    expect(g.get(1, 1)).toBe(0);
  });
});
