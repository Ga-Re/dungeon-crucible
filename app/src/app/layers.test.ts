import { describe, expect, it } from 'vitest';
import { commitView, produceFrame, setWorkspace, state } from './store';

/** The store starts with the sample crypt as a map and a scene on it (browser mode). */
describe('map and scene layers in the app', () => {
  it('the Map Forge shows the map alone; edits there change the map, edits in a scene only the scene', () => {
    setWorkspace('play');
    const tokens = state.scene.tokens.length;
    expect(tokens).toBeGreaterThan(0);
    const hall = state.scene.zones[0]!;
    const globalName = hall.name;

    // In the scene: rename an area – a change of this scene only.
    hall.name = 'Ruined hall';
    commitView();
    expect(state.sceneDoc!.overrides[hall.id]).toEqual({ name: 'Ruined hall' });
    expect(state.mapDoc!.zones.find((z) => z.id === hall.id)!.name).toBe(globalName);

    // The Map Forge: the map without the scene's changes, without tokens.
    setWorkspace('forge');
    expect(state.layer).toBe('map');
    expect(state.scene.tokens).toEqual([]);
    expect(state.scene.zones.find((z) => z.id === hall.id)!.name).toBe(globalName);
    // The TV keeps showing the scene, tokens included.
    const frame = produceFrame(Date.now());
    expect(frame.tokens.length).toBeGreaterThan(0);

    // A change of the map in the Forge: a wall, kept in the map.
    state.scene.walls.push({ id: 'wall-new', kind: 'wall', x1: 0, y1: 0, x2: 70, y2: 0 });
    setWorkspace('play');
    expect(state.mapDoc!.walls.some((w) => w.id === 'wall-new')).toBe(true);
    expect(state.scene.walls.some((w) => w.id === 'wall-new')).toBe(true);
    expect(state.scene.zones.find((z) => z.id === hall.id)!.name).toBe('Ruined hall');
    expect(state.scene.tokens.length).toBe(tokens);
    expect(state.sceneDoc!.added.walls).toEqual([]);
  });
});
