/** Runtime scene model used by the DM window. Never sent to the table as a whole. */
import type { Segment } from './geometry';
import type { GridConfig, DisplaySpec } from './grid';
import type { FogState } from './fog';
import type { Condition } from './rules/rules2024';

export type WallKind = 'wall' | 'door' | 'secret-door' | 'window';

export interface Wall extends Segment {
  id: string;
  kind: WallKind;
  /** Doors only. */
  open?: boolean;
}

export type ZoneKind = 'room' | 'area' | 'poi' | 'secret';

export interface Zone {
  id: string;
  name: string;
  kind: ZoneKind;
  /** Rectangle in map pixels. Polygons follow later. */
  rect: { x: number; y: number; w: number; h: number };
  color: string;
  biome?: FogBiome;
  /** Secret zones stay locked in the fog until discovered. */
  discovered?: boolean;
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
  /** Sight range in feet (darkvision or light). 0 = cannot see in darkness. */
  visionFt: number;
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

export type FogBiome = 'ground' | 'blizzard' | 'heat' | 'embers' | 'miasma' | 'sea' | 'arcane' | 'darkness';
export const FOG_BIOMES: readonly FogBiome[] = ['ground', 'blizzard', 'heat', 'embers', 'miasma', 'sea', 'arcane', 'darkness'];

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
  biome: FogBiome;
}

export interface Scene {
  map: MapInfo;
  walls: Wall[];
  zones: Zone[];
  tokens: Token[];
  templates: AreaTemplate[];
  pings: Ping[];
  fog: FogState;
  table: TableSettings;
  /** Feet → pixel conversion uses map.grid.cellWidth / feetPerCell. */
}

export function feetToPx(scene: Pick<Scene, 'map'>, feet: number): number {
  return (feet / scene.map.grid.feetPerCell) * scene.map.grid.cellWidth;
}

/** Segments that block sight: walls, closed doors (incl. secret). Windows let sight through. */
export function sightBlockers(walls: readonly Wall[]): Segment[] {
  return walls.filter((w) => w.kind === 'wall' || ((w.kind === 'door' || w.kind === 'secret-door') && !w.open));
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
