import { describe, expect, it } from 'vitest';
import { jitterRing, noise2 } from './handDrawn';

describe('noise2', () => {
  it('is deterministic, in -1…1 and smooth', () => {
    expect(noise2(3.3, 7.1, 5)).toBe(noise2(3.3, 7.1, 5));
    for (let i = 0; i < 200; i++) {
      const v = noise2(i * 0.37, i * 0.11, 9);
      expect(v).toBeGreaterThanOrEqual(-1);
      expect(v).toBeLessThanOrEqual(1);
    }
    expect(Math.abs(noise2(1, 1, 2) - noise2(1.01, 1, 2))).toBeLessThan(0.1);
  });
});

describe('jitterRing', () => {
  const square: [number, number][] = [[0, 0], [100, 0], [100, 100], [0, 100]];

  it('subdivides long edges and moves points no more than the amplitude', () => {
    const out = jitterRing(square, { step: 10, amplitude: 3, scale: 20, seed: 1 });
    expect(out.length).toBeGreaterThanOrEqual(40);
    for (const [x, y] of out) {
      const d = Math.min(Math.abs(x), Math.abs(x - 100), Math.abs(y), Math.abs(y - 100));
      expect(d).toBeLessThanOrEqual(3.0001);
    }
  });

  it('is the same for the same place: editing elsewhere never makes it flicker', () => {
    const a = jitterRing(square, { step: 10, amplitude: 3, scale: 20, seed: 1 });
    expect(jitterRing(square, { step: 10, amplitude: 3, scale: 20, seed: 1 })).toEqual(a);
  });

  it('keeps corners where they are', () => {
    const out = jitterRing(square, { step: 10, amplitude: 3, scale: 20, seed: 1 });
    for (const c of square) expect(out).toContainEqual(c);
  });

  it('leaves the ring as it is with no amplitude', () => {
    expect(jitterRing(square, { step: 10, amplitude: 0, scale: 20, seed: 1 })).toEqual(square);
  });
});
