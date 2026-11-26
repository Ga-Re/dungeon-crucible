import { describe, expect, it } from 'vitest';
import { belowCliff, sightBlockers } from '../scene';
import { cliffEdges, cliffSightWalls, offsetPolyline, type Cliff } from './cliffs';

const cliff = (patch: Partial<Cliff>): Cliff => ({ id: 'c', points: [{ x: 0, y: 0 }, { x: 200, y: 0 }], closed: false, kind: 'rock', form: 'edge', steep: true, width: 70, steps: 3, inside: 'low', growth: true, seed: 1, ...patch });

describe('offsetPolyline', () => {
  it('moves a line to its left (map y points down: left of → is up)', () => {
    expect(offsetPolyline([{ x: 0, y: 0 }, { x: 100, y: 0 }], false, 10)).toEqual([{ x: 0, y: -10 }, { x: 100, y: -10 }]);
  });

  it('keeps corners mitred', () => {
    const out = offsetPolyline([{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }], false, 10);
    expect(out[1].x).toBeCloseTo(110);
    expect(out[1].y).toBeCloseTo(-10);
  });
});

describe('cliffEdges (upper side to the left of each edge)', () => {
  it('an edge is the line itself', () => {
    const [e] = cliffEdges(cliff({}));
    expect(e.points).toEqual([{ x: 0, y: 0 }, { x: 200, y: 0 }]);
  });

  it('a ravine has two edges, both looking down into it', () => {
    const edges = cliffEdges(cliff({ form: 'ravine', width: 100 }));
    expect(edges).toHaveLength(2);
    // Each edge's lower side is the ravine's middle line.
    for (const e of edges) {
      const [a, b] = e.points;
      expect(belowCliff({ x1: a.x, y1: a.y, x2: b.x, y2: b.y }, { x: 100, y: 0 })).toBe(true);
    }
  });

  it('terraces are steps side by side, all looking the same way', () => {
    const edges = cliffEdges(cliff({ form: 'terraces', steps: 3, width: 50 }));
    expect(edges.map((e) => e.points[0].y)).toEqual([0, 50, 100]);
  });

  it('a pit looks inwards, a plateau outwards – whichever way the ring was drawn', () => {
    const square = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }];
    for (const points of [square, [...square].reverse()]) {
      const [pit] = cliffEdges(cliff({ points, closed: true, form: 'ring', inside: 'low' }));
      const seg = (e: typeof pit) => ({ x1: e.points[0].x, y1: e.points[0].y, x2: e.points[1].x, y2: e.points[1].y });
      expect(belowCliff(seg(pit), { x: 50, y: 50 })).toBe(true);
      const [plateau] = cliffEdges(cliff({ points, closed: true, form: 'ring', inside: 'high' }));
      expect(belowCliff(seg(plateau), { x: 50, y: 50 })).toBe(false);
    }
  });
});

describe('cliffSightWalls', () => {
  it('a steep cliff blocks sight from below, not from above', () => {
    const walls = cliffSightWalls([cliff({})]);
    expect(walls.every((w) => w.kind === 'cliff')).toBe(true);
    expect(sightBlockers(walls, { x: 100, y: 50 })).toHaveLength(walls.length);
    expect(sightBlockers(walls, { x: 100, y: -50 })).toHaveLength(0);
  });

  it('a flat slope and scree block nothing', () => {
    expect(cliffSightWalls([cliff({ steep: false }), cliff({ id: 'd', kind: 'scree' })])).toEqual([]);
  });

  it('carries the layer and closes rings', () => {
    const ring = cliff({ points: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }], closed: true, form: 'ring', layer: 'up' });
    const walls = cliffSightWalls([ring]);
    expect(walls).toHaveLength(3);
    expect(walls.every((w) => w.layer === 'up')).toBe(true);
  });
});
