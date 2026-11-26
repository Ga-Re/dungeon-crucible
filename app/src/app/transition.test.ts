import { beforeEach, describe, expect, it } from 'vitest';
import { produceFrame, setNextTransition, state, toggleBlackout } from './store';

/** Scene transitions on the TV (DC-105, E-38). The sample's map has no transition: a one-second fade. */
describe('the TV changes its picture', () => {
  beforeEach(() => {
    state.scene.table.blackout = false;
    delete state.scene.map.transition;
    state.nextTransition = null;
  });

  it('blackout fades out, lifting it fades in; each change counts on, and the frame carries it', () => {
    const n = state.tvCut.n;
    toggleBlackout();
    expect(state.tvCut).toEqual({ n: n + 1, play: 'out', ms: 1000 });
    expect(produceFrame(Date.now()).cut).toEqual({ n: n + 1, play: 'out', ms: 1000 });
    toggleBlackout();
    expect(state.tvCut).toEqual({ n: n + 2, play: 'in', ms: 1000 });
  });

  it('a map set to cut changes at once', () => {
    state.scene.map.transition = { kind: 'cut', seconds: 2 };
    toggleBlackout();
    expect(state.tvCut.play).toBe('cut');
    expect(state.tvCut.ms).toBe(0);
    toggleBlackout();
    delete state.scene.map.transition;
  });

  it('the transition chosen for the next change is kept until then', () => {
    setNextTransition('black');
    expect(state.nextTransition).toBe('black');
    setNextTransition(null);
    expect(state.nextTransition).toBeNull();
  });
});
