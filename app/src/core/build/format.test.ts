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

describe('map file version 6 (E-33)', () => {
  it('is version 6', () => {
    expect(MAP_VERSION).toBe(6);
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
