/**
 * Converts between the runtime Scene (what a view shows and edits) and the files:
 *  - map sidecar (`library/<map file>.dm.json`): grid, walls, areas, lights, start fog – the map
 *    as built in the Map Forge, shared by every scene on it
 *  - scene file (`campaigns/<slug>/scenes/<name>.scene.json`): the scene's own changes of the map
 *    (overrides by element id, added elements) and its state (fog, doors, lights, tokens, combat)
 *
 * A view shows one layer (`ViewLayer`): the map (Map Forge: map elements, start fog, no tokens) or
 * the scene (everything else: map elements with the scene's changes, the scene's state).
 */
import { EMPTY_LEVEL_FOG, rectPolygon } from './fogModel';
import type { LevelFog, Polygon } from './poly/types';
import { DEFAULT_TABLE, type Scene, type Zone } from './scene';
import { diffElements, resolveElements, type MapElements, type SceneLayer } from './mapLayers';
import { SCHEMA_VERSION, type CampaignManifest, type MapSidecar, type SceneOverride } from './sidecar';

export const BUILTIN_PREFIX = 'builtin:';

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

export type ViewLayer = 'map' | 'scene';

/** The map elements a view shows, without state (door open, light on, discovered). */
export function elementsFromScene(scene: Pick<Scene, 'walls' | 'zones' | 'lights'>): MapElements {
  return {
    walls: scene.walls.map((w) => ({ id: w.id, kind: w.kind, x1: w.x1, y1: w.y1, x2: w.x2, y2: w.y2 })),
    zones: scene.zones.map((z) => ({ id: z.id, name: z.name, kind: z.kind, rect: { ...z.rect }, color: z.color, ...(z.biome ? { biome: z.biome } : {}) })),
    lights: scene.lights.map((l) => ({ id: l.id, x: l.x, y: l.y, brightFt: l.brightFt, dimFt: l.dimFt, color: l.color })),
  };
}

/** The map elements of a sidecar, without state. */
export function elementsFromSidecar(map: Pick<MapSidecar, 'walls' | 'zones' | 'lights'>): MapElements {
  return {
    walls: map.walls.map(({ open: _o, ...w }) => ({ ...w })),
    zones: map.zones.map((z) => ({ ...z, rect: { ...z.rect } })),
    lights: map.lights.map((l) => ({ ...l })),
  };
}

/** The scene's own changes of the map, as stored in its file. */
export function layerOf(ov: Pick<SceneOverride, 'overrides' | 'added'> | null | undefined): SceneLayer {
  return { overrides: ov?.overrides ?? {}, added: ov?.added ?? { walls: [], zones: [], lights: [] } };
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
    schemaVersion: SCHEMA_VERSION,
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
    assets: m.assets.map((a) => ({ ...a })),
    lights: elements.lights,
    ambient: scene.ambient,
    ...(startFog ? { startFog: copyFog(startFog) } : {}),
  };
}

/**
 * The scene file for a view of the scene layer: its changes of `map` (by element id, plus its own
 * elements; orphaned overrides of `previous` are kept) and its state.
 */
export function sceneOverrideFromScene(scene: Scene, name: string, mapSidecar: string, combat: { round: number; turn: number }, map: Pick<MapSidecar, 'walls' | 'zones' | 'lights'>, previous?: SceneLayer): SceneOverride {
  const layer = diffElements(elementsFromSidecar(map), elementsFromScene(scene), previous);
  return {
    kind: 'scene',
    schemaVersion: SCHEMA_VERSION,
    name,
    mapSidecar,
    fog: copyFog(scene.fog),
    ...(scene.fogEffect ? { fogEffect: { ...scene.fogEffect } } : {}),
    doors: Object.fromEntries(scene.walls.filter((w) => w.kind === 'door' || w.kind === 'secret-door').map((w) => [w.id, !!w.open])),
    lights: Object.fromEntries(scene.lights.map((l) => [l.id, l.on])),
    discoveredZones: scene.zones.filter((z) => z.kind === 'secret' && z.discovered).map((z) => z.id),
    tokens: scene.tokens.map((t) => ({ ...t, conditions: [...t.conditions] })),
    templates: scene.templates.map((t) => ({ ...t })),
    combat: { ...combat },
    ambience: [],
    overrides: layer.overrides,
    added: layer.added,
  };
}

function copyFog(fog: LevelFog): LevelFog {
  const cp = (ps: readonly Polygon[]) => ps.map((p) => ({ outer: p.outer.map(([x, y]) => [x, y] as [number, number]), holes: p.holes.map((h) => h.map(([x, y]) => [x, y] as [number, number])) }));
  return { revealed: cp(fog.revealed), remembered: cp(fog.remembered) };
}

/** Undiscovered secret rooms: tools and vision never reveal them by accident. */
export function lockedAreas(zones: readonly Zone[]): Polygon[] {
  return zones.filter((z) => z.kind === 'secret' && !z.discovered).map((z) => rectPolygon(z.rect.x, z.rect.y, z.rect.x + z.rect.w, z.rect.y + z.rect.h));
}

/** Builds a Scene from a map sidecar and (optionally) a scene override. */
/**
 * A view of a map (`layer` "map": the Map Forge – map elements, start fog, no tokens) or of a scene
 * on it (`layer` "scene": the map with the scene's changes and the scene's state). Without a scene
 * file a scene starts with the map's start fog.
 */
export function sceneFromDocuments(map: MapSidecar, override: SceneOverride | null, imageUrl: string | null, table?: Partial<Scene['table']>, layer: ViewLayer = 'scene'): Scene {
  const onMap = layer === 'map';
  const discovered = new Set(override?.discoveredZones ?? []);
  const elements = onMap ? elementsFromSidecar(map) : resolveElements(elementsFromSidecar(map), layerOf(override)).elements;
  const zones: Zone[] = elements.zones.map((z) => ({ ...z, rect: { ...z.rect }, discovered: z.kind !== 'secret' || (!onMap && discovered.has(z.id)) }));
  const startFog = map.startFog ? copyFog(map.startFog) : EMPTY_LEVEL_FOG;
  const fog: LevelFog = onMap || !override ? startFog : copyFog(override.fog);
  const doors = onMap ? {} : (override?.doors ?? {});
  const lightsOn = onMap ? {} : (override?.lights ?? {});
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
      assets: map.assets.map((a) => ({ ...a, ...(a.variant === undefined ? {} : { variant: a.variant }) })),
    },
    walls: elements.walls.map((w) => ({ ...w, open: w.kind === 'door' || w.kind === 'secret-door' ? (doors[w.id] ?? false) : undefined })),
    zones,
    lights: elements.lights.map((l) => ({ ...l, on: lightsOn[l.id] ?? true })),
    ambient: map.ambient,
    tokens: onMap ? [] : (override?.tokens ?? []).map((t) => ({ ...t, conditions: [...t.conditions] })),
    templates: onMap ? [] : (override?.templates ?? []).map((t) => ({ ...t })),
    pings: [],
    fog,
    fogEffect: !onMap && override?.fogEffect ? { ...override.fogEffect } : null,
    table: { ...DEFAULT_TABLE, centerX: map.widthPx / 2, centerY: map.heightPx / 2, ...table },
  };
}

/** Overrides of a scene file that the map cannot take: their element is gone, or they are invalid. */
export function sceneIssues(map: MapSidecar, override: SceneOverride | null): { orphaned: string[]; invalid: string[] } {
  const r = resolveElements(elementsFromSidecar(map), layerOf(override));
  return { orphaned: r.orphaned, invalid: r.invalid };
}

export function tableFromManifest(m: CampaignManifest): Partial<Scene['table']> {
  return {
    display: { diagonalInches: m.table.diagonalInches, widthPx: m.table.widthPx, heightPx: m.table.heightPx },
    inchesPerCell: m.table.inchesPerCell,
    ppiCorrection: m.table.ppiCorrection,
    rotation: m.table.rotation,
  };
}

export function manifestFromState(name: string, activeScene: string | null, table: Scene['table']): CampaignManifest {
  return {
    kind: 'campaign',
    schemaVersion: SCHEMA_VERSION,
    name,
    activeScene,
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
