import type { Polygon, Ring } from "./types";
import type { Geom } from "polyclip-ts";

// Never call polyclip-ts's setPrecision: it is module-level state and would make core impure.

// Our polygons are an outer ring with holes. polyclip-ts works on the same model
// ([outer, ...holes] per polygon) but closes rings by repeating the first point.

/** A polygon as polyclip-ts takes and returns it. */
type ClipPolygon = [number, number][][];

/** Polygons as polyclip-ts takes them. */
function toClip(polygons: readonly Polygon[]): ClipPolygon[] {
  return polygons.map((polygon) =>
    [polygon.outer, ...polygon.holes].map((ring) =>
      ring.map(([x, y]) => [x, y]),
    ),
  );
}

/** polyclip-ts's result as polygons with open rings. */
export function fromClip(result: ClipPolygon[]): Polygon[] {
  return result.map(([outer = [], ...holes]) => ({
    outer: openRing(outer),
    holes: holes.map(openRing),
  }));
}

function openRing(ring: [number, number][]): Ring {
  const [first] = ring;
  const last = ring.at(-1);
  const closed =
    first !== undefined &&
    last !== undefined &&
    first[0] === last[0] &&
    first[1] === last[1];
  return closed ? ring.slice(0, -1) : ring;
}

/** Polygons as one polyclip-ts geometry. */
export const asGeom = (polygons: readonly Polygon[]): Geom => toClip(polygons);
