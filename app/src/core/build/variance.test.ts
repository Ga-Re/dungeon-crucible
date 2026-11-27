import { describe, expect, it } from 'vitest';
import { lineStrips, periodicNoise, variantBlobs } from './variance';


describe('periodic noise (DC-119a)', () => {
  it('repeats exactly with its period and stays in -1…1', () => {
    for (const [x, y] of [[0.3, 0.7], [5.2, 9.9], [15.01, 3.5]]) {
      const v = periodicNoise(x, y, 16, 7);
      expect(periodicNoise(x + 16, y, 16, 7)).toBeCloseTo(v, 12);
      expect(periodicNoise(x, y + 32, 16, 7)).toBeCloseTo(v, 12);
      expect(Math.abs(v)).toBeLessThanOrEqual(1);
    }
  });

  it('is deterministic and varies with the seed', () => {
    expect(periodicNoise(3.3, 4.4, 16, 7)).toBe(periodicNoise(3.3, 4.4, 16, 7));
    expect(periodicNoise(3.3, 4.4, 16, 7)).not.toBe(periodicNoise(3.3, 4.4, 16, 8));
  });
});

describe('variant blobs (DC-119a)', () => {
  it('assigns every cell a variant and a rotation the material allows', () => {
    const b = variantBlobs({ cells: 16, variants: 3, rotations: 4, seed: 5 });
    expect(b.cells).toBe(16);
    for (let y = 0; y < 16; y++)
      for (let x = 0; x < 16; x++) {
        const c = b.at(x, y);
        expect(c.variant).toBeGreaterThanOrEqual(0);
        expect(c.variant).toBeLessThan(3);
        expect([0, 1, 2, 3]).toContain(c.rotation);
      }
    const none = variantBlobs({ cells: 16, variants: 3, rotations: 1, seed: 5 });
    for (const [x, y] of [[0, 0], [7, 9]]) expect(none.at(x, y).rotation).toBe(0);
  });

  it('forms patches (neighbours mostly share a variant) and uses more than one variant', () => {
    const b = variantBlobs({ cells: 16, variants: 3, rotations: 1, seed: 5 });
    const used = new Set<number>();
    let sameNeighbour = 0;
    for (let y = 0; y < 16; y++)
      for (let x = 0; x < 16; x++) {
        used.add(b.at(x, y).variant);
        if (b.at(x, y).variant === b.at((x + 1) % 16, y).variant) sameNeighbour++;
      }
    expect(used.size).toBeGreaterThan(1);
    expect(sameNeighbour / 256).toBeGreaterThan(0.6);
  });

  it('wraps: the pattern repeats with the sheet, and one variant means no patch edges at all', () => {
    const b = variantBlobs({ cells: 8, variants: 4, rotations: 4, seed: 9 });
    expect(b.at(0, 3)).toEqual(b.at(8, 3));
    expect(b.at(5, 0)).toEqual(b.at(5, -8));
    const one = variantBlobs({ cells: 8, variants: 1, rotations: 1, seed: 9 });
    for (const [x, y] of [[0, 0], [3, 6]]) expect(one.at(x, y)).toEqual({ variant: 0, rotation: 0 });
  });
});

describe('line strips (DC-119b)', () => {
  it('walks a polyline at the given spacing with the running distance and the tangent angle', () => {
    const s = lineStrips([{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }], false, 20);
    expect(s.length).toBe(11);
    expect(s[0]).toMatchObject({ x: 0, y: 0, u: 0 });
    expect(s[0].angle).toBeCloseTo(0);
    expect(s[10].u).toBeCloseTo(200);
    expect(s[10].angle).toBeCloseTo(Math.PI / 2);
    // u grows by the spacing.
    for (let i = 1; i < s.length; i++) expect(s[i].u - s[i - 1].u).toBeCloseTo(20);
    // The corner lies on the line.
    const corner = s.find((p) => Math.abs(p.u - 100) < 1)!;
    expect(corner.x).toBeCloseTo(100);
    expect(corner.y).toBeCloseTo(0);
  });

  it('a closed ring walks all the way round and ends where it began', () => {
    const ring = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }];
    const s = lineStrips(ring, true, 50);
    expect(s[0].u).toBe(0);
    expect(s[s.length - 1].u).toBeCloseTo(400);
    expect(s[s.length - 1].x).toBeCloseTo(0);
    expect(s[s.length - 1].y).toBeCloseTo(0);
  });

  it('too few points give nothing', () => {
    expect(lineStrips([{ x: 1, y: 2 }], false, 10)).toEqual([]);
    expect(lineStrips([], true, 10)).toEqual([]);
  });
});
