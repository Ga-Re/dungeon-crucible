import { describe, expect, it } from 'vitest';
import { chaikin, stepContours, type Contour } from './contours';

/** Cliff contours from the step raster (Teil B §11.1): marching squares at k + 0.5, the higher side on the left. */
const plateau = (x0: number, y0: number, x1: number, y1: number, k = 1) => (x: number, y: number) => (x >= x0 && x <= x1 && y >= y0 && y <= y1 ? k : 0);
const area = { x0: 0, y0: 0, x1: 20, y1: 20 };

/** The side a contour's higher ground lies on, tested a little off its first segment. */
function leftIsHigher(c: Contour, step: (x: number, y: number) => number): boolean {
  const [a, b] = [c.points[0]!, c.points[1]!];
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  // Left of the direction (y grows down): (dy, -dx).
  const lx = (a.x + b.x) / 2 + ((b.y - a.y) / len) * 0.4;
  const ly = (a.y + b.y) / 2 - ((b.x - a.x) / len) * 0.4;
  const rx = (a.x + b.x) / 2 - ((b.y - a.y) / len) * 0.4;
  const ry = (a.y + b.y) / 2 + ((b.x - a.x) / len) * 0.4;
  return step(Math.round(lx), Math.round(ly)) > step(Math.round(rx), Math.round(ry));
}

describe('step contours', () => {
  it('a plateau inside the area is one closed ring, its top on the left', () => {
    const step = plateau(5, 5, 10, 10);
    const cs = stepContours(step, area, 0);
    expect(cs).toHaveLength(1);
    expect(cs[0]!.closed).toBe(true);
    expect(leftIsHigher(cs[0]!, step)).toBe(true);
    // It runs half way between the last high and the first low point.
    for (const p of cs[0]!.points) expect(Math.min(Math.abs(p.x - 4.5), Math.abs(p.x - 10.5), Math.abs(p.y - 4.5), Math.abs(p.y - 10.5))).toBeLessThan(1e-9);
  });

  it('a pit is a ring the other way round', () => {
    const step = (x: number, y: number) => 1 - plateau(5, 5, 10, 10)(x, y);
    const cs = stepContours(step, area, 0);
    expect(cs).toHaveLength(1);
    expect(leftIsHigher(cs[0]!, step)).toBe(true);
  });

  it('an edge leaving the area is an open line', () => {
    const step = (x: number, _y: number) => (x < 8 ? 2 : 0);
    const one = stepContours(step, area, 0);
    const two = stepContours(step, area, 1);
    expect(one).toHaveLength(1);
    expect(one[0]!.closed).toBe(false);
    expect(leftIsHigher(one[0]!, step)).toBe(true);
    // A two-step drop has a contour per step.
    expect(two).toHaveLength(1);
  });

  it('nothing where the step does not change', () => {
    expect(stepContours(() => 3, area, 2)).toEqual([]);
  });
});

describe('Chaikin smoothing', () => {
  it('keeps an open line\'s ends and a ring closed', () => {
    const open = chaikin([{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 4 }], false, 2);
    expect(open[0]).toEqual({ x: 0, y: 0 });
    expect(open[open.length - 1]).toEqual({ x: 4, y: 4 });
    expect(open.length).toBeGreaterThan(3);
    const ring = chaikin([{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 4 }, { x: 0, y: 4 }], true, 1);
    expect(ring).toHaveLength(8);
  });
});
