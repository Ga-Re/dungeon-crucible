/**
 * Scene fog on top of Dungeon-Manager's polygon fog (`poly/fog.ts`): `revealed` (the DM showed
 * it), `remembered` (seen before, dimmed) and – computed live, never stored – what player tokens
 * see right now. Token sight reveals automatically; what they leave turns into memory fog.
 */
import { difference, intersection, union } from 'polyclip-ts';
import type { VisibilityPoint } from './geometry';
import { EMPTY_LEVEL_FOG, hideArea, isInside, revealArea } from './poly/fog';
import { asGeom, fromClip } from './poly/polygon-clip';
import { circleArea } from './poly/shapes';
import type { LevelFog, Polygon } from './poly/types';

export { EMPTY_LEVEL_FOG };

export function rectPolygon(x0: number, y0: number, x1: number, y1: number): Polygon {
  const l = Math.min(x0, x1);
  const r = Math.max(x0, x1);
  const t = Math.min(y0, y1);
  const b = Math.max(y0, y1);
  return { outer: [[l, t], [r, t], [r, b], [l, b]], holes: [] };
}

/** The map's area; a drawn map's may start left of or above 0 (`origin`, E-33). */
export function mapPolygon(width: number, height: number, origin: { x: number; y: number } = { x: 0, y: 0 }): Polygon {
  return rectPolygon(origin.x, origin.y, origin.x + width, origin.y + height);
}

/** Removes `locked` (undiscovered secret rooms) from `area`. */
export function withoutLocked(area: Polygon, locked: readonly Polygon[]): Polygon[] {
  if (locked.length === 0) return [area];
  return fromClip(difference(asGeom([area]), asGeom(locked)));
}

/**
 * Reveals `area`. Locked areas stay hidden unless `force` is set (a DM tool aimed at them on
 * purpose).
 */
export function revealIn(fog: LevelFog, area: Polygon, locked: readonly Polygon[], force = false): LevelFog {
  const parts = force ? [area] : withoutLocked(area, locked);
  return parts.reduce((f, p) => revealArea(f, p), fog);
}

/** Forgets what was remembered in `area` (it is unexplored again); what the DM revealed stays. */
export function forgetIn(fog: LevelFog, area: Polygon): LevelFog {
  if (!fog.remembered.length) return fog;
  return { ...fog, remembered: fromClip(difference(asGeom(fog.remembered), asGeom([area]))) };
}

/** Hides `area`; with `remember`, what was revealed there becomes memory fog. */
export function hideIn(fog: LevelFog, area: Polygon, remember = false): LevelFog {
  return hideArea(fog, area, remember);
}

export function revealAll(fog: LevelFog, width: number, height: number, locked: readonly Polygon[], origin?: { x: number; y: number }): LevelFog {
  return revealIn(fog, mapPolygon(width, height, origin), locked);
}

/** Everything back to unexplored (memory fog included). */
export function hideAll(): LevelFog {
  return { revealed: [], remembered: [] };
}

/** A viewer's sight: the visibility polygon clipped to the round sight radius. */
export function sightPolygon(origin: { x: number; y: number }, radius: number, visibility: readonly VisibilityPoint[]): Polygon[] {
  if (visibility.length < 3 || radius <= 0) return [];
  const vis: Polygon = { outer: visibility.map((p) => [p.x, p.y] as [number, number]), holes: [] };
  return fromClip(intersection(asGeom([vis]), asGeom([circleArea([origin.x, origin.y], radius, 64)])));
}

/** Memory: whatever players see now and is not DM-revealed is remembered from now on. */
export function rememberSeen(fog: LevelFog, visible: readonly Polygon[]): LevelFog {
  if (visible.length === 0) return fog;
  const fresh = fog.revealed.length ? fromClip(difference(asGeom(visible), asGeom(fog.revealed))) : [...visible];
  if (fresh.length === 0) return fog;
  return { ...fog, remembered: fromClip(union(asGeom(fog.remembered), asGeom(fresh))) };
}

/** Not covered by opaque fog: revealed, remembered or in sight now. */
export function openArea(fog: LevelFog, visible: readonly Polygon[]): Polygon[] {
  return [...fog.revealed, ...fog.remembered, ...visible];
}

/** Fully visible to players right now (no memory dimming): revealed or in sight. */
export function clearArea(fog: LevelFog, visible: readonly Polygon[]): Polygon[] {
  return [...fog.revealed, ...visible];
}

/** Whether players see point `p` right now (monsters there are shown). */
export function seenNow(fog: LevelFog, visible: readonly Polygon[], p: { x: number; y: number }): boolean {
  return isInside(visible, [p.x, p.y]) || isInside(fog.revealed, [p.x, p.y]);
}

/** Share of the map that is not unexplored, 0…1 (approximate, sampled on a coarse grid). */
export function exploredShare(fog: LevelFog, visible: readonly Polygon[], width: number, height: number, samples = 40, origin = { x: 0, y: 0 }): number {
  const open = openArea(fog, visible);
  if (open.length === 0) return 0;
  let hit = 0;
  for (let j = 0; j < samples; j++) {
    for (let i = 0; i < samples; i++) {
      if (isInside(open, [origin.x + ((i + 0.5) / samples) * width, origin.y + ((j + 0.5) / samples) * height])) hit++;
    }
  }
  return hit / (samples * samples);
}
