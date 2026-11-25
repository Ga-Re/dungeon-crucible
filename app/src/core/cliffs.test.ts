import { describe, expect, it } from 'vitest';
import { isInside } from './poly/fog';
import { belowCliff, sightBlockers, type Wall } from './scene';
import { visiblePolygons, updateVision } from './vision';
import { createSampleScene } from '../sample/crypt';
import { readDocument } from './documents';
import { MAP_VERSION, MapSidecarSchema } from './sidecar';
import { DEFAULT_GRID } from './grid';

/**
 * Cliffs and galleries (DC-014, T-193): one way. The upper side is left of the drawing direction;
 * from there one sees down, from below one does not see up. Light behaves like sight.
 */
// Drawn left to right along y = 800: the upper side is y < 800 (the map's y points down).
const cliff: Wall = { id: 'c', kind: 'cliff', x1: 0, y1: 800, x2: 3000, y2: 800 };

const open = () => {
  const s = createSampleScene();
  s.walls = [cliff];
  s.lights = [];
  s.tokens = [];
  return s;
};
const pc = (x: number, y: number, o: Partial<ReturnType<typeof createSampleScene>['tokens'][number]> = {}) => ({
  id: 'p', name: 'P', label: 'P', kind: 'pc' as const, x, y, size: 1, ringColor: '#ffffff', visionFt: 60, hp: 10, maxHp: 10, ac: 10, initiative: 10, conditions: [], ...o,
});

describe('cliffs: which side is below', () => {
  it('the upper side is left of the drawing direction', () => {
    expect(belowCliff(cliff, { x: 500, y: 700 })).toBe(false);
    expect(belowCliff(cliff, { x: 500, y: 900 })).toBe(true);
    // Drawn the other way round, the sides swap.
    const flipped = { ...cliff, x1: cliff.x2, x2: cliff.x1 };
    expect(belowCliff(flipped, { x: 500, y: 900 })).toBe(false);
  });

  it('blocks only viewers below it', () => {
    expect(sightBlockers([cliff], { x: 500, y: 700 })).toEqual([]);
    expect(sightBlockers([cliff], { x: 500, y: 900 })).toEqual([cliff]);
  });

  it('a viewer exactly on the edge counts as above', () => {
    expect(sightBlockers([cliff], { x: 500, y: 800 })).toEqual([]);
  });
});

describe('cliffs: sight and light', () => {
  it('from above one sees down; from below not up (darkvision)', () => {
    const s = open();
    s.tokens = [pc(1000, 700)];
    expect(isInside(visiblePolygons(updateVision(s)), [1000, 900])).toBe(true);
    s.tokens = [pc(1000, 900)];
    const below = visiblePolygons(updateVision(s));
    expect(isInside(below, [1000, 700])).toBe(false);
    expect(isInside(below, [1100, 950])).toBe(true);
  });

  it('on a lit map too', () => {
    const s = open();
    s.ambient = 'lit';
    s.tokens = [pc(1000, 900, { visionFt: 0 })];
    expect(isInside(visiblePolygons(updateVision(s)), [1000, 500])).toBe(false);
    s.tokens = [pc(1000, 500, { visionFt: 0 })];
    expect(isInside(visiblePolygons(updateVision(s)), [1000, 1100])).toBe(true);
  });

  it('a light below does not light the plateau; a light above lights below', () => {
    const s = open();
    // A viewer far above, without darkvision, looking down at both places.
    s.tokens = [pc(1000, 100, { visionFt: 0 })];
    s.lights = [{ id: 'l', x: 2000, y: 900, brightFt: 20, dimFt: 40, color: '#ffaa00', on: true }];
    let v = visiblePolygons(updateVision(s));
    expect(isInside(v, [2000, 950])).toBe(true);
    expect(isInside(v, [2000, 750])).toBe(false);
    s.lights = [{ id: 'l', x: 2000, y: 700, brightFt: 20, dimFt: 40, color: '#ffaa00', on: true }];
    v = visiblePolygons(updateVision(s));
    expect(isInside(v, [2000, 750])).toBe(true);
    expect(isInside(v, [2000, 900])).toBe(true);
  });
});

describe('map files version 3', () => {
  const v2 = {
    kind: 'map', schemaVersion: 2, name: 'Old', resource: 'a.png', isVideo: false, widthPx: 100, heightPx: 100, grid: DEFAULT_GRID,
    walls: [{ id: 'w', kind: 'wall', x1: 0, y1: 0, x2: 10, y2: 0 }],
  };

  it('reads a version 2 map as version 3, walls unchanged', () => {
    const r = readDocument('map', MapSidecarSchema, JSON.stringify(v2));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.schemaVersion).toBe(MAP_VERSION);
      expect(r.value.walls).toEqual(v2.walls);
    }
  });

  it('keeps cliffs', () => {
    const r = readDocument('map', MapSidecarSchema, JSON.stringify({ ...v2, schemaVersion: 3, walls: [{ id: 'c', kind: 'cliff', x1: 0, y1: 0, x2: 10, y2: 0 }] }));
    expect(r.ok && r.value.walls[0].kind).toBe('cliff');
  });
});
