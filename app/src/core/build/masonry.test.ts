import { describe, expect, it } from 'vitest';
import { sightBlockers } from '../scene';
import { buildGraph, deriveWalls, doorSpan, drawnBounds, foundKey, masonryOutline, pointAt, polylineLength, type BuildDoor, type Masonry } from './masonry';

const m = (id: string, points: [number, number][], closed = false): Masonry => ({
  id,
  points: points.map(([x, y]) => ({ x, y })),
  closed,
  style: 'dungeon-stone',
  thickness: 10,
  seed: 1,
});

const door = (id: string, wall: string, at: number, extra: Partial<BuildDoor> = {}): BuildDoor => ({ id, wall, at, width: 40, secret: false, crack: false, ...extra });

describe('polylines', () => {
  it('measures open and closed polylines', () => {
    const sq = m('a', [[0, 0], [100, 0], [100, 100], [0, 100]]);
    expect(polylineLength(sq.points, false)).toBe(300);
    expect(polylineLength(sq.points, true)).toBe(400);
  });

  it('finds the point and segment at a distance along it', () => {
    const l = m('a', [[0, 0], [100, 0], [100, 100]]);
    expect(pointAt(l.points, false, 50)).toEqual({ x: 50, y: 0, segment: 0 });
    expect(pointAt(l.points, false, 150)).toEqual({ x: 100, y: 50, segment: 1 });
    expect(pointAt(l.points, false, 999)).toEqual({ x: 100, y: 100, segment: 1 });
  });
});

describe('doors on walls', () => {
  const l = m('a', [[0, 0], [100, 0], [100, 100]]);

  it('spans its width around its position, on one segment', () => {
    expect(doorSpan(l, door('d', 'a', 50))).toEqual({ segment: 0, from: 30, to: 70 });
  });

  it('stays on the segment of its centre (never round a corner)', () => {
    expect(doorSpan(l, door('d', 'a', 90))).toEqual({ segment: 0, from: 60, to: 100 });
    expect(doorSpan(l, door('d', 'a', 110))).toEqual({ segment: 1, from: 100, to: 140 });
  });

  it('is narrowed to a segment shorter than the door', () => {
    const short = m('s', [[0, 0], [20, 0]]);
    expect(doorSpan(short, door('d', 's', 10))).toEqual({ segment: 0, from: 0, to: 20 });
  });
});

describe('deriveWalls', () => {
  const l = m('a', [[0, 0], [100, 0], [100, 100]]);

  it('turns every segment into a sight wall', () => {
    const walls = deriveWalls([l], [], {});
    expect(walls.map((w) => [w.kind, w.x1, w.y1, w.x2, w.y2])).toEqual([
      ['wall', 0, 0, 100, 0],
      ['wall', 100, 0, 100, 100],
    ]);
  });

  it('closes a ring', () => {
    const ring = m('r', [[0, 0], [100, 0], [100, 100]], true);
    expect(deriveWalls([ring], [], {})).toHaveLength(3);
  });

  it('cuts a gap for a door and adds the door, closed by default', () => {
    const walls = deriveWalls([l], [door('d', 'a', 50)], {});
    expect(walls.map((w) => [w.id, w.kind, w.x1, w.x2, w.open])).toEqual([
      ['a#0~0', 'wall', 0, 30, undefined],
      ['a#0~1', 'wall', 70, 100, undefined],
      ['a#1', 'wall', 100, 100, undefined],
      ['d', 'door', 30, 70, false],
    ]);
  });

  it('opens a door as the scene says; an open door blocks no sight', () => {
    const walls = deriveWalls([l], [door('d', 'a', 50)], { d: true });
    expect(walls.find((w) => w.id === 'd')?.open).toBe(true);
    expect(sightBlockers(walls, { x: 50, y: 50 }).some((w) => w.id === 'd')).toBe(false);
  });

  it('makes a secret door a secret-door wall', () => {
    const walls = deriveWalls([l], [door('d', 'a', 50, { secret: true })], {});
    expect(walls.find((w) => w.id === 'd')?.kind).toBe('secret-door');
  });

  it('ignores doors on walls that are gone', () => {
    expect(deriveWalls([l], [door('d', 'gone', 50)], {}).some((w) => w.id === 'd')).toBe(false);
  });

  it('carries the layer', () => {
    const walls = deriveWalls([{ ...l, layer: 'up' }], [door('d', 'a', 50)], {});
    expect(walls.every((w) => w.layer === 'up')).toBe(true);
  });

  it('keeps the found mark apart from the open state', () => {
    expect(foundKey('d')).toBe('d:found');
  });
});

describe('buildGraph', () => {
  it('finds end caps, corners, tees and crossings', () => {
    const g = buildGraph([
      m('a', [[0, 0], [100, 0], [100, 100]]),
      m('b', [[50, 0], [50, -50]]),
      m('c', [[100, 50], [150, 50]]),
      m('x', [[200, 0], [200, 100]]),
      m('y', [[150, 50], [250, 50]]),
    ]);
    const at = (x: number, y: number) => g.nodes.find((n) => Math.abs(n.x - x) < 0.01 && Math.abs(n.y - y) < 0.01);
    expect(at(0, 0)?.kind).toBe('end');
    expect(at(100, 0)?.kind).toBe('corner');
    expect(at(50, 0)?.kind).toBe('tee');
    expect(at(100, 50)?.kind).toBe('tee');
    expect(at(150, 50)?.kind).toBe('straight');
    expect(at(200, 50)?.kind).toBe('cross');
    expect(at(200, 50)?.valence).toBe(4);
  });

  it('has no ends on a closed ring', () => {
    const g = buildGraph([m('r', [[0, 0], [100, 0], [100, 100], [0, 100]], true)]);
    expect(g.nodes.map((n) => n.kind)).toEqual(['corner', 'corner', 'corner', 'corner']);
  });
});

describe('masonryOutline', () => {
  it('unites walls into one clean shape at corners and tees', () => {
    const shape = masonryOutline([m('a', [[0, 0], [100, 0], [100, 100]]), m('b', [[50, 0], [50, -50]])], []);
    expect(shape).toHaveLength(1);
    expect(shape[0].holes).toHaveLength(0);
  });

  it('a closed ring leaves its inside as a hole', () => {
    const shape = masonryOutline([m('r', [[0, 0], [100, 0], [100, 100], [0, 100]], true)], []);
    expect(shape).toHaveLength(1);
    expect(shape[0].holes).toHaveLength(1);
  });

  it('a door cuts the shape open', () => {
    const ring = m('r', [[0, 0], [100, 0], [100, 100], [0, 100]], true);
    const shape = masonryOutline([ring], [door('d', 'r', 50)]);
    expect(shape).toHaveLength(1);
    expect(shape[0].holes).toHaveLength(0);
  });
});

describe('drawnBounds', () => {
  it('covers everything drawn plus a margin, on whole cells, also left of and above 0', () => {
    expect(drawnBounds([m('a', [[-130, 20], [260, 90]])], 50, 2)).toEqual({ x: -250, y: -100, w: 650, h: 300 });
  });

  it('is a default area while nothing is drawn', () => {
    expect(drawnBounds([], 50, 2)).toEqual({ x: 0, y: 0, w: 1000, h: 1000 });
  });
});
