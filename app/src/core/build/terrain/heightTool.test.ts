import { describe, expect, it } from 'vitest';
import { emptyTerrain, pointOf, setPoints } from './state';
import { paintRelief, paintSlope, RELIEF_MAX, RELIEF_PER_FT, reliefFtAt } from './heightTool';

/**
 * Fine height and slope (E-89, Teil B §7.2): relief in 1/16 ft, ±20 ft, never a cliff; a stroke
 * changes it once however often it passes (from its base). Modes: raise, lower, smooth, flatten to
 * the start's height, roughen, gradient from A to B. The slope mask turns a step into a ramp.
 */
const t0 = () => emptyTerrain(['temperate']);
const opts = { amountFt: 4, strength: 1, startFt: 0 };

describe('fine height', () => {
  it('raise and lower by the amount where the brush is full, less at its rim; within ±20 ft', () => {
    const t = paintRelief(t0(), 'map', [[10, 10, 1], [11, 10, 0.5]], 'raise', opts);
    expect(reliefFtAt(t, 'map', 10, 10)).toBe(4);
    expect(reliefFtAt(t, 'map', 11, 10)).toBe(2);
    const low = paintRelief(t0(), 'map', [[10, 10, 1]], 'lower', { ...opts, amountFt: 30 });
    expect(pointOf(low, 'map', 'relief', 10, 10)).toBe(-RELIEF_MAX);
    expect(RELIEF_MAX).toBe(20 * RELIEF_PER_FT);
  });

  it('flatten pulls towards the height at the start; smooth towards the neighbours', () => {
    const bumpy = setPoints(t0(), 'map', 'relief', [[10, 10, 8 * RELIEF_PER_FT], [11, 10, 0]]);
    const flat = paintRelief(bumpy, 'map', [[10, 10, 1], [11, 10, 1]], 'flatten', { ...opts, startFt: 2 });
    expect(reliefFtAt(flat, 'map', 10, 10)).toBe(2);
    expect(reliefFtAt(flat, 'map', 11, 10)).toBe(2);
    const smooth = paintRelief(bumpy, 'map', [[10, 10, 1]], 'smooth', opts);
    expect(reliefFtAt(smooth, 'map', 10, 10)).toBeLessThan(8);
    expect(reliefFtAt(smooth, 'map', 10, 10)).toBeGreaterThan(0);
  });

  it('roughen adds noise read at the place (the same stroke gives the same ground)', () => {
    const pts: [number, number, number][] = Array.from({ length: 40 }, (_, i) => [i, 5, 1]);
    const a = paintRelief(t0(), 'map', pts, 'roughen', opts);
    const b = paintRelief(t0(), 'map', pts, 'roughen', opts);
    const values = pts.map(([x, y]) => reliefFtAt(a, 'map', x, y));
    expect(values).toEqual(pts.map(([x, y]) => reliefFtAt(b, 'map', x, y)));
    expect(Math.max(...values) - Math.min(...values)).toBeGreaterThan(1);
    expect(Math.max(...values.map(Math.abs))).toBeLessThanOrEqual(4);
  });

  it('gradient lays a ramp from A\'s height to B\'s along A–B', () => {
    const t = setPoints(t0(), 'map', 'relief', [[40, 0, 8 * RELIEF_PER_FT]]);
    const pts: [number, number, number][] = Array.from({ length: 41 }, (_, i) => [i, 0, 1]);
    const ramp = paintRelief(t, 'map', pts, 'gradient', { ...opts, a: [0, 0], b: [40, 0] });
    expect(reliefFtAt(ramp, 'map', 0, 0)).toBe(0);
    expect(reliefFtAt(ramp, 'map', 20, 0)).toBeCloseTo(4, 1);
    expect(reliefFtAt(ramp, 'map', 40, 0)).toBe(8);
  });

  it('nothing to change: the same state', () => {
    const t = t0();
    expect(paintRelief(t, 'map', [[10, 10, 1]], 'flatten', opts)).toBe(t);
  });
});

describe('slope', () => {
  it('lifts the mask to the brush\'s strength; Alt takes it away', () => {
    const t = paintSlope(t0(), 'map', [[10, 10, 1], [11, 10, 0.5]], false);
    expect(pointOf(t, 'map', 'slope', 10, 10)).toBe(255);
    expect(pointOf(t, 'map', 'slope', 11, 10)).toBe(128);
    const gone = paintSlope(t, 'map', [[10, 10, 1]], true);
    expect(pointOf(gone, 'map', 'slope', 10, 10)).toBe(0);
  });
});
