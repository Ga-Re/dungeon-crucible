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

describe('map file version 9 (E-33, DC-119b/f, E-37)', () => {
  it('is version 9', () => {
    expect(MAP_VERSION).toBe(9);
  });

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

describe('a scene with its own drawing (scene version 11, DC-107c/DC-119b/f, E-37)', () => {
  it('round-trips its own walls and what it hides; reset brings the start drawing back; old scenes read with none', async () => {
    const { SCENE_VERSION } = await import('../sidecar');
    const { resetToStart, startOf } = await import('../persistence');
    expect(SCENE_VERSION).toBe(11);
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
    const withStart = { ...ov, start: { ...startOf(ov), drawing: { masonry: [], masonryDoors: [], cliffs: [], waters: [], floors: [], hidden: [] } } };
    expect(resetToStart(withStart).drawing.masonry).toEqual([]);
    // The Map Forge shows the map alone.
    expect(sceneFromDocuments(map, ov, null, undefined, 'map').own.masonry).toEqual([]);
    const v7 = readDocument('scene', SceneOverrideSchema, JSON.stringify({ kind: 'scene', schemaVersion: 7, name: 'S', mapSidecar: 'm', fog: { revealed: [], remembered: [] } }));
    expect(v7.ok && v7.value.drawing).toEqual({ masonry: [], masonryDoors: [], cliffs: [], waters: [], floors: [], hidden: [] });
  });
});
