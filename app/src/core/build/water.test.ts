import { describe, expect, it } from 'vitest';
import type { Cliff } from './cliffs';
import { ringArea, riverBanks, smoothLine, waterfalls, waterOutline, type Water } from './water';

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

describe('smoothLine', () => {
  it('rounds corners and keeps the ends of an open line', () => {
    const out = smoothLine([{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }], false, 1);
    expect(out[0]).toEqual({ x: 0, y: 0 });
    expect(out[out.length - 1]).toEqual({ x: 100, y: 100 });
    expect(out).toContainEqual({ x: 75, y: 0 });
    expect(out).toContainEqual({ x: 100, y: 25 });
    expect(out).not.toContainEqual({ x: 100, y: 0 });
  });

  it('closes round on a ring', () => {
    expect(smoothLine([{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }], true, 1)).toHaveLength(8);
  });
});

describe('waterOutline (organic since DC-119c)', () => {
  it('a river is one ring around both banks; the shore wobbles by the seed, within bounds', () => {
    const ring = waterOutline({ ...river([[0, 0], [200, 0]]), seed: 3 });
    const ys = ring.map((p) => p.y);
    // Width 40: banks near ±20, bays and tongues at most spine (14%) + bank (9%) wobble away.
    expect(Math.min(...ys)).toBeLessThan(-20);
    expect(Math.min(...ys)).toBeGreaterThan(-20 - 40 * 0.25);
    expect(Math.max(...ys)).toBeGreaterThan(18);
    expect(Math.max(...ys)).toBeLessThan(20 + 40 * 0.25);
    // Deterministic; another seed is another shore.
    expect(waterOutline({ ...river([[0, 0], [200, 0]]), seed: 3 })).toEqual(ring);
    expect(waterOutline({ ...river([[0, 0], [200, 0]]), seed: 4 })).not.toEqual(ring);
  });

  it('a lake is its ring, rounded and gently uneven, and stays near its shape', () => {
    const lake = { kind: 'lake' as const, points: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }], closed: true, width: 30, seed: 5 };
    const ring = waterOutline(lake);
    expect(ring.length).toBeGreaterThanOrEqual(32);
    for (const p of ring) {
      expect(Number.isFinite(p.x)).toBe(true);
      // Never further from the square than the wobble allows.
      expect(p.x).toBeGreaterThan(-30 * 0.25 - 1);
      expect(p.x).toBeLessThan(100 + 30 * 0.25 + 1);
    }
    expect(Math.abs(ringArea(ring))).toBeGreaterThan(4000);
  });
});
