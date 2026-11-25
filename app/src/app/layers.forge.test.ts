import { describe, expect, it } from 'vitest';
import {
  addLight, commitView, createLayer, deleteLayer, editableInForge, moveLayer, setCurrentLayer, setElementsLayer, setWorkspace, state, undo, updateLayer,
} from './store';

/** Layers in the Map Forge (E-28, DC-101). */
describe('layers in the Map Forge', () => {
  it('creates layers on top, makes them current; new elements land on the current layer', () => {
    setWorkspace('forge');
    const a = createLayer('Tent inside')!;
    const b = createLayer('Tent roof')!;
    expect(state.scene.map.layers.map((l) => [l.name, l.height])).toEqual([['Tent inside', 1], ['Tent roof', 2]]);
    expect(state.currentLayer).toBe(b);
    setCurrentLayer(a);
    addLight({ x: 100, y: 100 });
    expect(state.scene.lights.at(-1)!.layer).toBe(a);
    commitView();
    expect(state.mapDoc!.layers.map((l) => l.id)).toEqual([a, b]);
    expect(state.mapDoc!.lights.at(-1)!.layer).toBe(a);
  });

  it('changes settings, moves a layer up, moves elements to another layer, deletes a layer (its elements go to the base)', () => {
    setWorkspace('forge');
    const a = createLayer('Inside')!;
    const b = createLayer('Roof')!;
    updateLayer(a, { defaultActive: false, counter: b });
    expect(state.scene.map.layers.find((l) => l.id === a)).toMatchObject({ defaultActive: false, counter: b });
    moveLayer(a, 'up');
    expect(state.scene.map.layers.find((l) => l.id === a)!.height).toBeGreaterThan(state.scene.map.layers.find((l) => l.id === b)!.height);
    const wall = state.scene.walls[0];
    setElementsLayer([wall.id], a);
    expect(state.scene.walls[0].layer).toBe(a);
    deleteLayer(a);
    expect(state.scene.map.layers.some((l) => l.id === a)).toBe(false);
    expect(state.scene.walls[0].layer).toBeUndefined();
    // The counter link to the deleted layer is gone too.
    expect(state.scene.map.layers.find((l) => l.id === b)!.counter).toBeUndefined();
    undo();
    expect(state.scene.walls[0].layer).toBe(a);
  });

  it('counter layers are mutual; pairing anew unlinks the old pair', () => {
    setWorkspace('forge');
    const [a, b, c] = ['A', 'B', 'C'].map((n) => createLayer(n)!);
    const byId = (id: string) => state.scene.map.layers.find((l) => l.id === id)!;
    updateLayer(a, { counter: b });
    expect([byId(a).counter, byId(b).counter]).toEqual([b, a]);
    updateLayer(c, { counter: b });
    expect([byId(a).counter, byId(b).counter, byId(c).counter]).toEqual([undefined, c, b]);
    updateLayer(b, { counter: undefined });
    expect([byId(b).counter, byId(c).counter]).toEqual([undefined, undefined]);
  });

  it('a hidden or locked layer is not editable in the Forge', () => {
    setWorkspace('forge');
    const a = createLayer('Furniture')!;
    expect(editableInForge({ layer: a })).toBe(true);
    updateLayer(a, { editorHidden: true });
    expect(editableInForge({ layer: a })).toBe(false);
    updateLayer(a, { editorHidden: false, locked: true });
    expect(editableInForge({ layer: a })).toBe(false);
    expect(editableInForge({})).toBe(true);
  });
});
