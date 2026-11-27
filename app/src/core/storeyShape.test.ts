import { describe, expect, it } from 'vitest';
import { isInside } from './poly/fog';
import { rectPolygon } from './fogModel';
import { storeyFootprint, storeysBelow } from './storeyShape';
import type { MapStorey } from './sidecar';

const st = (id: string, level: number, footprint = [] as MapStorey['footprint']): MapStorey => ({ id, name: id, level, footprint });

/** Storeys: footprint and what lies below (DC-020, E-40). */
describe('storey footprint', () => {
  it('is the area drawn by hand, its parts joined', () => {
    const fp = storeyFootprint(st('up', 1, [rectPolygon(0, 0, 100, 100), rectPolygon(50, 50, 150, 150)]));
    expect(fp).toHaveLength(1);
    expect(isInside(fp, [125, 125])).toBe(true);
    expect(isInside(fp, [125, 25])).toBe(false);
    expect(storeyFootprint(st('empty', 1))).toEqual([]);
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
