import { describe, expect, it } from 'vitest';
import { readDocument } from './documents';
import { DEFAULT_GRID } from './grid';
import { allPlacements, commitStart, mapSidecarFromScene, resetToStart, sceneFromDocuments, sceneIssues, sceneOverrideFromScene, startOf } from './persistence';
import { MAP_VERSION, SceneOverrideSchema, SCENE_VERSION, type MapSidecar, type SceneOverride } from './sidecar';

/** Scene-own assets, asset lights and effects per scene (DC-110). */
const map: MapSidecar = {
  kind: 'map', schemaVersion: MAP_VERSION, name: 'Hall', layers: [], masonry: [], masonryDoors: [], cliffs: [], waters: [], waterAnimated: true, lightAngle: 45, autoShore: true, autoGrowth: true, resource: 'hall.png', isVideo: false, widthPx: 1000, heightPx: 1000,
  tags: [], biome: '', mapType: 'dungeon', fogBiome: 'nebel', fogStrength: 1, grid: { ...DEFAULT_GRID },
  walls: [], zones: [], pois: [], lights: [], ambient: 'dark',
  assets: [{ id: 'torch', assetPath: 'library/torch.png', x: 100, y: 100, rotation: 0, scale: 1 }],
};
const campfire = { id: 'fire', assetPath: 'library/campfire.webm', x: 500, y: 500, rotation: 0, scale: 1 };

function doc(extra: Partial<SceneOverride> = {}): SceneOverride {
  return SceneOverrideSchema.parse({ kind: 'scene', schemaVersion: SCENE_VERSION, name: 'S', mapSidecar: 'library/hall.png.dm.json', fog: { revealed: [], remembered: [] }, ...extra });
}

describe('scene files version 5', () => {
  it('a version 4 scene is read with no own assets and no effect states', () => {
    const r = readDocument('scene', SceneOverrideSchema, JSON.stringify({ kind: 'scene', schemaVersion: 4, name: 'S', mapSidecar: 'm', fog: { revealed: [], remembered: [] } }));
    expect(r.ok && r.value).toMatchObject({ schemaVersion: SCENE_VERSION, assets: [], effects: {} });
  });
});

describe('own assets in a view', () => {
  it("are kept apart from the map's; drawing and vision take both", () => {
    const s = sceneFromDocuments(map, doc({ assets: [campfire] }), null);
    expect(s.ownAssets.map((a) => a.id)).toEqual(['fire']);
    expect(s.map.assets.map((a) => a.id)).toEqual(['torch']);
    expect(allPlacements(s).map((a) => a.id)).toEqual(['torch', 'fire']);
    // The Map Forge shows none.
    expect(sceneFromDocuments(map, doc({ assets: [campfire] }), null, undefined, 'map').ownAssets).toEqual([]);
  });

  it('are saved with the scene, never into the map; asset lights and effects keep their state', () => {
    const s = sceneFromDocuments(map, doc({ assets: [campfire], lights: { 'torch:light': false }, effects: { fire: false } }), null);
    expect(s.assetLightsOn).toEqual({ 'torch:light': false });
    expect(s.effectsOn).toEqual({ fire: false });
    const out = sceneOverrideFromScene(s, 'S', 'm', { round: 1, turn: 0 }, map);
    expect(out.assets).toEqual([campfire]);
    expect(out.lights).toEqual({ 'torch:light': false });
    expect(out.effects).toEqual({ fire: false });
    expect(mapSidecarFromScene(s, 'hall.png', 'scene', map).assets.map((a) => a.id)).toEqual(['torch']);
  });

  it('a scene may hide its own asset; no orphan report for it', () => {
    const d = doc({ assets: [campfire], hidden: ['fire'] });
    expect(sceneFromDocuments(map, d, null).hidden.assets.map((a) => a.id)).toEqual(['fire']);
    expect(sceneIssues(map, d).orphaned).toEqual([]);
  });
});

describe('start and reset', () => {
  it('prepared assets stay after a reset, those placed in play go; effects and lights return to the start', () => {
    const base = doc();
    const startView = sceneFromDocuments(map, base, null, undefined, 'start');
    startView.ownAssets.push(campfire);
    startView.effectsOn = { fire: false };
    const prepared = commitStart(base, sceneOverrideFromScene(startView, 'S', 'm', { round: 1, turn: 0 }, map), []);
    expect(startOf(prepared).assets).toEqual([campfire]);
    expect(prepared.assets).toEqual([]);
    const played: SceneOverride = { ...prepared, assets: [campfire, { ...campfire, id: 'rubble', assetPath: 'library/rubble.png' }], effects: { fire: true } };
    const reset = resetToStart(played);
    expect(reset.assets.map((a) => a.id)).toEqual(['fire']);
    expect(reset.effects).toEqual({ fire: false });
  });
});
