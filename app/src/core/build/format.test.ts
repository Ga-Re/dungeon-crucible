import { describe, expect, it } from 'vitest';
import { readDocument } from '../documents';
import { mapSidecarFromScene, mapSidecarPath, sceneFromDocuments, sceneOverrideFromScene } from '../persistence';
import { MAP_VERSION, MapSidecarSchema, SceneOverrideSchema } from '../sidecar';
import { createSampleScene } from '../../sample/crypt';

/** Old drawn walls and doors (E-33) as files before version 14 held them. */
const wall = { id: 'm-a', points: [{ x: 0, y: 0 }, { x: 200, y: 0 }, { x: 200, y: 200 }], closed: false, style: 'brick', thickness: 12, seed: 7 };
const door = { id: 'md-a', wall: 'm-a', at: 100, width: 50, secret: true, crack: true };

/* ---------------------------------------------------------------- version 14: the procedural Map Forge (DC-121) */

const sq = { outer: [[0, 0], [70, 0], [70, 70], [0, 70]] as [number, number][], holes: [] };
const block = { v: 1 as const, data: 'eJxjYAAAAAQAAQ==' };
/** Every intent field of version 14, as the schema reads it (defaults filled in). */
const intent = {
  terrain: { stepFt: 10 as const, biomePalette: ['temperate' as const, 'dungeon' as const], stacks: { map: { base: { '0_0': block } }, 'storey-cave': { base: { '-1_0': block }, layers: { flood: { '0_0': { ...block, mask: 'AAE=' } } } } } },
  wallLines: [{ id: 'wl-a', points: [{ x: 0, y: 0 }, { x: 140, y: 0 }], closed: false, style: 'stone' as const, thickness: 12, fortified: true, seed: 3, layer: 'flood' }],
  openings: [
    { id: 'op-a', wall: 'wl-a', x: 70, y: 0, width: 50, kind: 'door' as const, secret: true, hinge: 'start' as const, opensTo: 'left' as const },
    { id: 'op-b', x: 0, y: 70, width: 70, kind: 'archway' as const, secret: false, storey: 'storey-cave' },
  ],
  paths: [{ id: 'p-a', kind: 'trail' as const, width: 40, seed: 2, nodes: [{ x: 0, y: 0, inX: 0, inY: 0, outX: 10, outY: 0 }, { x: 200, y: 50, inX: -10, inY: 0, outX: 0, outY: 0, w: 30 }] }],
  crossings: [{ id: 'cr-a', kind: 'auto' as const, a: { x: 0, y: 0 }, b: { x: 0, y: 140 }, width: 70, path: 'p-a' }],
  waterSources: [{ id: 'ws-a', x: 10, y: 10, width: 20, seed: 5 }],
  prefabs: [{ id: 'pf-a', prefab: 'library/camp.prefab.json', x: 300, y: 300, rotation: 90 as const, flip: true, params: { tents: 3, lit: true } }],
  derived: {
    pinned: { 'scatter:temperate.oak:1_1:0': { x: 1, y: 2, rotation: 0, scale: 1, assetPath: 'library/oak.png' } },
    suppressed: { 'scatter:temperate.dead-tree:3_7:12': true as const },
    moved: {},
    variant: { 'scatter:temperate.bush:-1_0:2': 'autumn' },
    regions: [{ id: 'rg-a', shape: [sq], rule: 'temperate.cliff-ivy', factor: 0.3 }],
  },
  mood: { sunElevation: 30, timeOfDay: 'evening' as const, season: 'autumn' as const, weather: 'rain' as const, haze: 0.4, clouds: 0.5 },
  undergrounds: [{ id: 'ug-a', storey: 'storey-cave', entrances: [{ id: 'en-a', x: 35, y: 35, area: sq, secret: true }], fade: 35, confirm: true, leaveOff: false }],
  // Version 15 (E-87).
  cliffPerspective: 0.6,
};
const INTENT_KEYS = Object.keys(intent) as (keyof typeof intent)[];
const pickIntent = (m: Record<string, unknown>) => Object.fromEntries(INTENT_KEYS.filter((k) => m[k] !== undefined).map((k) => [k, m[k]]));

/** A map with storeys and a layer, and all of the intent. */
function intentMap() {
  const base = mapSidecarFromScene(createSampleScene(), 'builtin:crypt', 'map');
  return MapSidecarSchema.parse(JSON.parse(JSON.stringify({ ...base, storeys: [{ id: 'storey-cave', name: 'Cave', level: -1 }], layers: [{ id: 'flood', name: 'Flood' }], ...intent })));
}

describe('map file version 15: the cliff band\'s width per map (E-87)', () => {
  const v14 = () => ({ ...mapSidecarFromScene(createSampleScene(), 'builtin:crypt', 'map'), schemaVersion: 14 });

  it('a version 14 map reads as version 15, nothing else changed; without a width the default applies', () => {
    const r = readDocument('map', MapSidecarSchema, JSON.stringify(v14()));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.schemaVersion).toBe(15);
    expect(r.value.cliffPerspective).toBeUndefined();
    expect({ ...r.raw, schemaVersion: 14 }).toEqual(v14());
  });

  it('the width is 0.2 to 1.0 cell per 10 ft', () => {
    const doc = (w: number) => JSON.stringify({ ...v14(), schemaVersion: 15, cliffPerspective: w });
    expect(readDocument('map', MapSidecarSchema, doc(0.2)).ok).toBe(true);
    expect(readDocument('map', MapSidecarSchema, doc(1)).ok).toBe(true);
    expect(readDocument('map', MapSidecarSchema, doc(0.1)).ok).toBe(false);
    expect(readDocument('map', MapSidecarSchema, doc(1.5)).ok).toBe(false);
  });
});

describe('map file version 14 (E-46 – E-77, DC-121)', () => {
  it('map version 15, scene version 13, the same in the file rules', async () => {
    const { DOCUMENT_VERSIONS } = await import('../documents');
    const { SCENE_VERSION } = await import('../sidecar');
    expect(MAP_VERSION).toBe(15);
    expect(SCENE_VERSION).toBe(13);
    expect(DOCUMENT_VERSIONS.map).toBe(MAP_VERSION);
    expect(DOCUMENT_VERSIONS.scene).toBe(SCENE_VERSION);
  });

  it('reading a version 13 map deletes the old drawing, its automatic details and the generator note (E-57)', () => {
    const v13 = {
      ...mapSidecarFromScene(createSampleScene(), 'builtin:crypt', 'map'),
      schemaVersion: 13,
      masonry: [wall], masonryDoors: [door], cliffs: [{ id: 'cl-a' }], waters: [{ id: 'w-a' }], floors: [{ id: 'f-a' }], rooms: [{ id: 'room-a' }],
      autoShore: false, autoGrowth: false, generated: { style: 'cave', density: 0.5, seed: 1, water: true, lights: true, details: true },
      lightAngle: 120, waterAnimated: false, origin: { x: -70, y: 0 },
      future: { kept: true },
    };
    const r = readDocument('map', MapSidecarSchema, JSON.stringify(v13));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    for (const gone of ['masonry', 'masonryDoors', 'cliffs', 'waters', 'floors', 'rooms', 'autoShore', 'autoGrowth', 'generated']) expect(r.raw, gone).not.toHaveProperty(gone);
    expect(r.raw['future']).toEqual({ kept: true });
    expect(r.value).toMatchObject({ schemaVersion: 15, lightAngle: 120, waterAnimated: false, origin: { x: -70, y: 0 } });
    expect(pickIntent(r.value)).toEqual({});
  });

  it('reading a version 12 scene deletes its own drawing and what it hid of the map\'s (E-57)', () => {
    const drawing = { masonry: [wall], masonryDoors: [door], cliffs: [{ id: 'cl-a' }], waters: [], floors: [], hidden: ['m-gone'], future: 1 };
    const v12 = { kind: 'scene', schemaVersion: 12, name: 'S', mapSidecar: 'm', fog: { revealed: [], remembered: [] }, doors: { 'md-a': true }, drawing, start: { fog: { revealed: [], remembered: [] }, drawing } };
    const r = readDocument('scene', SceneOverrideSchema, JSON.stringify(v12));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.raw['drawing']).toEqual({ future: 1 });
    expect((r.raw['start'] as Record<string, unknown>)['drawing']).toEqual({ future: 1 });
    expect(r.value.schemaVersion).toBe(13);
    expect(r.value.drawing).toEqual({ paths: [], hidden: [] });
    expect(r.value.start?.drawing).toEqual({ paths: [], hidden: [] });
    expect(r.value.doors).toEqual({ 'md-a': true });
  });

  it('a version 14 file still holding retired fields (written before DC-122) loses them on reading and keeps none on writing', async () => {
    const { keepUnknown } = await import('../documents');
    const v14 = { ...mapSidecarFromScene(createSampleScene(), 'builtin:crypt', 'map'), masonry: [wall], masonryDoors: [door], autoShore: false, generated: { style: 'cave' } };
    const r = readDocument('map', MapSidecarSchema, JSON.stringify(v14));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    for (const gone of ['masonry', 'masonryDoors', 'autoShore', 'generated']) expect(r.raw, gone).not.toHaveProperty(gone);
    const written = keepUnknown(MapSidecarSchema, r.raw, mapSidecarFromScene(sceneFromDocuments(r.value, null, null, undefined, 'map'), r.value.resource, 'map', r.value)) as Record<string, unknown>;
    for (const gone of ['masonry', 'masonryDoors', 'autoShore', 'generated']) expect(written, gone).not.toHaveProperty(gone);
    const scene = { kind: 'scene', schemaVersion: 13, name: 'S', mapSidecar: 'm', fog: { revealed: [], remembered: [] }, drawing: { masonry: [wall], hidden: ['p-a'] }, start: { fog: { revealed: [], remembered: [] }, drawing: { cliffs: [{ id: 'cl-a' }] } } };
    const s = readDocument('scene', SceneOverrideSchema, JSON.stringify(scene));
    expect(s.ok && s.raw['drawing']).toEqual({ hidden: ['p-a'] });
    expect(s.ok && (s.raw['start'] as Record<string, unknown>)['drawing']).toEqual({});
  });

  it('the TV frame is the same with and without the intent and a scene\'s own paths', async () => {
    const { buildPlayerFrame } = await import('../projection');
    const map = intentMap();
    const { terrain: _t, wallLines: _w, openings: _o, paths: _p, crossings: _c, waterSources: _ws, prefabs: _pf, derived: _d, mood: _m, undergrounds: _u, ...bare } = map;
    const opts = { seq: 1, now: 0, showGrid: true, memoryOpacity: 0.6, movementLocked: false, zoom: 1, look: { softEdges: true, fadeSeconds: 0.65, quality: 'medium' as const, edge: 1.2, motion: 1, speed: 5, coverFrom: 'middle' as const }, visible: [], quick: false, activeTokenId: null, seedKey: 'k', lights: [] };
    const withIntent = sceneFromDocuments(map, null, null);
    withIntent.ownPaths = structuredClone(intent.paths);
    expect(JSON.stringify(buildPlayerFrame(withIntent, opts))).toBe(JSON.stringify(buildPlayerFrame(sceneFromDocuments(bare, null, null), opts)));
  });

  it('every intent field round-trips through the Map Forge, also when it shows a storey', () => {
    const map = intentMap();
    expect(pickIntent(map)).toEqual(intent);
    for (const storey of ['', 'storey-cave']) {
      const view = sceneFromDocuments(map, null, null, undefined, 'map', storey);
      const back = MapSidecarSchema.parse(JSON.parse(JSON.stringify(mapSidecarFromScene(view, map.resource, 'map', map))));
      expect(pickIntent(back), storey).toEqual(intent);
    }
  });

  it('a scene\'s view writes the map\'s intent as the file has it', () => {
    const map = intentMap();
    const view = sceneFromDocuments(map, null, null);
    view.map.intent = {};
    expect(pickIntent(mapSidecarFromScene(view, map.resource, 'scene', map))).toEqual(intent);
  });

  it('an intent element keeps fields this version does not know when written back', async () => {
    const { keepUnknown } = await import('../documents');
    const map = intentMap();
    const original = JSON.parse(JSON.stringify(map));
    original.openings[0].future = 'kept';
    const next = mapSidecarFromScene(sceneFromDocuments(map, null, null, undefined, 'map'), map.resource, 'map', map);
    const written = keepUnknown(MapSidecarSchema, original, next) as typeof original;
    expect(written.openings[0].future).toBe('kept');
  });

  it('a scene\'s own paths round-trip; reset brings back the start\'s; the Map Forge has none (E-59)', async () => {
    const { resetToStart, startOf } = await import('../persistence');
    const map = intentMap();
    const scene = sceneFromDocuments(map, null, null);
    expect(scene.ownPaths).toEqual([]);
    scene.ownPaths = structuredClone(intent.paths);
    const ov = SceneOverrideSchema.parse(JSON.parse(JSON.stringify(sceneOverrideFromScene(scene, 'S', mapSidecarPath('builtin:crypt'), { round: 1, turn: 0 }, map))));
    expect(ov.drawing.paths).toEqual(intent.paths);
    expect(sceneFromDocuments(map, ov, null).ownPaths).toEqual(intent.paths);
    expect(sceneFromDocuments(map, ov, null, undefined, 'map').ownPaths).toEqual([]);
    const withStart = { ...ov, start: { ...startOf(ov), drawing: { ...startOf(ov).drawing, paths: [] } } };
    expect(resetToStart(withStart).drawing.paths).toEqual([]);
  });

  it('a scene may hide derived objects by their key, not only elements by id', () => {
    const ov = SceneOverrideSchema.safeParse({ kind: 'scene', schemaVersion: 13, name: 'S', mapSidecar: 'm', fog: { revealed: [], remembered: [] }, drawing: { hidden: ['p-a', 'water~fall~3_7', 'scatter:temperate.oak:1_1:0'] } });
    expect(ov.success).toBe(true);
    expect(SceneOverrideSchema.safeParse({ kind: 'scene', schemaVersion: 13, name: 'S', mapSidecar: 'm', fog: { revealed: [], remembered: [] }, drawing: { hidden: ['Upper'] } }).success).toBe(false);
  });
});
