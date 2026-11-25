/** Runtime scene model used by the DM window. Never sent to the table as a whole. */
import type { Point, Segment } from './geometry';
import type { GridConfig, DisplaySpec } from './grid';
import type { FogEffect, LevelFog, Polygon } from './poly/types';
import type { Condition } from './rules/rules2024';
import type { MapLayer } from './sidecar';

/** A cliff or gallery is one way: one sees down from its upper side, not up from below (DC-014). */
export type WallKind = 'wall' | 'door' | 'secret-door' | 'window' | 'cliff';

export interface Wall extends Segment {
  id: string;
  kind: WallKind;
  /** Doors only. */
  open?: boolean;
  /** Its layer (E-28); none: the base layer. */
  layer?: string;
}


export interface Zone {
  id: string;
  name: string;
  /** Polygons with holes in map pixels, possibly several parts (DC-013). */
  shape: Polygon[];
  /** Locked in the fog until discovered. */
  secret: boolean;
  color: string;
  biome?: FogBiome;
  /** Secret areas stay locked in the fog until discovered. */
  discovered?: boolean;
  layer?: string;
}

export type TokenKind = 'pc' | 'npc' | 'monster';

export interface Token {
  id: string;
  name: string;
  label: string;
  kind: TokenKind;
  x: number;
  y: number;
  /** Size in cells (Medium = 1, Large = 2 …). */
  size: number;
  ringColor: string;
  /** Darkvision in feet. 0 = cannot see in darkness without light. */
  visionFt: number;
  /** Light the token carries: bright radius in feet (dim light reaches twice as far). 0 = none. */
  lightFt?: number;
  hp: number;
  maxHp: number;
  ac: number;
  initiative: number;
  conditions: Condition[];
  exhaustion?: number;
  /** Hidden by the DM: never shown to players even when in sight. */
  hidden?: boolean;
  creatureId?: string;
}

/** A placed light source (brazier, lantern, magical light). Dim light reaches `dimFt`. */
export interface LightSource {
  id: string;
  x: number;
  y: number;
  brightFt: number;
  dimFt: number;
  color: string;
  on: boolean;
  /** How much an asset's light flickers (0–1, DC-110); placed lights do not. */
  flicker?: number;
  layer?: string;
}

/** Ambient light of a map: dark (dungeon, night) or lit (daylight, well-lit hall). */
export type AmbientLight = 'dark' | 'lit';

export type TemplateShape = 'cone' | 'sphere' | 'line' | 'cube';

export interface AreaTemplate {
  id: string;
  shape: TemplateShape;
  x: number;
  y: number;
  /** Direction in radians (cone/line). */
  angle: number;
  /** Size in feet: cone/line length, sphere radius, cube side. */
  sizeFt: number;
  color: string;
}

export interface Ping {
  id: string;
  x: number;
  y: number;
  at: number;
}

/**
 * Biomes of Dungeon-Manager's living fog (`render/pixi/fog-living.ts`): Bodennebel, Schneesturm,
 * Hitzeflimmern, Glutasche, Sumpfmiasma, Seenebel, Arkaner Dunst, Finsternis.
 */
export type FogBiome = 'nebel' | 'schnee' | 'wueste' | 'asche' | 'sumpf' | 'kueste' | 'arkan' | 'dunkel';
export const FOG_BIOMES: readonly FogBiome[] = ['nebel', 'schnee', 'wueste', 'asche', 'sumpf', 'kueste', 'arkan', 'dunkel'];

export type TableRotation = 0 | 90 | 180 | 270;

export interface TableSettings {
  rotation: TableRotation;
  blackout: boolean;
  display: DisplaySpec;
  /** Physical size of one grid cell on the table glass. 1 inch fits standard miniatures. */
  inchesPerCell: number;
  /** Fine-tuning after measuring a test square with a ruler. */
  ppiCorrection: number;
  /** Map point shown at the centre of the table. */
  centerX: number;
  centerY: number;
  monitorIndex: number | null;
}

export interface MapInfo {
  id: string;
  name: string;
  /** URL the renderer can load (asset protocol in the app, object URL in dev). */
  imageUrl: string | null;
  isVideo: boolean;
  widthPx: number;
  heightPx: number;
  grid: GridConfig;
  /** The map's default fog look (sidecar); a scene may override it live (`Scene.fogEffect`). */
  biome: FogBiome;
  biomeStrength: number;
  /** Catalog data of the map (sidecar), carried so saving never loses it. */
  tags: string[];
  /** Landscape/theme, free text (sidecar `biome`, not the fog biome). */
  region: string;
  mapType: MapType;
  /** Not edited yet; kept as read. */
  pois: MapPoi[];
  assets: MapAssetPlacement[];
  /** The map's layers (E-28); the base layer is not listed. */
  layers: MapLayer[];
}

export type MapType = 'dungeon' | 'building' | 'region' | 'world' | 'arena';
export interface MapPoi {
  id: string;
  name: string;
  x: number;
  y: number;
  icon: string;
}
export interface MapAssetPlacement {
  id: string;
  assetPath: string;
  variant?: string;
  x: number;
  y: number;
  rotation: number;
  scale: number;
  layer?: string;
}

/** Catalog defaults of a map that has none yet. */
export const EMPTY_MAP_CATALOG: Pick<MapInfo, 'tags' | 'region' | 'mapType' | 'pois' | 'assets' | 'layers'> = { tags: [], region: '', mapType: 'dungeon', pois: [], assets: [], layers: [] };

/** Map elements hidden in a scene (DC-103): kept apart, so vision, light and the TV never see them. */
export interface HiddenElements {
  walls: Wall[];
  zones: Zone[];
  lights: LightSource[];
  /** Placed assets of the map (DC-041). */
  assets: MapAssetPlacement[];
}

export function noHidden(): HiddenElements {
  return { walls: [], zones: [], lights: [], assets: [] };
}

export interface Scene {
  map: MapInfo;
  walls: Wall[];
  zones: Zone[];
  /** Map elements this scene hides (none in the Map Forge). */
  hidden: HiddenElements;
  /** Elements on layers inactive in this scene (E-28); kept apart like hidden ones, not saved as hidden. */
  inactive: HiddenElements;
  /** Layers switched in this scene (E-28), by id → active. */
  layersOn: Record<string, boolean>;
  /** Assets placed in this scene only (DC-110); none in the Map Forge. */
  ownAssets: MapAssetPlacement[];
  /** Lights of placed assets by light id (`<placement>:light`) → on. Not listed: on. */
  assetLightsOn: Record<string, boolean>;
  /** Looping effects by placement id → playing. Not listed: playing. */
  effectsOn: Record<string, boolean>;
  /** Doors of placed assets by door id (`<placement>:door`, E-29) → open. Not listed: closed. */
  assetDoorsOpen: Record<string, boolean>;
  tokens: Token[];
  templates: AreaTemplate[];
  pings: Ping[];
  lights: LightSource[];
  ambient: AmbientLight;
  /** Polygon fog in map pixels (Dungeon-Manager's model): revealed and remembered. */
  fog: LevelFog;
  /** Live change of biome/strength in this scene; `null` uses the map's setting. */
  fogEffect: FogEffect | null;
  table: TableSettings;
  /** Feet → pixel conversion uses map.grid.cellWidth / feetPerCell. */
}

export function feetToPx(scene: Pick<Scene, 'map'>, feet: number): number {
  return (feet / scene.map.grid.feetPerCell) * scene.map.grid.cellWidth;
}

/**
 * Segments that block sight (and light) from `from`: walls, closed doors (incl. secret), and
 * cliffs seen from below. Windows let sight through.
 */
export function sightBlockers(walls: readonly Wall[], from: Point): Segment[] {
  return walls.filter((w) => w.kind === 'wall' || ((w.kind === 'door' || w.kind === 'secret-door') && !w.open) || (w.kind === 'cliff' && belowCliff(w, from)));
}

/**
 * Whether `p` is below a cliff: its upper side is left of the drawing direction (x1, y1) → (x2, y2)
 * as seen on the map, whose y points down. A point on the edge counts as above.
 */
export function belowCliff(w: Segment, p: Point): boolean {
  return (w.x2 - w.x1) * (p.y - w.y1) - (w.y2 - w.y1) * (p.x - w.x1) > 0;
}

export const DEFAULT_TABLE: TableSettings = {
  rotation: 0,
  blackout: false,
  display: { diagonalInches: 55, widthPx: 3840, heightPx: 2160 },
  inchesPerCell: 1,
  ppiCorrection: 1,
  centerX: 0,
  centerY: 0,
  monitorIndex: null,
};
