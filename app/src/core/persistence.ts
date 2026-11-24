/**
 * Converts between the runtime Scene and the files in a campaign folder:
 *  - map sidecar (`<map file>.dm.json`): grid, walls, zones – the map as built
 *  - scene override (`scenes/<name>.scene.json`): fog, doors, tokens, combat
 */
import { EMPTY_LEVEL_FOG, rectPolygon } from './fogModel';
import type { LevelFog, Polygon } from './poly/types';
import { DEFAULT_TABLE, type Scene, type Zone } from './scene';
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

export function mapSidecarFromScene(scene: Scene, resource: string): MapSidecar {
  const m = scene.map;
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
    walls: scene.walls.map((w) => ({ id: w.id, kind: w.kind, x1: w.x1, y1: w.y1, x2: w.x2, y2: w.y2, ...(w.kind === 'door' || w.kind === 'secret-door' ? { open: false } : {}) })),
    zones: scene.zones.map((z) => ({ id: z.id, name: z.name, kind: z.kind, rect: { ...z.rect }, color: z.color, ...(z.biome ? { biome: z.biome } : {}) })),
    pois: m.pois.map((p) => ({ ...p })),
    assets: m.assets.map((a) => ({ ...a })),
    lights: scene.lights.map((l) => ({ id: l.id, x: l.x, y: l.y, brightFt: l.brightFt, dimFt: l.dimFt, color: l.color })),
    ambient: scene.ambient,
  };
}

export function sceneOverrideFromScene(scene: Scene, name: string, mapSidecar: string, combat: { round: number; turn: number }): SceneOverride {
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
export function sceneFromDocuments(map: MapSidecar, override: SceneOverride | null, imageUrl: string | null, table?: Partial<Scene['table']>): Scene {
  const discovered = new Set(override?.discoveredZones ?? []);
  const zones: Zone[] = map.zones.map((z) => ({ ...z, rect: { ...z.rect }, discovered: z.kind !== 'secret' || discovered.has(z.id) }));
  const fog: LevelFog = override ? copyFog(override.fog) : EMPTY_LEVEL_FOG;
  const doors = override?.doors ?? {};
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
    walls: map.walls.map((w) => ({ ...w, open: w.kind === 'door' || w.kind === 'secret-door' ? (doors[w.id] ?? false) : undefined })),
    zones,
    lights: map.lights.map((l) => ({ ...l, on: override?.lights?.[l.id] ?? true })),
    ambient: map.ambient,
    tokens: (override?.tokens ?? []).map((t) => ({ ...t, conditions: [...t.conditions] })),
    templates: (override?.templates ?? []).map((t) => ({ ...t })),
    pings: [],
    fog,
    fogEffect: override?.fogEffect ? { ...override.fogEffect } : null,
    table: { ...DEFAULT_TABLE, centerX: map.widthPx / 2, centerY: map.heightPx / 2, ...table },
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
