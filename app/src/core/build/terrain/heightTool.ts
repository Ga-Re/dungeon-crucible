/**
 * Fine height and slope (E-89, Teil B §7.2): the relief channel holds a stepless height in 1/16 ft
 * (±20 ft) – hills, hollows, ramps; it never makes a cliff. A stroke changes it once however often
 * it passes: every mode works from the stroke's base, with each support point's strongest touch.
 * The slope mask (0…255) turns a step into a ramp where it is set; from half of it the cliff goes.
 * Pure.
 */
import { noise2 } from '../handDrawn';
import { pointOf, setPoints, type TerrainState } from './state';

export const RELIEF_PER_FT = 16;
export const RELIEF_MAX = 20 * RELIEF_PER_FT;

export type ReliefMode = 'raise' | 'lower' | 'smooth' | 'flatten' | 'roughen' | 'gradient';

export interface ReliefOptions {
  /** Raise, lower, roughen: by how many ft where the brush is full; gradient between equal heights: how far B lies above A (negative: below). */
  readonly amountFt: number;
  /** Smooth, flatten, gradient: how far towards the goal (0…1). */
  readonly strength: number;
  /** Flatten: the height at the stroke's start (ft). */
  readonly startFt: number;
  /** Gradient: from A to B (support points); the ramp runs from A's height to B's, or by the amount where they are level. */
  readonly a?: readonly [number, number];
  readonly b?: readonly [number, number];
}

/** The fine height at a support point (ft). */
export function reliefFtAt(t: TerrainState, stack: string, x: number, y: number): number {
  return pointOf(t, stack, 'relief', x, y) / RELIEF_PER_FT;
}

const clamp = (v: number) => Math.max(-RELIEF_MAX, Math.min(RELIEF_MAX, Math.round(v)));

/** `t` with its fine height changed at support points [x, y, touch 0…1] the way `mode` does. */
export function paintRelief(t: TerrainState, stack: string, touched: readonly (readonly [number, number, number])[], mode: ReliefMode, opts: ReliefOptions): TerrainState {
  const at = (x: number, y: number) => pointOf(t, stack, 'relief', x, y);
  const goal = (x: number, y: number, now: number): number => {
    switch (mode) {
      case 'flatten':
        return opts.startFt * RELIEF_PER_FT;
      case 'smooth': {
        // The mean of a cell's worth around it.
        let sum = 0;
        let n = 0;
        for (let dy = -2; dy <= 2; dy++)
          for (let dx = -2; dx <= 2; dx++) {
            sum += at(x + dx, y + dy);
            n++;
          }
        return sum / n;
      }
      case 'gradient': {
        if (!opts.a || !opts.b) return now;
        const [ax, ay] = opts.a;
        const [bx, by] = opts.b;
        const len = (bx - ax) ** 2 + (by - ay) ** 2;
        const k = len > 0 ? Math.max(0, Math.min(1, ((x - ax) * (bx - ax) + (y - ay) * (by - ay)) / len)) : 0;
        // On level ground (A and B alike) the ramp rises by the amount (DM 2026-11-28).
        const end = at(bx, by) === at(ax, ay) ? at(ax, ay) + opts.amountFt * RELIEF_PER_FT : at(bx, by);
        return at(ax, ay) + (end - at(ax, ay)) * k;
      }
      default:
        return now;
    }
  };
  const edits: [number, number, number][] = [];
  for (const [x, y, s] of touched) {
    if (s <= 0) continue;
    const now = at(x, y);
    let next: number;
    if (mode === 'raise' || mode === 'lower') next = now + (mode === 'raise' ? 1 : -1) * s * opts.amountFt * RELIEF_PER_FT;
    else if (mode === 'roughen') {
      // Noise read at the place: bumps of about a cell and finer grain.
      const n = noise2(x / 4, y / 4, 5) * 0.7 + noise2(x / 1.5, y / 1.5, 9) * 0.3;
      next = now + n * s * opts.amountFt * RELIEF_PER_FT;
    } else next = now + (goal(x, y, now) - now) * Math.min(1, s * opts.strength);
    const v = clamp(next);
    if (v !== now) edits.push([x, y, v]);
  }
  return edits.length ? setPoints(t, stack, 'relief', edits) : t;
}

/** `t` with the slope mask lifted to each touch at support points [x, y, touch 0…1] (`remove`: taken away). */
export function paintSlope(t: TerrainState, stack: string, touched: readonly (readonly [number, number, number])[], remove: boolean): TerrainState {
  const edits: [number, number, number][] = [];
  for (const [x, y, s] of touched) {
    const now = pointOf(t, stack, 'slope', x, y);
    const v = remove ? Math.min(now, Math.round((1 - s) * 255)) : Math.max(now, Math.round(s * 255));
    if (v !== now) edits.push([x, y, v]);
  }
  return edits.length ? setPoints(t, stack, 'slope', edits) : t;
}
