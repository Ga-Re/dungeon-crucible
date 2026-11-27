import { describe, expect, it } from 'vitest';
import { DEFAULT_GRID } from '../grid';
import { hitLine, hitVertex, insertPoint, joinEnds, movePoint, projectOnto, removePoint, snapBuildPoint, splitAt, type Line } from './editing';

const grid = { ...DEFAULT_GRID, cellWidth: 70, cellHeight: 70, originX: 0, originY: 0 };
const pt = (x: number, y: number) => ({ x, y });
const line = (id: string, pts: [number, number][], closed = false): Line => ({ id, points: pts.map(([x, y]) => pt(x, y)), closed, thickness: 14 });

describe('snapBuildPoint', () => {
  it('snaps to grid corners, half cells, or not at all', () => {
    expect(snapBuildPoint(pt(80, 30), { mode: 'grid', grid, magnets: [], tol: 5 })).toEqual(pt(70, 0));
    expect(snapBuildPoint(pt(80, 30), { mode: 'half', grid, magnets: [], tol: 5 })).toEqual(pt(70, 35));
    expect(snapBuildPoint(pt(80, 30), { mode: 'free', grid, magnets: [], tol: 5 })).toEqual(pt(80, 30));
  });

  it('prefers a nearby point of another line', () => {
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
  const ls = [line('a', [[0, 0], [140, 0], [140, 140]])];

  it('finds points and lines', () => {
    expect(hitVertex(ls, pt(141, 2), 5)).toEqual({ line: 'a', index: 1 });
    expect(hitVertex(ls, pt(70, 2), 5)).toBeNull();
    expect(hitLine(ls, pt(70, 3), 5)).toMatchObject({ line: 'a', at: 70 });
    expect(hitLine(ls, pt(70, 30), 5)).toBeNull();
  });

  it('projects onto a line as a distance along it', () => {
    expect(projectOnto(ls[0], pt(150, 70))).toMatchObject({ at: 210, dist: 10 });
  });
});

describe('editing points', () => {
  it('inserts a point on the line', () => {
    const out = insertPoint([line('a', [[0, 0], [200, 0]])], 'a', pt(100, 4));
    expect(out.lines[0].points).toEqual([pt(0, 0), pt(100, 0), pt(200, 0)]);
    expect(out.index).toBe(1);
  });

  it('moves a point', () => {
    expect(movePoint([line('a', [[0, 0], [140, 0]])], 'a', 0, pt(-70, 0))[0].points[0]).toEqual(pt(-70, 0));
  });

  it('removes a point; a line with one point left goes', () => {
    expect(removePoint([line('a', [[0, 0], [140, 0], [140, 140]])], 'a', 1)[0].points).toEqual([pt(0, 0), pt(140, 140)]);
    expect(removePoint([line('b', [[0, 0], [70, 0]])], 'b', 0)).toEqual([]);
  });

  it('a ring keeps at least three points', () => {
    expect(removePoint([line('r', [[0, 0], [70, 0], [70, 70]], true)], 'r', 0)[0]).toMatchObject({ closed: false, points: [pt(70, 0), pt(70, 70)] });
  });
});

describe('split and join', () => {
  it('splits an open line in two at a point', () => {
    const out = splitAt([line('a', [[0, 0], [140, 0], [280, 0]])], 'a', 1, 'b');
    expect(out.map((w) => [w.id, w.points])).toEqual([['a', [pt(0, 0), pt(140, 0)]], ['b', [pt(140, 0), pt(280, 0)]]]);
  });

  it('opens a ring at a point', () => {
    const out = splitAt([line('r', [[0, 0], [70, 0], [70, 70], [0, 70]], true)], 'r', 2, 'x');
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ closed: false, points: [pt(70, 70), pt(0, 70), pt(0, 0), pt(70, 0), pt(70, 70)] });
  });

  it('joins two lines end to end', () => {
    const out = joinEnds([line('a', [[0, 0], [140, 0]]), line('b', [[140, 0], [140, 140]])], { line: 'a', end: 'last' }, { line: 'b', end: 'first' });
    expect(out).toHaveLength(1);
    expect(out[0].points).toEqual([pt(0, 0), pt(140, 0), pt(140, 140)]);
  });

  it("joining a line's own ends closes the ring", () => {
    const out = joinEnds([line('a', [[0, 0], [140, 0], [140, 140], [0, 0]])], { line: 'a', end: 'last' }, { line: 'a', end: 'first' });
    expect(out[0]).toMatchObject({ closed: true, points: [pt(0, 0), pt(140, 0), pt(140, 140)] });
  });
});
