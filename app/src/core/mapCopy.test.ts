import { describe, expect, it } from 'vitest';
import { DEFAULT_GRID } from './grid';
import { duplicateMap, mapFileFor } from './mapCopy';
import { MapSidecarSchema, MAP_VERSION } from './sidecar';

/** Duplicating a map (E-32, DC-118). */
const map = MapSidecarSchema.parse({
  kind: 'map', schemaVersion: MAP_VERSION, name: 'Camp', resource: 'library/camp.png', widthPx: 1000, heightPx: 800, grid: { ...DEFAULT_GRID, cellWidth: 100, cellHeight: 100 },
  tags: ['woods'], biome: 'Forest', mapType: 'region',
  layers: [{ id: 'inside', name: 'Inside', trigger: { area: 'tent', leaveOff: true }, counter: 'roof' }, { id: 'roof', name: 'Roof', counter: 'inside' }],
  walls: [{ id: 'w1', kind: 'wall', x1: 0, y1: 0, x2: 1, y2: 0, layer: 'inside' }],
  zones: [{ id: 'tent', name: 'Tent', color: '#88aa55', shape: [{ outer: [[0, 0], [1, 0], [1, 1]], holes: [] }] }],
  lights: [{ id: 'lamp', x: 1, y: 1, brightFt: 10, dimFt: 20, color: '#ffaa00', layer: 'roof' }],
  sounds: [{ id: 'brook', sound: 'library/brook.ogg', x: 2, y: 2, radiusFt: 20, volume: 0.5, layer: 'roof', storey: 'loft' }],
  ambientSound: { sound: 'builtin:wind', volume: 0.3 },
  storeys: [{ id: 'loft', name: 'Loft', level: 1 }],
  variants: [{ id: 'night', name: 'Night', image: 'library/camp-night.png' }],
  assets: [{ id: 'a1', assetPath: 'library/barrel.png', x: 5, y: 5, layer: 'inside' }],
  startFog: { revealed: [{ outer: [[0, 0], [1, 0], [1, 1]], holes: [] }], remembered: [] },
});
let n = 0;
const fresh = (prefix: string) => `${prefix}-n${++n}`;

describe('duplicating a map', () => {
  it('"only the map": picture, grid, type, tags, landscape – no walls, areas, lights, assets, layers, start fog', () => {
    const c = duplicateMap(map, 'Camp (copy)', false, fresh);
    expect(c).toMatchObject({ name: 'Camp (copy)', resource: 'library/camp.png', grid: { cellWidth: 100 }, tags: ['woods'], biome: 'Forest', mapType: 'region', walls: [], zones: [], lights: [], sounds: [], assets: [], layers: [] });
    expect(c.startFog).toBeUndefined();
    expect(c.storeys).toEqual([]);
    expect(c.variants.map((v) => v.name)).toEqual(['Night']);
    expect(c.variants[0].id).not.toBe('night');
    // The map's sound belongs to its look, like the fog's (E-37).
    expect(c.ambientSound).toEqual({ sound: 'builtin:wind', volume: 0.3 });
  });

  it('"with everything": all of it under new ids, references between them following', () => {
    const c = duplicateMap(map, 'Camp 2', true, fresh);
    const ids = [...c.walls, ...c.zones, ...c.lights, ...c.sounds, ...c.assets, ...c.layers].map((x) => x.id);
    expect(ids.some((id) => ['w1', 'tent', 'lamp', 'brook', 'a1', 'inside', 'roof'].includes(id))).toBe(false);
    const [inside, roof] = c.layers;
    expect(inside.trigger!.area).toBe(c.zones[0].id);
    expect(inside.counter).toBe(roof.id);
    expect(roof.counter).toBe(inside.id);
    expect(c.walls[0].layer).toBe(inside.id);
    expect(c.lights[0].layer).toBe(roof.id);
    expect(c.sounds[0]).toMatchObject({ sound: 'library/brook.ogg', layer: roof.id });
    // Storeys get new ids; what is on them follows (E-40).
    expect(c.storeys[0].id).not.toBe('loft');
    expect(c.sounds[0].storey).toBe(c.storeys[0].id);
    expect(c.variants[0].id).not.toBe('night');
    expect(c.assets[0].layer).toBe(inside.id);
    expect(c.startFog!.revealed).toHaveLength(1);
    // The original is untouched.
    expect(map.walls[0].id).toBe('w1');
  });

  it('a copy gets a free map file next to the pictures', () => {
    expect(mapFileFor('Camp 2', new Set())).toBe('library/camp-2.map.json');
    expect(mapFileFor('Camp 2', new Set(['library/camp-2.map.json']))).toBe('library/camp-2-2.map.json');
  });
});

/** The procedural Map Forge's intent (E-46 ff., map version 14) in a copy. */
describe('duplicating a map with intent (DC-121)', () => {
  const sq = { outer: [[0, 0], [70, 0], [70, 70], [0, 70]] as [number, number][], holes: [] };
  const block = { v: 1 as const, data: 'AAE=' };
  const withIntent = (resource: string) => MapSidecarSchema.parse({
    ...map,
    resource,
    terrain: { biomePalette: ['temperate'], stacks: { map: { base: { '0_0': block }, layers: { inside: { '0_0': { ...block, mask: 'AAE=' } } } }, loft: { base: { '1_1': block }, layers: { roof: { '1_1': { ...block, mask: 'AAE=' } } } } } },
    wallLines: [{ id: 'wl-a', points: [{ x: 0, y: 0 }, { x: 140, y: 0 }], style: 'fence', thickness: 8, seed: 1, layer: 'inside' }, { id: 'wl-up', points: [{ x: 0, y: 0 }, { x: 70, y: 0 }], style: 'wood', thickness: 8, seed: 2, storey: 'loft' }],
    openings: [{ id: 'op-a', wall: 'wl-a', x: 70, y: 0, width: 50, kind: 'door' }],
    paths: [{ id: 'p-a', kind: 'track', width: 50, seed: 1, nodes: [{ x: 0, y: 0 }, { x: 300, y: 0 }], layer: 'roof' }],
    crossings: [{ id: 'cr-a', kind: 'auto', a: { x: 0, y: 0 }, b: { x: 0, y: 140 }, width: 70, path: 'p-a' }],
    waterSources: [{ id: 'ws-a', x: 5, y: 5, width: 20, seed: 1 }],
    prefabs: [{ id: 'pf-a', prefab: 'library/well.prefab.json', x: 50, y: 50 }],
    derived: { suppressed: { 'scatter:temperate.oak:0_0:1': true }, regions: [{ id: 'rg-a', shape: [sq], rule: 'temperate.cliff-ivy', factor: 0.5, layer: 'inside' }, { id: 'rg-up', shape: [sq], rule: 'temperate.cliff-ivy', factor: 0, storey: 'loft' }] },
    mood: { season: 'autumn' },
    undergrounds: [{ id: 'ug-a', storey: 'loft', entrances: [{ id: 'en-a', x: 1, y: 1, area: sq }] }],
  });

  it('"only the map" of a picture map: what is drawn over it stays behind, its mood comes along', () => {
    const c = duplicateMap(withIntent('library/camp.png'), 'Copy', false, fresh);
    for (const k of ['terrain', 'wallLines', 'openings', 'paths', 'crossings', 'waterSources', 'prefabs', 'derived', 'undergrounds'] as const) expect(c[k], k).toBeUndefined();
    expect(c.mood).toEqual({ season: 'autumn' });
  });

  it('"only the map" of a drawn map keeps its drawing on the map itself – without layers and storeys', () => {
    const c = duplicateMap(withIntent('drawn:'), 'Copy', false, fresh);
    expect(c.terrain!.stacks).toEqual({ map: { base: { '0_0': block } } });
    expect(c.wallLines!.map((w) => w.id)).toEqual(['wl-a']);
    expect(c.wallLines![0].layer).toBeUndefined();
    expect(c.openings![0].wall).toBe('wl-a');
    expect(c.paths![0].layer).toBeUndefined();
    expect(c.crossings![0].path).toBe('p-a');
    expect(c.waterSources).toHaveLength(1);
    expect(c.prefabs).toHaveLength(1);
    expect(c.derived!.suppressed).toEqual({ 'scatter:temperate.oak:0_0:1': true });
    expect(c.derived!.regions.map((r) => [r.id, r.layer])).toEqual([['rg-a', undefined]]);
    expect(c.undergrounds).toBeUndefined();
    expect(c.mood).toEqual({ season: 'autumn' });
  });

  it('"with everything": the intent under new ids, its references following', () => {
    const original = withIntent('library/camp.png');
    const c = duplicateMap(original, 'Copy', true, fresh);
    const [inside, roof] = c.layers;
    const loft = c.storeys[0].id;
    const ids = [...c.wallLines!, ...c.openings!, ...c.paths!, ...c.crossings!, ...c.waterSources!, ...c.prefabs!, ...c.derived!.regions, ...c.undergrounds!, ...c.undergrounds![0].entrances].map((x) => x.id);
    expect(ids.some((id) => ['wl-a', 'wl-up', 'op-a', 'p-a', 'cr-a', 'ws-a', 'pf-a', 'rg-a', 'rg-up', 'ug-a', 'en-a'].includes(id))).toBe(false);
    expect(c.wallLines![0].layer).toBe(inside.id);
    expect(c.wallLines![1].storey).toBe(loft);
    expect(c.openings![0].wall).toBe(c.wallLines![0].id);
    expect(c.paths![0].layer).toBe(roof.id);
    expect(c.crossings![0].path).toBe(c.paths![0].id);
    expect(c.derived!.regions.map((r) => [r.layer, r.storey])).toEqual([[inside.id, undefined], [undefined, loft]]);
    expect(c.undergrounds![0].storey).toBe(loft);
    // The rasters of a storey and the patches of a layer follow their new ids.
    expect(Object.keys(c.terrain!.stacks).sort()).toEqual([loft, 'map'].sort());
    expect(Object.keys(c.terrain!.stacks['map'].layers!)).toEqual([inside.id]);
    expect(Object.keys(c.terrain!.stacks[loft].layers!)).toEqual([roof.id]);
    // Derived keys are no ids: they stay. The original is untouched.
    expect(c.derived!.suppressed).toEqual({ 'scatter:temperate.oak:0_0:1': true });
    expect(original.wallLines![0].id).toBe('wl-a');
  });
});
