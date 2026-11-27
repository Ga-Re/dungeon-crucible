/**
 * The map's intent for the procedural Map Forge (E-46 – E-77, map version 14; plan
 * `docs/KARTENSCHMIEDE-PROZEDURAL.md` A.6): what the DM draws – terrain rasters, wall lines,
 * openings, paths, crossings, water sources, prefabs, overrides of derived objects, mood and
 * undergrounds. Cliffs, water bodies, scatter and the walls for sight are derived from it and never
 * stored. Every field is optional: a map without them has no drawing. Coordinates are map px (A.4);
 * every list element may sit on a layer (E-28) and a storey (E-40). Pure.
 */
import { z } from 'zod';
import { idSchema } from '../documents';
import { polygonSchema } from '../poly/types';
import { BLOCK_KEY, biomePaletteSchema, stepFtSchema, type TerrainBiome } from './terrainKeys';
import type { FogBiome, MapType } from '../scene';

const id = idSchema;
/** The layer (E-28) and storey (E-40) an element is on, as in `sidecar.ts`; none: the base layer, the map itself. */
const layerRef = z.string().optional();
const storeyRef = z.string().optional();
const point = z.object({ x: z.number(), y: z.number() });

/* ---------------------------------------------------------------- terrain (E-46, E-49, E-55, E-58) */

export { BLOCK_KEY, TERRAIN_BIOMES, type TerrainBiome } from './terrainKeys';
const blockKey = z.string().regex(BLOCK_KEY, 'block key must be <bx>_<by>');
const base64 = z.string().regex(/^[A-Za-z0-9+/]*={0,2}$/, 'must be Base64');

/** A raster block: its channels run-length encoded, deflated and Base64 (E-55); `v` is the codec's version. */
export const rasterBlockSchema = z.object({ v: z.literal(1), data: base64 });
/** A layer's patch of a block (E-58): like a block, plus a mask of the points and channels it sets. */
export const rasterPatchSchema = z.object({ v: z.literal(1), data: base64, mask: base64 });

/** The rasters of the map itself or of one storey: its blocks, and per layer the patches laid over them. */
export const terrainStackSchema = z.object({
  base: z.record(blockKey, rasterBlockSchema).default({}),
  layers: z.record(id, z.record(blockKey, rasterPatchSchema)).optional(),
});

export const terrainSchema = z.object({
  /** Height of one step (E-46). */
  stepFt: stepFtSchema.default(10),
  /** The biomes the cells' weights refer to (at most 4 weights per cell, A.6). */
  biomePalette: biomePaletteSchema,
  /** By stack: `map` for the map itself, else a storey's id. */
  stacks: z.record(id, terrainStackSchema).default({}),
});
export type Terrain = z.infer<typeof terrainSchema>;

const BIOME_BY_FOG: Record<FogBiome, TerrainBiome> = {
  nebel: 'temperate',
  kueste: 'temperate',
  arkan: 'temperate',
  schnee: 'winter',
  wueste: 'desert',
  asche: 'desert',
  sumpf: 'swamp',
  dunkel: 'dungeon',
};

/** The terrain biome a new map starts with (O-A7, DM 2026-11-27): a dungeon map's is the dungeon's, others follow their fog. */
export function defaultTerrainBiome(mapType: MapType, fogBiome: FogBiome): TerrainBiome {
  return mapType === 'dungeon' ? 'dungeon' : BIOME_BY_FOG[fogBiome];
}

/* ---------------------------------------------------------------- walls and openings (E-48, E-64) */

/** Thin walls inside hollows and line structures (Teil B §16.1, §17.2); a castle wall is a stone line with `fortified`. */
export const WALL_LINE_STYLES = ['stone', 'brick', 'wood', 'palisade', 'fence', 'drystone', 'hedge'] as const;

export const wallLineSchema = z.object({
  id,
  points: z.array(point).min(2),
  closed: z.boolean().default(false),
  style: z.enum(WALL_LINE_STYLES),
  thickness: z.number().positive(),
  /** Height in ft as drawn; none: the style's. */
  height: z.number().positive().optional(),
  /** Battlements, and towers at corners, ends and every six cells. */
  fortified: z.boolean().optional(),
  /** How decayed it looks, 0–1. */
  decay: z.number().min(0).max(1).optional(),
  seed: z.number().int(),
  layer: layerRef,
  storey: storeyRef,
});
export type WallLine = z.infer<typeof wallLineSchema>;

/** Teil B §16.5. Open, closed and found are scene state (`doors[id]`, `<id>:found`, A.4). */
export const OPENING_KINDS = ['door', 'double-door', 'portcullis', 'window', 'arrow-slit', 'archway', 'breach'] as const;
const SECRET_KINDS: readonly string[] = ['door', 'double-door'];

export const openingSchema = z
  .object({
    id,
    /** The wall line it sits in; none: the rock raster's edge nearest to x, y (it snaps on deriving, A.4). */
    wall: id.optional(),
    x: z.number(),
    y: z.number(),
    width: z.number().positive(),
    kind: z.enum(OPENING_KINDS),
    /** Looks like the wall until found. */
    secret: z.boolean().default(false),
    material: z.enum(['wood', 'iron', 'stone']).optional(),
    /** Seen along the wall: the end it turns on and the side it opens to. */
    hinge: z.enum(['start', 'end']).optional(),
    opensTo: z.enum(['left', 'right']).optional(),
    layer: layerRef,
    storey: storeyRef,
  })
  .refine((o) => !o.secret || SECRET_KINDS.includes(o.kind), { message: 'only doors can be secret', path: ['secret'] });
export type Opening = z.infer<typeof openingSchema>;

/* ---------------------------------------------------------------- paths and crossings (E-63) */

/** Teil B §14.2; in dungeons the ground class does what a path would. */
export const PATH_KINDS = ['trail', 'track', 'cobblestone', 'flagstone', 'boardwalk'] as const;

/** A node of a path: its handles relative to it (none: a corner) and, if it differs, its width. */
const pathNodeSchema = z.object({
  x: z.number(),
  y: z.number(),
  inX: z.number().default(0),
  inY: z.number().default(0),
  outX: z.number().default(0),
  outY: z.number().default(0),
  w: z.number().positive().optional(),
});

/** A path as a cubic Bézier spline (E-63): look and export only, it blocks nothing. */
export const pathSchema = z.object({
  id,
  kind: z.enum(PATH_KINDS),
  nodes: z.array(pathNodeSchema).min(2),
  width: z.number().positive(),
  seed: z.number().int(),
  layer: layerRef,
  storey: storeyRef,
});
export type MapPath = z.infer<typeof pathSchema>;

/** "Übergang" (A.4, A.5): not the stairs between storeys (E-44). */
export const CROSSING_KINDS = ['stairs', 'ramp', 'ladder', 'bridge', 'jetty', 'ford'] as const;

/** A crossing stores intent, not geometry: it is fitted to the terrain on every derivation (Teil B §15). */
export const crossingSchema = z.object({
  id,
  /** `auto`: chosen from the terrain each time; a fixed kind stays, only length, piers and joins adapt. */
  kind: z.enum(['auto', ...CROSSING_KINDS]),
  /** Lower and upper end (stairs, ramp, ladder) or the two banks (bridge, jetty, ford). */
  a: point,
  b: point,
  width: z.number().positive(),
  /** How it is built within its kind (e.g. `stone-arch`); none: chosen by the rules. */
  style: id.optional(),
  /** The path it was made from: it follows that path. */
  path: id.optional(),
  layer: layerRef,
  storey: storeyRef,
});
export type Crossing = z.infer<typeof crossingSchema>;

/* ---------------------------------------------------------------- water, prefabs (E-47, E-65) */

/** Where the source tool started a river (Teil B §12.2); the water itself is in the raster. */
export const waterSourceSchema = z.object({ id, x: z.number(), y: z.number(), width: z.number().positive(), seed: z.number().int(), layer: layerRef, storey: storeyRef });
export type WaterSource = z.infer<typeof waterSourceSchema>;

/** A linked instance of a prefab file (E-65); "dissolve" bakes it in and removes it from the list. */
export const prefabPlacementSchema = z.object({
  id,
  /** The prefab file in the flat library, relative to the root folder. */
  prefab: z.string().regex(/^library\/[^/\\]+\.prefab\.json$/, 'must be library/<name>.prefab.json'),
  x: z.number(),
  y: z.number(),
  /** In quarter turns, so its raster stays exact (Teil B §19.3); mirrored first. */
  rotation: z.union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)]).default(0),
  flip: z.boolean().optional(),
  params: z.record(z.string().min(1), z.union([z.number(), z.string(), z.boolean()])).default({}),
  layer: layerRef,
  storey: storeyRef,
});
export type PrefabPlacement = z.infer<typeof prefabPlacementSchema>;

/* ---------------------------------------------------------------- overrides of derived objects (E-50, E-51) */

/** A derived object's key (A.4): lowercase, parts joined by `:`, `.` or `~` – e.g. `scatter:temperate.dead-tree:3_7:12`. Ids fit too. */
export const DERIVED_KEY = /^[a-z0-9][a-z0-9_.:~-]{0,199}$/;
export const derivedKeySchema = z.string().regex(DERIVED_KEY, 'derived key must be lowercase');
/** A rule's id (Teil B §13): `<biome>.<name>`, e.g. `temperate.cliff-ivy`. */
const ruleId = z.string().regex(/^[a-z0-9][a-z0-9_.-]{0,99}$/);

const transformSchema = z.object({ x: z.number(), y: z.number(), rotation: z.number().default(0), scale: z.number().positive().default(1), flip: z.boolean().optional() });
/** A derived object frozen as it is, the rules no longer touch it. */
const pinSchema = transformSchema.extend({ assetPath: z.string().min(1), variant: z.string().optional() });

/** A rule weakened or strengthened inside an area (e.g. ivy × 0.3). */
export const ruleRegionSchema = z.object({ id, shape: z.array(polygonSchema).min(1), rule: ruleId, factor: z.number().min(0).max(4), layer: layerRef, storey: storeyRef });

/** Overrides refer to derived objects by stable key; an orphaned one stays in the file and is reported (E-51). */
export const derivedSchema = z.object({
  pinned: z.record(derivedKeySchema, pinSchema).default({}),
  suppressed: z.record(derivedKeySchema, z.literal(true)).default({}),
  /** Moved, still bound to its rule. */
  moved: z.record(derivedKeySchema, transformSchema).default({}),
  variant: z.record(derivedKeySchema, z.string().min(1)).default({}),
  regions: z.array(ruleRegionSchema).default([]),
});
export type DerivedOverrides = z.infer<typeof derivedSchema>;

/* ---------------------------------------------------------------- mood, undergrounds (E-71, E-62) */

/** Look only (E-71): `lightAngle` stays the light's direction, `ambient` the switch for the rules of sight. */
export const moodSchema = z.object({
  /** Degrees above the horizon (Teil B §20.1: 50 by default). */
  sunElevation: z.number().min(5).max(90).optional(),
  timeOfDay: z.enum(['morning', 'noon', 'evening', 'twilight', 'night']).optional(),
  season: z.enum(['spring', 'summer', 'autumn', 'winter']).optional(),
  weather: z.enum(['clear', 'rain', 'snow']).optional(),
  /** "Dunst" (A.5), not fog: 0–1. */
  haze: z.number().min(0).max(1).optional(),
  clouds: z.number().min(0).max(1).optional(),
});
export type Mood = z.infer<typeof moodSchema>;

/**
 * A cave or dungeon below the surface (E-62, A.8): a storey (level −1) shown through the surface
 * above its footprint once a player character steps into an entrance. A secret entrance stays
 * hidden from the TV until found.
 */
export const undergroundSchema = z.object({
  id,
  storey: id,
  entrances: z.array(z.object({ id, x: z.number(), y: z.number(), area: polygonSchema, secret: z.boolean().default(false) })).default([]),
  /** Width of the soft edge where the surface fades out (map px); none: the default. */
  fade: z.number().min(0).optional(),
  /** Ask the DM before switching; switch back once no player character is in an entrance. */
  confirm: z.boolean().default(false),
  leaveOff: z.boolean().default(true),
});
export type Underground = z.infer<typeof undergroundSchema>;

/* ---------------------------------------------------------------- the whole */

/** The intent fields of a map file (version 14). */
export const mapIntentSchema = z.object({
  terrain: terrainSchema.optional(),
  wallLines: z.array(wallLineSchema).optional(),
  openings: z.array(openingSchema).optional(),
  paths: z.array(pathSchema).optional(),
  crossings: z.array(crossingSchema).optional(),
  waterSources: z.array(waterSourceSchema).optional(),
  prefabs: z.array(prefabPlacementSchema).optional(),
  derived: derivedSchema.optional(),
  mood: moodSchema.optional(),
  undergrounds: z.array(undergroundSchema).optional(),
});
export type MapIntent = z.infer<typeof mapIntentSchema>;

const INTENT_FIELDS = Object.keys(mapIntentSchema.shape) as (keyof MapIntent)[];

/** Every id the intent uses (for new ids that are never one already in the file). */
export function intentIds(m: MapIntent): string[] {
  const lists = [m.wallLines, m.openings, m.paths, m.crossings, m.waterSources, m.prefabs, m.derived?.regions, m.undergrounds, m.undergrounds?.flatMap((u) => u.entrances)];
  return lists.flatMap((xs) => (xs ?? []).map((x) => x.id));
}

/** The intent fields `map` has, copied; the others left out. */
export function intentOf(map: MapIntent): MapIntent {
  return structuredClone(Object.fromEntries(INTENT_FIELDS.filter((k) => map[k] !== undefined).map((k) => [k, map[k]]))) as MapIntent;
}
