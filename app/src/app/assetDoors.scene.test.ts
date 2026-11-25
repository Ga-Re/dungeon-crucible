import { describe, expect, it } from 'vitest';
import { activateAsset, commitView, placeAsset, setAssetInfo, setWorkspace, sightWalls, state, toggleDoor, undo } from './store';

/** Door assets (E-29, DC-042 step 2). The sample crypt: the storeroom's top wall runs from (210, 140) to (630, 140). */
describe('door assets', () => {
  const info = {
    'library/door.png': {
      name: 'door', kind: 'prop' as const, sizeCells: { w: 1, h: 1 }, url: 'dc-asset://file/door.png', video: false,
      anchor: { x: 0.5, y: 0.5, wallSnap: true }, door: { x1: 0, y1: 0.5, x2: 1, y2: 0.5 },
    },
  };

  it('placed on a wall, it snaps onto it and cuts a closed door into it; opened in the scene, saved there', () => {
    setWorkspace('forge');
    setAssetInfo(info);
    const id = placeAsset('library/door.png', { x: 300, y: 150 })!;
    expect(state.scene.map.assets.find((a) => a.id === id)).toMatchObject({ x: 315, y: 140, rotation: 0 }); // centred on the cell 280–350
    // The map's wall stays whole; sight and light see a gap with the door in it.
    expect(state.scene.walls.find((w) => w.id === 'w0')).toMatchObject({ x1: 210, x2: 630 });
    const seen = sightWalls(state.scene);
    expect(seen.filter((w) => w.id.startsWith('w0')).map((w) => [w.x1, w.x2])).toEqual([[210, 280], [350, 630]]);
    expect(seen.find((w) => w.id === `${id}:door`)).toMatchObject({ kind: 'door', open: false, x1: 280, x2: 350 });
    commitView();
    expect(state.mapDoc!.walls.find((w) => w.id === 'w0')).toMatchObject({ x1: 210, x2: 630 });

    setWorkspace('play');
    toggleDoor(`${id}:door`);
    expect(sightWalls(state.scene).find((w) => w.id === `${id}:door`)!.open).toBe(true);
    commitView();
    expect(state.sceneDoc!.doors[`${id}:door`]).toBe(true);
    undo();
    expect(state.scene.assetDoorsOpen[`${id}:door`]).toBeFalsy();
    // A click on the asset opens it too.
    expect(activateAsset(id)).toBe(true);
    expect(state.scene.assetDoorsOpen[`${id}:door`]).toBe(true);
  });

  it('walls drawn after a door asset was placed count at once (the wall list changes in place)', () => {
    setWorkspace('forge');
    setAssetInfo(info);
    placeAsset('library/door.png', { x: 300, y: 150 });
    const before = sightWalls(state.scene).length;
    state.scene.walls.push({ id: 'late', kind: 'wall', x1: 0, y1: 1500, x2: 100, y2: 1500 });
    expect(sightWalls(state.scene)).toHaveLength(before + 1);
    expect(sightWalls(state.scene).some((w) => w.id === 'late')).toBe(true);
    // Moved to another layer in place: the cut pieces follow.
    state.scene.walls.find((w) => w.id === 'w0')!.layer = 'roof';
    expect(sightWalls(state.scene).filter((w) => w.id.startsWith('w0~')).every((w) => w.layer === 'roof')).toBe(true);
  });
});
