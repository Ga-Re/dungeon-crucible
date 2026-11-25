import { describe, expect, it } from 'vitest';
import {
  commitView, cycleAssetVariant, deletePlacedAsset, moveAssetTo, placeAsset, placedAssetAt, rotatePlacedAsset, scalePlacedAsset, selectPlacedAsset, setAssetInfo, setWorkspace, state, toggleHidden, undo,
} from './store';

/** Placing assets in the Map Forge (DC-041). The sample crypt has 70 px cells. */
describe('placed assets', () => {
  const info = {
    'library/oak_01.png': { name: 'oak 01', kind: 'prop' as const, sizeCells: { w: 2, h: 2 }, group: 'P: oak', url: 'dc-asset://file/oak_01.png', video: false },
    'library/oak_02.png': { name: 'oak 02', kind: 'prop' as const, sizeCells: { w: 2, h: 2 }, group: 'P: oak', url: 'dc-asset://file/oak_02.png', video: false },
  };

  it('places, moves, turns, scales, changes the variant and deletes – each undoable – in the map', () => {
    setWorkspace('forge');
    setAssetInfo(info);
    const before = state.scene.map.assets.length;
    const id = placeAsset('library/oak_01.png', { x: 150, y: 120 })!;
    const a = () => state.scene.map.assets.find((x) => x.id === id)!;
    // A 2×2 asset snaps its edges to the grid.
    expect(a()).toMatchObject({ assetPath: 'library/oak_01.png', x: 140, y: 140, rotation: 0, scale: 1 });
    expect(state.selectedAssetId).toBe(id);
    expect(placedAssetAt({ x: 100, y: 100 })).toBe(id);
    moveAssetTo(id, { x: 290, y: 280 }, true);
    expect(a()).toMatchObject({ x: 280, y: 280 });
    rotatePlacedAsset(id, -15);
    expect(a().rotation).toBe(345);
    scalePlacedAsset(id, 1.25);
    expect(a().scale).toBe(1.25);
    cycleAssetVariant(id);
    expect(a().assetPath).toBe('library/oak_02.png');
    commitView();
    expect(state.mapDoc!.assets.find((x) => x.id === id)).toMatchObject({ assetPath: 'library/oak_02.png', rotation: 345 });
    deletePlacedAsset(id);
    expect(state.scene.map.assets).toHaveLength(before);
    expect(state.selectedAssetId).toBeNull();
    undo();
    expect(a().assetPath).toBe('library/oak_02.png');
  });

  it('the Orchestrator places assets in the scene only; map assets are only hidden there', () => {
    setWorkspace('forge');
    setAssetInfo(info);
    const id = placeAsset('library/oak_01.png', { x: 500, y: 500 })!;
    setWorkspace('play');
    const mapAssets = state.mapDoc!.assets.length;
    const own = placeAsset('library/oak_01.png', { x: 600, y: 600 })!;
    expect(state.scene.ownAssets.map((a) => a.id)).toEqual([own]);
    // The map's asset cannot be selected (or moved) here; the scene's own can.
    selectPlacedAsset(null);
    selectPlacedAsset(id);
    expect(state.selectedAssetId).toBeNull();
    selectPlacedAsset(own);
    expect(state.selectedAssetId).toBe(own);
    toggleHidden(id);
    expect(state.scene.map.assets.some((x) => x.id === id)).toBe(false);
    expect(state.scene.hidden.assets.map((x) => x.id)).toEqual([id]);
    commitView();
    expect(state.sceneDoc!.hidden).toContain(id);
    expect(state.sceneDoc!.assets.map((a) => a.id)).toEqual([own]);
    expect(state.mapDoc!.assets).toHaveLength(mapAssets);
    toggleHidden(id);
    expect(state.scene.map.assets.some((x) => x.id === id)).toBe(true);
    // The scene's own asset hides and comes back as its own.
    toggleHidden(own);
    toggleHidden(own);
    expect(state.scene.ownAssets.map((a) => a.id)).toEqual([own]);
  });

});

describe('scene-own assets in the start and in play (DC-110)', () => {
  it('prepared ones stay after a reset, those placed in play go', async () => {
    const { resetScene, setEditStart } = await import('./campaign');
    setWorkspace('play');
    setAssetInfo({ 'library/fire.png': { name: 'fire', kind: 'prop', url: null, video: false } });
    await setEditStart(true);
    const prepared = placeAsset('library/fire.png', { x: 700, y: 700 })!;
    await setEditStart(false);
    expect(state.scene.ownAssets.map((a) => a.id)).not.toContain(prepared);
    const played = placeAsset('library/fire.png', { x: 800, y: 800 })!;
    commitView();
    const ids = (xs: { id: string }[]) => xs.map((a) => a.id);
    expect(ids(state.sceneDoc!.start!.assets)).toContain(prepared);
    expect(ids(state.sceneDoc!.start!.assets)).not.toContain(played);
    expect(ids(state.sceneDoc!.assets)).toContain(played);
    await resetScene();
    expect(ids(state.scene.ownAssets)).toContain(prepared);
    expect(ids(state.scene.ownAssets)).not.toContain(played);
  });
});
