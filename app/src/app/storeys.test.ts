import { describe, expect, it } from 'vitest';
import { addLight, addStorey, deleteStorey, renameStorey, setWorkingStorey, setWorkspace, state, undo } from './store';

/** Storeys in the Map Forge (DC-020, E-40). */
describe('storeys', () => {
  it('a new storey is worked on at once; what is drawn there is on it; the map itself keeps its own', () => {
    setWorkspace('forge');
    const groundLights = state.scene.lights.length;
    addStorey('Tower', true);
    const up = state.scene.map.storeys!.at(-1)!;
    expect(up).toMatchObject({ name: 'Tower', level: 1 });
    expect(state.scene.map.storey).toBe(up.id);
    expect(state.scene.lights.length).toBe(0);
    addLight({ x: 100, y: 100 });
    expect(state.scene.lights[0].storey).toBe(up.id);
    setWorkingStorey('');
    expect(state.scene.lights.length).toBe(groundLights);
    setWorkingStorey(up.id);
    expect(state.scene.lights.length).toBe(1);
    renameStorey(up.id, 'Top');
    expect(state.scene.map.storeys!.find((s) => s.id === up.id)!.name).toBe('Top');
    // A cellar goes below the map itself.
    addStorey('', false);
    expect(state.scene.map.storeys!.at(-1)!.level).toBe(-1);
  });

  it('deleting a storey takes what is on it; undo brings both back', () => {
    setWorkspace('forge');
    setWorkingStorey('');
    addStorey('Attic', true);
    const id = state.scene.map.storey!;
    addLight({ x: 50, y: 50 });
    // Every light of the map, on every storey, as the view holds them.
    const before = state.scene.lights.length + state.scene.inactive.lights.length;
    deleteStorey(id);
    expect(state.scene.map.storey).toBeUndefined();
    expect(state.mapDoc!.storeys.some((s) => s.id === id)).toBe(false);
    expect(state.mapDoc!.lights.length).toBe(before - 1);
    expect(state.mapDoc!.lights.some((l) => l.storey === id)).toBe(false);
    undo();
    expect(state.scene.map.storeys!.some((s) => s.id === id)).toBe(true);
  });
});
