/**
 * Storeys (DC-020, E-40): the area a storey covers and the storeys beneath it. A storey covers
 * the area drawn for it by hand (from the rasters again with DC-129); outside it, the storey below
 * shows (blurred). The map itself covers everything, so nothing beneath it shows. Pure.
 */
import { union, type Geom } from 'polyclip-ts';
import { asGeom, fromClip } from './poly/polygon-clip';
import type { Polygon } from './poly/types';
import type { MapStorey } from './sidecar';

/** The area `storey` covers (map px): its hand-drawn footprint, joined. */
export function storeyFootprint(storey: MapStorey): Polygon[] {
  const parts: Polygon[] = [...storey.footprint];
  if (!parts.length) return [];
  try {
    return fromClip(union(asGeom([parts[0]]) as Geom, ...parts.slice(1).map((p) => asGeom([p]) as Geom)) as [number, number][][][]);
  } catch {
    // The clipper failed: the parts as they are – a covered area too large, never too small.
    return parts;
  }
}

/**
 * The storeys whose picture shows beneath storey `current` ("" the map itself), nearest first –
 * those lower down, down to the map itself for a storey above it. The map and cellars show nothing
 * beneath.
 */
export function storeysBelow(storeys: readonly MapStorey[], current: string): string[] {
  const cur = storeys.find((s) => s.id === current);
  if (!cur || cur.level <= 0) return [];
  return [...storeys.filter((s) => s.level < cur.level && s.level > 0).sort((a, b) => b.level - a.level).map((s) => s.id), ''];
}
