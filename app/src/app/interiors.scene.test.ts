import { describe, expect, it } from 'vitest';
import { isInside } from '../core/poly/fog';
import { activateAsset, answerInteriorAsk, assetExtras, commitView, deletePlacedAsset, moveToken, placeAsset, produceFrame, setAssetInfo, setWorkspace, sightWalls, state, toggleDoor, undo } from './store';

/** Houses with an interior in a scene (E-29, DC-042 step 3). The sample crypt has 70 px cells; the throne room spans cells 13–23 × 11–19. */
describe('interiors in the Orchestrator', () => {
  const trigger = { mode: 'enter' as const, nearFt: 10, confirm: false, leaveOff: true };
  const house = (confirm = false) => ({
    'library/tent.png': {
      name: 'tent', kind: 'prop' as const, sizeCells: { w: 2, h: 2 }, url: 'dc-asset://file/tent.png', video: false,
      cover: { shape: 'polygon' as const, points: [[0, 0], [2, 0], [2, 2], [0, 2]] as [number, number][] },
      interior: {
        asset: 'library/tent_in.png',
        // The door first (in0), then the walls around.
        walls: [
          { kind: 'door' as const, x1: 0.5, y1: 2, x2: 1.5, y2: 2 },
          { kind: 'wall' as const, x1: 0, y1: 2, x2: 0.5, y2: 2 }, { kind: 'wall' as const, x1: 1.5, y1: 2, x2: 2, y2: 2 },
          { kind: 'wall' as const, x1: 0, y1: 0, x2: 2, y2: 0 }, { kind: 'wall' as const, x1: 0, y1: 0, x2: 0, y2: 2 }, { kind: 'wall' as const, x1: 2, y1: 0, x2: 2, y2: 2 },
        ],
        trigger: { ...trigger, confirm },
      },
    },
    'library/tent_in.png': { name: 'tent inside', kind: 'prop' as const, sizeCells: { w: 2, h: 2 }, url: 'dc-asset://file/tent_in.png', video: false },
  });
  // A tent in the throne room: footprint 1260…1400 × 980…1120.
  const pitch = () => {
    setWorkspace('forge');
    const id = placeAsset('library/tent.png', { x: 1330, y: 1050 })!;
    expect(state.scene.map.assets.find((a) => a.id === id)).toMatchObject({ x: 1330, y: 1050 });
    commitView();
    setWorkspace('play');
    return id;
  };

  it('a character stepping in shows the interior (mask off, inner door on); leaving shows the outside again', () => {
    setAssetInfo(house());
    const id = pitch();
    expect(assetExtras(state.scene).covers).toHaveLength(1);
    const pc = state.scene.tokens.find((t) => t.kind === 'pc')!;
    const from = { x: pc.x, y: pc.y };
    moveToken(pc.id, { x: 1300, y: 1000 }, true);
    expect(state.scene.interiorsOn[id]).toBe(true);
    expect(assetExtras(state.scene).covers ?? []).toHaveLength(0);
    expect(sightWalls(state.scene).find((w) => w.id === `${id}:in0`)).toMatchObject({ kind: 'door', open: false });
    // The inner door opens like any door; saved with the scene's doors.
    toggleDoor(`${id}:in0`);
    expect(sightWalls(state.scene).find((w) => w.id === `${id}:in0`)!.open).toBe(true);
    commitView();
    expect(state.sceneDoc!.interiors[id]).toBe(true);
    expect(state.sceneDoc!.doors[`${id}:in0`]).toBe(true);
    moveToken(pc.id, from, true);
    expect(state.scene.interiorsOn[id]).toBe(false);
    expect(sightWalls(state.scene).some((w) => w.id === `${id}:in0`)).toBe(false);
  });

  it('with confirmation it asks the DM first; a click switches by hand, undoably', () => {
    setAssetInfo(house(true));
    const id = pitch();
    const pc = state.scene.tokens.find((t) => t.kind === 'pc')!;
    moveToken(pc.id, { x: 1300, y: 1000 }, true);
    expect(state.scene.interiorsOn[id]).toBeFalsy();
    // (The first test's tent stands there too and asks as well.)
    expect(state.interiorAsks).toContainEqual({ id, name: 'tent' });
    answerInteriorAsk(id, true);
    expect(state.scene.interiorsOn[id]).toBe(true);
    expect(state.interiorAsks.some((x) => x.id === id)).toBe(false);
    activateAsset(id);
    expect(state.scene.interiorsOn[id]).toBe(false);
    undo();
    expect(state.scene.interiorsOn[id]).toBe(true);
  });

  it('inside is unexplored until seen: switching it on forgets what was remembered of the roof', () => {
    setAssetInfo(house());
    const id = pitch();
    const centre: [number, number] = [1330, 1050];
    // Every player character far away (the earlier tests left one in a tent).
    for (const t of state.scene.tokens.filter((k) => k.kind === 'pc')) moveToken(t.id, { x: 315, y: 875 }, true);
    // The players have seen the roof (remembered); from outside nobody sees in (walls around, door closed).
    state.scene.fog = { ...state.scene.fog, remembered: [...state.scene.fog.remembered, { outer: [[1200, 950], [1450, 950], [1450, 1150], [1200, 1150]], holes: [] }] };
    expect(isInside(produceFrame(1).fog.open, centre)).toBe(true);
    activateAsset(id);
    expect(state.scene.interiorsOn[id]).toBe(true);
    expect(isInside(state.scene.fog.remembered, centre)).toBe(false);
    expect(isInside(produceFrame(2).fog.open, centre)).toBe(false);
    // Around the house the memory stays.
    expect(isInside(state.scene.fog.remembered, [1430, 1140])).toBe(true);
  });

  it('the TV gets the house as switched, never the DM\'s see-through roof', () => {
    setAssetInfo(house());
    const id = pitch();
    expect(state.roofsSeeThrough).toBe(true);
    // (Tents of the earlier tests stand there too.)
    const inside = () => produceFrame(3).assets.filter((a) => a.url.endsWith('tent_in.png')).length;
    const placed = state.scene.map.assets.length;
    const before = inside();
    // One picture per placement, none see-through.
    expect(produceFrame(3).assets).toHaveLength(placed);
    expect(produceFrame(3).assets.some((a) => 'alpha' in a)).toBe(false);
    activateAsset(id);
    expect(inside()).toBe(before + 1);
  });

  it('the state of a house that is gone is not saved', () => {
    setAssetInfo(house());
    setWorkspace('forge');
    const id = placeAsset('library/tent.png', { x: 1330, y: 1050 })!;
    commitView();
    setWorkspace('play');
    activateAsset(id);
    toggleDoor(`${id}:in0`);
    commitView();
    expect(state.sceneDoc!.interiors[id]).toBe(true);
    setWorkspace('forge');
    deletePlacedAsset(id);
    commitView();
    setWorkspace('play');
    commitView();
    expect(state.sceneDoc!.interiors[id]).toBeUndefined();
    expect(state.sceneDoc!.doors[`${id}:in0`]).toBeUndefined();
  });
});
