/**
 * Converts between the runtime Scene (what a view shows and edits) and the files:
 *  - map sidecar (`library/<map file>.dm.json`): grid, walls, areas, lights, sound sources, start fog – the map
 *    as built in the Map Forge, shared by every scene on it
 *  - scene file (`campaigns/<slug>/scenes/<name>.scene.json`): the scene's own changes of the map
 *    (overrides by element id, added elements) and its state (fog, doors, lights, tokens, combat)
 *
 * A view shows one layer (`ViewLayer`): the map (Map Forge: map elements, start fog, no tokens) or
 * the scene (everything else: map elements with the scene's changes, the scene's state).
 */
import { EMPTY_LEVEL_FOG } from './fogModel';
import type { LevelFog, Polygon } from './poly/types';
import type { Masonry } from './build/masonry';
import type { Cliff } from './build/cliffs';
import type { Water } from './build/water';
import type { FloorPatch } from './build/floors';
import { activeLayers, drawOrder, elementLayer } from './layers';
import { DEFAULT_TABLE, type HiddenElements, type MapAssetPlacement, type Scene, type Zone } from './scene';
import { diffElements, resolveElements, type MapElements, type SceneLayer } from './mapLayers';
import { MAP_VERSION, SCENE_VERSION, SCHEMA_VERSION, type CampaignManifest, type MapSidecar, type Player, type SceneDrawing, type SceneOverride } from './sidecar';
import { emptyOwnDrawing } from './build/sceneDrawing';

export const BUILTIN_PREFIX = 'builtin:';
/** The resource of a drawn map (E-33): it has no picture, its drawn walls are its picture. */
export const DRAWN_RESOURCE = 'drawn:';

export function isDrawn(resource: string): boolean {
  return resource === DRAWN_RESOURCE;
}

export function mapSidecarPath(resource: string): string {
  if (resource.startsWith(BUILTIN_PREFIX)) return `library/${resource.slice(BUILTIN_PREFIX.length)}.builtin.dm.json`;
  return `${resource}.dm.json`;
}

export function slugify(name: string): string {
  const s = name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return s || 'untitled';
}

/** What a view shows: the map (Map Forge), the scene's play state, or its start state. */
export type ViewLayer = 'map' | 'scene' | 'start';

export type SceneStart = NonNullable<SceneOverride['start']>;

/** The start state of a scene file; older files without one start where they are now. */
export function startOf(ov: SceneOverride): SceneStart {
  if (ov.start) return ov.start;
  return {
    fog: copyFog(ov.fog),
    tokens: ov.tokens.map((t) => ({ ...t, conditions: [...t.conditions] })),
    doors: { ...ov.doors },
    lights: { ...ov.lights },
    discoveredZones: [...ov.discoveredZones],
    ambience: ov.ambience.map((a) => ({ ...a })),
    ...copyAmbientSound(ov.ambientSound),
    hidden: [...ov.hidden],
    assets: ov.assets.map((a) => ({ ...a })),
    effects: { ...ov.effects },
    layers: { ...ov.layers },
    interiors: { ...ov.interiors },
    drawing: copySceneDrawing(ov.drawing),
  };
}

/** A scene's own drawing, copied (DC-107c). */
function copySceneDrawing(d: SceneDrawing): SceneDrawing {
  return {
    masonry: d.masonry.map(copyMasonry),
    masonryDoors: d.masonryDoors.map((x) => ({ ...x })),
    cliffs: d.cliffs.map(copyCliff),
    waters: d.waters.map(copyWater),
    floors: d.floors.map(copyFloor),
    hidden: [...d.hidden],
  };
}

/**
 * The scene file after editing its start state: `fromView` is the file a start-state view
 * produced (its changes of the map count for the scene; its state becomes the start), the play
 * state of `previous` stays.
 */
export function commitStart(previous: SceneOverride, fromView: SceneOverride, ambience: SceneStart['ambience']): SceneOverride {
  return {
    ...previous,
    overrides: fromView.overrides,
    added: fromView.added,
    start: {
      fog: copyFog(fromView.fog),
      tokens: fromView.tokens,
      doors: fromView.doors,
      lights: fromView.lights,
      discoveredZones: fromView.discoveredZones,
      ambience: ambience.map((a) => ({ ...a })),
      ...copyAmbientSound(fromView.ambientSound),
      hidden: fromView.hidden,
      assets: fromView.assets,
      effects: fromView.effects,
      layers: fromView.layers,
      interiors: fromView.interiors,
      drawing: fromView.drawing,
    },
  };
}

/**
 * "Reset scene": the play state becomes the start state again – fog, tokens, doors, lights,
 * discovered areas, hidden map elements, scene-own assets, effects, ambience; combat back to round 1; spell templates gone; the scene's live fog
 * look back to the map's.
 */
export function resetToStart(ov: SceneOverride): SceneOverride {
  const start = startOf(ov);
  const { fogEffect: _fe, ambientSound: _as, ...rest } = ov;
  return {
    ...rest,
    ...copyAmbientSound(start.ambientSound),
    fog: copyFog(start.fog),
    tokens: start.tokens.map((t) => ({ ...t, conditions: [...t.conditions] })),
    doors: { ...start.doors },
    lights: { ...start.lights },
    discoveredZones: [...start.discoveredZones],
    ambience: start.ambience.map((a) => ({ ...a })),
    hidden: [...start.hidden],
    assets: start.assets.map((a) => ({ ...a })),
    effects: { ...start.effects },
    drawing: copySceneDrawing(start.drawing),
    layers: { ...start.layers },
    interiors: { ...start.interiors },
    templates: [],
    combat: { round: 1, turn: 0 },
    start,
  };
}

/** The map elements of a view, shown and hidden, without state (door open, light on, discovered). */
export function elementsFromScene(view: Pick<Scene, 'walls' | 'zones' | 'lights' | 'sounds'> & Partial<Pick<Scene, 'hidden' | 'inactive'>>): MapElements {
  // Shown, hidden and on inactive layers: all are elements of the map.
  const parts = [view, view.hidden, view.inactive].filter((x): x is Pick<Scene, 'walls' | 'zones' | 'lights' | 'sounds'> => !!x);
  const walls = parts.flatMap((p) => p.walls);
  const zones = parts.flatMap((p) => p.zones);
  const lights = parts.flatMap((p) => p.lights);
  const sounds = parts.flatMap((p) => p.sounds);
  const onLayer = (el: { layer?: string }) => (el.layer ? { layer: el.layer } : {});
  return {
    walls: walls.map((w) => ({ id: w.id, kind: w.kind, x1: w.x1, y1: w.y1, x2: w.x2, y2: w.y2, ...onLayer(w) })),
    zones: zones.map((z) => ({ id: z.id, name: z.name, shape: copyShape(z.shape), secret: z.secret, color: z.color, ...(z.biome ? { biome: z.biome } : {}), ...onLayer(z) })),
    lights: lights.map((l) => ({ id: l.id, x: l.x, y: l.y, brightFt: l.brightFt, dimFt: l.dimFt, color: l.color, ...onLayer(l) })),
    sounds: sounds.map((x) => ({ id: x.id, sound: x.sound, x: x.x, y: x.y, radiusFt: x.radiusFt, volume: x.volume, fade: x.fade, ...onLayer(x) })),
  };
}

/** The map elements of a sidecar, without state. */
export function elementsFromSidecar(map: Pick<MapSidecar, 'walls' | 'zones' | 'lights' | 'sounds'>): MapElements {
  return {
    walls: map.walls.map(({ open: _o, ...w }) => ({ ...w })),
    zones: map.zones.map((z) => ({ ...z, shape: copyShape(z.shape) })),
    lights: map.lights.map((l) => ({ ...l })),
    sounds: map.sounds.map((x) => ({ ...x })),
  };
}

/** The scene's own changes of the map, as stored in its file. */
export function layerOf(ov: Pick<SceneOverride, 'overrides' | 'added'> | null | undefined): SceneLayer {
  return { overrides: ov?.overrides ?? {}, added: ov?.added ?? { walls: [], zones: [], lights: [], sounds: [] } };
}

/**
 * The map's file data with the map-wide values of a view (name, grid, fog look, catalog data,
 * ambient light) – from any layer – and, from the map layer only, its elements and start fog.
 */
export function mapSidecarFromScene(scene: Scene, resource: string, layer: ViewLayer = 'map', previous?: MapSidecar | null): MapSidecar {
  const m = scene.map;
  const fromView = layer === 'map' || !previous;
  const elements = fromView ? elementsFromScene(scene) : elementsFromSidecar(previous);
  const startFog = fromView ? (layer === 'map' ? copyFog(scene.fog) : previous?.startFog) : previous.startFog;
  return {
    kind: 'map',
    schemaVersion: MAP_VERSION,
    name: m.name,
    resource,
    isVideo: m.isVideo,
    widthPx: m.widthPx,
    heightPx: m.heightPx,
    tags: [...m.tags],
    biome: m.region,
    mapType: m.mapType,
    fogBiome: m.biome,
    fogStrength: m.biomeStrength,
    grid: { ...m.grid },
    walls: elements.walls,
    zones: elements.zones,
    pois: m.pois.map((p) => ({ ...p })),
    // Placed assets and layers are edited in the Map Forge only; a scene's view may leave some out.
    assets: (fromView ? m.assets : previous.assets).map((a) => ({ ...a })),
    layers: (fromView ? m.layers : previous.layers).map((l) => ({ ...l, ...(l.trigger ? { trigger: { ...l.trigger } } : {}) })),
    lights: elements.lights,
    sounds: elements.sounds,
    ...((fromView ? m.ambientSound : previous.ambientSound) ? { ambientSound: { ...(fromView ? m.ambientSound : previous.ambientSound)! } } : {}),
    ambient: scene.ambient,
    ...(startFog ? { startFog: copyFog(startFog) } : {}),
    // Drawn walls are edited in the Map Forge only, like placed assets.
    masonry: (fromView ? m.masonry : previous.masonry).map(copyMasonry),
    masonryDoors: (fromView ? m.masonryDoors : previous.masonryDoors).map((d) => ({ ...d })),
    cliffs: (fromView ? m.cliffs : previous.cliffs).map(copyCliff),
    waters: (fromView ? m.waters : previous.waters).map(copyWater),
    floors: (fromView ? m.floors : previous.floors).map(copyFloor),
    waterAnimated: fromView ? m.waterAnimated : previous.waterAnimated,
    lightAngle: fromView ? m.lightAngle : previous.lightAngle,
    autoShore: fromView ? m.autoShore : previous.autoShore,
    autoGrowth: fromView ? m.autoGrowth : previous.autoGrowth,
    ...((fromView ? m.origin : previous.origin) ? { origin: { ...(fromView ? m.origin : previous.origin)! } } : {}),
  };
}

/**
 * The scene file for a view of the scene layer: its changes of `map` (by element id, plus its own
 * elements; orphaned overrides and hidden ids of `previous` are kept) and its state.
 */
export function sceneOverrideFromScene(scene: Scene, name: string, mapSidecar: string, combat: { round: number; turn: number }, map: Pick<MapSidecar, 'walls' | 'zones' | 'lights' | 'sounds' | 'assets'>, previous?: SceneLayer & { hidden?: string[] }): SceneOverride {
  const base = elementsFromSidecar(map);
  const current = elementsFromScene(scene);
  const layer = diffElements(base, current, previous);
  // Hidden ids whose element is gone are kept too, until the DM cleans them up.
  const off = [...scene.hidden.assets, ...scene.inactive.assets];
  const known = new Set([...elementIds(base, current), ...scene.map.assets.map((a) => a.id), ...scene.ownAssets.map((a) => a.id), ...off.map((a) => a.id)]);
  // The scene's own assets, shown, hidden or on an inactive layer – never the map's.
  const mapAssets = new Set(map.assets.map((a) => a.id));
  const own = [...scene.ownAssets, ...off.filter((a) => !mapAssets.has(a.id))];
  const all = <K extends 'walls' | 'zones' | 'lights'>(k: K) => [...scene[k], ...scene.hidden[k], ...scene.inactive[k]] as Scene[K];
  const orphanedHidden = (previous?.hidden ?? []).filter((id) => !known.has(id));
  // Door and interior states of placements that are gone are left out (E-29).
  const placements = new Set([...map.assets.map((a) => a.id), ...own.map((a) => a.id)]);
  const ofPlacement = (key: string) => placements.has(key.replace(/:(door|in\d+)$/, ''));
  const assetDoors = Object.fromEntries(Object.entries(scene.assetDoorsOpen).filter(([k]) => ofPlacement(k)));
  const interiors = Object.fromEntries(Object.entries(scene.interiorsOn).filter(([k]) => placements.has(k)));
  // States of drawn doors (open, found) are left out once the door is gone (E-33) – the map's and the scene's own.
  const drawnDoors = new Set([...scene.map.masonryDoors, ...scene.own.masonryDoors].map((d) => d.id));
  const masonryDoors = Object.fromEntries(Object.entries(scene.masonryDoorsOpen).filter(([k]) => drawnDoors.has(k.replace(/:found$/, ''))));
  return {
    kind: 'scene',
    schemaVersion: SCENE_VERSION,
    name,
    mapSidecar,
    fog: copyFog(scene.fog),
    ...(scene.fogEffect ? { fogEffect: { ...scene.fogEffect } } : {}),
    doors: { ...Object.fromEntries(all('walls').filter((w) => w.kind === 'door' || w.kind === 'secret-door').map((w) => [w.id, !!w.open])), ...assetDoors, ...masonryDoors },
    lights: { ...Object.fromEntries(all('lights').map((l) => [l.id, l.on])), ...scene.assetLightsOn },
    discoveredZones: all('zones').filter((z) => z.secret && z.discovered).map((z) => z.id),
    hidden: [...hiddenIds(scene.hidden), ...orphanedHidden],
    assets: own.map((a) => ({ ...a })),
    effects: { ...scene.effectsOn },
    layers: { ...scene.layersOn },
    interiors,
    drawing: copySceneDrawing({ ...scene.own, hidden: scene.drawnHidden }),
    tokens: scene.tokens.map((t) => ({ ...t, conditions: [...t.conditions] })),
    templates: scene.templates.map((t) => ({ ...t })),
    combat: { ...combat },
    ambience: [],
    ...copyAmbientSound(scene.ambientOverride),
    overrides: layer.overrides,
    added: layer.added,
  };
}

/** A scene's own sound everywhere (E-37) as a field to spread: none when the map's counts. */
function copyAmbientSound(a: SceneOverride['ambientSound']): Pick<SceneOverride, 'ambientSound'> {
  return a === undefined ? {} : { ambientSound: a === 'none' ? 'none' : { ...a } };
}

function copyFloor(f: FloorPatch): FloorPatch {
  return { ...f, shape: copyShape(f.shape) };
}

function copyWater(w: Water): Water {
  return { ...w, points: w.points.map((q) => ({ x: q.x, y: q.y })) };
}

function copyCliff(c: Cliff): Cliff {
  return { ...c, points: c.points.map((q) => ({ x: q.x, y: q.y })) };
}

function copyMasonry(w: Masonry): Masonry {
  return { ...w, points: w.points.map((q) => ({ x: q.x, y: q.y })) };
}

function copyShape(ps: readonly Polygon[]): Polygon[] {
  return ps.map((p) => ({ outer: p.outer.map(([x, y]) => [x, y] as [number, number]), holes: p.holes.map((h) => h.map(([x, y]) => [x, y] as [number, number])) }));
}

function copyFog(fog: LevelFog): LevelFog {
  return { revealed: copyShape(fog.revealed), remembered: copyShape(fog.remembered) };
}

/** Undiscovered secret areas: tools and vision never reveal them by accident. */
export function lockedAreas(zones: readonly Zone[]): Polygon[] {
  return zones.filter((z) => z.secret && !z.discovered).flatMap((z) => z.shape);
}

/** Builds a Scene from a map sidecar and (optionally) a scene override. */
/**
 * A view of a map (`layer` "map": the Map Forge – map elements, start fog, no tokens) or of a scene
 * on it (`layer` "scene": the map with the scene's changes and the scene's state). Without a scene
 * file a scene starts with the map's start fog.
 */
export function sceneFromDocuments(map: MapSidecar, override: SceneOverride | null, imageUrl: string | null, table?: Partial<Scene['table']>, layer: ViewLayer = 'scene'): Scene {
  const onMap = layer === 'map';
  // The start state shows the scene's start instead of its play state.
  const st = layer === 'start' && override ? startOf(override) : null;
  // The start's own sound everywhere, not the play state's (E-37).
  const state = st ? { ...override!, ...st, ambientSound: st.ambientSound, templates: [], fogEffect: undefined } : override;
  const discovered = new Set(state?.discoveredZones ?? []);
  const elements = onMap ? elementsFromSidecar(map) : resolveElements(elementsFromSidecar(map), layerOf(override)).elements;
  const zones: Zone[] = elements.zones.map((z) => ({ ...z, shape: copyShape(z.shape), discovered: !z.secret || (!onMap && discovered.has(z.id)) }));
  const startFog = map.startFog ? copyFog(map.startFog) : EMPTY_LEVEL_FOG;
  const fog: LevelFog = onMap || !state ? startFog : copyFog(state.fog);
  const doors = onMap ? {} : (state?.doors ?? {});
  const lightsOn = onMap ? {} : (state?.lights ?? {});
  const hide = new Set(onMap ? [] : (state?.hidden ?? []));
  const walls = elements.walls.map((w) => ({ ...w, open: w.kind === 'door' || w.kind === 'secret-door' ? (doors[w.id] ?? false) : undefined }));
  const lights = elements.lights.map((l) => ({ ...l, on: lightsOn[l.id] ?? true }));
  const sounds = elements.sounds.map((x) => ({ ...x }));
  const shown = <T extends { id: string }>(xs: T[]) => xs.filter((x) => !hide.has(x.id));
  const hiddenOf = <T extends { id: string }>(xs: T[]) => xs.filter((x) => hide.has(x.id));
  // Elements on layers this scene has off (E-28): apart from the shown ones, unless hidden anyway.
  const active = onMap ? null : activeLayers(map.layers, state?.layers ?? {});
  const on = <T extends { layer?: string }>(x: T) => !active || active.has(elementLayer(x));
  const shownOn = <T extends { id: string; layer?: string }>(xs: T[]) => shown(xs).filter(on);
  const inactiveOf = <T extends { id: string; layer?: string }>(xs: T[]) => shown(xs).filter((x) => !on(x));
  const ownAssets = onMap ? [] : (state?.assets ?? []).map((a) => ({ ...a }));
  // Asset lights are stored with the map lights, by `<placement>:light`.
  const assetLightsOn = Object.fromEntries(Object.entries(lightsOn).filter(([id]) => id.endsWith(':light')));
  // Likewise doors of assets with the map doors, by `<placement>:door` and `<placement>:in<n>` (E-29).
  const assetDoorsOpen = Object.fromEntries(Object.entries(doors).filter(([id]) => /:(door|in\d+)$/.test(id)));
  // The scene's own drawing (DC-107c): none in the Map Forge.
  const drawing = onMap || !state ? null : copySceneDrawing(state.drawing);
  // And doors on drawn walls by their id, found secret ones by `<id>:found` (E-33).
  const drawnDoors = new Set([...map.masonryDoors, ...(drawing?.masonryDoors ?? [])].map((d) => d.id));
  const masonryDoorsOpen = Object.fromEntries(Object.entries(doors).filter(([id]) => drawnDoors.has(id.replace(/:found$/, ''))));
  return {
    map: {
      id: slugify(map.name),
      name: map.name,
      imageUrl,
      isVideo: map.isVideo,
      widthPx: map.widthPx,
      heightPx: map.heightPx,
      grid: { ...map.grid },
      biome: map.fogBiome,
      biomeStrength: map.fogStrength,
      tags: [...map.tags],
      region: map.biome,
      mapType: map.mapType,
      pois: map.pois.map((p) => ({ ...p })),
      assets: shownOn(map.assets.map((a) => ({ ...a, ...(a.variant === undefined ? {} : { variant: a.variant }) }))),
      layers: map.layers.map((l) => ({ ...l, ...(l.trigger ? { trigger: { ...l.trigger } } : {}) })),
      masonry: map.masonry.map(copyMasonry),
      masonryDoors: map.masonryDoors.map((d) => ({ ...d })),
      cliffs: map.cliffs.map(copyCliff),
      waters: map.waters.map(copyWater),
      floors: map.floors.map(copyFloor),
      waterAnimated: map.waterAnimated,
      lightAngle: map.lightAngle,
      autoShore: map.autoShore,
      autoGrowth: map.autoGrowth,
      ...(map.origin ? { origin: { ...map.origin } } : {}),
      ...(isDrawn(map.resource) ? { drawn: true } : {}),
      ...(map.ambientSound ? { ambientSound: { ...map.ambientSound } } : {}),
    },
    walls: shownOn(walls),
    zones: shownOn(zones),
    lights: shownOn(lights),
    sounds: shownOn(sounds),
    inactive: { walls: inactiveOf(walls), zones: inactiveOf(zones), lights: inactiveOf(lights), sounds: inactiveOf(sounds), assets: inactiveOf([...map.assets.map((a) => ({ ...a })), ...ownAssets]) },
    layersOn: onMap ? {} : { ...(state?.layers ?? {}) },
    interiorsOn: onMap ? {} : { ...(state?.interiors ?? {}) },
    hidden: { walls: hiddenOf(walls), zones: hiddenOf(zones), lights: hiddenOf(lights), sounds: hiddenOf(sounds), assets: hiddenOf([...map.assets.map((a) => ({ ...a })), ...ownAssets]) },
    ownAssets: shownOn(ownAssets),
    assetLightsOn,
    assetDoorsOpen,
    masonryDoorsOpen,
    own: drawing ? { masonry: drawing.masonry, masonryDoors: drawing.masonryDoors, cliffs: drawing.cliffs, waters: drawing.waters, floors: drawing.floors } : emptyOwnDrawing(),
    drawnHidden: drawing ? drawing.hidden : [],
    effectsOn: onMap ? {} : { ...(state?.effects ?? {}) },
    ...(onMap || state?.ambientSound === undefined ? {} : { ambientOverride: copyAmbientSound(state.ambientSound).ambientSound }),
    ambient: map.ambient,
    tokens: onMap ? [] : (state?.tokens ?? []).map((t) => ({ ...t, conditions: [...t.conditions] })),
    templates: onMap ? [] : (state?.templates ?? []).map((t) => ({ ...t })),
    pings: [],
    fog,
    fogEffect: !onMap && state?.fogEffect ? { ...state.fogEffect } : null,
    table: { ...DEFAULT_TABLE, centerX: (map.origin?.x ?? 0) + map.widthPx / 2, centerY: (map.origin?.y ?? 0) + map.heightPx / 2, ...table },
  };
}

/**
 * Changes of a scene file that the map cannot take: overrides and hidden ids (play state and start)
 * whose element is gone (`orphaned`), and overrides that would make their element invalid.
 */
export function sceneIssues(map: MapSidecar, override: SceneOverride | null): { orphaned: string[]; invalid: string[] } {
  const base = elementsFromSidecar(map);
  const layer = layerOf(override);
  const r = resolveElements(base, layer);
  const own = [...(override?.assets ?? []), ...(override?.start?.assets ?? [])];
  const known = new Set([...elementIds(base, layer.added), ...map.assets.map((a) => a.id), ...own.map((a) => a.id)]);
  const hidden = [...(override?.hidden ?? []), ...(override?.start?.hidden ?? [])].filter((id) => !known.has(id));
  return { orphaned: [...new Set([...r.orphaned, ...hidden])].sort(), invalid: r.invalid };
}

function elementIds(...sets: MapElements[]): Set<string> {
  return new Set(sets.flatMap((e) => [...e.walls, ...e.zones, ...e.lights, ...e.sounds].map((x) => x.id)));
}

/** "Clean up": the scene file without the changes the map cannot take (orphaned or invalid). */
export function withoutOrphans(override: SceneOverride, map: MapSidecar): SceneOverride {
  const { orphaned, invalid } = sceneIssues(map, override);
  const drop = new Set([...orphaned, ...invalid]);
  const keep = (ids: string[]) => ids.filter((id) => !drop.has(id));
  return {
    ...override,
    overrides: Object.fromEntries(Object.entries(override.overrides).filter(([id]) => !drop.has(id))),
    hidden: keep(override.hidden),
    ...(override.start ? { start: { ...override.start, hidden: keep(override.start.hidden) } } : {}),
  };
}

export function hiddenIds(h: HiddenElements): string[] {
  return [...h.walls, ...h.zones, ...h.lights, ...h.sounds, ...h.assets].map((x) => x.id);
}

/** How a scene's element differs from the map: hidden, changed fields, or only in this scene. */
export interface ElementChange {
  id: string;
  kind: keyof MapElements | 'assets';
  status: 'hidden' | 'changed' | 'own';
}

/** Every element of a view that differs from the map `base`, in the order walls, areas, lights, sounds. */
export function sceneChanges(base: MapElements, view: Scene): ElementChange[] {
  const layer = diffElements(base, elementsFromScene(view));
  const hidden = new Set(hiddenIds(view.hidden));
  const out: ElementChange[] = [];
  for (const kind of ['walls', 'zones', 'lights', 'sounds'] as const) {
    for (const el of [...base[kind], ...layer.added[kind]]) {
      const own = layer.added[kind].includes(el as never);
      if (hidden.has(el.id)) out.push({ id: el.id, kind, status: 'hidden' });
      else if (own) out.push({ id: el.id, kind, status: 'own' });
      else if (layer.overrides[el.id]) out.push({ id: el.id, kind, status: 'changed' });
    }
  }
  // Placed assets: a scene only hides them.
  for (const a of view.hidden.assets) out.push({ id: a.id, kind: 'assets', status: 'hidden' });
  return out;
}

/**
 * "Reset to map": the element `id` takes the map's fields again; its state (a door open, a light
 * on, an area discovered) and whether it is hidden stay. Returns a new scene.
 */
export function resetElement(view: Scene, base: MapElements, id: string): Scene {
  const fromMap = <T extends { id: string }>(xs: T[], kind: keyof MapElements): T[] =>
    xs.map((x) => {
      const b = (base[kind] as { id: string }[]).find((e) => e.id === id);
      if (x.id !== id || !b) return x;
      const state: Record<string, unknown> = {};
      for (const k of ['open', 'on', 'discovered']) if (k in x) state[k] = (x as Record<string, unknown>)[k];
      return { ...structuredClone(b), ...state } as unknown as T;
    });
  return {
    ...view,
    walls: fromMap(view.walls, 'walls'),
    zones: fromMap(view.zones, 'zones'),
    lights: fromMap(view.lights, 'lights'),
    sounds: fromMap(view.sounds, 'sounds'),
    hidden: { ...view.hidden, walls: fromMap(view.hidden.walls, 'walls'), zones: fromMap(view.hidden.zones, 'zones'), lights: fromMap(view.hidden.lights, 'lights'), sounds: fromMap(view.hidden.sounds, 'sounds') },
  };
}

export function tableFromManifest(m: CampaignManifest): Partial<Scene['table']> {
  return {
    display: { diagonalInches: m.table.diagonalInches, widthPx: m.table.widthPx, heightPx: m.table.heightPx },
    inchesPerCell: m.table.inchesPerCell,
    ppiCorrection: m.table.ppiCorrection,
    rotation: m.table.rotation,
  };
}

export function manifestFromState(name: string, activeScene: string | null, table: Scene['table'], players: Player[] = []): CampaignManifest {
  return {
    kind: 'campaign',
    schemaVersion: SCHEMA_VERSION,
    name,
    activeScene,
    players,
    table: {
      diagonalInches: table.display.diagonalInches,
      widthPx: table.display.widthPx,
      heightPx: table.display.heightPx,
      inchesPerCell: table.inchesPerCell,
      ppiCorrection: table.ppiCorrection,
      rotation: table.rotation,
    },
  };
}

/** Every placed asset of a view – the map's (shown) and the scene's own (DC-110) – in drawing order by layer height (E-28). */
export function allPlacements(scene: Pick<Scene, 'map' | 'ownAssets'>): MapAssetPlacement[] {
  return drawOrder([...scene.map.assets, ...scene.ownAssets], scene.map.layers);
}
