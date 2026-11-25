import { describe, expect, it } from 'vitest';
import { addLight, commitView, createLayer, moveToken, setLayerActive, setWorkspace, state, undo, updateLayer } from './store';

/** Layers in a scene (E-28, DC-101). The sample crypt: Throne Room is cells 13–23 × 11–19 (70 px). */
describe('layers in the Orchestrator', () => {
  it('switches a layer by hand (its counter layer goes the other way), undoably; saved per scene', () => {
    setWorkspace('forge');
    const roof = createLayer('Roof')!;
    const inside = createLayer('Inside')!;
    updateLayer(inside, { defaultActive: false, counter: roof });
    addLight({ x: 1200, y: 1000 });
    const lamp = state.scene.lights.at(-1)!.id;
    setWorkspace('play');
    expect(state.scene.lights.some((l) => l.id === lamp)).toBe(false);
    setLayerActive(inside, true);
    expect(state.scene.lights.some((l) => l.id === lamp)).toBe(true);
    expect(state.scene.layersOn).toMatchObject({ [inside]: true, [roof]: false });
    commitView();
    expect(state.sceneDoc!.layers).toMatchObject({ [inside]: true, [roof]: false });
    undo();
    expect(state.scene.lights.some((l) => l.id === lamp)).toBe(false);
  });

  it('a trigger area switches its layer when a character steps in and out', () => {
    setWorkspace('forge');
    const inside = createLayer('Throne inside')!;
    updateLayer(inside, { defaultActive: false, trigger: { area: 'throne', leaveOff: true } });
    setWorkspace('play');
    const pc = state.scene.tokens.find((t) => t.kind === 'pc')!;
    const from = { x: pc.x, y: pc.y };
    moveToken(pc.id, { x: 18 * 70 + 35, y: 15 * 70 + 35 }, true);
    expect(state.scene.layersOn[inside]).toBe(true);
    moveToken(pc.id, from, true);
    expect(state.scene.layersOn[inside]).toBe(false);
  });
});
