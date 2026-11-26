import { describe, expect, it } from 'vitest';
import { fogOptions } from './fogOptions';

const look = { softEdges: true, fadeSeconds: 0.65, quality: 'medium' as const, edge: 1.2, motion: 1, speed: 5, coverFrom: 'middle' as const };
const base = { look, cellSizePx: 70, seedKey: 'map', effect: { biome: 'nebel', strength: 1 }, opacity: 1, quick: false };

describe('fog options', () => {
  it('a change of fog fades and spreads as the device says', () => {
    const o = fogOptions(base);
    expect(o.fade).toBe(650);
    expect(o.speed).toBeDefined();
  });

  it('another scene (DC-105): its fog at once – no fade, no spread from the scene before', () => {
    const o = fogOptions({ ...base, jump: true });
    expect(o.fade).toBe(0);
    expect(o.speed).toBeUndefined();
  });
});
