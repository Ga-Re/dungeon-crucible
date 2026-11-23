// Fog fades (T-136b): pure timing; the spread itself is in `fog-spread.ts` (T-167).

/** Ease-out (cubic): the change shows at once and settles softly. */
export function easeOut(t: number): number {
  const clamped = Math.min(1, Math.max(0, t));
  return 1 - (1 - clamped) ** 3;
}

/** How far a fade started at `start` (ms) and lasting `duration` (ms) is at `now`, 0…1. */
export function fadeProgress(
  start: number,
  duration: number,
  now: number,
): number {
  if (duration <= 0) return 1;
  return Math.min(1, Math.max(0, (now - start) / duration));
}
