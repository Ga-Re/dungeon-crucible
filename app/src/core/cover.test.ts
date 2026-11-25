import { describe, expect, it } from 'vitest';
import { isInside } from './poly/fog';
import { placementCovers, placementLights } from './cover';
import { DEFAULT_GRID } from './grid';
import { litSources, updateVision, visiblePolygons } from './vision';
import { createSampleScene } from '../sample/crypt';

/** Cover masks and lights of placed assets in sight and light (DC-108). 70 px cells. */
const grid = { ...DEFAULT_GRID, cellWidth: 70, cellHeight: 70 };
const placed = (p: Partial<{ x: number; y: number; rotation: number; scale: number; assetPath: string }> = {}) => ({ id: 'p', assetPath: 'library/pillar.png', x: 1000, y: 800, rotation: 0, scale: 1, ...p });

describe('placed masks on the map', () => {
  it('a circle in cells becomes a polygon around the footprint centre, scaled', () => {
    const info = { 'library/pillar.png': { sizeCells: { w: 2, h: 2 }, cover: { shape: 'circle' as const, x: 1, y: 1, r: 0.5 } } };
    const [c] = placementCovers([placed({ scale: 2 })], info, grid);
    // Radius 0.5 cells × 70 px × scale 2 = 70 px around (1000, 800).
    for (const [x, y] of c.outer) expect(Math.hypot(x - 1000, y - 800)).toBeCloseTo(70, 0);
  });

  it('a polygon turns with the asset', () => {
    // A 2×1 asset, mask over its right half; turned 90° clockwise that half points down.
    const info = { 'library/bench.png': { sizeCells: { w: 2, h: 1 }, cover: { shape: 'polygon' as const, points: [[1, 0], [2, 0], [2, 1], [1, 1]] as [number, number][] } } };
    const [c] = placementCovers([placed({ assetPath: 'library/bench.png', rotation: 90 })], info, grid);
    const ys = c.outer.map(([, y]) => y);
    expect(Math.min(...ys)).toBeCloseTo(800, 5);
    expect(Math.max(...ys)).toBeCloseTo(870, 5);
  });

  it('assets without a mask or a known file give none', () => {
    expect(placementCovers([placed()], {}, grid)).toEqual([]);
    expect(placementCovers([placed()], { 'library/pillar.png': {} }, grid)).toEqual([]);
  });

  it('an asset light shines from its turned place', () => {
    const info = { 'library/torch.png': { sizeCells: { w: 1, h: 2 }, light: { x: 0.5, y: 0, brightFt: 20, dimFt: 40, color: '#ffaa00', flicker: 0.3 } } };
    const [l] = placementLights([placed({ assetPath: 'library/torch.png', rotation: 180 })], info, grid);
    // The top middle of a 1×2 footprint, turned half round: its bottom middle.
    expect(l).toMatchObject({ id: 'p:light', x: 1000, y: 870, brightFt: 20, dimFt: 40, on: true });
  });
});

describe('cover in sight and light', () => {
  const scene = () => {
    const s = createSampleScene();
    s.walls = [];
    s.lights = [];
    s.tokens = [{ id: 'v', name: 'V', label: 'V', kind: 'pc', x: 600, y: 800, size: 1, ringColor: '#fff', visionFt: 120, hp: 10, maxHp: 10, ac: 10, initiative: 10, conditions: [] }];
    return s;
  };
  const pillar = placementCovers([placed()], { 'library/pillar.png': { sizeCells: { w: 2, h: 2 }, cover: { shape: 'circle', x: 1, y: 1, r: 0.8 } } }, grid);

  it('casts a shadow behind; the pillar itself and what is beside it stay visible', () => {
    const v = visiblePolygons(updateVision(scene(), { covers: pillar }));
    expect(isInside(v, [1300, 800])).toBe(false);
    expect(isInside(v, [1000, 800])).toBe(true);
    expect(isInside(v, [1000, 1100])).toBe(true);
    // Without the mask the point behind is seen.
    expect(isInside(visiblePolygons(updateVision(scene())), [1300, 800])).toBe(true);
  });

  it('a viewer inside the mask sees out', () => {
    const s = scene();
    s.tokens[0].x = 1000;
    const v = visiblePolygons(updateVision(s, { covers: pillar }));
    expect(isInside(v, [1300, 800])).toBe(true);
  });

  it('stops light: behind the pillar it stays dark', () => {
    const s = scene();
    s.tokens[0].visionFt = 0;
    s.tokens[0].x = 1000;
    s.tokens[0].y = 400;
    s.lights = [{ id: 'l', x: 600, y: 800, brightFt: 40, dimFt: 80, color: '#ffaa00', on: true }];
    const lit = litSources(s, { covers: pillar })[0].area;
    expect(isInside(lit, [1300, 800])).toBe(false);
    expect(isInside(lit, [1300, 1000])).toBe(true);
    // The lit side of the pillar is lit.
    expect(isInside(lit, [960, 800])).toBe(true);
  });

  it('asset lights shine like placed lights', () => {
    const s = scene();
    const lights = placementLights([placed({ assetPath: 'library/torch.png' })], { 'library/torch.png': { light: { x: 0.5, y: 0.5, brightFt: 20, dimFt: 40, color: '#ffaa00', flicker: 0 } } }, grid);
    expect(litSources(s, { lights }).map((l) => [Math.round(l.x), Math.round(l.y)])).toEqual([[1000, 800]]);
  });
});

describe('cover in the crypt (regression)', () => {
  it('a small round mask next to walls does not break sight; the barrel stays visible', () => {
    const s = createSampleScene();
    const covers = placementCovers([placed({ assetPath: 'library/barrel.png', x: 455, y: 875 })], { 'library/barrel.png': { cover: { shape: 'circle', x: 0.5, y: 0.5, r: 0.45 } } }, s.map.grid);
    const lights = placementLights([placed({ assetPath: 'library/oak.png', x: 980, y: 1120 })], { 'library/oak.png': { sizeCells: { w: 2, h: 2 }, light: { x: 1, y: 1, brightFt: 20, dimFt: 40, color: '#ffb14a', flicker: 0 } } }, s.map.grid);
    const v = visiblePolygons(updateVision(s, { covers, lights }));
    expect(isInside(v, [455, 875])).toBe(true);
  });
});

describe('cover stays fast (review)', () => {
  it('sight and light with 40 tree masks on the crypt stay well under a frame budget per move', () => {
    const s = createSampleScene();
    const placements = Array.from({ length: 40 }, (_, i) => ({ id: `t${i}`, assetPath: 'library/tree.png', x: 150 + (i % 8) * 3 * 70, y: 150 + Math.floor(i / 8) * 3 * 70, rotation: 0, scale: 1 }));
    const covers = placementCovers(placements, { 'library/tree.png': { sizeCells: { w: 2, h: 2 }, cover: { shape: 'circle', x: 1, y: 1, r: 0.6 } } }, s.map.grid);
    updateVision(s, { covers });
    const t0 = performance.now();
    for (let i = 0; i < 3; i++) updateVision(s, { covers });
    // About 120 ms here; generous for slow CI machines – it was 600 ms before the fix.
    expect((performance.now() - t0) / 3).toBeLessThan(350);
  });
});
