import { describe, expect, it } from 'vitest';
import { outlineFromAlpha, simplifyPath } from './outline';

/** "Suggest from outline" (DC-109): the largest opaque shape of an image as a polygon. */
function grid(rows: string[]): { alpha: Uint8ClampedArray; w: number; h: number } {
  const h = rows.length;
  const w = rows[0].length;
  const alpha = new Uint8ClampedArray(w * h);
  rows.forEach((r, y) => [...r].forEach((c, x) => (alpha[y * w + x] = c === '#' ? 255 : 0)));
  return { alpha, w, h };
}

function area(p: [number, number][]): number {
  let a = 0;
  for (let i = 0; i < p.length; i++) {
    const [x1, y1] = p[i];
    const [x2, y2] = p[(i + 1) % p.length];
    a += x1 * y2 - x2 * y1;
  }
  return Math.abs(a / 2);
}

describe('outlineFromAlpha', () => {
  it('traces a filled rectangle as its four corners, in pixel units', () => {
    const g = grid(['......', '.####.', '.####.', '......']);
    const out = outlineFromAlpha(g.alpha, g.w, g.h)!;
    expect(out).toHaveLength(4);
    expect(area(out)).toBe(8);
    expect(out.map(([x]) => x).sort((a, b) => a - b)).toEqual([1, 1, 5, 5]);
  });

  it('keeps the concave corner of an L shape', () => {
    const g = grid(['##..', '##..', '####', '####']);
    const out = outlineFromAlpha(g.alpha, g.w, g.h)!;
    expect(out).toHaveLength(6);
    expect(area(out)).toBe(12);
  });

  it('takes the largest of several shapes; none for an empty image', () => {
    const g = grid(['#.....', '......', '..###.', '..###.']);
    expect(area(outlineFromAlpha(g.alpha, g.w, g.h)!)).toBe(6);
    const empty = grid(['....', '....']);
    expect(outlineFromAlpha(empty.alpha, empty.w, empty.h)).toBeNull();
  });
});

describe('simplifyPath', () => {
  it('drops points that lie (nearly) on a straight line', () => {
    const square: [number, number][] = [[0, 0], [5, 0], [10, 0.2], [10, 10], [0, 10]];
    expect(simplifyPath(square, 0.5)).toEqual([[0, 0], [10, 0.2], [10, 10], [0, 10]]);
  });
});
