import { describe, expect, it } from 'vitest';
import { closesRing, simplifyPath, strokeToLine } from './strokes';

const pt = (x: number, y: number) => ({ x, y });

describe('simplifyPath (Ramer–Douglas–Peucker)', () => {
  it('keeps the ends and drops points that lie on the line', () => {
    expect(simplifyPath([pt(0, 0), pt(10, 0.2), pt(20, -0.1), pt(30, 0)], 1)).toEqual([pt(0, 0), pt(30, 0)]);
  });

  it('keeps corners', () => {
    const out = simplifyPath([pt(0, 0), pt(50, 0), pt(100, 0), pt(100, 50), pt(100, 100)], 1);
    expect(out).toEqual([pt(0, 0), pt(100, 0), pt(100, 100)]);
  });
});

describe('strokeToLine (a hand-drawn stroke as a few editable points)', () => {
  // A wobbly stroke along y = 0, sampled every 2 px, with a bend at x = 200.
  const wobble = Array.from({ length: 101 }, (_, i) => pt(i * 2, Math.sin(i) * 0.8)).concat(Array.from({ length: 50 }, (_, i) => pt(200, (i + 1) * 2)));

  it('smooths the wobble away and keeps the bend', () => {
    const line = strokeToLine(wobble, 70);
    expect(line.length).toBeGreaterThanOrEqual(3);
    expect(line.length).toBeLessThan(12);
    expect(line[0]).toEqual(pt(0, 0));
    expect(line[line.length - 1]).toEqual(pt(200, 100));
    expect(line.some((p) => Math.abs(p.x - 200) < 12 && Math.abs(p.y) < 12)).toBe(true);
  });

  it('keeps the exact ends (so they can join other lines)', () => {
    const line = strokeToLine([pt(3, 4), pt(40, 41), pt(80, 79), pt(121, 122)], 70);
    expect(line[0]).toEqual(pt(3, 4));
    expect(line[line.length - 1]).toEqual(pt(121, 122));
  });

  it('is empty for a stroke too short to be a line', () => {
    expect(strokeToLine([pt(0, 0), pt(1, 1)], 70)).toEqual([]);
  });
});

describe('closesRing', () => {
  it('is true when a long stroke ends near its start', () => {
    const ring = [pt(0, 0), pt(200, 0), pt(200, 200), pt(0, 200), pt(5, 6)];
    expect(closesRing(ring, 20)).toBe(true);
    expect(closesRing([pt(0, 0), pt(10, 0), pt(4, 3)], 20)).toBe(false);
    expect(closesRing([pt(0, 0), pt(200, 0), pt(200, 200)], 20)).toBe(false);
  });
});
