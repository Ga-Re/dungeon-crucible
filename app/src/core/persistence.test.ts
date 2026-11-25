import { describe, expect, it } from 'vitest';
import { History } from './history';
import { lockedAreas, mapSidecarFromScene, mapSidecarPath, manifestFromState, sceneFromDocuments, sceneOverrideFromScene, slugify, tableFromManifest } from './persistence';
import { CampaignManifestSchema, MapSidecarSchema, SceneOverrideSchema } from './sidecar';
import { createSampleScene } from '../sample/crypt';
import { updateVision, visiblePolygons } from './vision';
import { hideAll, rememberSeen, revealAll } from './fogModel';
import { isInside } from './poly/fog';

describe('persistence', () => {
  it('round-trips a scene through map sidecar and scene override', () => {
    const scene = createSampleScene();
    scene.fog = rememberSeen(scene.fog, visiblePolygons(updateVision(scene)));
    scene.fogEffect = { biome: 'schnee', strength: 0.4 };
    scene.walls.find((w) => w.id === 'd-throne')!.open = true;
    scene.tokens[0].hp = 7;
    scene.tokens[0].conditions = ['prone'];
    scene.templates.push({ id: 't1', shape: 'cone', x: 10, y: 20, angle: 1, sizeFt: 15, color: '#e2554c' });

    const map = MapSidecarSchema.parse(JSON.parse(JSON.stringify(mapSidecarFromScene(scene, 'builtin:crypt'))));
    const ov = SceneOverrideSchema.parse(JSON.parse(JSON.stringify(sceneOverrideFromScene(scene, 'Session 3', mapSidecarPath('builtin:crypt'), { round: 2, turn: 3 }, map))));
    expect(ov.overrides).toEqual({});
    expect(ov.added).toEqual({ walls: [], zones: [], lights: [] });
    const back = sceneFromDocuments(map, ov, 'builtin:crypt');

    expect(back.walls).toHaveLength(scene.walls.length);
    expect(back.walls.find((w) => w.id === 'd-throne')!.open).toBe(true);
    expect(back.walls.find((w) => w.id === 'd-secret')!.open).toBe(false);
    expect(back.tokens[0]).toMatchObject({ hp: 7, conditions: ['prone'] });
    expect(back.templates).toHaveLength(1);
    expect(back.fog).toEqual(scene.fog);
    expect(back.fog.remembered.length).toBeGreaterThan(0);
    expect(back.fogEffect).toEqual({ biome: 'schnee', strength: 0.4 });
    expect(ov.combat).toEqual({ round: 2, turn: 3 });
  });

  it('keeps secret zones locked on a fresh scene', () => {
    const scene = createSampleScene();
    const map = mapSidecarFromScene(scene, 'builtin:crypt');
    const fresh = sceneFromDocuments(map, null, null);
    const secret = fresh.zones.find((z) => z.kind === 'secret')!;
    expect(secret.discovered).toBe(false);
    const fog = revealAll(fresh.fog, fresh.map.widthPx, fresh.map.heightPx, lockedAreas(fresh.zones));
    expect(isInside(fog.revealed, [secret.rect.x + 10, secret.rect.y + 10])).toBe(false);
  });

  it('stores the table calibration in the campaign manifest', () => {
    const scene = createSampleScene();
    scene.table.ppiCorrection = 1.02;
    const m = CampaignManifestSchema.parse(manifestFromState('Ashes', 'scenes/s3.scene.json', scene.table));
    expect(tableFromManifest(m)).toMatchObject({ ppiCorrection: 1.02, display: { diagonalInches: 55, widthPx: 3840, heightPx: 2160 } });
  });

  it('names files safely', () => {
    expect(slugify("Crypt of Vhal'Durn – Übersicht")).toBe('crypt-of-vhal-durn-ubersicht');
    expect(slugify('***')).toBe('untitled');
    expect(mapSidecarPath('maps/crypt.webp')).toBe('maps/crypt.webp.dm.json');
    expect(mapSidecarPath('builtin:crypt')).toBe('library/crypt.builtin.dm.json');
  });
});

describe('history', () => {
  it('undoes and redoes', () => {
    const h = new History<number>(3);
    h.push(1);
    h.push(2);
    expect(h.undo(3)).toBe(2);
    expect(h.undo(2)).toBe(1);
    expect(h.undo(1)).toBeNull();
    expect(h.redo(1)).toBe(2);
    h.push(5);
    expect(h.canRedo).toBe(false);
  });
  it('drops the oldest entries beyond the limit', () => {
    const h = new History<number>(2);
    [1, 2, 3].forEach((n) => h.push(n));
    expect(h.undo(4)).toBe(3);
    expect(h.undo(3)).toBe(2);
    expect(h.undo(2)).toBeNull();
  });
});

describe('map sidecar round trip', () => {
  it('keeps the catalog data (tags, theme, type, POIs, assets)', () => {
    const map = MapSidecarSchema.parse({
      kind: 'map', schemaVersion: 1, name: 'Tavern', resource: 'library/tavern.webp', widthPx: 1000, heightPx: 800,
      tags: ['town', 'inn'], biome: 'city', mapType: 'building', fogBiome: 'kueste', fogStrength: 0.5,
      grid: { type: 'square', cellWidth: 50, cellHeight: 50, originX: 0, originY: 0, rotationDeg: 0, feetPerCell: 5 },
      pois: [{ id: 'poi-bar', name: 'Bar', x: 10, y: 20, icon: 'flag' }],
      assets: [{ id: 'asset-table', assetPath: 'library/table.webp', x: 1, y: 2, rotation: 15, scale: 1 }],
    });
    const scene = sceneFromDocuments(map, null, 'x');
    const back = mapSidecarFromScene(scene, map.resource);
    expect(back).toMatchObject({ tags: ['town', 'inn'], biome: 'city', mapType: 'building', fogBiome: 'kueste', fogStrength: 0.5, pois: map.pois, assets: map.assets });
  });
});

describe('map and scene layers', () => {
  it('the map layer shows the map: its start fog, no tokens, no scene changes', () => {
    const scene = createSampleScene();
    scene.fog = revealAll(scene.fog, 100, 100, []);
    const map = MapSidecarSchema.parse(JSON.parse(JSON.stringify(mapSidecarFromScene(scene, 'builtin:crypt', 'map'))));
    expect(map.startFog?.revealed.length).toBeGreaterThan(0);
    // The scene hides a wall and adds one.
    const inScene = sceneFromDocuments(map, null, null);
    const hidden = inScene.walls[0]!.id;
    inScene.walls = inScene.walls.filter((w) => w.id !== hidden);
    inScene.walls.push({ id: 'wall-rubble', kind: 'wall', x1: 0, y1: 0, x2: 10, y2: 0 });
    inScene.fog = hideAll();
    inScene.tokens = scene.tokens;
    const ov = SceneOverrideSchema.parse(JSON.parse(JSON.stringify(sceneOverrideFromScene(inScene, 'S', 'library/crypt.builtin.dm.json', { round: 1, turn: 0 }, map))));
    expect(ov.overrides).toEqual({ [hidden]: { hidden: true } });
    expect(ov.added.walls.map((w) => w.id)).toEqual(['wall-rubble']);
    // Scene layer: with the changes; map layer: without them, with the start fog and no tokens.
    const sceneView = sceneFromDocuments(map, ov, null, undefined, 'scene');
    expect(sceneView.walls.some((w) => w.id === hidden)).toBe(false);
    expect(sceneView.walls.some((w) => w.id === 'wall-rubble')).toBe(true);
    expect(sceneView.tokens.length).toBe(scene.tokens.length);
    const mapView = sceneFromDocuments(map, ov, null, undefined, 'map');
    expect(mapView.walls.some((w) => w.id === hidden)).toBe(true);
    expect(mapView.walls.some((w) => w.id === 'wall-rubble')).toBe(false);
    expect(mapView.tokens).toEqual([]);
    expect(mapView.fog).toEqual(map.startFog);
    // A new scene starts with the start fog.
    expect(sceneFromDocuments(map, null, null).fog).toEqual(map.startFog);
  });

  it('a scene view never changes the map elements of the sidecar', () => {
    const scene = createSampleScene();
    const map = mapSidecarFromScene(scene, 'builtin:crypt', 'map');
    const view = sceneFromDocuments(map, null, null, undefined, 'scene');
    view.walls = [];
    view.map.name = 'Renamed';
    const again = mapSidecarFromScene(view, 'builtin:crypt', 'scene', map);
    expect(again.walls).toEqual(map.walls);
    expect(again.name).toBe('Renamed');
  });
});

