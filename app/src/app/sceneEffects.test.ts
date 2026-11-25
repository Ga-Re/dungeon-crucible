import { describe, expect, it } from 'vitest';
import { activateAsset, commitView, placeAsset, setAssetInfo, setWorkspace, state, undo } from './store';

/** Switching asset lights and effects in a scene (DC-110). */
describe('activating assets in the Orchestrator', () => {
  const info = {
    'library/torch.png': { name: 'torch', kind: 'light' as const, url: null, video: false, light: { x: 0.5, y: 0.5, brightFt: 20, dimFt: 40, color: '#ffaa00', flicker: 0.3 } },
    'library/portal.webm': { name: 'portal', kind: 'effect' as const, url: null, video: true, effect: { loop: true, trigger: false } },
    'library/bolt.webm': { name: 'bolt', kind: 'effect' as const, url: null, video: true, effect: { loop: false, trigger: true } },
  };

  it('switches an asset light and a looping effect (undoable, saved); plays a play-once effect', () => {
    setWorkspace('play');
    setAssetInfo(info);
    const torch = placeAsset('library/torch.png', { x: 300, y: 900 })!;
    const portal = placeAsset('library/portal.webm', { x: 400, y: 900 })!;
    const bolt = placeAsset('library/bolt.webm', { x: 500, y: 900 })!;
    const lightsBefore = state.lights.length;
    activateAsset(torch);
    expect(state.scene.assetLightsOn[`${torch}:light`]).toBe(false);
    expect(state.lights.length).toBe(lightsBefore - 1);
    activateAsset(portal);
    expect(state.scene.effectsOn[portal]).toBe(false);
    commitView();
    expect(state.sceneDoc!.lights[`${torch}:light`]).toBe(false);
    expect(state.sceneDoc!.effects[portal]).toBe(false);
    undo();
    expect(state.scene.effectsOn[portal]).not.toBe(false);
    // Play once: a run starts now (not saved, nothing to undo).
    activateAsset(bolt);
    expect(state.effectRuns[bolt]).toBeGreaterThan(0);
  });
});
