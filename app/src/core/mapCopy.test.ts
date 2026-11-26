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
  sounds: [{ id: 'brook', sound: 'library/brook.ogg', x: 2, y: 2, radiusFt: 20, volume: 0.5, layer: 'roof' }],
  ambientSound: { sound: 'builtin:wind', volume: 0.3 },
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
