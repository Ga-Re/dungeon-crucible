import { describe, expect, it } from 'vitest';
import type { Wall } from './scene';
import { chainOf, endsAt, moveEnds, nearestEnd, removeWalls, wallAt, withoutDegenerate } from './walls';

const w = (id: string, x1: number, y1: number, x2: number, y2: number, kind: Wall['kind'] = 'wall'): Wall => ({ id, kind, x1, y1, x2, y2 });

// An L of two walls joined at (100, 0), a loose wall, and a door hanging off the L's end.
const walls: Wall[] = [
  w('a', 0, 0, 100, 0),
  w('b', 100, 0, 100, 100),
  w('c', 300, 300, 400, 300),
  w('d', 100, 100, 150, 100, 'door'),
];

describe('wallAt', () => {
  it('finds the wall nearest to the point within the tolerance', () => {
    expect(wallAt(walls, { x: 50, y: 3 }, 5)).toBe('a');
    expect(wallAt(walls, { x: 103, y: 50 }, 5)).toBe('b');
    expect(wallAt(walls, { x: 50, y: 20 }, 5)).toBeNull();
  });

  it('measures to the segment, not to its line', () => {
    expect(wallAt(walls, { x: 200, y: 0 }, 5)).toBeNull();
  });
});

describe('endsAt (joints)', () => {
  it('returns every wall end at the grabbed point', () => {
    expect(endsAt(walls, { x: 101, y: 1 }, 4)).toEqual([
      { id: 'a', end: 2 },
      { id: 'b', end: 1 },
    ]);
  });

  it('returns a single loose end', () => {
    expect(endsAt(walls, { x: 0, y: 2 }, 4)).toEqual([{ id: 'a', end: 1 }]);
  });

  it('returns nothing away from any end', () => {
    expect(endsAt(walls, { x: 50, y: 0 }, 4)).toEqual([]);
  });

  it('can be limited to some walls (Shift: only the selected wall leaves the joint)', () => {
    expect(endsAt(walls, { x: 100, y: 0 }, 4, new Set(['b']))).toEqual([{ id: 'b', end: 1 }]);
  });
});

describe('moveEnds', () => {
  it('moves every end of a joint together and leaves the other walls alone', () => {
    const moved = moveEnds(walls, endsAt(walls, { x: 100, y: 0 }, 1), { x: 120, y: -20 });
    expect(moved.find((q) => q.id === 'a')).toMatchObject({ x1: 0, y1: 0, x2: 120, y2: -20 });
    expect(moved.find((q) => q.id === 'b')).toMatchObject({ x1: 120, y1: -20, x2: 100, y2: 100 });
    expect(moved.find((q) => q.id === 'c')).toBe(walls[2]);
  });

  it('does not change the walls it was given', () => {
    moveEnds(walls, [{ id: 'a', end: 1 }], { x: 9, y: 9 });
    expect(walls[0].x1).toBe(0);
  });
});

describe('withoutDegenerate', () => {
  it('drops walls whose ends met', () => {
    const squashed = moveEnds(walls, [{ id: 'a', end: 1 }], { x: 100, y: 0 });
    expect(withoutDegenerate(squashed).map((q) => q.id)).toEqual(['b', 'c', 'd']);
  });
});

describe('chainOf', () => {
  it('follows shared ends through every kind of wall', () => {
    expect(chainOf(walls, 'a').sort()).toEqual(['a', 'b', 'd']);
    expect(chainOf(walls, 'd').sort()).toEqual(['a', 'b', 'd']);
  });

  it('is the wall alone when nothing joins it', () => {
    expect(chainOf(walls, 'c')).toEqual(['c']);
  });

  it('is empty for an unknown wall', () => {
    expect(chainOf(walls, 'x')).toEqual([]);
  });
});

describe('nearestEnd', () => {
  it('snaps a point to the nearest wall end within the tolerance', () => {
    expect(nearestEnd(walls, { x: 297, y: 302 }, 5)).toEqual({ x: 300, y: 300 });
    expect(nearestEnd(walls, { x: 290, y: 300 }, 5)).toBeNull();
  });
});

describe('removeWalls', () => {
  it('removes the given walls', () => {
    expect(removeWalls(walls, new Set(['a', 'd'])).map((q) => q.id)).toEqual(['b', 'c']);
  });
});
