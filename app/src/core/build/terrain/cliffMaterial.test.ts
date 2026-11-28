import { describe, expect, it } from 'vitest';
import { DEFAULT_GRID } from '../../grid';
import { newBlock, withPoints } from './block';
import { BAND_HEIGHTS, bandHeight, bandVariant, CLIFF_MATERIALS, classWeightsAtPx, cliffMaterial, cliffNoiseAt, MATERIAL_HEIGHTS, materialWeights, moduleChances } from './cliffMaterial';
import { classId } from './groundTool';

/**
 * Cliff materials (E-90, Teil B §11.4): which material a cliff shows by the biome and the ground
 * class on its upper side and its drop, in which of three band heights, and its modules.
 */
describe('the material of a cliff', () => {
  it('paving on top gives a built wall in the style of the biome', () => {
    expect(cliffMaterial('temperate', 'paving', 10)).toBe('ashlar');
    expect(cliffMaterial('dungeon', 'paving', 10)).toBe('ashlar');
    expect(cliffMaterial('desert', 'paving', 30)).toBe('brick');
    expect(cliffMaterial('winter', 'paving', 10)).toBe('rubble');
    expect(cliffMaterial('swamp', 'paving', 20)).toBe('wood');
  });

  it('temperate: limestone under rock, earth under earth or leaves, else sandstone', () => {
    expect(cliffMaterial('temperate', 'rock', 10)).toBe('limestone');
    expect(cliffMaterial('temperate', 'earth', 10)).toBe('earth');
    expect(cliffMaterial('temperate', 'leaves', 40)).toBe('earth');
    expect(cliffMaterial('temperate', null, 10)).toBe('sandstone');
    expect(cliffMaterial('temperate', 'grass', 40)).toBe('sandstone');
  });

  it('dungeon: earth under earth, else cave rock', () => {
    expect(cliffMaterial('dungeon', 'earth', 10)).toBe('earth');
    expect(cliffMaterial('dungeon', null, 10)).toBe('caveRock');
    expect(cliffMaterial('dungeon', 'moss', 30)).toBe('caveRock');
  });

  it('swamp: peat on low steps, granite under rock, else earth', () => {
    expect(cliffMaterial('swamp', null, 10)).toBe('peat');
    expect(cliffMaterial('swamp', 'rock', 10)).toBe('peat');
    expect(cliffMaterial('swamp', 'rock', 20)).toBe('granite');
    expect(cliffMaterial('swamp', 'grass', 15)).toBe('earth');
  });

  it('desert: clay under earth, granite under rock, else desert sandstone', () => {
    expect(cliffMaterial('desert', 'earth', 10)).toBe('clay');
    expect(cliffMaterial('desert', 'rock', 10)).toBe('granite');
    expect(cliffMaterial('desert', null, 10)).toBe('desertSandstone');
  });

  it('winter: ice under snow from 20 ft, earth under earth, else granite', () => {
    expect(cliffMaterial('winter', 'snow', 20)).toBe('ice');
    expect(cliffMaterial('winter', 'snow', 15)).toBe('granite');
    expect(cliffMaterial('winter', 'earth', 30)).toBe('earth');
    expect(cliffMaterial('winter', null, 40)).toBe('granite');
  });

  it('every material is reached by some rule', () => {
    const reached = new Set<string>();
    for (const biome of ['temperate', 'dungeon', 'swamp', 'desert', 'winter'] as const)
      for (const cls of [null, 'grass', 'tallgrass', 'earth', 'rock', 'gravel', 'moss', 'leaves', 'paving', 'snow'] as const)
        for (const drop of [5, 10, 20, 40]) reached.add(cliffMaterial(biome, cls, drop));
    expect([...reached].sort()).toEqual([...CLIFF_MATERIALS].sort());
  });
});

describe('band heights', () => {
  it('low up to 15 ft, high up to 35 ft, very high above', () => {
    expect([5, 10, 15, 20, 30, 35, 40, 80].map(bandHeight)).toEqual(['low', 'low', 'low', 'high', 'high', 'high', 'veryHigh', 'veryHigh']);
  });

  it('a material without a height takes the nearest one it has', () => {
    expect(MATERIAL_HEIGHTS.peat).toEqual(['low']);
    expect(bandVariant('peat', 30)).toBe('low');
    expect(bandVariant('ice', 10)).toBe('high');
    expect(bandVariant('wood', 50)).toBe('high');
    expect(bandVariant('granite', 50)).toBe('veryHigh');
    for (const m of CLIFF_MATERIALS) for (const h of MATERIAL_HEIGHTS[m]) expect(BAND_HEIGHTS).toContain(h);
  });
});

describe('modules along a band', () => {
  it('smooth pieces most of the time, a crack now and then, ledges only on high natural faces', () => {
    const rock = moduleChances('granite', 'high');
    expect(rock.ledge).toBeGreaterThan(0);
    expect(rock.a).toBeGreaterThan(rock.crack);
    expect(moduleChances('granite', 'low').ledge).toBe(0);
    expect(moduleChances('ashlar', 'veryHigh').ledge).toBe(0);
    expect(moduleChances('granite', 'high').crack).toBeGreaterThan(moduleChances('earth', 'high').crack);
    for (const m of CLIFF_MATERIALS)
      for (const h of MATERIAL_HEIGHTS[m]) {
        const c = moduleChances(m, h);
        expect(c.a + c.b + c.c + c.crack + c.ledge).toBeCloseTo(1, 6);
      }
  });
});

describe('the ground above a cliff', () => {
  const grid = { ...DEFAULT_GRID, cellWidth: 70, cellHeight: 70, originX: 0, originY: 0, rotationDeg: 0 };

  it('the painted classes at the nearest support point, Auto what they leave', () => {
    let b = withPoints(newBlock(), 'ground1Class', [[8, 8, classId('rock')]]);
    b = withPoints(b, 'ground1Weight', [[8, 8, 153]]);
    const w = classWeightsAtPx(new Map([['0_0', b]]), grid, { x: 2 * 70 + 3, y: 2 * 70 - 2 });
    expect(w.get('rock')).toBeCloseTo(0.6, 2);
    expect(w.get(null)).toBeCloseTo(0.4, 2);
  });

  it('no block there: all Auto', () => {
    expect([...classWeightsAtPx(new Map(), grid, { x: 10, y: 10 })]).toEqual([[null, 1]]);
  });

  it('materials weighted by biome and class, alike ones added up', () => {
    const w = materialWeights([0.5, 0.5, 0, 0], ['temperate', 'desert'], new Map([[null, 0.4], ['paving', 0.6]]), 10);
    expect(w.get('sandstone')).toBeCloseTo(0.2);
    expect(w.get('desertSandstone')).toBeCloseTo(0.2);
    expect(w.get('ashlar')).toBeCloseTo(0.3);
    expect(w.get('brick')).toBeCloseTo(0.3);
    // A place the palette has no biome for counts as the first one.
    const tv = materialWeights([0, 0, 1, 0], ['winter', null, null], new Map([[null, 1]]), 10);
    expect([...tv]).toEqual([['granite', 1]]);
  });

  it('built walls run straight, soft ground wanders less than stone (Teil B §11.1)', () => {
    const paved = withPoints(withPoints(newBlock(), 'ground1Class', [[8, 8, classId('paving')]]), 'ground1Weight', [[8, 8, 255]]);
    const at = { x: 2 * 70, y: 2 * 70 };
    expect(cliffNoiseAt(new Map([['0_0', paved]]), grid, ['temperate'], at, 10)).toBe(0);
    const earth = withPoints(withPoints(newBlock(), 'ground1Class', [[8, 8, classId('earth')]]), 'ground1Weight', [[8, 8, 255]]);
    const soft = cliffNoiseAt(new Map([['0_0', earth]]), grid, ['temperate'], at, 10);
    const stone = cliffNoiseAt(new Map(), grid, ['temperate'], at, 10);
    expect(soft).toBeGreaterThan(0);
    expect(stone).toBeCloseTo(0.15);
    expect(soft).toBeLessThan(stone);
  });
});
