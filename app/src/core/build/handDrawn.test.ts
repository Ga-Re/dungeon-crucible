import { describe, expect, it } from 'vitest';
import { floorField, jitterRing, noise2 } from './handDrawn';
import type { Masonry } from './masonry';

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

describe('floorField', () => {
  const wall = (id: string, x: number, style: Masonry['style']): Masonry => ({ id, points: [{ x, y: 0 }, { x, y: 400 }], closed: false, style, thickness: 10, seed: 1 });

  it('gives each sample the style of the nearest wall', () => {
    const f = floorField([wall('a', 0, 'brick'), wall('b', 400, 'wood')], { x: 0, y: 0, w: 400, h: 400 }, 100);
    expect(f.cols).toBe(4);
    expect(f.rows).toBe(4);
    // Sample centres at 50, 150, 250, 350.
    expect(f.styles.slice(0, 4)).toEqual(['brick', 'brick', 'wood', 'wood']);
  });

  it('is dungeon stone without walls', () => {
    const f = floorField([], { x: 0, y: 0, w: 200, h: 200 }, 100);
    expect(new Set(f.styles)).toEqual(new Set(['dungeon-stone']));
  });
});

describe('floorField against the exact search', () => {
  it('picks a wall no farther than a sample beyond the nearest', () => {
    let s = 7;
    const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    const styles: Masonry['style'][] = ['dungeon-stone', 'cave-rock', 'brick', 'wood'];
    const walls: Masonry[] = Array.from({ length: 30 }, (_, i) => ({
      id: `w${i}`, points: [{ x: rnd() * 2000, y: rnd() * 2000 }, { x: rnd() * 2000, y: rnd() * 2000 }], closed: false, style: styles[i % 4], thickness: 10, seed: i,
    }));
    const step = 40;
    const f = floorField(walls, { x: 0, y: 0, w: 2000, h: 2000 }, step);
    const seg = (px: number, py: number, w: Masonry) => {
      const [a, b] = w.points;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const t = Math.max(0, Math.min(1, ((px - a.x) * dx + (py - a.y) * dy) / (dx * dx + dy * dy)));
      return Math.hypot(px - (a.x + t * dx), py - (a.y + t * dy));
    };
    for (let r = 0; r < f.rows; r++)
      for (let c = 0; c < f.cols; c++) {
        const px = (c + 0.5) * step;
        const py = (r + 0.5) * step;
        const nearest = Math.min(...walls.map((w) => seg(px, py, w)));
        const ofStyle = Math.min(...walls.filter((w) => w.style === f.styles[r * f.cols + c]).map((w) => seg(px, py, w)));
        expect(ofStyle).toBeLessThanOrEqual(nearest + step);
      }
  });
});
