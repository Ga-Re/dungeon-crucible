import { describe, expect, it } from 'vitest';
import { readDocument } from './documents';
import { DEFAULT_GRID } from './grid';
import { activeLayers, drawOrder } from './layers';
import { allPlacements, commitStart, mapSidecarFromScene, resetToStart, sceneFromDocuments, sceneIssues, sceneOverrideFromScene, startOf } from './persistence';
import { MapSidecarSchema, SceneOverrideSchema, SCENE_VERSION, type MapSidecar, type SceneOverride } from './sidecar';

/** Layers of a map (E-28, DC-101). */
const map: MapSidecar = MapSidecarSchema.parse({
  kind: 'map', schemaVersion: 4, name: 'Camp', resource: 'camp.png', isVideo: false, widthPx: 1000, heightPx: 1000, grid: { ...DEFAULT_GRID },
  layers: [
    { id: 'inside', name: 'Tent inside', height: 2, defaultActive: false, counter: 'roof' },
    { id: 'roof', name: 'Tent roof', height: 3, defaultActive: true },
  ],
  walls: [
    { id: 'w-out', kind: 'wall', x1: 0, y1: 0, x2: 100, y2: 0 },
    { id: 'w-in', kind: 'wall', x1: 0, y1: 50, x2: 100, y2: 50, layer: 'inside' },
  ],
  lights: [{ id: 'lamp', x: 50, y: 50, brightFt: 10, dimFt: 20, color: '#ffaa00', layer: 'inside' }],
  assets: [
    { id: 'roof-1', assetPath: 'library/roof.png', x: 50, y: 50, rotation: 0, scale: 1, layer: 'roof' },
    { id: 'rug', assetPath: 'library/rug.png', x: 50, y: 50, rotation: 0, scale: 1, layer: 'inside' },
    { id: 'rock', assetPath: 'library/rock.png', x: 500, y: 500, rotation: 0, scale: 1 },
  ],
});

function doc(extra: Partial<SceneOverride> = {}): SceneOverride {
  return SceneOverrideSchema.parse({ kind: 'scene', schemaVersion: SCENE_VERSION, name: 'S', mapSidecar: 'library/camp.png.dm.json', fog: { revealed: [], remembered: [] }, ...extra });
}

const ids = (xs: { id: string }[]) => xs.map((x) => x.id);

describe('files', () => {
  it('a version 3 map has no layers: everything is on the base layer', () => {
    const r = readDocument('map', MapSidecarSchema, JSON.stringify({ kind: 'map', schemaVersion: 3, name: 'Old', resource: 'a.png', widthPx: 10, heightPx: 10, grid: DEFAULT_GRID, walls: [{ id: 'w', kind: 'wall', x1: 0, y1: 0, x2: 1, y2: 0 }] }));
    expect(r.ok && r.value).toMatchObject({ schemaVersion: 4, layers: [] });
    expect(r.ok && r.value.walls[0].layer).toBeUndefined();
  });

  it('a version 5 scene switches no layer', () => {
    const r = readDocument('scene', SceneOverrideSchema, JSON.stringify({ kind: 'scene', schemaVersion: 5, name: 'S', mapSidecar: 'm', fog: { revealed: [], remembered: [] } }));
    expect(r.ok && r.value).toMatchObject({ schemaVersion: 6, layers: {} });
  });
});

describe('active layers', () => {
  it('the base layer always; others by the scene, else their default', () => {
    expect([...activeLayers(map.layers, {})].sort()).toEqual(['map', 'roof']);
    expect([...activeLayers(map.layers, { inside: true, roof: false })].sort()).toEqual(['inside', 'map']);
  });
});

describe('a scene view', () => {
  it('leaves out the elements of inactive layers – without hiding them', () => {
    const s = sceneFromDocuments(map, doc(), null);
    expect(ids(s.walls)).toEqual(['w-out']);
    expect(ids(s.lights)).toEqual([]);
    expect(ids(allPlacements(s))).toEqual(['roof-1', 'rock']);
    expect(ids(s.inactive.walls)).toEqual(['w-in']);
    const out = sceneOverrideFromScene(s, 'S', 'm', { round: 1, turn: 0 }, map);
    expect(out.hidden).toEqual([]);
    expect(out.overrides).toEqual({});
    expect(sceneIssues(map, doc()).orphaned).toEqual([]);
    expect(ids(mapSidecarFromScene(s, 'camp.png', 'scene', map).walls)).toEqual(['w-out', 'w-in']);
  });

  it('a scene that switched the inside on shows it; the switch is saved', () => {
    const s = sceneFromDocuments(map, doc({ layers: { inside: true, roof: false } }), null);
    expect(ids(s.walls)).toEqual(['w-out', 'w-in']);
    expect(ids(s.lights)).toEqual(['lamp']);
    expect(ids(allPlacements(s))).toEqual(['rug', 'rock']);
    expect(sceneOverrideFromScene(s, 'S', 'm', { round: 1, turn: 0 }, map).layers).toEqual({ inside: true, roof: false });
  });

  it('the Map Forge shows every layer', () => {
    const s = sceneFromDocuments(map, doc(), null, undefined, 'map');
    expect(ids(s.walls)).toEqual(['w-out', 'w-in']);
    expect(ids(s.map.assets)).toEqual(['roof-1', 'rug', 'rock']);
  });

  it('the start keeps its own switches; reset takes them', () => {
    const base = doc();
    const startView = sceneFromDocuments(map, base, null, undefined, 'start');
    startView.layersOn = { inside: true };
    const prepared = commitStart(base, sceneOverrideFromScene(startView, 'S', 'm', { round: 1, turn: 0 }, map), []);
    expect(startOf(prepared).layers).toEqual({ inside: true });
    expect(prepared.layers).toEqual({});
    expect(resetToStart({ ...prepared, layers: { roof: false } }).layers).toEqual({ inside: true });
  });
});

describe('drawing order', () => {
  it('assets of a higher layer lie above those of a lower one; the base layer is lowest', () => {
    expect(ids(drawOrder(map.assets, map.layers))).toEqual(['rock', 'rug', 'roof-1']);
  });
});
