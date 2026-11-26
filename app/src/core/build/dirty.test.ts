import { describe, expect, it } from 'vitest';
import { changedRegion } from './dirty';
import type { Drawing } from './playerDrawing';

const wall = (id: string, x: number, style: Drawing['masonry'][number]['style'] = 'dungeon-stone') => ({ id, points: [{ x, y: 0 }, { x, y: 700 }], closed: false, style, thickness: 14, seed: 1 });
const base: Drawing = { origin: { x: 0, y: 0 }, width: 2800, height: 700, masonry: [wall('a', 140), wall('b', 2660)], doors: [], cracks: [], cliffs: [], biome: 'nebel', waters: [], waterAnimated: true, lightAngle: 45 };

describe('changedRegion', () => {
  it('is nothing when nothing that is painted changed (door states are drawn apart)', () => {
    expect(changedRegion(base, { ...base, masonry: base.masonry.map((w) => ({ ...w })) }, 70)).toBeNull();
  });

  it('is everything when the area or the grid changes', () => {
    expect(changedRegion(base, { ...base, width: 2870 }, 70)).toBe('all');
    expect(changedRegion(base, base, 70, 60)).toBe('all');
  });

  it('covers a moved wall where it was and where it is, with room for shadow and edge', () => {
    const moved = { ...base, masonry: [wall('a', 210), base.masonry[1]] };
    const r = changedRegion(base, moved, 70);
    expect(r).not.toBe('all');
    if (r && r !== 'all') {
      expect(r.x).toBeLessThanOrEqual(140 - 7);
      expect(r.x + r.w).toBeGreaterThanOrEqual(210 + 7);
      // Far from the change nothing is repainted.
      expect(r.x + r.w).toBeLessThan(2660);
    }
  });

  it('covers the floors that follow another wall now', () => {
    const restyled = { ...base, masonry: [base.masonry[0], wall('b', 2660, 'wood')] };
    const r = changedRegion(base, restyled, 70);
    expect(r).not.toBe('all');
    // The floor near b changes with it – as far as a wall's floor reaches (3 cells), beyond lies the ground (E-34).
    if (r && r !== 'all') {
      expect(r.x).toBeLessThanOrEqual(2660 - 3 * 70);
      expect(r.x).toBeGreaterThan(140 + 3 * 70);
    }
  });

  it('covers the wall a door was added to', () => {
    const r = changedRegion(base, { ...base, doors: [{ wall: 'a', at: 350, width: 70, open: false }] }, 70);
    expect(r).not.toBeNull();
    expect(r).not.toBe('all');
  });
});

describe('changedRegion with cliffs (E-34)', () => {
  const c = { id: 'c', points: [{ x: 1400, y: 100 }, { x: 1600, y: 100 }], closed: false, kind: 'rock' as const, form: 'edge' as const, steep: true, width: 70, steps: 3, inside: 'low' as const, growth: true, seed: 1 };

  it('covers an added cliff with room for its face and growth', () => {
    const r = changedRegion(base, { ...base, cliffs: [c] }, 70);
    expect(r).not.toBe('all');
    if (r && r !== 'all') {
      expect(r.x).toBeLessThan(1400);
      expect(r.x + r.w).toBeGreaterThan(1600);
    }
  });

  it('repaints everything when the biome changes (cliffs look after it)', () => {
    expect(changedRegion(base, { ...base, biome: 'schnee' }, 70)).toBe('all');
    expect(changedRegion(base, { ...base, lightAngle: 200 }, 70)).toBe('all');
  });
});
