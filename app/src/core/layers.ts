/**
 * Layers of a map (E-28, DC-101): which are active in a scene, and the drawing order of placed
 * assets by layer height. Pure.
 */
import { areaContains } from './areas';
import type { Point } from './geometry';
import type { Polygon } from './poly/types';
import type { MapLayer } from './sidecar';

/** The base layer: every element without a layer is on it; always active, lowest. */
export const BASE_LAYER = 'map';

/** The layers active in a scene: the base layer, and the others as switched there, else by their default. */
export function activeLayers(layers: readonly MapLayer[], switched: Readonly<Record<string, boolean>>): Set<string> {
  const out = new Set([BASE_LAYER]);
  for (const l of layers) if (switched[l.id] ?? l.defaultActive) out.add(l.id);
  return out;
}

/** An element's layer (the base layer when it names none). */
export function elementLayer(el: { layer?: string }): string {
  return el.layer ?? BASE_LAYER;
}

/** Placed assets in drawing order: by their layer's height (base layer 0), otherwise as placed. */
export function drawOrder<T extends { layer?: string }>(placements: readonly T[], layers: readonly MapLayer[]): T[] {
  const height = new Map(layers.map((l) => [l.id, l.height]));
  const h = (p: T) => (p.layer ? (height.get(p.layer) ?? 0) : 0);
  return placements.map((p, i) => ({ p, i })).sort((a, b) => h(a.p) - h(b.p) || a.i - b.i).map(({ p }) => p);
}

/**
 * What trigger areas switch after characters moved (E-28): a layer comes on when a character
 * steps into its area, and goes off when the last one has left – if set so. `inside` (the layers
 * whose area has a character in it now) is passed back in next time.
 */
export function triggerChanges(
  layers: readonly MapLayer[],
  areas: ReadonlyMap<string, readonly Polygon[]>,
  characters: readonly Point[],
  wasInside: ReadonlySet<string>,
): { on: string[]; off: string[]; inside: Set<string> } {
  const on: string[] = [];
  const off: string[] = [];
  const inside = new Set<string>();
  for (const l of layers) {
    const shape = l.trigger && areas.get(l.trigger.area);
    if (!l.trigger || !shape) continue;
    const now = characters.some((c) => areaContains(shape, c));
    if (now) inside.add(l.id);
    if (now && !wasInside.has(l.id)) on.push(l.id);
    if (!now && wasInside.has(l.id) && l.trigger.leaveOff) off.push(l.id);
  }
  return { on, off, inside };
}
