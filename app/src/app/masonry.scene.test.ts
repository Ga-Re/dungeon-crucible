import { describe, expect, it } from 'vitest';
import { foundKey } from '../core/build/masonry';
import { commitView, discoverZone, setWorkspace, sightWalls, state, toggleDoor, undo } from './store';

/** Drawn walls in sight and in a scene (E-33, DC-107a). */
describe('drawn walls', () => {
  it('count for sight; their doors open in the scene, are saved there and undone', () => {
    setWorkspace('forge');
    state.scene.map.masonry = [{ id: 'm-x', points: [{ x: 0, y: 2000 }, { x: 400, y: 2000 }], closed: false, style: 'dungeon-stone', thickness: 10, seed: 3 }];
    state.scene.map.masonryDoors = [{ id: 'md-x', wall: 'm-x', at: 200, width: 70, secret: true, crack: false }];
    expect(sightWalls(state.scene).filter((w) => w.id.startsWith('m-x')).map((w) => [w.x1, w.x2])).toEqual([[0, 165], [235, 400]]);
    commitView();
    expect(state.mapDoc!.masonry).toHaveLength(1);

    setWorkspace('play');
    expect(sightWalls(state.scene).find((w) => w.id === 'md-x')).toMatchObject({ kind: 'secret-door', open: false });
    toggleDoor('md-x');
    expect(sightWalls(state.scene).find((w) => w.id === 'md-x')!.open).toBe(true);
    commitView();
    expect(state.sceneDoc!.doors).toMatchObject({ 'md-x': true, [foundKey('md-x')]: true });
    undo();
    expect(state.scene.masonryDoorsOpen['md-x']).toBeFalsy();
  });

  it('a discovered secret area opens and finds the drawn secret doors touching it', () => {
    setWorkspace('play');
    state.scene.map.masonry = [{ id: 'm-y', points: [{ x: 0, y: 3000 }, { x: 400, y: 3000 }], closed: false, style: 'brick', thickness: 10, seed: 4 }];
    state.scene.map.masonryDoors = [{ id: 'md-y', wall: 'm-y', at: 200, width: 70, secret: true, crack: false }];
    state.scene.masonryDoorsOpen = {};
    state.scene.zones.push({ id: 'z-y', name: 'Vault', shape: [{ outer: [[150, 3000], [250, 3000], [250, 3100], [150, 3100]], holes: [] }], secret: true, color: '#000000', discovered: false });
    discoverZone('z-y');
    expect(state.scene.masonryDoorsOpen).toMatchObject({ 'md-y': true, [foundKey('md-y')]: true });
  });
});
