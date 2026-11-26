import { describe, expect, it } from 'vitest';
import { DEFAULT_TRANSITION, transitionLook } from './transition';

/** Scene transitions on the TV (DC-105, E-38). */
describe('how a transition looks at a moment', () => {
  it('fade: the old picture goes from fully there to gone', () => {
    expect(transitionLook('fade', 0)).toEqual({ old: 1, black: 0 });
    expect(transitionLook('fade', 0.5)).toEqual({ old: 0.5, black: 0 });
    expect(transitionLook('fade', 1)).toEqual({ old: 0, black: 0 });
  });

  it('through black: first the old picture into black, then black away from the new one', () => {
    expect(transitionLook('black', 0)).toEqual({ old: 1, black: 0 });
    expect(transitionLook('black', 0.25)).toEqual({ old: 1, black: 0.5 });
    expect(transitionLook('black', 0.5)).toEqual({ old: 0, black: 1 });
    expect(transitionLook('black', 0.75)).toEqual({ old: 0, black: 0.5 });
    expect(transitionLook('black', 1)).toEqual({ old: 0, black: 0 });
  });

  it('out to black (blackout) and in from black (release)', () => {
    expect(transitionLook('out', 0.5)).toEqual({ old: 1, black: 0.5 });
    expect(transitionLook('out', 1)).toEqual({ old: 1, black: 1 });
    expect(transitionLook('in', 0)).toEqual({ old: 0, black: 1 });
    expect(transitionLook('in', 1)).toEqual({ old: 0, black: 0 });
  });

  it('cut and anything outside 0…1 are plain', () => {
    expect(transitionLook('cut', 0.3)).toEqual({ old: 0, black: 0 });
    expect(transitionLook('fade', -1)).toEqual({ old: 1, black: 0 });
    expect(transitionLook('fade', 2)).toEqual({ old: 0, black: 0 });
  });

  it('a new map fades for a second', () => {
    expect(DEFAULT_TRANSITION).toEqual({ kind: 'fade', seconds: 1 });
  });
});
