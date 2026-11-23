import type { LevelFog, Point, Polygon, Ring } from "./types";
import { difference, intersection, union } from "polyclip-ts";
import { asGeom, fromClip } from "./polygon-clip";

// Fog regions are lists of polygons with holes (schema v1), clipped with polyclip-ts.

/** Reveals `area`: it becomes visible and is no longer memory fog. */
export function revealArea(fog: LevelFog, area: Polygon): LevelFog {
  return {
    ...fog,
    revealed: fromClip(union(asGeom(fog.revealed), asGeom([area]))),
    remembered: fromClip(difference(asGeom(fog.remembered), asGeom([area]))),
  };
}

/** Hides `area`; with `remember`, the part that was revealed turns into memory fog. */
export function hideArea(
  fog: LevelFog,
  area: Polygon,
  remember: boolean,
): LevelFog {
  const wasRevealed = intersection(asGeom(fog.revealed), asGeom([area]));
  return {
    ...fog,
    revealed: fromClip(difference(asGeom(fog.revealed), asGeom([area]))),
    remembered: remember
      ? fromClip(union(asGeom(fog.remembered), wasRevealed))
      : fromClip(difference(asGeom(fog.remembered), asGeom([area]))),
  };
}

/** Fog of a level that has never been touched. */
export const EMPTY_LEVEL_FOG: LevelFog = { revealed: [], remembered: [] };

/** Ray casting; points exactly on an edge may count either way. */
function inRing(ring: Ring, [x, y]: Point): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i] ?? [0, 0];
    const [xj, yj] = ring[j] ?? [0, 0];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi)
      inside = !inside;
  }
  return inside;
}

/** Whether `point` (map pixels) lies inside one of `polygons` and not in one of its holes. */
export function isInside(polygons: readonly Polygon[], point: Point): boolean {
  return polygons.some(
    (polygon) =>
      inRing(polygon.outer, point) &&
      !polygon.holes.some((hole) => inRing(hole, point)),
  );
}
