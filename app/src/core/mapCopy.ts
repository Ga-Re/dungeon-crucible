/**
 * Duplicating a map (E-32, DC-118): a copy is its own map file `library/<name>.map.json` on the
 * same picture. "Only the map" takes the picture, grid, type, tags and landscape (and the fog's
 * look and the map's sound); "with everything" also walls, areas, lights, sound sources, assets,
 * layers, points and the start fog – all under new ids, with the references between them following. A drawn map's walls are its
 * picture (E-33): "only the map" keeps them; walls drawn over a picture are content. The same holds for
 * the procedural Map Forge's intent (E-46 ff.), except its mood, which is part of the map's look. Pure.
 */
import { slugId } from './documents';
import { isDrawn } from './persistence';
import type { MapIntent, Terrain } from './build/intent';
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
    const { startFog: _f, terrain: _t, wallLines: _wl, openings: _o, paths: _p, crossings: _c, waterSources: _ws, prefabs: _pf, derived: _d, mood: _m, undergrounds: _u, ...rest } = copy;
    const drawing = isDrawn(copy.resource)
      ? { masonry: copy.masonry.map(({ layer: _l, ...w }) => w), masonryDoors: copy.masonryDoors, cliffs: copy.cliffs.map(({ layer: _l, ...c }) => c), waters: copy.waters.map(({ layer: _l, ...w }) => w), floors: copy.floors.map(({ layer: _l, ...f }) => f), rooms: copy.rooms.map(({ layer: _l, ...r }) => ({ ...r, id: fresh('room') })) }
      : { masonry: [], masonryDoors: [], cliffs: [], waters: [], floors: [], rooms: [] };
    const intent = isDrawn(copy.resource) ? intentOfMapItself(copy) : copy.mood ? { mood: copy.mood } : {};
    // Variants are pictures of the map and come along (new ids); storeys are content and do not (E-40/41).
    return { ...rest, walls: [], zones: [], lights: [], sounds: [], assets: [], layers: [], pois: [], storeys: [], stairs: [], variants: copy.variants.map((v) => ({ ...v, id: fresh('variant') })), ...drawing, ...intent };
  }
  const ids = new Map<string, string>();
  const renew = <T extends { id: string }>(xs: T[], prefix: string) => xs.map((x) => {
    const id = fresh(prefix);
    ids.set(x.id, id);
    return { ...x, id };
  });
  // Layers, storeys and areas first: other elements refer to them.
  copy.layers = renew(copy.layers, 'layer');
  copy.storeys = renew(copy.storeys, 'storey');
  copy.variants = renew(copy.variants, 'variant');
  copy.stairs = renew(copy.stairs, 'stair');
  copy.rooms = renew(copy.rooms, 'room');
  copy.zones = renew(copy.zones, 'area');
  copy.walls = renew(copy.walls, 'wall');
  copy.lights = renew(copy.lights, 'light');
  copy.sounds = renew(copy.sounds, 'sound');
  copy.assets = renew(copy.assets, 'asset');
  copy.pois = renew(copy.pois, 'poi');
  copy.masonry = renew(copy.masonry, 'masonry');
  copy.masonryDoors = renew(copy.masonryDoors, 'door');
  copy.cliffs = renew(copy.cliffs, 'cliff');
  copy.waters = renew(copy.waters, 'water');
  copy.floors = renew(copy.floors, 'floor');
  const ref = (id: string | undefined) => (id === undefined ? undefined : ids.get(id) ?? id);
  const onLayer = <T extends { layer?: string; storey?: string }>(x: T): T => ({ ...x, ...(x.layer ? { layer: ref(x.layer) } : {}), ...(x.storey ? { storey: ref(x.storey) } : {}) });
  copy.layers = copy.layers.map((l) => ({
    ...l,
    ...(l.trigger ? { trigger: { ...l.trigger, area: ref(l.trigger.area)! } } : {}),
    ...(l.counter ? { counter: ref(l.counter) } : {}),
  }));
  copy.walls = copy.walls.map(onLayer);
  copy.zones = copy.zones.map(onLayer);
  copy.lights = copy.lights.map(onLayer);
  copy.sounds = copy.sounds.map(onLayer);
  copy.assets = copy.assets.map(onLayer);
  copy.masonry = copy.masonry.map(onLayer);
  copy.cliffs = copy.cliffs.map(onLayer);
  copy.waters = copy.waters.map(onLayer);
  copy.floors = copy.floors.map(onLayer);
  copy.masonryDoors = copy.masonryDoors.map((d) => ({ ...d, wall: ref(d.wall)! }));
  copy.rooms = copy.rooms.map(onLayer);
  copy.stairs = copy.stairs.map((x) => ({ ...x, ...(x.from ? { from: ref(x.from) } : {}), ...(x.to ? { to: ref(x.to) } : {}) }));
  // The intent (E-46 ff.): wall lines and paths first, openings and crossings refer to them.
  const renewOn = <T extends { id: string; layer?: string; storey?: string }>(xs: T[] | undefined, prefix: string) => (xs ? renew(xs, prefix).map(onLayer) : undefined);
  const lists = {
    wallLines: renewOn(copy.wallLines, 'wall-line'),
    paths: renewOn(copy.paths, 'path'),
    waterSources: renewOn(copy.waterSources, 'source'),
    prefabs: renewOn(copy.prefabs, 'prefab'),
  };
  const intent: MapIntent = {
    ...lists,
    openings: renewOn(copy.openings, 'opening')?.map((o) => (o.wall ? { ...o, wall: ref(o.wall) } : o)),
    crossings: renewOn(copy.crossings, 'crossing')?.map((c) => (c.path ? { ...c, path: ref(c.path) } : c)),
    undergrounds: copy.undergrounds && renew(copy.undergrounds, 'underground').map((u) => ({ ...u, storey: ref(u.storey)!, entrances: u.entrances.map((e) => ({ ...e, id: fresh('entrance') })) })),
    derived: copy.derived && { ...copy.derived, regions: renewOn(copy.derived.regions, 'region')! },
    // A storey's rasters and a layer's patches are keyed by its id.
    terrain: copy.terrain && {
      ...copy.terrain,
      stacks: Object.fromEntries(Object.entries(copy.terrain.stacks).map(([k, st]) => [k === 'map' ? k : ref(k)!, { ...st, ...(st.layers ? { layers: Object.fromEntries(Object.entries(st.layers).map(([l, p]) => [ref(l)!, p])) } : {}) }])),
    },
  };
  return { ...copy, ...withoutUndefined(intent) };
}

/** A drawn map's intent on the map itself, its picture: without layers (they stay behind) and without what is on storeys. */
function intentOfMapItself(map: MapSidecar): MapIntent {
  const own = <T extends { layer?: string; storey?: string }>(xs: T[] | undefined) => xs?.filter((x) => !x.storey).map(({ layer: _l, ...x }) => x as T);
  const base = map.terrain?.stacks['map'];
  const stacks: Terrain['stacks'] = base ? { map: { base: base.base } } : {};
  return withoutUndefined({
    terrain: map.terrain && { ...map.terrain, stacks },
    wallLines: own(map.wallLines),
    openings: own(map.openings),
    paths: own(map.paths),
    crossings: own(map.crossings),
    waterSources: own(map.waterSources),
    prefabs: own(map.prefabs),
    derived: map.derived && { ...map.derived, regions: own(map.derived.regions)! },
    mood: map.mood,
  });
}

function withoutUndefined<T extends object>(o: T): T {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T;
}
