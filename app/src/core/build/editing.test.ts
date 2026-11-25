import { describe, expect, it } from 'vitest';
import { DEFAULT_GRID } from '../grid';
import { doorPlacement, hitDoor, hitMasonry, hitVertex, insertPoint, joinEnds, movePoint, projectOnto, removePoint, removeWall, slideDoor, snapBuildPoint, splitAt } from './editing';
import type { BuildDoor, Masonry } from './masonry';

const grid = { ...DEFAULT_GRID, cellWidth: 70, cellHeight: 70, originX: 0, originY: 0 };
const pt = (x: number, y: number) => ({ x, y });
const wall = (id: string, pts: [number, number][], closed = false): Masonry => ({ id, points: pts.map(([x, y]) => pt(x, y)), closed, style: 'dungeon-stone', thickness: 14, seed: 1 });
const door = (id: string, w: string, at: number): BuildDoor => ({ id, wall: w, at, width: 70, secret: false, crack: false });

describe('snapBuildPoint', () => {
  it('snaps to grid corners, half cells, or not at all', () => {
    expect(snapBuildPoint(pt(80, 30), { mode: 'grid', grid, magnets: [], tol: 5 })).toEqual(pt(70, 0));
    expect(snapBuildPoint(pt(80, 30), { mode: 'half', grid, magnets: [], tol: 5 })).toEqual(pt(70, 35));
    expect(snapBuildPoint(pt(80, 30), { mode: 'free', grid, magnets: [], tol: 5 })).toEqual(pt(80, 30));
  });

  it('prefers a nearby point of another wall', () => {
    expect(snapBuildPoint(pt(102, 98), { mode: 'grid', grid, magnets: [pt(100, 100)], tol: 5 })).toEqual(pt(100, 100));
  });

  it('turns in 45° steps from the last point in angle mode', () => {
    const q = snapBuildPoint(pt(100, 8), { mode: 'angle', grid, from: pt(0, 0), magnets: [], tol: 5 });
    expect(q.y).toBeCloseTo(0);
    expect(q.x).toBeCloseTo(100);
    const d = snapBuildPoint(pt(100, 90), { mode: 'angle', grid, from: pt(0, 0), magnets: [], tol: 5 });
    expect(d.x).toBeCloseTo(d.y);
  });
});

describe('hits', () => {
  const ws = [wall('a', [[0, 0], [140, 0], [140, 140]])];

  it('finds points, lines and doors', () => {
    expect(hitVertex(ws, pt(141, 2), 5)).toEqual({ wall: 'a', index: 1 });
    expect(hitVertex(ws, pt(70, 2), 5)).toBeNull();
    expect(hitMasonry(ws, pt(70, 3), 5)).toMatchObject({ wall: 'a', at: 70 });
    expect(hitMasonry(ws, pt(70, 30), 5)).toBeNull();
    expect(hitDoor(ws, [door('d', 'a', 70)], pt(75, 2), 10)).toBe('d');
  });

  it('projects onto a wall as a distance along it', () => {
    expect(projectOnto(ws[0], pt(150, 70))).toMatchObject({ at: 210, dist: 10 });
  });
});

describe('editing points', () => {
  it('inserts a point on the line, keeping doors where they are', () => {
    const ws = [wall('a', [[0, 0], [200, 0]])];
    const out = insertPoint(ws, 'a', pt(100, 4));
    expect(out.masonry[0].points).toEqual([pt(0, 0), pt(100, 0), pt(200, 0)]);
    expect(out.index).toBe(1);
  });

  it('moves a point; doors keep their place on the wall', () => {
    const ws = [wall('a', [[0, 0], [140, 0], [140, 140]])];
    const out = movePoint(ws, [door('d', 'a', 210)], 'a', 0, pt(-70, 0));
    expect(out.masonry[0].points[0]).toEqual(pt(-70, 0));
    expect(out.doors[0].at).toBeCloseTo(280);
  });

  it('removes a point; a wall with one point left goes, with its doors', () => {
    const ws = [wall('a', [[0, 0], [140, 0], [140, 140]])];
    expect(removePoint(ws, [], 'a', 1).masonry[0].points).toEqual([pt(0, 0), pt(140, 140)]);
    const gone = removePoint([wall('b', [[0, 0], [70, 0]])], [door('d', 'b', 35)], 'b', 0);
    expect(gone.masonry).toEqual([]);
    expect(gone.doors).toEqual([]);
  });

  it('a ring keeps at least three points', () => {
    const ring = wall('r', [[0, 0], [70, 0], [70, 70]], true);
    expect(removePoint([ring], [], 'r', 0).masonry[0]).toMatchObject({ closed: false, points: [pt(70, 0), pt(70, 70)] });
  });
});

describe('split and join', () => {
  it('splits an open wall in two at a point; doors go with their half', () => {
    const ws = [wall('a', [[0, 0], [140, 0], [280, 0]])];
    const out = splitAt(ws, [door('d', 'a', 210)], 'a', 1, 'b');
    expect(out.masonry.map((w) => [w.id, w.points])).toEqual([['a', [pt(0, 0), pt(140, 0)]], ['b', [pt(140, 0), pt(280, 0)]]]);
    expect(out.doors[0]).toMatchObject({ wall: 'b', at: 70 });
  });

  it('opens a ring at a point', () => {
    const ring = wall('r', [[0, 0], [70, 0], [70, 70], [0, 70]], true);
    const out = splitAt([ring], [], 'r', 2, 'x');
    expect(out.masonry).toHaveLength(1);
    expect(out.masonry[0]).toMatchObject({ closed: false, points: [pt(70, 70), pt(0, 70), pt(0, 0), pt(70, 0), pt(70, 70)] });
  });

  it('joins two walls end to end, the doors following', () => {
    const ws = [wall('a', [[0, 0], [140, 0]]), wall('b', [[140, 0], [140, 140]])];
    const out = joinEnds(ws, [door('d', 'b', 70)], { wall: 'a', end: 'last' }, { wall: 'b', end: 'first' });
    expect(out.masonry).toHaveLength(1);
    expect(out.masonry[0].points).toEqual([pt(0, 0), pt(140, 0), pt(140, 140)]);
    expect(out.doors[0]).toMatchObject({ wall: 'a', at: 210 });
  });

  it("joining a wall's own ends closes the ring", () => {
    const ws = [wall('a', [[0, 0], [140, 0], [140, 140], [0, 0]])];
    const out = joinEnds(ws, [], { wall: 'a', end: 'last' }, { wall: 'a', end: 'first' });
    expect(out.masonry[0]).toMatchObject({ closed: true, points: [pt(0, 0), pt(140, 0), pt(140, 140)] });
  });

  it('removes a wall with its doors', () => {
    const out = removeWall([wall('a', [[0, 0], [70, 0]])], [door('d', 'a', 35)], 'a');
    expect(out).toEqual({ masonry: [], doors: [] });
  });
});

describe('doors', () => {
  const ws = [wall('a', [[0, 0], [350, 0]])];

  it('is placed on the nearest wall, centred on a cell', () => {
    expect(doorPlacement(ws, pt(120, 5), grid, 20)).toEqual({ wall: 'a', at: 105 });
    expect(doorPlacement(ws, pt(120, 60), grid, 20)).toBeNull();
    expect(doorPlacement(ws, pt(120, 5), null, 20)).toEqual({ wall: 'a', at: 120 });
  });

  it('slides along its wall', () => {
    expect(slideDoor(ws, door('d', 'a', 105), pt(260, 30), grid).at).toBeCloseTo(245);
  });
});
