/**
 * Renderer fog options from the device's fog look – the same for the DM window and the TV, so
 * both spread, soften and drift alike (Dungeon-Manager's `fog-settings.ts`). No DM state here:
 * the table window uses this module too.
 */
import { fogSpeed, livingFog, softEdgeWidth, type FogLook } from '../app/fog-settings';
import type { FogLookWire } from '../core/projection';
import type { FogOptions } from './pixi/renderer';

/** How long a change from token movement takes: quick, so sight keeps up with the token. */
export const QUICK_FADE_MS = 150;

export function lookFromWire(w: FogLookWire): FogLook {
  return { ...w, speed: w.speed ?? Number.POSITIVE_INFINITY };
}

export function lookToWire(l: FogLook): FogLookWire {
  return { ...l, speed: Number.isFinite(l.speed) ? l.speed : null };
}

export interface FogOptionInput {
  look: FogLook;
  cellSizePx: number;
  /** Seeds the ragged spread (the map's path), so the DM window and the TV spread alike. */
  seedKey: string;
  effect: { biome: string; strength: number };
  opacity: number;
  /** A change from token movement: no ragged spread, a short transition. */
  quick: boolean;
  /**
   * Another scene came (DC-105): its fog at once, never grown out of the scene before – on the
   * same map that fog would show the new scene where the old one was open.
   */
  jump?: boolean;
}

export function fogOptions(i: FogOptionInput): FogOptions {
  const living = livingFog(i.look, i.cellSizePx, i.effect);
  const fadeMs = i.look.fadeSeconds * 1000;
  return {
    opacity: i.opacity,
    softEdge: softEdgeWidth(i.cellSizePx, i.look.softEdges),
    fade: i.jump ? 0 : i.quick ? Math.min(fadeMs, QUICK_FADE_MS) : fadeMs,
    ...(i.quick || i.jump ? {} : { speed: fogSpeed(i.look, i.cellSizePx, i.seedKey) }),
    coverFrom: i.look.coverFrom,
    ...(living ? { living } : {}),
  };
}
