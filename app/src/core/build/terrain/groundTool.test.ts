import { describe, expect, it } from 'vitest';
import { DEFAULT_GRID } from '../../grid';
import { cellOf, emptyTerrain, pointOf } from './state';
import { applyStroke } from './stepTool';
import { BIOME_CLASSES, biomeWeightsAt, brushWeights, classId, fillPoints, groundAt, paintBiome, paintGround } from './groundTool';

/**
 * Ground classes and biomes (E-88, Teil B §13): a point holds up to two classes with weights, the
 * rest is Auto; a stroke lifts its class to its strength however often it passes; Alt takes the
 * ground back to Auto. A cell holds biome weights against the map's palette (at most two mixing);
 * a new biome joins the palette (four at most). Filling takes the connected ground of the same
 * mix on the same step.
 */
const grid = { ...DEFAULT_GRID, cellWidth: 70, cellHeight: 70, originX: 0, originY: 0, rotationDeg: 0 };
const at = (cx: number, cy: number) => ({ x: cx * 70, y: cy * 70 });
const t0 = () => emptyTerrain(['temperate']);
const point = (x: number, y: number, s = 1) => [[x, y, s]] as [number, number, number][];

describe('the classes each biome has (Teil B §13.1)', () => {
  it('nine in all; snow only in winter, tall grass not in caves or winter', () => {
    expect(BIOME_CLASSES.temperate).toEqual(['grass', 'tallgrass', 'earth', 'rock', 'gravel', 'moss', 'leaves', 'paving']);
    expect(BIOME_CLASSES.winter).toContain('snow');
    expect(BIOME_CLASSES.dungeon).not.toContain('tallgrass');
    expect(BIOME_CLASSES.desert).toEqual(['grass', 'tallgrass', 'earth', 'rock', 'gravel', 'paving']);
  });
});

describe('painting a ground class', () => {
  it('at full strength the point is that class; Auto is what is left', () => {
    const t = paintGround(t0(), 'map', point(10, 10), 'rock');
    expect(groundAt(t, 'map', 10, 10)).toEqual(new Map([[classId('rock'), 1]]));
    expect(groundAt(t, 'map', 11, 10)).toEqual(new Map());
  });

  it('half strength gives half; a second class pushes the others down; at most two classes stay', () => {
    let t = paintGround(t0(), 'map', point(10, 10, 0.5), 'grass');
    expect(groundAt(t, 'map', 10, 10).get(classId('grass'))).toBeCloseTo(0.5, 1);
    t = paintGround(t, 'map', point(10, 10, 0.5), 'earth');
    const g = groundAt(t, 'map', 10, 10);
    expect(g.get(classId('earth'))).toBeCloseTo(0.5, 1);
    expect(g.get(classId('grass'))).toBeCloseTo(0.25, 1);
    t = paintGround(t, 'map', point(10, 10, 0.8), 'moss');
    expect(groundAt(t, 'map', 10, 10).size).toBe(2);
    expect(groundAt(t, 'map', 10, 10).has(classId('moss'))).toBe(true);
  });

  it('"auto" takes the ground back', () => {
    const t = paintGround(paintGround(t0(), 'map', point(10, 10), 'rock'), 'map', point(10, 10), 'auto');
    expect(groundAt(t, 'map', 10, 10)).toEqual(new Map());
  });

  it('the brush is soft at its rim; a stroke covers its path once (the strongest touch counts)', () => {
    const w = new Map(brushWeights([at(5, 5), at(5.1, 5)], 2, 0.5, grid).map(([x, y, s]) => [`${x},${y}`, s]));
    expect(w.get('20,20')).toBe(1);
    expect(w.get('24,20')!).toBeLessThan(0.5);
    expect(w.has('30,20')).toBe(false);
  });
});

describe('painting a biome', () => {
  it('a new biome joins the palette; its cells mix with the one there, two at most', () => {
    const t = paintBiome(t0(), 'map', [[3, 3, 1], [4, 3, 0.5]], 'desert')!;
    expect(t.biomePalette).toEqual(['temperate', 'desert']);
    expect(biomeWeightsAt(t, 'map', 3, 3)).toEqual([0, 1, 0, 0]);
    const half = biomeWeightsAt(t, 'map', 4, 3);
    expect(half[0]! + half[1]!).toBeCloseTo(1, 2);
    expect(half[1]).toBeCloseTo(0.5, 1);
    const three = paintBiome(t, 'map', [[4, 3, 0.5]], 'winter')!;
    expect(biomeWeightsAt(three, 'map', 4, 3).filter((w) => w > 0)).toHaveLength(2);
    expect(cellOf(three, 'map', 'biome1', 9, 9)).toBe(255);
  });

  it('a fifth biome is refused: the palette holds four', () => {
    let t = t0();
    for (const b of ['desert', 'winter', 'swamp'] as const) t = paintBiome(t, 'map', [[0, 0, 1]], b)!;
    expect(t.biomePalette).toHaveLength(4);
    expect(paintBiome(t, 'map', [[0, 0, 1]], 'dungeon')).toBeNull();
  });
});

describe('filling', () => {
  it('takes the connected ground of the same mix on the same step, within the bounds', () => {
    // A plateau of cells 2…5 (support points 8…24): filling on it stays on it.
    const plateau = applyStroke(t0(), 'map', Array.from({ length: 17 * 17 }, (_, i) => [8 + (i % 17), 8 + Math.floor(i / 17)] as const), 'raise', 1);
    const bounds = { x0: 0, y0: 0, x1: 40, y1: 40 };
    const top = fillPoints(plateau, 'map', 16, 16, 0.1, bounds);
    expect(top).toHaveLength(17 * 17);
    // Below it: everything else in the bounds.
    expect(fillPoints(plateau, 'map', 0, 0, 0.1, bounds)).toHaveLength(41 * 41 - 17 * 17);
    // A painted spot is its own ground: it is left out, unless the tolerance takes it.
    const spotted = paintGround(plateau, 'map', point(16, 16, 0.3), 'rock');
    expect(fillPoints(spotted, 'map', 12, 12, 0.1, bounds)).toHaveLength(17 * 17 - 1);
    expect(fillPoints(spotted, 'map', 12, 12, 0.5, bounds)).toHaveLength(17 * 17);
    expect(pointOf(spotted, 'map', 'step', 16, 16)).toBe(1);
  });
});
