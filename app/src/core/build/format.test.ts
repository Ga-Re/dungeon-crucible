import { describe, expect, it } from 'vitest';
import { readDocument } from '../documents';
import { duplicateMap } from '../mapCopy';
import { DRAWN_RESOURCE, isDrawn, mapSidecarFromScene, mapSidecarPath, sceneFromDocuments, sceneOverrideFromScene } from '../persistence';
import { MAP_VERSION, MapSidecarSchema, SceneOverrideSchema } from '../sidecar';
import { createSampleScene } from '../../sample/crypt';
import { foundKey, type BuildDoor, type Masonry } from './masonry';

const wall: Masonry = { id: 'm-a', points: [{ x: 0, y: 0 }, { x: 200, y: 0 }, { x: 200, y: 200 }], closed: false, style: 'brick', thickness: 12, seed: 7 };
const door: BuildDoor = { id: 'md-a', wall: 'm-a', at: 100, width: 50, secret: true, crack: true };

function drawnMap() {
  const scene = createSampleScene();
  scene.map.masonry = [structuredClone(wall)];
  scene.map.masonryDoors = [{ ...door }];
  scene.map.origin = { x: -100, y: -50 };
  return MapSidecarSchema.parse(JSON.parse(JSON.stringify(mapSidecarFromScene(scene, 'builtin:crypt', 'map'))));
}

describe('drawn walls in the map file (E-33)', () => {
  it('reads a version 5 map without drawn walls', () => {
    const v5 = { ...mapSidecarFromScene(createSampleScene(), 'builtin:crypt', 'map'), schemaVersion: 5 } as Record<string, unknown>;
    delete v5['masonry'];
    delete v5['masonryDoors'];
    const r = readDocument('map', MapSidecarSchema, JSON.stringify(v5));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.masonry).toEqual([]);
      expect(r.value.masonryDoors).toEqual([]);
      expect(r.value.origin).toBeUndefined();
    }
  });

  it('keeps drawn walls, doors and the origin', () => {
    const map = drawnMap();
    expect(map.masonry).toEqual([wall]);
    expect(map.masonryDoors).toEqual([door]);
    expect(map.origin).toEqual({ x: -100, y: -50 });
    const view = sceneFromDocuments(map, null, null, undefined, 'map');
    expect(view.map.masonry).toEqual([wall]);
    expect(view.map.origin).toEqual({ x: -100, y: -50 });
  });

  it('refuses drawn walls with fewer than two points and unknown styles', () => {
    const bad = { ...drawnMap(), masonry: [{ ...wall, points: [{ x: 0, y: 0 }] }] };
    expect(MapSidecarSchema.safeParse(bad).success).toBe(false);
    expect(MapSidecarSchema.safeParse({ ...drawnMap(), masonry: [{ ...wall, style: 'glass' }] }).success).toBe(false);
  });

  it('knows a drawn map by its resource', () => {
    expect(isDrawn(DRAWN_RESOURCE)).toBe(true);
    expect(isDrawn('library/cave.webp')).toBe(false);
  });
});

describe('door states of drawn doors in a scene', () => {
  it('round-trip open and found, and leave out doors that are gone', () => {
    const map = drawnMap();
    const scene = sceneFromDocuments(map, null, null);
    expect(scene.masonryDoorsOpen).toEqual({});
    scene.masonryDoorsOpen = { 'md-a': true, [foundKey('md-a')]: true, 'md-gone': true, [foundKey('md-gone')]: true };
    const ov = SceneOverrideSchema.parse(JSON.parse(JSON.stringify(sceneOverrideFromScene(scene, 'S', mapSidecarPath('builtin:crypt'), { round: 1, turn: 0 }, map))));
    expect(ov.doors['md-a']).toBe(true);
    expect(ov.doors[foundKey('md-a')]).toBe(true);
    expect(ov.doors['md-gone']).toBeUndefined();
    const back = sceneFromDocuments(map, ov, null);
    expect(back.masonryDoorsOpen).toEqual({ 'md-a': true, [foundKey('md-a')]: true });
  });

  it('are not part of the Map Forge view', () => {
    const map = drawnMap();
    const ov = SceneOverrideSchema.parse({ ...JSON.parse(JSON.stringify(sceneOverrideFromScene(sceneFromDocuments(map, null, null), 'S', mapSidecarPath('builtin:crypt'), { round: 1, turn: 0 }, map))), doors: { 'md-a': true } });
    expect(sceneFromDocuments(map, ov, null, undefined, 'map').masonryDoorsOpen).toEqual({});
  });
});

describe('duplicating a drawn map', () => {
  let n = 0;
  const fresh = (prefix: string) => `${prefix}-${++n}`;

  it('"only the map" of a picture map leaves walls drawn over it out', () => {
    const copy = duplicateMap(drawnMap(), 'Copy', false, fresh);
    expect(copy.masonry).toEqual([]);
    expect(copy.masonryDoors).toEqual([]);
  });

  it('"only the map" of a drawn map keeps the drawing: it is its picture', () => {
    const copy = duplicateMap({ ...drawnMap(), resource: DRAWN_RESOURCE }, 'Copy', false, fresh);
    expect(copy.masonry).toEqual([wall]);
    expect(copy.masonryDoors).toEqual([door]);
    expect(copy.walls).toEqual([]);
  });

  it('"with everything" renews ids and the doors follow their wall', () => {
    const copy = duplicateMap(drawnMap(), 'Copy', true, fresh);
    expect(copy.masonry[0].id).not.toBe('m-a');
    expect(copy.masonryDoors[0].id).not.toBe('md-a');
    expect(copy.masonryDoors[0].wall).toBe(copy.masonry[0].id);
    expect(copy.origin).toEqual({ x: -100, y: -50 });
  });
});

describe('cliffs in the map file (E-34)', () => {
  it('round-trip; files without them read with none', () => {
    const scene = createSampleScene();
    scene.map.cliffs = [{ id: 'cl-a', points: [{ x: 0, y: 0 }, { x: 140, y: 0 }], closed: false, kind: 'earth', form: 'ravine', steep: true, width: 70, steps: 3, inside: 'low', growth: false, seed: 9 }];
    const map = MapSidecarSchema.parse(JSON.parse(JSON.stringify(mapSidecarFromScene(scene, 'builtin:crypt', 'map'))));
    expect(map.cliffs).toEqual(scene.map.cliffs);
    expect(sceneFromDocuments(map, null, null, undefined, 'map').map.cliffs).toEqual(scene.map.cliffs);
    const { cliffs: _c, ...without } = map;
    expect(MapSidecarSchema.parse(without).cliffs).toEqual([]);
  });
});

describe('water in the map file (E-35)', () => {
  it('round-trips with its animation switch; files without read with none, animated', () => {
    const scene = createSampleScene();
    scene.map.waters = [{ id: 'w-a', kind: 'river', points: [{ x: 0, y: 0 }, { x: 140, y: 70 }], closed: false, width: 50, seed: 3 }];
    scene.map.waterAnimated = false;
    const map = MapSidecarSchema.parse(JSON.parse(JSON.stringify(mapSidecarFromScene(scene, 'builtin:crypt', 'map'))));
    expect(map.waters).toEqual(scene.map.waters);
    expect(map.waterAnimated).toBe(false);
    expect(sceneFromDocuments(map, null, null, undefined, 'map').map).toMatchObject({ waters: scene.map.waters, waterAnimated: false });
    const { waters: _w, waterAnimated: _a, ...without } = map;
    expect(MapSidecarSchema.parse(without)).toMatchObject({ waters: [], waterAnimated: true });
  });
});

describe('a scene with its own drawing (DC-107c/DC-119b/f, E-37, E-41)', () => {
  it('round-trips its own walls and what it hides; reset brings the start drawing back; old scenes read with none', async () => {
    const { SCENE_VERSION } = await import('../sidecar');
    const { resetToStart, startOf } = await import('../persistence');
    expect(SCENE_VERSION).toBe(13);
    const map = drawnMap();
    const scene = sceneFromDocuments(map, null, null);
    expect(scene.own.masonry).toEqual([]);
    scene.own.masonry = [{ id: 's-a', points: [{ x: 0, y: 500 }, { x: 140, y: 500 }], closed: false, style: 'wood', thickness: 8, seed: 2 }];
    scene.drawnHidden = ['m-a'];
    const ov = SceneOverrideSchema.parse(JSON.parse(JSON.stringify(sceneOverrideFromScene(scene, 'S', mapSidecarPath('builtin:crypt'), { round: 1, turn: 0 }, map))));
    expect(ov.drawing.masonry.map((w) => w.id)).toEqual(['s-a']);
    expect(ov.drawing.hidden).toEqual(['m-a']);
    const back = sceneFromDocuments(map, ov, null);
    expect(back.own.masonry.map((w) => w.id)).toEqual(['s-a']);
    expect(back.drawnHidden).toEqual(['m-a']);
    // The start had none: reset takes them away again.
    const withStart = { ...ov, start: { ...startOf(ov), drawing: { masonry: [], masonryDoors: [], cliffs: [], waters: [], floors: [], paths: [], hidden: [] } } };
    expect(resetToStart(withStart).drawing.masonry).toEqual([]);
    // The Map Forge shows the map alone.
    expect(sceneFromDocuments(map, ov, null, undefined, 'map').own.masonry).toEqual([]);
    const v7 = readDocument('scene', SceneOverrideSchema, JSON.stringify({ kind: 'scene', schemaVersion: 7, name: 'S', mapSidecar: 'm', fog: { revealed: [], remembered: [] } }));
    expect(v7.ok && v7.value.drawing).toEqual({ masonry: [], masonryDoors: [], cliffs: [], waters: [], floors: [], paths: [], hidden: [] });
  });
});

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
};
const INTENT_KEYS = Object.keys(intent) as (keyof typeof intent)[];
const pickIntent = (m: Record<string, unknown>) => Object.fromEntries(INTENT_KEYS.filter((k) => m[k] !== undefined).map((k) => [k, m[k]]));

/** A map with storeys and a layer, and all of the intent. */
function intentMap() {
  const base = mapSidecarFromScene(createSampleScene(), 'builtin:crypt', 'map');
  return MapSidecarSchema.parse(JSON.parse(JSON.stringify({ ...base, storeys: [{ id: 'storey-cave', name: 'Cave', level: -1 }], layers: [{ id: 'flood', name: 'Flood' }], ...intent })));
}

describe('map file version 14 (E-46 – E-77, DC-121)', () => {
  it('map version 14, scene version 13, the same in the file rules', async () => {
    const { DOCUMENT_VERSIONS } = await import('../documents');
    const { SCENE_VERSION } = await import('../sidecar');
    expect(MAP_VERSION).toBe(14);
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
    expect(r.value).toMatchObject({ schemaVersion: 14, lightAngle: 120, waterAnimated: false, origin: { x: -70, y: 0 } });
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
    expect(r.value.drawing).toMatchObject({ masonry: [], paths: [], hidden: [] });
    expect(r.value.start?.drawing).toMatchObject({ masonry: [], paths: [], hidden: [] });
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
    expect(written['masonry'] ?? []).toEqual([]);
    expect(written['generated']).toBeUndefined();
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
