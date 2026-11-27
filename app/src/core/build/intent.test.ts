import { describe, expect, it } from 'vitest';
import { FOG_BIOMES } from '../scene';
import { crossingSchema, defaultTerrainBiome, derivedSchema, mapIntentSchema, moodSchema, openingSchema, pathSchema, terrainSchema, undergroundSchema, wallLineSchema } from './intent';

/** The procedural Map Forge's intent in the map file (E-46 – E-77, map version 14). */

const square = { outer: [[0, 0], [70, 0], [70, 70], [0, 70]] as [number, number][], holes: [] };

describe('default terrain biome of a new map (O-A7)', () => {
  it('a dungeon map starts in the dungeon/cave biome, whatever its fog', () => {
    for (const fog of FOG_BIOMES) expect(defaultTerrainBiome('dungeon', fog)).toBe('dungeon');
  });

  it('other maps take it from their fog biome', () => {
    const byFog = Object.fromEntries(FOG_BIOMES.map((fog) => [fog, defaultTerrainBiome('region', fog)]));
    expect(byFog).toEqual({ nebel: 'temperate', kueste: 'temperate', arkan: 'temperate', schnee: 'winter', wueste: 'desert', asche: 'desert', sumpf: 'swamp', dunkel: 'dungeon' });
    expect(defaultTerrainBiome('building', 'schnee')).toBe('winter');
  });
});

describe('terrain', () => {
  const block = { v: 1, data: 'eJxjYAAAAAQAAQ==' };
  const terrain = { stepFt: 10, biomePalette: ['temperate'], stacks: { map: { base: { '0_0': block, '-2_3': block }, layers: { flood: { '-1_0': { ...block, mask: 'AAE=' } } } } } };

  it('holds blocks by signed block key, per stack and layer patch', () => {
    expect(terrainSchema.parse(terrain)).toEqual(terrain);
  });

  it('defaults to 10 ft steps and no blocks', () => {
    expect(terrainSchema.parse({ biomePalette: ['winter'] })).toEqual({ stepFt: 10, biomePalette: ['winter'], stacks: {} });
  });

  it('refuses odd steps, palettes and block keys, and data that is not Base64', () => {
    const bad = [
      { ...terrain, stepFt: 7 },
      { ...terrain, biomePalette: [] },
      { ...terrain, biomePalette: ['temperate', 'dungeon', 'swamp', 'desert', 'winter'] },
      { ...terrain, biomePalette: ['jungle'] },
      { ...terrain, stacks: { map: { base: { a_b: block } } } },
      { ...terrain, stacks: { map: { base: { '0_0': { v: 1, data: 'not base64!' } } } } },
      { ...terrain, stacks: { map: { base: { '0_0': { v: 2, data: '' } } } } },
      { ...terrain, stacks: { Map: { base: {} } } },
      { ...terrain, biomePalette: ['temperate', 'temperate'] },
      ...['00_0', '-0_0', '0_01', '1_-0'].map((k) => ({ ...terrain, stacks: { map: { base: { [k]: block } } } })),
    ];
    for (const t of bad) expect(terrainSchema.safeParse(t).success, JSON.stringify(t)).toBe(false);
  });
});

describe('wall lines and openings', () => {
  const line = { id: 'wl-a', points: [{ x: 0, y: 0 }, { x: 140, y: 0 }], style: 'palisade', thickness: 10, seed: 4 };

  it('a wall line is a polyline with a style', () => {
    expect(wallLineSchema.parse(line)).toEqual({ ...line, closed: false });
    expect(wallLineSchema.safeParse({ ...line, points: [{ x: 0, y: 0 }] }).success).toBe(false);
    expect(wallLineSchema.safeParse({ ...line, style: 'glass' }).success).toBe(false);
  });

  it('an opening sits in a wall line or, without one, in the rock raster', () => {
    const door = { id: 'op-a', wall: 'wl-a', x: 70, y: 0, width: 50, kind: 'door' };
    expect(openingSchema.parse(door)).toEqual({ ...door, secret: false });
    expect(openingSchema.parse({ id: 'op-b', x: 0, y: 0, width: 70, kind: 'archway' }).wall).toBeUndefined();
  });

  it('only doors can be secret', () => {
    expect(openingSchema.safeParse({ id: 'op-a', x: 0, y: 0, width: 50, kind: 'double-door', secret: true }).success).toBe(true);
    expect(openingSchema.safeParse({ id: 'op-a', x: 0, y: 0, width: 50, kind: 'window', secret: true }).success).toBe(false);
  });
});

describe('paths and crossings', () => {
  it('a path is a Bézier spline whose handles default to none', () => {
    const p = pathSchema.parse({ id: 'p-a', kind: 'trail', width: 50, seed: 1, nodes: [{ x: 0, y: 0 }, { x: 100, y: 0, outX: 20, outY: 5, w: 30 }] });
    expect(p.nodes[0]).toEqual({ x: 0, y: 0, inX: 0, inY: 0, outX: 0, outY: 0 });
    expect(p.nodes[1]).toMatchObject({ outX: 20, outY: 5, w: 30 });
    expect(pathSchema.safeParse({ ...p, nodes: [p.nodes[0]] }).success).toBe(false);
  });

  it('a crossing is chosen automatically or fixed to a kind', () => {
    const c = { id: 'cr-a', kind: 'auto', a: { x: 0, y: 0 }, b: { x: 0, y: 140 }, width: 70 };
    expect(crossingSchema.parse(c)).toEqual(c);
    expect(crossingSchema.safeParse({ ...c, kind: 'bridge', style: 'stone-arch', path: 'p-a' }).success).toBe(true);
    expect(crossingSchema.safeParse({ ...c, kind: 'tunnel' }).success).toBe(false);
  });
});

describe('overrides of derived objects', () => {
  it('are records by derived key', () => {
    const d = derivedSchema.parse({ suppressed: { 'scatter:temperate.dead-tree:3_7:12': true }, moved: { 'scatter:temperate.bush:-1_0:2': { x: 10, y: 20 } }, regions: [{ id: 'rg-a', shape: [square], rule: 'temperate.cliff-ivy', factor: 0.3 }] });
    expect(d).toEqual({
      pinned: {},
      suppressed: { 'scatter:temperate.dead-tree:3_7:12': true },
      moved: { 'scatter:temperate.bush:-1_0:2': { x: 10, y: 20, rotation: 0, scale: 1 } },
      variant: {},
      regions: [{ id: 'rg-a', shape: [square], rule: 'temperate.cliff-ivy', factor: 0.3 }],
    });
  });

  it('refuse keys that are not lowercase and a suppression that is not true', () => {
    expect(derivedSchema.safeParse({ suppressed: { 'Scatter:x': true } }).success).toBe(false);
    expect(derivedSchema.safeParse({ suppressed: { 'scatter:x': false } }).success).toBe(false);
  });
});

describe('mood and undergrounds', () => {
  it('mood is optional per value and refuses a sun below 5°', () => {
    expect(moodSchema.parse({ timeOfDay: 'night', season: 'winter' })).toEqual({ timeOfDay: 'night', season: 'winter' });
    expect(moodSchema.safeParse({ sunElevation: 0 }).success).toBe(false);
  });

  it('an underground is a storey with entrances that switch the TV to it', () => {
    const u = undergroundSchema.parse({ id: 'ug-a', storey: 'storey-cave', entrances: [{ id: 'en-a', x: 35, y: 35, area: square }] });
    expect(u).toEqual({ id: 'ug-a', storey: 'storey-cave', entrances: [{ id: 'en-a', x: 35, y: 35, area: square, secret: false }], confirm: false, leaveOff: true });
    expect(undergroundSchema.safeParse({ id: 'ug-a', entrances: [] }).success).toBe(false);
  });
});

describe('the intent as a whole', () => {
  it('is all optional: a map without intent has none of it', () => {
    expect(mapIntentSchema.parse({})).toEqual({});
  });
});

describe('prefabs', () => {
  it('come from the flat library only', async () => {
    const { prefabPlacementSchema } = await import('./intent');
    const p = { id: 'pf-a', prefab: 'library/well.prefab.json', x: 0, y: 0 };
    expect(prefabPlacementSchema.parse(p)).toMatchObject({ rotation: 0, params: {} });
    for (const bad of ['../well.prefab.json', 'library/../x.prefab.json', 'library/sub/well.prefab.json', 'library/well.json']) expect(prefabPlacementSchema.safeParse({ ...p, prefab: bad }).success, bad).toBe(false);
  });
});
