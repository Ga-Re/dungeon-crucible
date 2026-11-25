import { describe, expect, it } from 'vitest';
import { placeHere, previewPlacing, setAssetInfo, setPlacing, setWorkspace, startPlacing, state, stopPlacing, undo } from './store';

/** The placing mode (E-31, DC-116). The sample crypt has 70 px cells. */
describe('placing mode', () => {
  const info = { 'library/barrel.png': { name: 'barrel', kind: 'prop' as const, sizeCells: { w: 1, h: 1 }, url: 'dc-asset://file/barrel.png', video: false } };

  it('previews what the next click places, snapped; each click places one (undoable); Esc ends it', () => {
    setWorkspace('forge');
    setAssetInfo(info);
    const before = state.scene.map.assets.length;
    startPlacing('library/barrel.png', 'barrel');
    setPlacing({ randomRotation: false, rotation: 90, randomScale: false, snap: true });
    previewPlacing({ x: 320, y: 880 });
    expect(state.placing!.at).toMatchObject({ x: 315, y: 875, rotation: 90 });
    placeHere({ x: 320, y: 880 });
    placeHere({ x: 390, y: 880 });
    expect(state.scene.map.assets.length).toBe(before + 2);
    expect(state.scene.map.assets.at(-1)).toMatchObject({ assetPath: 'library/barrel.png', x: 385, y: 875, rotation: 90, scale: 1 });
    // Still placing after a click.
    expect(state.placing).not.toBeNull();
    undo();
    expect(state.scene.map.assets.length).toBe(before + 1);
    stopPlacing();
    expect(state.placing).toBeNull();
  });

  it('random turns and sizes are rolled for each click, within their limits', () => {
    setWorkspace('forge');
    setAssetInfo(info);
    startPlacing('library/barrel.png', 'barrel');
    setPlacing({ randomRotation: true, rotationStep: 90, randomScale: true, scaleSpread: 0.2, snap: false });
    for (let i = 0; i < 5; i++) placeHere({ x: 3000 + i * 70, y: 3000 });
    const placed = state.scene.map.assets.slice(-5);
    expect(placed.every((a) => a.rotation % 90 === 0 && a.scale >= 0.8 && a.scale <= 1.2)).toBe(true);
    // Not snapped: where clicked.
    expect(placed[0]).toMatchObject({ x: 3000, y: 3000 });
    // Leaving the Map Forge for the Vault ends it.
    setWorkspace('vault');
    expect(state.placing).toBeNull();
  });
});
