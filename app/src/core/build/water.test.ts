import { describe, expect, it } from 'vitest';
import type { Cliff } from './cliffs';
import { riverBanks, waterfalls, type Water } from './water';

const river = (points: [number, number][], extra: Partial<Water> = {}): Water => ({ id: 'r', kind: 'river', points: points.map(([x, y]) => ({ x, y })), closed: false, width: 40, seed: 1, ...extra });
const cliff = (points: [number, number][], extra: Partial<Cliff> = {}): Cliff => ({ id: 'c', points: points.map(([x, y]) => ({ x, y })), closed: false, kind: 'rock', form: 'edge', steep: true, width: 70, steps: 3, inside: 'low', growth: false, seed: 1, ...extra });

describe('riverBanks', () => {
  it('are the river line moved half its width to each side', () => {
    const { left, right } = riverBanks(river([[0, 0], [100, 0]]));
    expect(left).toEqual([{ x: 0, y: -20 }, { x: 100, y: -20 }]);
    expect(right).toEqual([{ x: 0, y: 20 }, { x: 100, y: 20 }]);
  });
});

describe('waterfalls (automatic where a river falls over a cliff, E-35)', () => {
  // A cliff along y = 100 drawn left to right: its upper side is above (y < 100).
  const edge = cliff([[0, 100], [400, 100]]);

  it('where a river flows from the upper to the lower side', () => {
    const falls = waterfalls([river([[200, 0], [200, 200]])], [edge]);
    expect(falls).toHaveLength(1);
    expect(falls[0]).toMatchObject({ water: 'r', x: 200, y: 100, width: 40 });
    // It falls downwards on the map: along +y.
    expect(falls[0].angle).toBeCloseTo(Math.PI / 2);
  });

  it('none where it flows up the cliff (the DM gets a hint instead)', () => {
    const falls = waterfalls([river([[200, 200], [200, 0]])], [edge]);
    expect(falls).toEqual([]);
  });

  it('none at flat slopes and scree, none for lakes', () => {
    expect(waterfalls([river([[200, 0], [200, 200]])], [cliff([[0, 100], [400, 100]], { steep: false })])).toEqual([]);
    expect(waterfalls([river([[200, 0], [200, 200]])], [cliff([[0, 100], [400, 100]], { kind: 'scree', steep: false })])).toEqual([]);
    expect(waterfalls([{ ...river([[150, 50], [250, 50], [250, 150], [150, 150]]), kind: 'lake', closed: true }], [edge])).toEqual([]);
  });

  it('at each edge of terraces', () => {
    const terraces = cliff([[0, 100], [400, 100]], { form: 'terraces', steps: 3, width: 50 });
    expect(waterfalls([river([[200, 0], [200, 400]])], [terraces])).toHaveLength(3);
  });
});
