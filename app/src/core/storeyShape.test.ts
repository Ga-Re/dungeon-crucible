import { describe, expect, it } from 'vitest';
import { isInside } from './poly/fog';
import { rectPolygon } from './fogModel';
import { storeyFootprint, storeysBelow } from './storeyShape';
import type { MapStorey } from './sidecar';

const st = (id: string, level: number, footprint = [] as MapStorey['footprint']): MapStorey => ({ id, name: id, level, footprint });
const ring = (id: string, storey: string, x: number, y: number, s: number) => ({ id, points: [{ x, y }, { x: x + s, y }, { x: x + s, y: y + s }, { x, y: y + s }], closed: true, style: 'dungeon-stone' as const, thickness: 14, seed: 1, storey });

/** Storeys: footprint and what lies below (DC-020, E-40). */
describe('storey footprint', () => {
  it('is what its closed walls enclose, its floors and the area drawn by hand', () => {
    const fp = storeyFootprint(
      st('up', 1, [rectPolygon(500, 500, 600, 600)]),
      [ring('t', 'up', 0, 0, 100), ring('g', '', 200, 0, 100), { ...ring('open', 'up', 300, 0, 100), closed: false }],
      [{ id: 'f', style: 'wood', shape: [rectPolygon(0, 200, 50, 250)], seed: 1, storey: 'up' }],
    );
    expect(isInside(fp, [50, 50])).toBe(true);
    expect(isInside(fp, [250, 50])).toBe(false);
    expect(isInside(fp, [350, 50])).toBe(false);
    expect(isInside(fp, [25, 225])).toBe(true);
    expect(isInside(fp, [550, 550])).toBe(true);
  });
});

describe('storeys below', () => {
  const storeys = [st('up', 1), st('top', 2), st('cellar', -1)];
  it('from the top: the one below first, down to the map itself', () => {
    expect(storeysBelow(storeys, 'top')).toEqual(['up', '']);
  });
  it('the map itself covers everything: nothing below shows', () => {
    expect(storeysBelow(storeys, '')).toEqual([]);
  });
  it('a cellar has nothing below it here', () => {
    expect(storeysBelow(storeys, 'cellar')).toEqual([]);
  });
});
