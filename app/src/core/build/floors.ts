/**
 * Painted floors (E-33, DC-107b): areas painted with the floor brush over the floors that follow
 * the walls. The same floor merges into one area; painting over another floor replaces it there;
 * the eraser takes floor away (the automatic floor shows again). Pure.
 */
import { difference, union, type Geom } from 'polyclip-ts';
import { asGeom, fromClip } from '../poly/polygon-clip';
import type { Polygon } from '../poly/types';
import { MASONRY_STYLES } from './masonry';

/** What can be painted: the walls' floors, the natural grounds and floors of their own. */
export const FLOOR_STYLES = [...MASONRY_STYLES, 'grass', 'snow', 'sand', 'ash', 'swamp', 'carpet', 'marble', 'gravel', 'dirt', 'moss'] as const;
export type FloorPaint = (typeof FLOOR_STYLES)[number];

export interface FloorPatch {
  id: string;
  style: FloorPaint;
  shape: Polygon[];
  seed: number;
  layer?: string;
}

function minus(shape: readonly Polygon[], area: Polygon): Polygon[] {
  if (!shape.length) return [];
  return fromClip(difference(asGeom(shape), asGeom([area]) as Geom) as [number, number][][][]);
}

/**
 * Paints `area` with `style` (or erases it): other floors lose it, the floor of this style gains
 * it (one area per style, keeping its id). Patches left empty go.
 */
export function paintFloor(patches: readonly FloorPatch[], area: Polygon, style: FloorPaint, erase: boolean, fresh: () => string, seed = 1): FloorPatch[] {
  const out: FloorPatch[] = [];
  let own: FloorPatch | null = null;
  for (const p of patches) {
    if (!erase && p.style === style && !own) {
      own = { ...p, shape: fromClip(union(asGeom(p.shape), asGeom([area]) as Geom) as [number, number][][][]) };
      out.push(own);
      continue;
    }
    const shape = minus(p.shape, area);
    if (shape.length) out.push({ ...p, shape });
  }
  if (!erase && !own) out.push({ id: fresh(), style, shape: [area], seed });
  return out;
}
