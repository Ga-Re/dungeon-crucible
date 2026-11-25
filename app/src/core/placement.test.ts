import { describe, expect, it } from 'vitest';
import { DEFAULT_GRID } from './grid';
import { assetShapes, footprintOf, hitsPlacement, nextVariant, rotateBy, scaleBy, snapPlacement } from './placement';
import { buildPlayerFrame, PlayerFrameSchema } from './projection';
import { createSampleScene } from '../sample/crypt';

/** Placed assets on the map (DC-041). Grid: 70 px cells from (0, 0). */
const grid = { ...DEFAULT_GRID, cellWidth: 70, cellHeight: 70 };
const place = (p: Partial<{ x: number; y: number; rotation: number; scale: number }> = {}) => ({ id: 'a', assetPath: 'library/oak.png', x: 140, y: 140, rotation: 0, scale: 1, ...p });

describe('footprint', () => {
  it('is the asset size in cells times the cell size and the scale, around the centre', () => {
    expect(footprintOf(place({ scale: 1.5 }), { w: 2, h: 1 }, grid)).toEqual({ cx: 140, cy: 140, w: 210, h: 105, rotation: 0 });
    // An asset without a size counts as one cell.
    expect(footprintOf(place(), undefined, grid)).toMatchObject({ w: 70, h: 70 });
  });
});

describe('hit test', () => {
  it('finds a point inside the turned rectangle only', () => {
    const fp = footprintOf(place({ rotation: 90 }), { w: 3, h: 1 }, grid);
    // Turned by 90°: 70 wide, 210 high.
    expect(hitsPlacement(fp, { x: 140, y: 230 })).toBe(true);
    expect(hitsPlacement(fp, { x: 230, y: 140 })).toBe(false);
  });
});

describe('snapping', () => {
  it('lays the footprint on the grid: even sizes centre on a corner, odd ones on a cell centre', () => {
    expect(snapPlacement(grid, { x: 150, y: 120 }, { w: 2, h: 2 }, 1, 0)).toEqual({ x: 140, y: 140 });
    expect(snapPlacement(grid, { x: 150, y: 120 }, { w: 1, h: 3 }, 1, 0)).toEqual({ x: 175, y: 105 });
    // Turned by 90°: width and height swap.
    expect(snapPlacement(grid, { x: 150, y: 120 }, { w: 1, h: 2 }, 1, 90)).toEqual({ x: 140, y: 105 });
  });

  it('at other angles centres on a cell', () => {
    expect(snapPlacement(grid, { x: 150, y: 120 }, { w: 2, h: 2 }, 1, 45)).toEqual({ x: 175, y: 105 });
  });
});

describe('turning, scaling, variants', () => {
  it('turns in steps and keeps the angle in 0–359', () => {
    expect(rotateBy(0, -15)).toBe(345);
    expect(rotateBy(350, 15)).toBe(5);
  });

  it('scales within limits', () => {
    expect(scaleBy(1, 1.25)).toBe(1.25);
    expect(scaleBy(0.25, 0.5)).toBe(0.25);
    expect(scaleBy(8, 2)).toBe(8);
  });

  it('cycles through the files of a group, by name', () => {
    const group = ['library/oak_02.png', 'library/oak_01.png', 'library/oak_03.png'];
    expect(nextVariant(group, 'library/oak_01.png')).toBe('library/oak_02.png');
    expect(nextVariant(group, 'library/oak_03.png')).toBe('library/oak_01.png');
    expect(nextVariant(['library/x.png'], 'library/x.png')).toBe('library/x.png');
  });
});

describe('what is drawn', () => {
  it('places with a known file are drawn at their footprint; unknown files are left out', () => {
    const info = { 'library/oak.png': { url: 'dc-asset://file/oak.png', video: false, sizeCells: { w: 2, h: 1 } }, 'library/gone.png': { url: null, video: false } };
    const shapes = assetShapes([place({ rotation: 30 }), { ...place(), id: 'b', assetPath: 'library/gone.png' }, { ...place(), id: 'c', assetPath: 'library/none.png' }], info, grid);
    expect(shapes).toEqual([{ id: 'a', url: 'dc-asset://file/oak.png', video: false, x: 140, y: 140, width: 140, height: 70, rotation: 30 }]);
  });
});

describe('the TV frame (DC-041)', () => {
  it('carries the placed assets it is given, and nothing else of them', () => {
    const scene = createSampleScene();
    const frame = buildPlayerFrame(scene, { seq: 1, now: 0, showGrid: true, memoryOpacity: 0.6, movementLocked: false, zoom: 1, look: { softEdges: true, fadeSeconds: 0.65, quality: 'medium' as const, edge: 1.2, motion: 1, speed: 5, coverFrom: 'middle' as const }, visible: [], quick: false, activeTokenId: null, seedKey: 'k', lights: [], assets: [{ id: 'a', url: 'dc-asset://file/oak.png', video: false, x: 1, y: 2, width: 70, height: 70, rotation: 0 }] });
    expect(frame.assets).toEqual([{ url: 'dc-asset://file/oak.png', video: false, x: 1, y: 2, width: 70, height: 70, rotation: 0 }]);
    expect(PlayerFrameSchema.safeParse(frame).success).toBe(true);
  });
});
