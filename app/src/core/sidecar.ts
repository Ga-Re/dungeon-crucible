/**
 * File-based campaign storage. Every resource is a normal file with a sidecar
 * `<file>.dm.json` holding metadata; per-session state lives in `*.scene.json`.
 */
import { z } from 'zod';
import { CHALLENGE_RATINGS, CONDITIONS } from './rules/rules2024';
import { fogEffectSchema, levelFogSchema, polygonSchema } from './poly/types';
import { idSchema } from './documents';
import { MASONRY_STYLES } from './build/masonry';
import { CLIFF_FORMS, CLIFF_KINDS } from './build/cliffs';
import { WATER_KINDS } from './build/water';
import { FLOOR_STYLES } from './build/floors';

export const SIDECAR_SUFFIX = '.dm.json';
export const SCENE_SUFFIX = '.scene.json';
export const SCHEMA_VERSION = 1;

export function sidecarPathFor(resourcePath: string): string {
  return resourcePath + SIDECAR_SUFFIX;
}

export function resourcePathForSidecar(sidecarPath: string): string | null {
  return sidecarPath.endsWith(SIDECAR_SUFFIX) ? sidecarPath.slice(0, -SIDECAR_SUFFIX.length) : null;
}

/** Element ids: lowercase (they may name files; see `documents.ts`). */
const id = idSchema;
const color = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const biome = z.enum(['nebel', 'schnee', 'wueste', 'asche', 'sumpf', 'kueste', 'arkan', 'dunkel']);

export const GridSchema = z.object({
  /** Square only (E-7). Maps saved with the removed hex grid are read as square grids. */
  type: z.preprocess((v) => (v === 'hex-pointy' || v === 'hex-flat' ? 'square' : v), z.literal('square')),
  cellWidth: z.number().positive(),
  cellHeight: z.number().positive(),
  originX: z.number(),
  originY: z.number(),
  rotationDeg: z.number(),
  feetPerCell: z.number().positive(),
});

/** Map elements as built in the Map Forge (`open` of doors is scene state, kept only for old files). */
/** The layer an element is on (E-28); none: the base layer. */
const layerRef = z.string().optional();
export const mapWallSchema = z.object({ id, kind: z.enum(['wall', 'door', 'secret-door', 'window', 'cliff']), x1: z.number(), y1: z.number(), x2: z.number(), y2: z.number(), open: z.boolean().optional(), layer: layerRef });
/** An area (DC-013): polygons with holes in map pixels, possibly several parts; secret or not. */
export const mapAreaSchema = z.object({
  id,
  name: z.string(),
  shape: z.array(polygonSchema).min(1),
  secret: z.boolean().default(false),
  color,
  biome: biome.optional(),
  layer: layerRef,
});
/** A drawn wall (E-33): a polyline with a style, a thickness and a seed. */
export const masonrySchema = z.object({
  id,
  points: z.array(z.object({ x: z.number(), y: z.number() })).min(2),
  closed: z.boolean().default(false),
  style: z.enum(MASONRY_STYLES),
  thickness: z.number().positive(),
  seed: z.number().int(),
  layer: layerRef,
  height: z.number().positive().optional(),
  fortified: z.boolean().optional(),
});
/** A door on a drawn wall (E-33): its centre as the distance along the wall; open and found are scene state. */
export const masonryDoorSchema = z.object({ id, wall: id, at: z.number().min(0), width: z.number().positive(), secret: z.boolean().default(false), crack: z.boolean().default(false), window: z.boolean().optional() });
/** A drawn cliff or slope (E-34): its upper side is left of its direction (as in DC-014). */
export const cliffSchema = z.object({
  id,
  points: z.array(z.object({ x: z.number(), y: z.number() })).min(2),
  closed: z.boolean().default(false),
  kind: z.enum(CLIFF_KINDS),
  form: z.enum(CLIFF_FORMS).default('edge'),
  steep: z.boolean().default(true),
  width: z.number().positive(),
  steps: z.number().int().min(1).max(12).default(3),
  inside: z.enum(['low', 'high']).default('low'),
  growth: z.boolean().default(true),
  seed: z.number().int(),
  layer: layerRef,
});
/** A painted floor (E-33, DC-107b): an area of one floor over the floors that follow the walls. */
export const floorPatchSchema = z.object({ id, style: z.enum(FLOOR_STYLES), shape: z.array(polygonSchema).min(1), seed: z.number().int(), layer: layerRef });
/** Drawn water (E-35): a river (a line with a width, flowing in its drawing direction), a lake or the sea (rings). */
export const waterSchema = z.object({
  id,
  kind: z.enum(WATER_KINDS),
  points: z.array(z.object({ x: z.number(), y: z.number() })).min(2),
  closed: z.boolean().default(false),
  width: z.number().positive(),
  seed: z.number().int(),
  layer: layerRef,
});
export const mapLightSchema = z.object({ id, x: z.number(), y: z.number(), brightFt: z.number().min(0), dimFt: z.number().min(0), color, layer: layerRef });

/**
 * A layer of a map (E-28): elements on it count in a scene only while it is active there. Height
 * orders drawing (higher lies above); a counter layer goes off when this one comes on and back.
 */
export const mapLayerSchema = z.object({
  id,
  name: z.string().min(1),
  height: z.number().default(1),
  /** Active in a scene that has not switched it. */
  defaultActive: z.boolean().default(true),
  /** Comes on when a player character enters this area; off again on leaving if `leaveOff`. */
  trigger: z.object({ area: id, leaveOff: z.boolean().default(true) }).optional(),
  counter: id.optional(),
  /** Editing aids in the Map Forge: hidden in the editor, locked against changes. */
  editorHidden: z.boolean().default(false),
  locked: z.boolean().default(false),
});
export type MapLayer = z.infer<typeof mapLayerSchema>;

/** Version 2: areas are polygons (DC-013). */
export const MAP_VERSION = 6;
/** Version 2: scene overrides and own areas follow the map's area format (DC-013). */
export const SCENE_VERSION = 7;

/**
 * When a house's interior is shown (E-29): by the DM's click only, when a player character steps
 * into its footprint, or when one comes within `nearFt` of it; `confirm` asks the DM first;
 * `leaveOff` shows the outside again once no player character is inside (or near) any more.
 */
export const interiorTriggerSchema = z.object({
  mode: z.enum(['click', 'enter', 'near']).default('enter'),
  nearFt: z.number().min(0).default(10),
  confirm: z.boolean().default(false),
  leaveOff: z.boolean().default(true),
});
export type InteriorTrigger = z.infer<typeof interiorTriggerSchema>;

/**
 * An asset placed on a map or in a scene (DC-041, DC-110): its file, centre, turn and scale; a
 * house may trigger its interior differently from its asset (E-29).
 */
export const placementSchema = z.object({ id, assetPath: z.string(), variant: z.string().optional(), x: z.number(), y: z.number(), rotation: z.number().default(0), scale: z.number().positive().default(1), layer: layerRef, interiorTrigger: interiorTriggerSchema.optional() });

export const MapSidecarSchema = z.object({
  kind: z.literal('map'),
  schemaVersion: z.literal(MAP_VERSION),
  name: z.string().min(1),
  /** Map image/video relative to the campaign folder, or `builtin:<id>`. */
  resource: z.string().min(1),
  isVideo: z.boolean().default(false),
  widthPx: z.number().positive(),
  heightPx: z.number().positive(),
  tags: z.array(z.string()).default([]),
  biome: z.string().default(''),
  mapType: z.enum(['dungeon', 'building', 'region', 'world', 'arena']).default('dungeon'),
  fogBiome: biome.default('nebel'),
  /** Strength of the biome's wind, particles and glow, 0…1 (Dungeon-Manager T-168). */
  fogStrength: z.number().min(0).max(1).default(1),
  grid: GridSchema,
  layers: z.array(mapLayerSchema).default([]),
  walls: z.array(mapWallSchema).default([]),
  zones: z.array(mapAreaSchema).default([]),
  pois: z.array(z.object({ id, name: z.string(), x: z.number(), y: z.number(), icon: z.string().default('flag') })).default([]),
  /** Placed light sources; whether each is on is per scene. */
  lights: z.array(mapLightSchema).default([]),
  /** What is revealed when a new scene starts on this map (painted in the Map Forge, E-26). */
  startFog: levelFogSchema.optional(),
  /** Dark (darkvision and light matter) or lit (daylight: line of sight is enough). */
  ambient: z.enum(['dark', 'lit']).default('dark'),
  assets: z.array(placementSchema).default([]),
  /** Drawn walls and the doors on them (E-33, version 6). */
  masonry: z.array(masonrySchema).default([]),
  masonryDoors: z.array(masonryDoorSchema).default([]),
  /** Drawn cliffs and slopes (E-34). */
  cliffs: z.array(cliffSchema).default([]),
  /** Drawn rivers, lakes and sea (E-35), and whether their water moves (per map). */
  waters: z.array(waterSchema).default([]),
  /** Painted floors (DC-107b). */
  floors: z.array(floorPatchSchema).default([]),
  waterAnimated: z.boolean().default(true),
  /** Where the light falls towards in the 2.5D look (degrees, map coordinates; 45: to the lower right, E-35). */
  lightAngle: z.number().default(45),
  /** Automatic details (E-35): stones and reeds along shores, plants at the foot of walls on natural ground. */
  autoShore: z.boolean().default(true),
  autoGrowth: z.boolean().default(true),
  /** Top left of a drawn map's area (map px; it grows left and up too). None: 0, 0. */
  origin: z.object({ x: z.number(), y: z.number() }).optional(),
});
export type MapSidecar = z.infer<typeof MapSidecarSchema>;

/** What an asset is (E-27): the app treats each kind differently (editor, placing, TV). */
export const ASSET_KINDS = ['prop', 'tile', 'texture', 'effect', 'light', 'sound', 'handout'] as const;
export type AssetKind = (typeof ASSET_KINDS)[number];

export const ASSET_VERSION = 3;

/**
 * Sidecar of a library file other than a map (E-27, DC-040): props, map pieces, textures,
 * effects, light sources, sounds, handouts. `subkind` and `environments` hold a built-in key
 * (shown translated) or the DM's own text; `group` joins variants of one thing.
 */
export const AssetSidecarSchema = z.object({
  kind: z.literal('asset'),
  schemaVersion: z.literal(ASSET_VERSION),
  name: z.string().min(1),
  assetKind: z.enum(ASSET_KINDS),
  subkind: z.string().min(1).optional(),
  tags: z.array(z.string()).default([]),
  environments: z.array(z.string()).default([]),
  /** Footprint in grid cells (props, map pieces, effects …). */
  sizeCells: z.object({ w: z.number().positive(), h: z.number().positive() }).optional(),
  group: z.string().min(1).optional(),
  collections: z.array(z.string()).default([]),
  favorite: z.boolean().default(false),
  /**
   * Cover mask (DC-109): blocks sight and light behind it while the asset itself stays visible.
   * In cells from the footprint's top left corner, so it turns and scales with the placed asset.
   */
  cover: z
    .discriminatedUnion('shape', [
      z.object({ shape: z.literal('circle'), x: z.number(), y: z.number(), r: z.number().positive() }),
      z.object({ shape: z.literal('polygon'), points: z.array(z.tuple([z.number(), z.number()])).min(3) }),
    ])
    .optional(),
  /** The light a light source (or an effect) brings: position in cells, radii in ft, flicker 0–1. */
  light: z.object({ x: z.number(), y: z.number(), brightFt: z.number().min(0), dimFt: z.number().min(0), color, flicker: z.number().min(0).max(1).default(0) }).optional(),
  /**
   * Anchor (E-29, DC-042): in cells from the footprint's top left corner; the placed asset turns and
   * scales about it and it snaps to the grid – or, with `wallSnap`, onto a near wall.
   */
  anchor: z.object({ x: z.number(), y: z.number(), wallSnap: z.boolean().default(false) }).optional(),
  /**
   * Door line (E-29, DC-042), in cells like the anchor: where the asset is placed it becomes a door
   * (opened and closed in the scene) and cuts a gap into a wall it lies on.
   */
  door: z.object({ x1: z.number(), y1: z.number(), x2: z.number(), y2: z.number() }).optional(),
  /**
   * Interior (E-29, DC-042): another asset of its group shown instead of this one (the roof) when
   * triggered, with its walls, doors and windows in cells; while shown, the cover mask is off.
   */
  interior: z
    .object({
      asset: z.string().min(1),
      walls: z.array(z.object({ kind: z.enum(['wall', 'door', 'window']).default('wall'), x1: z.number(), y1: z.number(), x2: z.number(), y2: z.number() })).default([]),
      trigger: interiorTriggerSchema.default({ mode: 'enter', nearFt: 10, confirm: false, leaveOff: true }),
    })
    .optional(),
  /** How an effect plays: in a loop (switched on/off in the scene) and/or once on a click. */
  effect: z.object({ loop: z.boolean().default(true), trigger: z.boolean().default(false) }).optional(),
});
export type AssetSidecar = z.infer<typeof AssetSidecarSchema>;

export const OBJECT_VERSION = 1;

/**
 * An asset object with variants (E-31, DC-112): its own file next to the variants' files
 * (`library/<name>.object.json`). It names its variants (files of the library, by file name) and
 * its main variant, and holds what all of them share; each variant keeps its own tags, mask,
 * light, anchor, door and interior in its sidecar.
 */
export const AssetObjectSchema = z.object({
  kind: z.literal('object'),
  schemaVersion: z.literal(OBJECT_VERSION),
  name: z.string().min(1),
  assetKind: z.enum(ASSET_KINDS),
  subkind: z.string().min(1).optional(),
  environments: z.array(z.string()).default([]),
  sizeCells: z.object({ w: z.number().positive(), h: z.number().positive() }).optional(),
  collections: z.array(z.string()).default([]),
  favorite: z.boolean().default(false),
  /** The variant shown for the object and placed by default (a file name of `variants`). */
  main: z.string().min(1),
  variants: z.array(z.object({ file: z.string().min(1), name: z.string().min(1) })).min(1),
});
export type AssetObject = z.infer<typeof AssetObjectSchema>;

const scores = z.object({ str: z.number().int().min(1).max(30), dex: z.number().int().min(1).max(30), con: z.number().int().min(1).max(30), int: z.number().int().min(1).max(30), wis: z.number().int().min(1).max(30), cha: z.number().int().min(1).max(30) });

const creatureObject = z.object({
  kind: z.literal('creature'),
  /** Fixed id that tokens and players refer to; a rename keeps it (DC-096). */
  id,
  schemaVersion: z.literal(SCHEMA_VERSION),
  role: z.enum(['pc', 'npc', 'monster']),
  name: z.string().min(1),
  size: z.enum(['tiny', 'small', 'medium', 'large', 'huge', 'gargantuan']),
  creatureType: z.string().default('humanoid'),
  alignment: z.string().default(''),
  /** PCs: species, class, subclass, background (2024). */
  species: z.string().optional(),
  classes: z.array(z.object({ name: z.string(), subclass: z.string().optional(), level: z.number().int().min(1).max(20) })).optional(),
  background: z.string().optional(),
  cr: z.enum(CHALLENGE_RATINGS).optional(),
  ac: z.number().int().min(0).max(40),
  acNote: z.string().default(''),
  hp: z.number().int().min(1),
  hpFormula: z.string().default(''),
  speed: z.object({ walk: z.number().int().min(0), fly: z.number().int().optional(), swim: z.number().int().optional(), climb: z.number().int().optional(), burrow: z.number().int().optional() }),
  abilities: scores,
  saveProficiencies: z.array(z.enum(['str', 'dex', 'con', 'int', 'wis', 'cha'])).default([]),
  skills: z.record(z.string(), z.number().int()).default({}),
  vulnerabilities: z.array(z.string()).default([]),
  resistances: z.array(z.string()).default([]),
  immunities: z.array(z.string()).default([]),
  conditionImmunities: z.array(z.enum(CONDITIONS)).default([]),
  senses: z.object({ darkvision: z.number().int().min(0).default(0), blindsight: z.number().int().min(0).default(0), truesight: z.number().int().min(0).default(0), tremorsense: z.number().int().min(0).default(0) }),
  languages: z.array(z.string()).default([]),
  weaponMasteries: z.array(z.string()).default([]),
  traits: z.array(z.object({ name: z.string(), text: z.string() })).default([]),
  actions: z.array(z.object({ name: z.string(), text: z.string(), attackBonus: z.number().int().optional(), damage: z.string().optional() })).default([]),
  bonusActions: z.array(z.object({ name: z.string(), text: z.string() })).default([]),
  reactions: z.array(z.object({ name: z.string(), text: z.string() })).default([]),
  legendaryActions: z.array(z.object({ name: z.string(), text: z.string() })).default([]),
  token: z.object({ image: z.string().optional(), ringColor: color, lightFt: z.number().int().min(0).default(0) }),
});

/**
 * 2024-style stat block, entered by the user. Files written before creatures had an id get the
 * one their tokens already use: the name as a slug.
 */
export const CreatureSchema = z.preprocess((raw) => {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw) || 'id' in raw) return raw;
  const name = (raw as { name?: unknown }).name;
  return typeof name === 'string' ? { ...raw, id: creatureIdFromName(name) } : raw;
}, creatureObject);
export type Creature = z.infer<typeof creatureObject>;

/** The id an old creature file without one gets: its name as a slug (as its tokens refer to it). */
export function creatureIdFromName(name: string): string {
  const s = name.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 64);
  return s || 'creature';
}

const tokenSchema = z.object({
  id,
  name: z.string(),
  label: z.string().max(4),
  kind: z.enum(['pc', 'npc', 'monster']),
  x: z.number(),
  y: z.number(),
  size: z.number().positive(),
  ringColor: color,
  visionFt: z.number().min(0),
  hp: z.number().int(),
  maxHp: z.number().int().positive(),
  ac: z.number().int(),
  initiative: z.number(),
  conditions: z.array(z.enum(CONDITIONS)).default([]),
  exhaustion: z.number().int().min(0).max(6).optional(),
  lightFt: z.number().min(0).optional(),
  hidden: z.boolean().optional(),
  creatureId: z.string().optional(),
});

/** Per-session state on top of a map: fog, doors, tokens, combat. The map itself stays untouched. */
export const SceneOverrideSchema = z.object({
  kind: z.literal('scene'),
  schemaVersion: z.literal(SCENE_VERSION),
  name: z.string().min(1),
  /** Path of the map sidecar relative to the campaign folder. */
  mapSidecar: z.string().min(1),
  /** Polygon fog in map pixels, as in Dungeon-Manager: revealed and remembered. */
  fog: levelFogSchema,
  /** Live change of the map's biome/strength in this scene; none uses the map's. */
  fogEffect: fogEffectSchema.optional(),
  doors: z.record(z.string(), z.boolean()).default({}),
  /** Light id → on. Lights not listed are on. */
  lights: z.record(z.string(), z.boolean()).default({}),
  discoveredZones: z.array(z.string()).default([]),
  /** Map elements hidden in this scene's play state (DC-103), by id. */
  hidden: z.array(z.string()).default([]),
  /** Assets placed in this scene only, in its play state (DC-110). */
  assets: z.array(placementSchema).default([]),
  /** Looping effects (map's or scene's assets) by placement id → playing. Not listed: playing. */
  effects: z.record(z.string(), z.boolean()).default({}),
  /** Layers switched in this scene's play state (E-28), by id → active. Not listed: their default. */
  layers: z.record(z.string(), z.boolean()).default({}),
  /** Houses showing their interior in this scene's play state (E-29), by placement id. Not listed: outside. */
  interiors: z.record(z.string(), z.boolean()).default({}),
  tokens: z.array(tokenSchema).default([]),
  templates: z.array(z.object({ id, shape: z.enum(['cone', 'sphere', 'line', 'cube']), x: z.number(), y: z.number(), angle: z.number(), sizeFt: z.number().positive(), color })).default([]),
  combat: z.object({ round: z.number().int().min(1), turn: z.number().int().min(0) }).default({ round: 1, turn: 0 }),
  ambience: z.array(z.object({ path: z.string(), volume: z.number().min(0).max(1) })).default([]),
  /** Changes of the map for this scene only, by element id: the fields that differ (E-2). Hiding is state: `hidden`. */
  overrides: z.record(z.string(), z.record(z.string(), z.unknown())).default({}),
  /**
   * The scene's start state (E-3): what "reset scene" returns to. Edited in the Orchestrator with
   * "edit start state" (E-17). Missing in older files: the play state counts as the start.
   */
  start: z.object({
    fog: levelFogSchema,
    tokens: z.array(tokenSchema).default([]),
    doors: z.record(z.string(), z.boolean()).default({}),
    lights: z.record(z.string(), z.boolean()).default({}),
    discoveredZones: z.array(z.string()).default([]),
    ambience: z.array(z.object({ path: z.string(), volume: z.number().min(0).max(1) })).default([]),
    /** Map elements hidden from the start (prepared, e.g. a buried corridor). */
    hidden: z.array(z.string()).default([]),
    /** Assets placed for the start (prepared, e.g. a campfire). */
    assets: z.array(placementSchema).default([]),
    effects: z.record(z.string(), z.boolean()).default({}),
    layers: z.record(z.string(), z.boolean()).default({}),
    interiors: z.record(z.string(), z.boolean()).default({}),
  }).optional(),
  /** Walls, areas and lights that exist only in this scene (E-24). */
  added: z.object({ walls: z.array(mapWallSchema).default([]), zones: z.array(mapAreaSchema).default([]), lights: z.array(mapLightSchema).default([]) }).default({ walls: [], zones: [], lights: [] }),
});
export type SceneOverride = z.infer<typeof SceneOverrideSchema>;

/** A player of the campaign, linked to a character in the library (DC-096). */
export const PlayerSchema = z.object({
  id,
  name: z.string(),
  /** Id of a library creature; none while the player has no character yet. */
  characterId: id.optional(),
  /** At the table this session: only present players' characters are placed. */
  present: z.boolean().default(true),
});
export type Player = z.infer<typeof PlayerSchema>;

export const CampaignManifestSchema = z.object({
  kind: z.literal('campaign'),
  schemaVersion: z.literal(SCHEMA_VERSION),
  name: z.string().min(1),
  activeScene: z.string().nullable(),
  players: z.array(PlayerSchema).default([]),
  table: z.object({
    diagonalInches: z.number().positive(),
    widthPx: z.number().int().positive(),
    heightPx: z.number().int().positive(),
    inchesPerCell: z.number().positive(),
    ppiCorrection: z.number().positive(),
    rotation: z.union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)]),
  }),
});
export type CampaignManifest = z.infer<typeof CampaignManifestSchema>;

export const CAMPAIGN_FILE = 'campaign.dm.json';

export type SidecarParse<T> = { ok: true; value: T } | { ok: false; errors: string[] };

export function parseSidecar<T>(schema: z.ZodType<T>, json: string): SidecarParse<T> {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return { ok: false, errors: ['not valid JSON'] };
  }
  const r = schema.safeParse(raw);
  if (r.success) return { ok: true, value: r.data };
  return { ok: false, errors: r.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`) };
}
