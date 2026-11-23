/**
 * Converts between the runtime Scene and the files in a campaign folder:
 *  - map sidecar (`<map file>.dm.json`): grid, walls, zones – the map as built
 *  - scene override (`scenes/<name>.scene.json`): fog, doors, tokens, combat
 */
import { FogState, rle, unrle } from './fog';
import { DEFAULT_TABLE, type Scene, type Zone } from './scene';
import { SCHEMA_VERSION, type CampaignManifest, type MapSidecar, type SceneOverride } from './sidecar';

export const BUILTIN_PREFIX = 'builtin:';

export function mapSidecarPath(resource: string): string {
  if (resource.startsWith(BUILTIN_PREFIX)) return `maps/${resource.slice(BUILTIN_PREFIX.length)}.builtin.dm.json`;
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
    tags: [],
    biome: '',
    mapType: 'dungeon',
    fogBiome: m.biome,
    grid: { ...m.grid },
    walls: scene.walls.map((w) => ({ id: w.id, kind: w.kind, x1: w.x1, y1: w.y1, x2: w.x2, y2: w.y2, ...(w.kind === 'door' || w.kind === 'secret-door' ? { open: false } : {}) })),
    zones: scene.zones.map((z) => ({ id: z.id, name: z.name, kind: z.kind, rect: { ...z.rect }, color: z.color, ...(z.biome ? { biome: z.biome } : {}) })),
    pois: [],
    assets: [],
  };
}

export function sceneOverrideFromScene(scene: Scene, name: string, mapSidecar: string, combat: { round: number; turn: number }): SceneOverride {
  return {
    kind: 'scene',
    schemaVersion: SCHEMA_VERSION,
    name,
    mapSidecar,
    fog: { cols: scene.fog.cols, rows: scene.fog.rows, cellSize: scene.fog.cellSize, explored: scene.fog.encode(), locked: rle(scene.fog.locked) },
    doors: Object.fromEntries(scene.walls.filter((w) => w.kind === 'door' || w.kind === 'secret-door').map((w) => [w.id, !!w.open])),
    discoveredZones: scene.zones.filter((z) => z.kind === 'secret' && z.discovered).map((z) => z.id),
    tokens: scene.tokens.map((t) => ({ ...t, conditions: [...t.conditions] })),
    templates: scene.templates.map((t) => ({ ...t })),
    combat: { ...combat },
    ambience: [],
  };
}

function fogGridFor(map: MapSidecar): { cols: number; rows: number; cellSize: number } {
  const cellSize = map.grid.cellWidth;
  return { cols: Math.max(1, Math.ceil(map.widthPx / cellSize)), rows: Math.max(1, Math.ceil(map.heightPx / cellSize)), cellSize };
}

function zoneCells(z: Pick<Zone, 'rect'>, cellSize: number): [number, number][] {
  const out: [number, number][] = [];
  for (let r = Math.floor(z.rect.y / cellSize); r < Math.ceil((z.rect.y + z.rect.h) / cellSize); r++) {
    for (let c = Math.floor(z.rect.x / cellSize); c < Math.ceil((z.rect.x + z.rect.w) / cellSize); c++) out.push([c, r]);
  }
  return out;
}

/** Builds a Scene. Fog from the override is used only when its grid still matches the map. */
export function sceneFromDocuments(map: MapSidecar, override: SceneOverride | null, imageUrl: string | null, table?: Partial<Scene['table']>): Scene {
  const discovered = new Set(override?.discoveredZones ?? []);
  const zones: Zone[] = map.zones.map((z) => ({ ...z, rect: { ...z.rect }, discovered: z.kind !== 'secret' || discovered.has(z.id) }));
  const fg = fogGridFor(map);
  let fog: FogState;
  const of = override?.fog;
  if (of && of.cols === fg.cols && of.rows === fg.rows && of.cellSize === fg.cellSize) {
    fog = new FogState(fg, unrle(of.explored, fg.cols * fg.rows), unrle(of.locked, fg.cols * fg.rows));
  } else {
    fog = new FogState(fg);
    for (const z of zones) if (z.kind === 'secret' && !z.discovered) fog.setLocked(zoneCells(z, fg.cellSize), true);
  }
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
    },
    walls: map.walls.map((w) => ({ ...w, open: w.kind === 'door' || w.kind === 'secret-door' ? (doors[w.id] ?? false) : undefined })),
    zones,
    tokens: (override?.tokens ?? []).map((t) => ({ ...t, conditions: [...t.conditions] })),
    templates: (override?.templates ?? []).map((t) => ({ ...t })),
    pings: [],
    fog,
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
