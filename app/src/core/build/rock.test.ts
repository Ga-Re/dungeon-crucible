import { describe, expect, it } from 'vitest';
import { isInside } from '../poly/fog';
import type { Masonry } from './masonry';
import { rockArea } from './rock';

const ring = (id: string, pts: [number, number][], extra: Partial<Masonry> = {}): Masonry => ({
  id, points: pts.map(([x, y]) => ({ x, y })), closed: true, style: 'cave-rock', thickness: 14, seed: 1, ...extra,
});
const area = { x: 0, y: 0, w: 1000, h: 1000 };
const square = (x0: number, y0: number, s: number): [number, number][] => [[x0, y0], [x0 + s, y0], [x0 + s, y0 + s], [x0, y0 + s]];
const inRock = (r: ReturnType<typeof rockArea>, x: number, y: number) => isInside(r, [x, y]);

describe('solid rock beside drawn walls (DC-119f)', () => {
  it('no solid side: no rock', () => {
    expect(rockArea([ring('a', square(100, 100, 200))], area)).toEqual([]);
  });

  it('a cave ring with rock outside: everything around it is rock, the inside stays open', () => {
    const r = rockArea([ring('a', square(300, 300, 200), { solid: 'outside' })], area);
    expect(inRock(r, 400, 400)).toBe(false);
    expect(inRock(r, 100, 100)).toBe(true);
    expect(inRock(r, 900, 900)).toBe(true);
  });

  it('with a reach the rock only hugs the ring', () => {
    const r = rockArea([ring('a', square(300, 300, 200), { solid: 'outside', solidReach: 100 })], area);
    expect(inRock(r, 400, 400)).toBe(false);
    expect(inRock(r, 250, 400)).toBe(true);
    expect(inRock(r, 100, 100)).toBe(false);
  });

  it('a ring with rock inside is a block (a pillar in a cave)', () => {
    const r = rockArea([ring('cave', square(100, 100, 600), { solid: 'outside' }), ring('pillar', square(350, 350, 100), { solid: 'inside' })], area);
    expect(inRock(r, 200, 200)).toBe(false);
    expect(inRock(r, 400, 400)).toBe(true);
    expect(inRock(r, 50, 50)).toBe(true);
  });

  it('two caves never fill each other', () => {
    const r = rockArea([ring('a', square(100, 100, 200), { solid: 'outside' }), ring('b', square(600, 600, 200), { solid: 'outside' })], area);
    expect(inRock(r, 200, 200)).toBe(false);
    expect(inRock(r, 700, 700)).toBe(false);
    expect(inRock(r, 500, 500)).toBe(true);
  });

  it('stays inside the map area; open lines are ignored', () => {
    const r = rockArea([ring('a', square(300, 300, 200), { solid: 'outside' }), { ...ring('line', square(0, 0, 50), { solid: 'inside' }), closed: false }], area);
    for (const p of r) for (const [x, y] of p.outer) {
      expect(x).toBeGreaterThanOrEqual(-0.01);
      expect(x).toBeLessThanOrEqual(1000.01);
      expect(y).toBeGreaterThanOrEqual(-0.01);
      expect(y).toBeLessThanOrEqual(1000.01);
    }
    expect(inRock(r, 25, 25)).toBe(true);
  });
});

describe('solid rock: robustness (DC-119f review)', () => {
  it('does not depend on which way round a ring runs', () => {
    const cw = rockArea([ring('a', square(300, 300, 200), { solid: 'outside', solidReach: 100 })], area);
    const ccw = rockArea([ring('a', [...square(300, 300, 200)].reverse(), { solid: 'outside', solidReach: 100 })], area);
    for (const [x, y] of [[400, 400], [250, 400], [100, 100], [560, 560]]) expect(inRock(ccw, x, y)).toBe(inRock(cw, x, y));
  });

  it('a ring without area carries no rock', () => {
    expect(rockArea([ring('flat', [[0, 0], [100, 0], [200, 0]], { solid: 'outside', solidReach: 50 })], area)).toEqual([]);
  });
});
