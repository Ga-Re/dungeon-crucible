/**
 * Scene transitions on the TV (DC-105, E-38): how the last picture of the old scene and black lie
 * over the new scene at a moment of the transition. Only the picture the players already saw and
 * black are drawn over the new scene, so each scene is only ever seen with its own fog. Pure.
 */

/** What the DM chooses: fade over, through black, or a hard cut. */
export const TRANSITION_KINDS = ['fade', 'black', 'cut'] as const;
export type TransitionKind = (typeof TRANSITION_KINDS)[number];
/** What the TV plays: a change of scene, or fading out to black (blackout) and in from it (release). */
export type TransitionPlay = TransitionKind | 'out' | 'in';

export interface Transition {
  kind: TransitionKind;
  seconds: number;
}

/** A map without its own: a one-second fade. */
export const DEFAULT_TRANSITION: Transition = { kind: 'fade', seconds: 1 };

/**
 * At progress `p` (0 start … 1 done): the opacity of the old picture (over the new scene) and of
 * black (over both).
 */
export function transitionLook(kind: TransitionPlay, p: number): { old: number; black: number } {
  const t = Math.max(0, Math.min(1, p));
  switch (kind) {
    case 'fade':
      return { old: 1 - t, black: 0 };
    case 'black':
      return t < 0.5 ? { old: 1, black: t * 2 } : { old: 0, black: 2 - t * 2 };
    case 'out':
      return { old: 1, black: t };
    case 'in':
      return { old: 0, black: 1 - t };
    default:
      return { old: 0, black: 0 };
  }
}
