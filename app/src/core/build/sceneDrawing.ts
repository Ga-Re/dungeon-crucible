/**
 * A scene's own drawing (E-33, DC-107c): walls, doors, cliffs, water and floors that exist only in
 * this scene, and the map's drawn elements it hides (a collapsed wall). What a scene shows is the
 * map's drawing without what it hides, plus its own. The map stays untouched. Pure, apart from a
 * cache that keeps the same lists while nothing changed.
 */
import type { Cliff } from './cliffs';
import type { FloorPatch } from './floors';
import type { BuildDoor, Masonry } from './masonry';
import type { Water } from './water';

export interface OwnDrawing {
  masonry: Masonry[];
  masonryDoors: BuildDoor[];
  cliffs: Cliff[];
  waters: Water[];
  floors: FloorPatch[];
}

export function emptyOwnDrawing(): OwnDrawing {
  return { masonry: [], masonryDoors: [], cliffs: [], waters: [], floors: [] };
}

type Lists = Pick<OwnDrawing, keyof OwnDrawing>;

/** The last result per map wall list, with what it was made from. */
const shownCache = new WeakMap<object, { map: Readonly<Lists>; key: string; out: Lists }>();

export function shownDrawing(map: Readonly<Lists>, own: OwnDrawing, hidden: readonly string[]): Lists {
  const empty = !own.masonry.length && !own.masonryDoors.length && !own.cliffs.length && !own.waters.length && !own.floors.length;
  if (empty && !hidden.length) return map as Lists;
  const key = JSON.stringify([own, hidden]);
  const hit = shownCache.get(map.masonry);
  // The map's lists are replaced on every edit: the same lists and the same scene part, the same result.
  if (hit && hit.key === key && hit.map.masonryDoors === map.masonryDoors && hit.map.cliffs === map.cliffs && hit.map.waters === map.waters && hit.map.floors === map.floors) return hit.out;
  const off = new Set(hidden);
  const masonry = [...map.masonry.filter((w) => !off.has(w.id)), ...own.masonry];
  const walls = new Set(masonry.map((w) => w.id));
  const out: Lists = {
    masonry,
    masonryDoors: [...map.masonryDoors, ...own.masonryDoors].filter((d) => !off.has(d.id) && walls.has(d.wall)),
    cliffs: [...map.cliffs.filter((c) => !off.has(c.id)), ...own.cliffs],
    waters: [...map.waters.filter((w) => !off.has(w.id)), ...own.waters],
    floors: [...map.floors.filter((f) => !off.has(f.id)), ...own.floors],
  };
  shownCache.set(map.masonry, { map, key, out });
  return out;
}

/** The map's info as this scene shows it: its drawing lists replaced by the scene's view of them. */
export function sceneMap<M extends Lists>(scene: { map: M; own?: OwnDrawing; drawnHidden?: readonly string[] }): M {
  if (!scene.own) return scene.map;
  const shown = shownDrawing(scene.map, scene.own, scene.drawnHidden ?? []);
  return shown === (scene.map as Lists) ? scene.map : { ...scene.map, ...shown };
}
