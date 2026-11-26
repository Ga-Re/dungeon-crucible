import { describe, expect, it } from 'vitest';
import { findLeaks } from './leaks';
import type { Wall } from './scene';

const w = (id: string, x1: number, y1: number, x2: number, y2: number, kind: Wall['kind'] = 'wall'): Wall => ({ id, kind, x1, y1, x2, y2 });
// A closed room 0..100 × 0..100.
const room = [w('n', 0, 0, 100, 0), w('e', 100, 0, 100, 100), w('s', 100, 100, 0, 100), w('w', 0, 100, 0, 0)];

/** The leak check of the Map Forge (DC-025, E-43). */
describe('finding leaks in walls', () => {
  it('a closed room has none', () => {
    expect(findLeaks(room, 10)).toEqual([]);
  });

  it('a small gap between two walls is one gap, not two open ends', () => {
    const walls = [w('n', 0, 0, 96, 0), ...room.slice(1)];
    expect(findLeaks(walls, 10)).toEqual([{ kind: 'gap', at: { x: 96, y: 0 }, to: { x: 100, y: 0 }, walls: ['n', 'e'] }]);
  });

  it('a wall end touching the middle of another wall is closed', () => {
    expect(findLeaks([...room, w('inner', 50, 0, 50, 100)], 10)).toEqual([]);
  });

  it('a wall standing free has two open ends', () => {
    const leaks = findLeaks([...room, w('pillar', 30, 30, 30, 60)], 10);
    expect(leaks.map((l) => l.kind)).toEqual(['end', 'end']);
    expect(leaks.every((l) => l.walls[0] === 'pillar')).toBe(true);
  });

  it('a door touching no wall is flagged once as a door, its ends not as open ends', () => {
    const leaks = findLeaks([...room, w('d', 200, 0, 240, 0, 'door')], 10);
    expect(leaks).toEqual([{ kind: 'door', at: { x: 220, y: 0 }, walls: ['d'] }]);
  });

  it('cliffs are open lines and are left alone', () => {
    expect(findLeaks([...room, w('c', 300, 0, 400, 0, 'cliff')], 10)).toEqual([]);
  });
});
