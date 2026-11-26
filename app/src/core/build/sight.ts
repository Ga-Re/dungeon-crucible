/**
 * Drawn walls for sight, light and movement (E-33): the walls derived from the map's masonry,
 * on the layers active in the scene (all of them in the Map Forge), with the scene's door
 * states. Results are kept per list, so vision and light – which cache by wall list – are only
 * recomputed when something changed. Pure apart from those caches.
 */
import { activeLayers, elementLayer } from '../layers';
import type { Scene, Wall } from '../scene';
import { deriveWalls, foundKey, type BuildDoor } from './masonry';
import { cliffSightWalls } from './cliffs';

const derived = new WeakMap<object, { key: string; out: Wall[] }>();

/** Sums drawn walls up, so an edit in place is noticed too. */
function masonryKey(masonry: Scene['map']['masonry']): string {
  let sum = 0;
  let rest = '';
  for (const w of masonry) {
    for (const p of w.points) sum += p.x * 3 + p.y * 7;
    rest += `${w.id}${w.points.length}${w.closed ? 1 : 0}${w.layer ?? ''},`;
  }
  return `${sum}|${rest}`;
}
const NONE: Wall[] = [];

export function masonrySightWalls(scene: Pick<Scene, 'map' | 'masonryDoorsOpen' | 'layersOn'>, allLayers: boolean): Wall[] {
  const { masonry, masonryDoors, layers, cliffs } = scene.map;
  if (!masonry.length && !cliffs.length) return NONE;
  const active = allLayers ? null : activeLayers(layers, scene.layersOn);
  const key = `${masonryKey(masonry)}#${JSON.stringify([masonryDoors, scene.masonryDoorsOpen, active && [...active], cliffs])}`;
  const hit = derived.get(masonry);
  if (hit?.key === key) return hit.out;
  const shown = active ? masonry.filter((w) => active.has(elementLayer(w))) : masonry;
  const shownCliffs = active ? cliffs.filter((c) => active.has(elementLayer(c))) : cliffs;
  // Steep cliffs see down, not up (E-34), like the cliffs of DC-014.
  const out = [...deriveWalls(shown, masonryDoors, scene.masonryDoorsOpen), ...cliffSightWalls(shownCliffs)];
  derived.set(masonry, { key, out });
  return out;
}

const combined = new WeakMap<readonly Wall[], { key: string; extra: readonly Wall[]; out: readonly Wall[] }>();

/** Sums a wall list up: the store edits walls in place (pushed, moved, opened, put on another layer). */
function wallsKey(walls: readonly Wall[]): string {
  let sum = 0;
  let rest = '';
  for (const w of walls) {
    sum += w.x1 * 3 + w.y1 * 5 + w.x2 * 7 + w.y2 * 11;
    rest += `${w.kind[0]}${w.open ? 1 : 0}${w.layer ?? ''},`;
  }
  return `${walls.length}|${sum}|${rest}`;
}

/** `walls` and the drawn walls as one list – the same list while neither changes. */
export function withMasonry(walls: readonly Wall[], extra: readonly Wall[]): readonly Wall[] {
  if (!extra.length) return walls;
  const key = wallsKey(walls);
  const hit = combined.get(walls);
  if (hit?.extra === extra && hit.key === key) return hit.out;
  const out = [...walls, ...extra];
  combined.set(walls, { key, extra, out });
  return out;
}

/** The scene's door states with door `id` opened or closed; a secret door once opened stays found. Null: no such door. */
export function toggledMasonryDoor(doors: readonly BuildDoor[], states: Readonly<Record<string, boolean>>, id: string): Record<string, boolean> | null {
  const d = doors.find((x) => x.id === id);
  if (!d) return null;
  const open = !states[id];
  return { ...states, [id]: open, ...(d.secret && open ? { [foundKey(id)]: true } : {}) };
}
