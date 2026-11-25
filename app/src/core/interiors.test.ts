import { describe, expect, it } from 'vitest';
import { readDocument } from './documents';
import { DEFAULT_GRID } from './grid';
import { interiorChanges, interiorOf, interiorWalls, shownAssetPath } from './interiors';
import { commitStart, resetToStart, sceneFromDocuments, sceneOverrideFromScene, startOf } from './persistence';
import { AssetSidecarSchema, MapSidecarSchema, SceneOverrideSchema, SCENE_VERSION, type MapSidecar } from './sidecar';

/** Interiors as asset variants (E-29, DC-042 step 3). Grid: 70 px cells, 5 ft. */
const grid = DEFAULT_GRID;
const trigger = { mode: 'enter' as const, nearFt: 10, confirm: false, leaveOff: true };
const info = {
  'library/house_roof.png': {
    sizeCells: { w: 2, h: 2 },
    interior: { asset: 'library/house_inside.png', walls: [{ kind: 'wall' as const, x1: 0, y1: 0, x2: 2, y2: 0 }, { kind: 'door' as const, x1: 0.5, y1: 2, x2: 1.5, y2: 2 }], trigger },
  },
  'library/barrel.png': { sizeCells: { w: 1, h: 1 } },
};
// A 2×2 house: footprint 70…210 × 70…210.
const house = { id: 'h1', assetPath: 'library/house_roof.png', x: 140, y: 140, rotation: 0, scale: 1 };

describe('files', () => {
  it('a version 2 asset, a version 4 map and a version 6 scene read without interiors', () => {
    const a = readDocument('asset', AssetSidecarSchema, JSON.stringify({ kind: 'asset', schemaVersion: 2, name: 'House', assetKind: 'prop' }));
    expect(a.ok && a.value.interior).toBeUndefined();
    const m = readDocument('map', MapSidecarSchema, JSON.stringify({ kind: 'map', schemaVersion: 4, name: 'M', resource: 'm.png', widthPx: 10, heightPx: 10, grid, assets: [{ id: 'h1', assetPath: 'x.png', x: 1, y: 1 }] }));
    expect(m.ok && m.value).toMatchObject({ schemaVersion: 5 });
    expect(m.ok && m.value.assets[0].interiorTrigger).toBeUndefined();
    const s = readDocument('scene', SceneOverrideSchema, JSON.stringify({ kind: 'scene', schemaVersion: 6, name: 'S', mapSidecar: 'm', fog: { revealed: [], remembered: [] } }));
    expect(s.ok && s.value).toMatchObject({ schemaVersion: 7, interiors: {} });
  });

  it('an interior keeps its trigger defaults', () => {
    const a = AssetSidecarSchema.parse({ kind: 'asset', schemaVersion: 3, name: 'House', assetKind: 'prop', interior: { asset: 'library/in.png' } });
    expect(a.interior).toEqual({ asset: 'library/in.png', walls: [], trigger: { mode: 'enter', nearFt: 10, confirm: false, leaveOff: true } });
  });
});

describe('an interior', () => {
  it('the trigger comes from the asset unless the placement has its own', () => {
    expect(interiorOf(house, info)?.trigger).toEqual(trigger);
    expect(interiorOf({ ...house, interiorTrigger: { ...trigger, mode: 'click' } }, info)?.trigger.mode).toBe('click');
    expect(interiorOf({ ...house, assetPath: 'library/barrel.png' }, info)).toBeNull();
  });

  it('while shown, the placement shows the inner asset', () => {
    expect(shownAssetPath(house, info, {})).toBe('library/house_roof.png');
    expect(shownAssetPath(house, info, { h1: true })).toBe('library/house_inside.png');
  });

  it('its walls and doors are on the map only while it is shown; doors open as the scene says', () => {
    expect(interiorWalls([house], info, grid, {}, {})).toEqual([]);
    const walls = interiorWalls([house], info, grid, { h1: true }, { 'h1:in1': true });
    expect(walls.map((w) => [w.id, w.kind, w.x1, w.y1, w.x2, w.y2, w.open])).toEqual([
      ['h1:in0', 'wall', 70, 70, 210, 70, undefined],
      ['h1:in1', 'door', 105, 210, 175, 210, true],
    ]);
  });
});

describe('triggers', () => {
  const near = { ...house, id: 'h2', interiorTrigger: { ...trigger, mode: 'near' as const, nearFt: 10 } };
  const click = { ...house, id: 'h3', interiorTrigger: { ...trigger, mode: 'click' as const } };

  it('entering: a character inside the footprint; leaving: none inside any more', () => {
    let r = interiorChanges([house], info, grid, [{ x: 300, y: 300 }], new Set());
    expect(r).toEqual({ entered: [], left: [], inside: new Set() });
    r = interiorChanges([house], info, grid, [{ x: 150, y: 150 }], r.inside);
    expect(r).toEqual({ entered: ['h1'], left: [], inside: new Set(['h1']) });
    r = interiorChanges([house], info, grid, [{ x: 160, y: 150 }], r.inside);
    expect(r.entered).toEqual([]);
    r = interiorChanges([house], info, grid, [{ x: 300, y: 300 }], r.inside);
    expect(r).toEqual({ entered: [], left: ['h1'], inside: new Set() });
  });

  it('near: within the distance of the footprint (10 ft = 140 px); a click-only house never', () => {
    expect(interiorChanges([near, click], info, grid, [{ x: 340, y: 140 }], new Set()).entered).toEqual(['h2']);
    expect(interiorChanges([near, click], info, grid, [{ x: 360, y: 140 }], new Set()).entered).toEqual([]);
    expect(interiorChanges([near, click], info, grid, [{ x: 140, y: 140 }], new Set()).entered).toEqual(['h2']);
  });
});

describe('scene state', () => {
  const map: MapSidecar = MapSidecarSchema.parse({ kind: 'map', schemaVersion: 5, name: 'Village', resource: 'v.png', widthPx: 1000, heightPx: 1000, grid, assets: [house] });
  const doc = (extra = {}) => SceneOverrideSchema.parse({ kind: 'scene', schemaVersion: SCENE_VERSION, name: 'S', mapSidecar: 'm', fog: { revealed: [], remembered: [] }, ...extra });

  it('which houses show their interior is saved with the scene; the start keeps its own; reset takes it', () => {
    const s = sceneFromDocuments(map, doc({ interiors: { h1: true } }), null);
    expect(s.interiorsOn).toEqual({ h1: true });
    expect(sceneOverrideFromScene(s, 'S', 'm', { round: 1, turn: 0 }, map).interiors).toEqual({ h1: true });
    const base = doc();
    const startView = sceneFromDocuments(map, base, null, undefined, 'start');
    startView.interiorsOn = { h1: true };
    const prepared = commitStart(base, sceneOverrideFromScene(startView, 'S', 'm', { round: 1, turn: 0 }, map), []);
    expect(startOf(prepared).interiors).toEqual({ h1: true });
    expect(prepared.interiors).toEqual({});
    expect(resetToStart({ ...prepared, interiors: {} }).interiors).toEqual({ h1: true });
    // The Map Forge shows every house from outside.
    expect(sceneFromDocuments(map, doc({ interiors: { h1: true } }), null, undefined, 'map').interiorsOn).toEqual({});
  });
});
