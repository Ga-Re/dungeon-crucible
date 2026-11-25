import { describe, expect, it } from 'vitest';
import { DEFAULT_GRID } from './grid';
import { addShape, areaBounds, moveVertex, normalizeShape, partFromDrag, partFromPoints, vertexAt, areaContains, distanceToArea, labelPoint, migrateArea, migrateAreaOverride, subtractShape } from './areas';
import { rectPolygon } from './fogModel';

const square = (x: number, y: number, s: number) => rectPolygon(x, y, x + s, y + s);

describe('area migration (version 1 → 2)', () => {
  it('turns the rectangle into a shape and the kind into "secret"; unknown fields stay', () => {
    const v1 = { id: 'area-a', name: 'Vault', kind: 'secret', rect: { x: 10, y: 20, w: 30, h: 40 }, color: '#ffffff', biome: 'asche', note: 'keep' };
    expect(migrateArea(v1)).toEqual({ id: 'area-a', name: 'Vault', shape: [rectPolygon(10, 20, 40, 60)], secret: true, color: '#ffffff', biome: 'asche', note: 'keep' });
    expect(migrateArea({ id: 'r', name: 'Hall', kind: 'room', rect: { x: 0, y: 0, w: 1, h: 1 }, color: '#000000' })).toMatchObject({ secret: false });
  });

  it('leaves an area that is already version 2 alone, and non-objects too', () => {
    const v2 = { id: 'a', name: 'A', shape: [square(0, 0, 5)], secret: false, color: '#000000' };
    expect(migrateArea(v2)).toEqual(v2);
    expect(migrateArea(null)).toBeNull();
  });

  it('migrates scene overrides of an area: rect → shape, kind → secret; others untouched', () => {
    expect(migrateAreaOverride({ rect: { x: 0, y: 0, w: 10, h: 10 }, name: 'Ruin' })).toEqual({ shape: [rectPolygon(0, 0, 10, 10)], name: 'Ruin' });
    expect(migrateAreaOverride({ kind: 'room' })).toEqual({ secret: false });
    expect(migrateAreaOverride({ hidden: true })).toEqual({ hidden: true });
    expect(migrateAreaOverride({ x1: 5 })).toEqual({ x1: 5 });
  });
});

describe('area shapes', () => {
  it('adds overlapping shapes into one part, separate ones as more parts', () => {
    const joined = addShape([square(0, 0, 10)], square(5, 0, 10));
    expect(joined).toHaveLength(1);
    expect(areaBounds(joined)).toEqual({ x: 0, y: 0, w: 15, h: 10 });
    expect(addShape(joined, square(100, 100, 5))).toHaveLength(2);
  });

  it('subtracts a shape, leaving a hole when inside', () => {
    const holed = subtractShape([square(0, 0, 30)], square(10, 10, 10));
    expect(holed).toHaveLength(1);
    expect(holed[0]!.holes).toHaveLength(1);
    expect(areaContains(holed, { x: 15, y: 15 })).toBe(false);
    expect(areaContains(holed, { x: 5, y: 5 })).toBe(true);
    expect(subtractShape([square(0, 0, 10)], square(-5, -5, 30))).toEqual([]);
  });

  it('distance to an area: 0 inside, else to the nearest edge', () => {
    const shape = [square(0, 0, 10)];
    expect(distanceToArea(shape, { x: 5, y: 5 })).toBe(0);
    expect(distanceToArea(shape, { x: 13, y: 5 })).toBe(3);
    expect(distanceToArea(shape, { x: 13, y: 14 })).toBe(5);
  });

  it('a label point lies inside the area, near its top left, never in a hole', () => {
    expect(labelPoint([square(0, 0, 100)])).toEqual({ x: 10, y: 9 });
    const ring = subtractShape([square(0, 0, 100)], square(5, 5, 90));
    const p = labelPoint(ring);
    expect(areaContains(ring, p)).toBe(true);
    // An L shape whose bounding box corner is outside it.
    const l = addShape([rectPolygon(50, 0, 100, 100)], rectPolygon(0, 50, 100, 100));
    expect(areaContains(l, labelPoint(l))).toBe(true);
  });
});

describe('reading version 1 files', () => {
  it('a map sidecar with rectangle areas is read as version 2 with polygons', async () => {
    const { readDocument } = await import('./documents');
    const { MapSidecarSchema } = await import('./sidecar');
    const { DEFAULT_GRID } = await import('./grid');
    const v1 = { kind: 'map', schemaVersion: 1, name: 'Crypt', resource: 'library/crypt.webp', widthPx: 100, heightPx: 100, grid: DEFAULT_GRID,
      zones: [{ id: 'vault', name: 'Vault', kind: 'secret', rect: { x: 10, y: 10, w: 20, h: 20 }, color: '#ffffff' }] };
    const r = readDocument('map', MapSidecarSchema, JSON.stringify(v1));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.schemaVersion).toBe((await import('./sidecar')).MAP_VERSION);
    expect(r.value.zones[0]).toEqual({ id: 'vault', name: 'Vault', shape: [rectPolygon(10, 10, 30, 30)], secret: true, color: '#ffffff' });
  });

  it('a scene with area overrides and own areas is read as the current version', async () => {
    const { readDocument } = await import('./documents');
    const { SceneOverrideSchema } = await import('./sidecar');
    const v1 = { kind: 'scene', schemaVersion: 1, name: 'S', mapSidecar: 'library/crypt.webp.dm.json', fog: { revealed: [], remembered: [] },
      overrides: { hall: { rect: { x: 0, y: 0, w: 5, h: 5 }, kind: 'secret' }, 'wall-a': { hidden: true } },
      added: { walls: [], zones: [{ id: 'rubble', name: 'Rubble', kind: 'area', rect: { x: 1, y: 1, w: 2, h: 2 }, color: '#000000' }], lights: [] } };
    const r = readDocument('scene', SceneOverrideSchema, JSON.stringify(v1));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.overrides).toEqual({ hall: { shape: [rectPolygon(0, 0, 5, 5)], secret: true } });
    // Version 4 keeps hiding as state (DC-103).
    expect(r.value.hidden).toEqual(['wall-a']);
    expect(r.value.added.zones[0]).toMatchObject({ id: 'rubble', shape: [rectPolygon(1, 1, 3, 3)], secret: false });
  });
});

describe('drawing an area part', () => {
  const grid = { ...DEFAULT_GRID, cellWidth: 10, cellHeight: 10 };

  it('a rectangle snaps its corners to the grid; without a grid it stays free', () => {
    expect(partFromDrag('rect', { x: 3, y: 4 }, { x: 27, y: 36 }, grid)).toEqual(rectPolygon(0, 0, 30, 40));
    expect(partFromDrag('rect', { x: 3, y: 4 }, { x: 27, y: 36 }, null)).toEqual(rectPolygon(3, 4, 27, 36));
  });

  it('an ellipse fills its snapped box; too small parts give nothing', () => {
    const e = partFromDrag('ellipse', { x: 1, y: 1 }, { x: 39, y: 19 }, grid)!;
    expect(areaBounds([e])).toEqual({ x: 0, y: 0, w: 40, h: 20 });
    expect(partFromDrag('rect', { x: 1, y: 1 }, { x: 4, y: 4 }, grid)).toBeNull();
  });

  it('a polygon snaps its points (repeated ones dropped); a lasso stays free', () => {
    const pts = [{ x: 1, y: 1 }, { x: 2, y: 2 }, { x: 29, y: 1 }, { x: 31, y: 18 }];
    expect(partFromPoints('polygon', pts, grid)?.outer).toEqual([[0, 0], [30, 0], [30, 20]]);
    expect(partFromPoints('lasso', pts, grid)?.outer).toEqual([[1, 1], [2, 2], [29, 1], [31, 18]]);
    expect(partFromPoints('polygon', [{ x: 1, y: 1 }, { x: 2, y: 2 }, { x: 3, y: 3 }], grid)).toBeNull();
  });
});

describe('editing corners', () => {
  it('finds the corner near a point and moves it', () => {
    const shape = [rectPolygon(0, 0, 100, 100)];
    const at = vertexAt(shape, { x: 98, y: 3 }, 6)!;
    expect(at).toMatchObject({ part: 0, ring: 0 });
    expect(shape[0]!.outer[at.index]).toEqual([100, 0]);
    expect(vertexAt(shape, { x: 50, y: 50 }, 6)).toBeNull();
    const moved = moveVertex(shape, at, { x: 120, y: -10 });
    expect(moved[0]!.outer[at.index]).toEqual([120, -10]);
    expect(shape[0]!.outer[at.index]).toEqual([100, 0]);
  });

  it('a moved corner that crosses edges is cleaned up into a valid shape', () => {
    // Pulling a corner across the square makes a bow tie; cleaning gives two triangles.
    const bow = moveVertex([rectPolygon(0, 0, 100, 100)], vertexAt([rectPolygon(0, 0, 100, 100)], { x: 100, y: 0 }, 1)!, { x: -50, y: 100 });
    const clean = normalizeShape(bow);
    expect(clean.length).toBeGreaterThanOrEqual(1);
    for (const p of clean) expect(p.outer.length).toBeGreaterThanOrEqual(3);
    expect(normalizeShape([rectPolygon(0, 0, 10, 10)])).toHaveLength(1);
  });
});
