import { describe, expect, it } from 'vitest';
import { readDocument } from './documents';
import { DEFAULT_GRID } from './grid';
import { commitStart, elementsFromSidecar, mapSidecarFromScene, resetElement, resetToStart, sceneChanges, sceneFromDocuments, sceneIssues, sceneOverrideFromScene, withoutOrphans } from './persistence';
import { MAP_VERSION, SceneOverrideSchema, SCENE_VERSION, type MapSidecar, type SceneOverride } from './sidecar';
import { rectPolygon } from './fogModel';

/** Hiding map elements in a scene, for its start or its play state (DC-103). */
const map: MapSidecar = {
  kind: 'map', schemaVersion: MAP_VERSION, name: 'Hall', layers: [], masonry: [], masonryDoors: [], cliffs: [], waters: [], waterAnimated: true, lightAngle: 45, autoShore: true, autoGrowth: true, floors: [], resource: 'hall.png', isVideo: false, widthPx: 1000, heightPx: 1000,
  tags: [], biome: '', mapType: 'dungeon', fogBiome: 'nebel', fogStrength: 1, grid: { ...DEFAULT_GRID },
  walls: [
    { id: 'w1', kind: 'wall', x1: 0, y1: 0, x2: 100, y2: 0 },
    { id: 'd1', kind: 'door', x1: 100, y1: 0, x2: 200, y2: 0 },
  ],
  zones: [{ id: 'vault', name: 'Vault', shape: [rectPolygon(0, 0, 100, 100)], secret: true, color: '#ffffff' }],
  pois: [], assets: [],
  lights: [{ id: 'l1', x: 50, y: 50, brightFt: 10, dimFt: 20, color: '#ffaa00' }],
  ambient: 'dark',
};

function sceneDoc(extra: Partial<SceneOverride> = {}): SceneOverride {
  return SceneOverrideSchema.parse({ kind: 'scene', schemaVersion: SCENE_VERSION, name: 'S', mapSidecar: 'library/hall.dm.json', fog: { revealed: [], remembered: [] }, ...extra });
}

describe('scene files version 4', () => {
  it('moves { hidden: true } overrides into the hidden lists of play state and start', () => {
    const v3 = {
      kind: 'scene', schemaVersion: 3, name: 'S', mapSidecar: 'library/hall.dm.json', fog: { revealed: [], remembered: [] },
      overrides: { w1: { hidden: true }, l1: { dimFt: 30 } },
      start: { fog: { revealed: [], remembered: [] } },
    };
    const r = readDocument('scene', SceneOverrideSchema, JSON.stringify(v3));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.schemaVersion).toBe(SCENE_VERSION);
    expect(r.value.overrides).toEqual({ l1: { dimFt: 30 } });
    expect(r.value.hidden).toEqual(['w1']);
    expect(r.value.start!.hidden).toEqual(['w1']);
  });

  it('a version 3 scene without a start block gets the list in its play state only', () => {
    const r = readDocument('scene', SceneOverrideSchema, JSON.stringify({ kind: 'scene', schemaVersion: 3, name: 'S', mapSidecar: 'm', fog: { revealed: [], remembered: [] }, overrides: { d1: { hidden: true } } }));
    expect(r.ok && r.value.hidden).toEqual(['d1']);
    expect(r.ok && r.value.start).toBeUndefined();
  });
});

describe('hidden elements in a view', () => {
  it('are kept apart from the shown ones: vision, light and the TV never see them', () => {
    const s = sceneFromDocuments(map, sceneDoc({ hidden: ['w1', 'vault', 'l1'] }), null);
    expect(s.walls.map((w) => w.id)).toEqual(['d1']);
    expect(s.zones).toEqual([]);
    expect(s.lights).toEqual([]);
    expect(s.hidden.walls.map((w) => w.id)).toEqual(['w1']);
    expect(s.hidden.zones.map((z) => z.id)).toEqual(['vault']);
    expect(s.hidden.lights.map((l) => l.id)).toEqual(['l1']);
  });

  it('the start view uses the start list; the Map Forge hides nothing', () => {
    const doc = sceneDoc({ hidden: ['w1'], start: { fog: { revealed: [], remembered: [] }, tokens: [], doors: {}, lights: {}, discoveredZones: [], ambience: [], hidden: ['d1'], assets: [], effects: {}, layers: {}, interiors: {}, drawing: { masonry: [], masonryDoors: [], cliffs: [], waters: [], floors: [], hidden: [] } } });
    expect(sceneFromDocuments(map, doc, null, undefined, 'start').hidden.walls.map((w) => w.id)).toEqual(['d1']);
    expect(sceneFromDocuments(map, doc, null, undefined, 'map').hidden.walls).toEqual([]);
  });

  it('are written as the hidden list, not as overrides, and the map stays whole', () => {
    const s = sceneFromDocuments(map, sceneDoc({ hidden: ['w1'] }), null);
    const out = sceneOverrideFromScene(s, 'S', 'library/hall.dm.json', { round: 1, turn: 0 }, map);
    expect(out.hidden).toEqual(['w1']);
    expect(out.overrides).toEqual({});
    expect(mapSidecarFromScene(s, 'hall.png', 'scene', map).walls.map((w) => w.id)).toEqual(['w1', 'd1']);
  });
});

describe('start and reset', () => {
  it('the start state keeps its own list; reset brings it back into play', () => {
    const doc = sceneDoc({ hidden: [] });
    // Prepared: the corridor is buried from the start.
    const startView = sceneFromDocuments(map, doc, null, undefined, 'start');
    startView.hidden.walls.push(...startView.walls.filter((w) => w.id === 'w1'));
    startView.walls = startView.walls.filter((w) => w.id !== 'w1');
    const fromView = sceneOverrideFromScene(startView, 'S', 'm', { round: 1, turn: 0 }, map);
    const prepared = commitStart(doc, fromView, []);
    expect(prepared.start!.hidden).toEqual(['w1']);
    expect(prepared.hidden).toEqual([]);
    // In play the door is blown away as well; reset: only the prepared one stays hidden.
    const played = { ...prepared, hidden: ['w1', 'd1'] };
    expect(resetToStart(played).hidden).toEqual(['w1']);
  });
});

describe('changes per element', () => {
  it('lists hidden, changed and scene-own elements', () => {
    const doc = sceneDoc({ hidden: ['d1'], overrides: { l1: { dimFt: 30 } }, added: { walls: [{ id: 'rubble', kind: 'wall', x1: 0, y1: 500, x2: 50, y2: 500 }], zones: [], lights: [] } });
    const s = sceneFromDocuments(map, doc, null);
    expect(sceneChanges(elementsFromSidecar(map), s)).toEqual([
      { id: 'd1', kind: 'walls', status: 'hidden' },
      { id: 'rubble', kind: 'walls', status: 'own' },
      { id: 'l1', kind: 'lights', status: 'changed' },
    ]);
  });

  it('"reset to map" gives an element the map\'s fields again, keeping its state', () => {
    const doc = sceneDoc({ overrides: { l1: { dimFt: 30, color: '#00ff00' } }, lights: { l1: false } });
    const s = sceneFromDocuments(map, doc, null);
    const reset = resetElement(s, elementsFromSidecar(map), 'l1');
    expect(reset.lights[0]).toMatchObject({ dimFt: 20, color: '#ffaa00', on: false });
    expect(sceneChanges(elementsFromSidecar(map), reset)).toEqual([]);
    // The scene it came from is unchanged.
    expect(s.lights[0].dimFt).toBe(30);
  });
});

describe('orphaned changes', () => {
  const doc = sceneDoc({
    overrides: { gone: { dimFt: 5 }, l1: { dimFt: 30 } },
    hidden: ['w1', 'lost'],
    start: { fog: { revealed: [], remembered: [] }, tokens: [], doors: {}, lights: {}, discoveredZones: [], ambience: [], hidden: ['lost2'], assets: [], effects: {}, layers: {}, interiors: {}, drawing: { masonry: [], masonryDoors: [], cliffs: [], waters: [], floors: [], hidden: [] } },
  });

  it('are reported: overrides and hidden ids whose element the map has no more', () => {
    expect(sceneIssues(map, doc).orphaned).toEqual(['gone', 'lost', 'lost2']);
  });

  it('survive saving a view until cleaned up', () => {
    const s = sceneFromDocuments(map, doc, null);
    const out = sceneOverrideFromScene(s, 'S', 'm', { round: 1, turn: 0 }, map, { overrides: doc.overrides, added: doc.added, hidden: doc.hidden });
    expect(out.hidden).toEqual(['w1', 'lost']);
    expect(out.overrides).toMatchObject({ gone: { dimFt: 5 } });
  });

  it('are removed by the clean-up; everything else stays', () => {
    const clean = withoutOrphans(doc, map);
    expect(clean.overrides).toEqual({ l1: { dimFt: 30 } });
    expect(clean.hidden).toEqual(['w1']);
    expect(clean.start!.hidden).toEqual([]);
    expect(sceneIssues(map, clean).orphaned).toEqual([]);
  });
});

describe('placed assets in a scene (DC-041)', () => {
  const withAssets: MapSidecar = { ...map, assets: [
    { id: 'p1', assetPath: 'library/oak.png', x: 100, y: 100, rotation: 0, scale: 1 },
    { id: 'p2', assetPath: 'library/rock.png', x: 300, y: 100, rotation: 45, scale: 2 },
  ] };

  it('a scene hides a placed asset like other map elements; saving keeps the map whole', () => {
    const s = sceneFromDocuments(withAssets, sceneDoc({ hidden: ['p1'] }), null);
    expect(s.map.assets.map((a) => a.id)).toEqual(['p2']);
    expect(s.hidden.assets.map((a) => a.id)).toEqual(['p1']);
    expect(sceneOverrideFromScene(s, 'S', 'm', { round: 1, turn: 0 }, withAssets).hidden).toEqual(['p1']);
    expect(mapSidecarFromScene(s, 'hall.png', 'scene', withAssets).assets.map((a) => a.id)).toEqual(['p1', 'p2']);
    expect(sceneIssues(withAssets, sceneDoc({ hidden: ['p1'] })).orphaned).toEqual([]);
    expect(sceneChanges(elementsFromSidecar(withAssets), s)).toContainEqual({ id: 'p1', kind: 'assets', status: 'hidden' });
  });

  it('the Map Forge saves the placed assets of its view', () => {
    const s = sceneFromDocuments(withAssets, null, null, undefined, 'map');
    s.map.assets = s.map.assets.filter((a) => a.id !== 'p2');
    expect(mapSidecarFromScene(s, 'hall.png', 'map', withAssets).assets.map((a) => a.id)).toEqual(['p1']);
  });
});
