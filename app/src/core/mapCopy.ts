/**
 * Duplicating a map (E-32, DC-118): a copy is its own map file `library/<name>.map.json` on the
 * same picture. "Only the map" takes the picture, grid, type, tags and landscape (and the fog's
 * look); "with everything" also walls, areas, lights, assets, layers, points and the start fog –
 * all under new ids, with the references between them following. A drawn map's walls are its
 * picture (E-33): "only the map" keeps them; walls drawn over a picture are content. Pure.
 */
import { slugId } from './documents';
import { isDrawn } from './persistence';
import type { MapSidecar } from './sidecar';

/** A free map file for `name` in the (flat) library. */
export function mapFileFor(name: string, taken: ReadonlySet<string>): string {
  const base = slugId(name, 'map');
  let p = `library/${base}.map.json`;
  for (let i = 2; taken.has(p); i++) p = `library/${base}-${i}.map.json`;
  return p;
}

/** A copy of `map` named `name`; `fresh(prefix)` gives a new id (random, never one in use). */
export function duplicateMap(map: MapSidecar, name: string, withContent: boolean, fresh: (prefix: string) => string): MapSidecar {
  const copy = structuredClone(map);
  copy.name = name;
  if (!withContent) {
    const { startFog: _f, ...rest } = copy;
    const drawing = isDrawn(copy.resource)
      ? { masonry: copy.masonry.map(({ layer: _l, ...w }) => w), masonryDoors: copy.masonryDoors, cliffs: copy.cliffs.map(({ layer: _l, ...c }) => c), waters: copy.waters.map(({ layer: _l, ...w }) => w), floors: copy.floors.map(({ layer: _l, ...f }) => f) }
      : { masonry: [], masonryDoors: [], cliffs: [], waters: [], floors: [] };
    return { ...rest, walls: [], zones: [], lights: [], assets: [], layers: [], pois: [], ...drawing };
  }
  const ids = new Map<string, string>();
  const renew = <T extends { id: string }>(xs: T[], prefix: string) => xs.map((x) => {
    const id = fresh(prefix);
    ids.set(x.id, id);
    return { ...x, id };
  });
  // Layers and areas first: other elements refer to them.
  copy.layers = renew(copy.layers, 'layer');
  copy.zones = renew(copy.zones, 'area');
  copy.walls = renew(copy.walls, 'wall');
  copy.lights = renew(copy.lights, 'light');
  copy.assets = renew(copy.assets, 'asset');
  copy.pois = renew(copy.pois, 'poi');
  copy.masonry = renew(copy.masonry, 'masonry');
  copy.masonryDoors = renew(copy.masonryDoors, 'door');
  copy.cliffs = renew(copy.cliffs, 'cliff');
  copy.waters = renew(copy.waters, 'water');
  copy.floors = renew(copy.floors, 'floor');
  const ref = (id: string | undefined) => (id === undefined ? undefined : ids.get(id) ?? id);
  const onLayer = <T extends { layer?: string }>(x: T): T => (x.layer ? { ...x, layer: ref(x.layer) } : x);
  copy.layers = copy.layers.map((l) => ({
    ...l,
    ...(l.trigger ? { trigger: { ...l.trigger, area: ref(l.trigger.area)! } } : {}),
    ...(l.counter ? { counter: ref(l.counter) } : {}),
  }));
  copy.walls = copy.walls.map(onLayer);
  copy.zones = copy.zones.map(onLayer);
  copy.lights = copy.lights.map(onLayer);
  copy.assets = copy.assets.map(onLayer);
  copy.masonry = copy.masonry.map(onLayer);
  copy.cliffs = copy.cliffs.map(onLayer);
  copy.waters = copy.waters.map(onLayer);
  copy.floors = copy.floors.map(onLayer);
  copy.masonryDoors = copy.masonryDoors.map((d) => ({ ...d, wall: ref(d.wall)! }));
  return copy;
}
