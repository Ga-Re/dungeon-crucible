import { describe, expect, it } from 'vitest';
import { activateAsset, answerInteriorAsk, assetExtras, commitView, moveToken, placeAsset, setAssetInfo, setWorkspace, sightWalls, state, undo } from './store';

/** Houses with an interior in a scene (E-29, DC-042 step 3). The sample crypt has 70 px cells; the throne room spans cells 13–23 × 11–19. */
describe('interiors in the Orchestrator', () => {
  const trigger = { mode: 'enter' as const, nearFt: 10, confirm: false, leaveOff: true };
  const house = (confirm = false) => ({
    'library/tent.png': {
      name: 'tent', kind: 'prop' as const, sizeCells: { w: 2, h: 2 }, url: 'dc-asset://file/tent.png', video: false,
      cover: { shape: 'polygon' as const, points: [[0, 0], [2, 0], [2, 2], [0, 2]] as [number, number][] },
      interior: { asset: 'library/tent_in.png', walls: [{ kind: 'door' as const, x1: 0.5, y1: 2, x2: 1.5, y2: 2 }], trigger: { ...trigger, confirm } },
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
    commitView();
    expect(state.sceneDoc!.interiors[id]).toBe(true);
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
});
