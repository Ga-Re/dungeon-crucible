/**
 * Layers of a map (E-28, DC-101): which are active in a scene, and the drawing order of placed
 * assets by layer height. Pure.
 */
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
