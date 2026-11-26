import { describe, expect, it } from 'vitest';
import type { Drawing } from '../core/build/playerDrawing';
import { paintKey } from './mapBinding';

const base: Drawing = { origin: { x: 0, y: 0 }, width: 700, height: 700, biome: 'nebel', masonry: [], doors: [], cracks: [], cliffs: [], waters: [], waterAnimated: true, lightAngle: 45, autoShore: true, autoGrowth: true, floors: [] };
const cliff = { id: 'c', points: [{ x: 0, y: 0 }, { x: 70, y: 0 }], closed: false, kind: 'rock' as const, form: 'edge' as const, steep: true, width: 70, steps: 3, inside: 'low' as const, growth: true, seed: 1 };

describe('paintKey (whether a drawn map is painted again)', () => {
  it('changes with cliffs and the biome (E-34)', () => {
    expect(paintKey({ ...base, cliffs: [cliff] }, 70)).not.toBe(paintKey(base, 70));
    expect(paintKey({ ...base, biome: 'schnee' }, 70)).not.toBe(paintKey(base, 70));
    expect(paintKey({ ...base, waters: [{ id: 'w', kind: 'lake', points: [{ x: 0, y: 0 }, { x: 70, y: 0 }, { x: 0, y: 70 }], closed: true, width: 40, seed: 1 }] }, 70)).not.toBe(paintKey(base, 70));
  });

  it('stays the same when only a door opens: doors are drawn apart', () => {
    const shut = { ...base, doors: [{ wall: 'w', at: 10, width: 70, open: false }] };
    expect(paintKey({ ...shut, doors: [{ ...shut.doors[0], open: true }] }, 70)).toBe(paintKey(shut, 70));
  });
});
