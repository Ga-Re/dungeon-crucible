import { describe, expect, it } from 'vitest';
import type { BuildDoor, Masonry } from './masonry';
import { foundKey } from './masonry';
import { dmDrawing, playerDrawing } from './playerDrawing';

const masonry: Masonry[] = [
  { id: 'm-a', points: [{ x: 0, y: 0 }, { x: 300, y: 0 }], closed: false, style: 'dungeon-stone', thickness: 10, seed: 1 },
  { id: 'm-b', points: [{ x: 0, y: 100 }, { x: 300, y: 100 }], closed: false, style: 'wood', thickness: 8, seed: 2, layer: 'upper' },
];
const doors: BuildDoor[] = [
  { id: 'd-plain', wall: 'm-a', at: 50, width: 40, secret: false, crack: false },
  { id: 'd-secret', wall: 'm-a', at: 150, width: 40, secret: true, crack: false },
  { id: 'd-crack', wall: 'm-a', at: 250, width: 40, secret: true, crack: true },
];
const map = { masonry, masonryDoors: doors, cliffs: [], waters: [], waterAnimated: true, biome: 'nebel', layers: [{ id: 'upper', name: 'U', height: 1, defaultActive: false, editorHidden: false, locked: false }], origin: { x: -50, y: -20 }, widthPx: 400, heightPx: 200 };

describe('playerDrawing (what the TV may know)', () => {
  it('is null for a map without drawn walls', () => {
    expect(playerDrawing({ ...map, masonry: [], masonryDoors: [] }, {}, {})).toBeNull();
  });

  it('sends walls of active layers only, without ids of layers', () => {
    const d = playerDrawing(map, {}, {})!;
    expect(d.masonry.map((w) => w.id)).toEqual(['m-a']);
    expect(d.masonry[0]).not.toHaveProperty('layer');
    expect(playerDrawing(map, {}, { upper: true })!.masonry).toHaveLength(2);
  });

  it('never sends an unfound secret door; a crack only where the DM switched it on', () => {
    const d = playerDrawing(map, {}, {})!;
    expect(d.doors).toEqual([{ wall: 'm-a', at: 50, width: 40, open: false }]);
    expect(d.cracks).toEqual([{ wall: 'm-a', at: 250, width: 40 }]);
    expect(JSON.stringify(d)).not.toContain('secret');
    expect(JSON.stringify(d)).not.toContain('150');
  });

  it('a found secret door is an ordinary door, open as the scene says', () => {
    const d = playerDrawing(map, { 'd-secret': true, [foundKey('d-secret')]: true, 'd-crack': false, [foundKey('d-crack')]: true }, {})!;
    expect(d.doors).toEqual([
      { wall: 'm-a', at: 50, width: 40, open: false },
      { wall: 'm-a', at: 150, width: 40, open: true },
      { wall: 'm-a', at: 250, width: 40, open: false },
    ]);
    expect(d.cracks).toEqual([]);
  });

  it('carries the area', () => {
    expect(playerDrawing(map, {}, {})).toMatchObject({ origin: { x: -50, y: -20 }, width: 400, height: 200 });
  });
});

describe('dmDrawing', () => {
  it('shows every wall and door, secret ones marked', () => {
    const d = dmDrawing(map, {})!;
    expect(d.masonry).toHaveLength(2);
    expect(d.doors.map((x) => [x.at, x.secret])).toEqual([[50, false], [150, true], [250, true]]);
  });
});

describe('a drawn map without walls yet', () => {
  it('still has its drawing (its area) for the TV and the DM', () => {
    const empty = { ...map, masonry: [], masonryDoors: [], drawn: true };
    expect(playerDrawing(empty, {}, {})).toEqual({ origin: { x: -50, y: -20 }, width: 400, height: 200, biome: 'nebel', lightAngle: 45, masonry: [], doors: [], cracks: [], cliffs: [], waters: [], waterAnimated: true });
    expect(dmDrawing(empty, {})).not.toBeNull();
  });

  it('the DM sees in a scene only the walls of its active layers', () => {
    expect(dmDrawing(map, {}, {})!.masonry.map((w) => w.id)).toEqual(['m-a']);
  });
});

describe('cliffs for the TV (E-34)', () => {
  const cl = (id: string, layer?: string) => ({ id, points: [{ x: 0, y: 0 }, { x: 70, y: 0 }], closed: false, kind: 'rock' as const, form: 'edge' as const, steep: true, width: 70, steps: 3, inside: 'low' as const, growth: true, seed: 1, ...(layer ? { layer } : {}) });

  it('sends those on active layers, without their layer', () => {
    const d = playerDrawing({ ...map, masonry: [], masonryDoors: [], cliffs: [cl('a'), cl('b', 'upper')] }, {}, {})!;
    expect(d.cliffs.map((c) => c.id)).toEqual(['a']);
    expect(d.cliffs[0]).not.toHaveProperty('layer');
    expect(d.biome).toBe('nebel');
  });
});

describe('cliffs take the biome of the area they lie in (E-34)', () => {
  const cl = { id: 'a', points: [{ x: 10, y: 10 }, { x: 60, y: 10 }], closed: false, kind: 'rock' as const, form: 'edge' as const, steep: true, width: 70, steps: 3, inside: 'low' as const, growth: true, seed: 1 };
  const square = [{ outer: [[0, 0], [100, 0], [100, 100], [0, 100]] as [number, number][], holes: [] }];
  const m = { ...map, masonry: [], masonryDoors: [], cliffs: [cl] };

  it('for the DM, any area', () => {
    expect(dmDrawing(m, {}, undefined, [{ shape: square, biome: 'schnee', secret: true }])!.cliffs[0].biome).toBe('schnee');
  });

  it('for the TV, not an undiscovered secret area (its biome would give it away)', () => {
    expect(playerDrawing(m, {}, {}, [{ shape: square, biome: 'schnee', secret: true, discovered: false }])!.cliffs[0].biome).toBeUndefined();
    expect(playerDrawing(m, {}, {}, [{ shape: square, biome: 'schnee', secret: true, discovered: true }])!.cliffs[0].biome).toBe('schnee');
    expect(playerDrawing(m, {}, {}, [{ shape: square, biome: 'wueste', secret: false }])!.cliffs[0].biome).toBe('wueste');
  });

  it("outside any area: none (the map's biome)", () => {
    expect(playerDrawing({ ...m, cliffs: [{ ...cl, points: [{ x: 500, y: 500 }, { x: 560, y: 500 }] }] }, {}, {}, [{ shape: square, biome: 'schnee', secret: false }])!.cliffs[0].biome).toBeUndefined();
  });
});

describe('water for the TV (E-35)', () => {
  it('sends water on active layers with the animation switch', () => {
    const w = (id: string, layer?: string) => ({ id, kind: 'lake' as const, points: [{ x: 0, y: 0 }, { x: 70, y: 0 }, { x: 70, y: 70 }], closed: true, width: 40, seed: 1, ...(layer ? { layer } : {}) });
    const d = playerDrawing({ ...map, masonry: [], masonryDoors: [], waters: [w('a'), w('b', 'upper')], waterAnimated: false }, {}, {})!;
    expect(d.waters.map((x) => x.id)).toEqual(['a']);
    expect(d.waterAnimated).toBe(false);
  });
});

describe('windows, wall height and light for the TV (E-35)', () => {
  it('a window is always shown, marked as one; walls carry height and fortification; the map its light', () => {
    const wall = { id: 'm-w', points: [{ x: 0, y: 0 }, { x: 300, y: 0 }], closed: false, style: 'brick' as const, thickness: 10, seed: 1, height: 40, fortified: true };
    const win = { id: 'w', wall: 'm-w', at: 50, width: 40, secret: true, crack: false, window: true };
    const d = playerDrawing({ ...map, masonry: [wall], masonryDoors: [win], lightAngle: 120 }, {}, {})!;
    expect(d.doors).toEqual([{ wall: 'm-w', at: 50, width: 40, open: false, window: true }]);
    expect(d.masonry[0]).toMatchObject({ height: 40, fortified: true });
    expect(d.lightAngle).toBe(120);
  });
});
