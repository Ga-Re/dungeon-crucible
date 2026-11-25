/**
 * A map whose area does not start at 0, 0 (a drawn map grows left and up, E-33): the layers
 * that cover the map's area – the map itself, grid, light, memory and fog – are built in the
 * map's own space (0, 0 at its top left) and placed at its origin. Their inputs come in map
 * coordinates like everything else and are moved here. Pure.
 */
import type { Polygon } from "../../core/poly/types";
import type { GridLines, Lighting } from "./renderer";

export interface Origin {
  readonly x: number;
  readonly y: number;
}

export const ZERO: Origin = { x: 0, y: 0 };

export const sameOrigin = (a: Origin, b: Origin) => a.x === b.x && a.y === b.y;

/** Polygons moved into the map's own space. */
export function shiftPolygons(polygons: readonly Polygon[], o: Origin): readonly Polygon[] {
  if (o.x === 0 && o.y === 0) return polygons;
  const move = (ring: readonly (readonly [number, number])[]) => ring.map(([x, y]) => [x - o.x, y - o.y] as [number, number]);
  return polygons.map((p) => ({ outer: move(p.outer), holes: p.holes.map(move) }));
}

export function shiftLighting(lighting: Lighting | null, o: Origin): Lighting | null {
  if (!lighting || (o.x === 0 && o.y === 0)) return lighting;
  return {
    ...lighting,
    lit: shiftPolygons(lighting.lit, o),
    glows: lighting.glows.map((g) => ({ ...g, x: g.x - o.x, y: g.y - o.y, area: shiftPolygons(g.area, o) })),
  };
}

export function shiftGrid(grid: GridLines | null, o: Origin): GridLines | null {
  if (!grid || (o.x === 0 && o.y === 0)) return grid;
  return { ...grid, offsetXPx: grid.offsetXPx - o.x, offsetYPx: grid.offsetYPx - o.y };
}
