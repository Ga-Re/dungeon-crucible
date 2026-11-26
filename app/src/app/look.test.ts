import { describe, expect, it } from 'vitest';
import { cancelLookCommand, finishLookCommand, setWorkspace, shownLook, startLookCommand, state, undo, updateLook } from './store';

/** "Adjust picture" (DC-022, E-42): a preview until OK, one undoable step then. */
describe('adjusting the picture', () => {
  it('previews, cancels without a trace, applies as one step', () => {
    setWorkspace('forge');
    delete state.scene.map.look;
    startLookCommand();
    updateLook({ rotation: 90 });
    expect(shownLook()?.rotation).toBe(90);
    expect(state.scene.map.look).toBeUndefined();
    cancelLookCommand();
    expect(shownLook()).toBeUndefined();
    startLookCommand();
    updateLook({ rotation: 270, crop: { x: 0, y: 0, w: 700, h: 700 }, adjust: { brightness: 1.3, contrast: 1, saturation: 1, hue: 0 } });
    finishLookCommand();
    expect(state.scene.map.look).toEqual({ rotation: 270, crop: { x: 0, y: 0, w: 700, h: 700 }, adjust: { brightness: 1.3, contrast: 1, saturation: 1, hue: 0 } });
    undo();
    expect(state.scene.map.look).toBeUndefined();
  });

  it('turned back upright with nothing else, the map keeps no look at all', () => {
    setWorkspace('forge');
    state.scene.map.look = { rotation: 90 };
    startLookCommand();
    updateLook({ rotation: 0 });
    finishLookCommand();
    expect(state.scene.map.look).toBeUndefined();
  });
});
