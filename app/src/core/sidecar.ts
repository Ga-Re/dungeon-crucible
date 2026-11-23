/**
 * File-based campaign storage. Every resource is a normal file with a sidecar
 * `<file>.dm.json` holding metadata; per-session state lives in `*.scene.json`.
 */
import { z } from 'zod';
import { CHALLENGE_RATINGS, CONDITIONS } from './rules/rules2024';

export const SIDECAR_SUFFIX = '.dm.json';
export const SCENE_SUFFIX = '.scene.json';
export const SCHEMA_VERSION = 1;

export function sidecarPathFor(resourcePath: string): string {
  return resourcePath + SIDECAR_SUFFIX;
}

export function resourcePathForSidecar(sidecarPath: string): string | null {
  return sidecarPath.endsWith(SIDECAR_SUFFIX) ? sidecarPath.slice(0, -SIDECAR_SUFFIX.length) : null;
}

const id = z.string().min(1).max(64);
const color = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const biome = z.enum(['ground', 'blizzard', 'heat', 'embers', 'miasma', 'sea', 'arcane', 'darkness']);

export const GridSchema = z.object({
  type: z.enum(['square', 'hex-pointy', 'hex-flat']),
  cellWidth: z.number().positive(),
  cellHeight: z.number().positive(),
  originX: z.number(),
  originY: z.number(),
  rotationDeg: z.number(),
  feetPerCell: z.number().positive(),
});

export const MapSidecarSchema = z.object({
  kind: z.literal('map'),
  schemaVersion: z.literal(SCHEMA_VERSION),
  name: z.string().min(1),
  tags: z.array(z.string()).default([]),
  biome: z.string().default(''),
  mapType: z.enum(['dungeon', 'building', 'region', 'world', 'arena']).default('dungeon'),
  fogBiome: biome.default('ground'),
  grid: GridSchema,
  walls: z.array(
    z.object({ id, kind: z.enum(['wall', 'door', 'secret-door', 'window']), x1: z.number(), y1: z.number(), x2: z.number(), y2: z.number(), open: z.boolean().optional() }),
  ).default([]),
  zones: z.array(
    z.object({
      id,
      name: z.string(),
      kind: z.enum(['room', 'area', 'poi', 'secret']),
      rect: z.object({ x: z.number(), y: z.number(), w: z.number().positive(), h: z.number().positive() }),
      color,
      biome: biome.optional(),
    }),
  ).default([]),
  pois: z.array(z.object({ id, name: z.string(), x: z.number(), y: z.number(), icon: z.string().default('flag') })).default([]),
  assets: z.array(z.object({ id, assetPath: z.string(), variant: z.string().optional(), x: z.number(), y: z.number(), rotation: z.number().default(0), scale: z.number().positive().default(1) })).default([]),
});
export type MapSidecar = z.infer<typeof MapSidecarSchema>;

export const AssetSidecarSchema = z.object({
  kind: z.literal('asset'),
  schemaVersion: z.literal(SCHEMA_VERSION),
  name: z.string().min(1),
  tags: z.array(z.string()).default([]),
  assetType: z.enum(['building', 'nature', 'dungeon', 'furniture', 'prop', 'vehicle']),
  sizeCells: z.object({ w: z.number().positive(), h: z.number().positive() }),
  blocksSight: z.boolean().default(false),
  variants: z.array(
    z.object({
      id,
      name: z.string(),
      file: z.string(),
      trigger: z.enum(['default', 'approach', 'enter-zone', 'manual']).default('default'),
      triggerDistanceCells: z.number().positive().optional(),
      props: z.array(z.object({ id, name: z.string(), file: z.string(), x: z.number(), y: z.number(), rotation: z.number().default(0), blocksSight: z.boolean().default(false) })).default([]),
    }),
  ).min(1),
});
export type AssetSidecar = z.infer<typeof AssetSidecarSchema>;

const scores = z.object({ str: z.number().int().min(1).max(30), dex: z.number().int().min(1).max(30), con: z.number().int().min(1).max(30), int: z.number().int().min(1).max(30), wis: z.number().int().min(1).max(30), cha: z.number().int().min(1).max(30) });

/** 2024-style stat block, entered by the user. */
export const CreatureSchema = z.object({
  kind: z.literal('creature'),
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
export type Creature = z.infer<typeof CreatureSchema>;

export const SceneOverrideSchema = z.object({
  kind: z.literal('scene'),
  schemaVersion: z.literal(SCHEMA_VERSION),
  mapPath: z.string(),
  fog: z.object({ cols: z.number().int().positive(), rows: z.number().int().positive(), cellSize: z.number().positive(), explored: z.string() }),
  doors: z.record(z.string(), z.boolean()).default({}),
  discoveredZones: z.array(z.string()).default([]),
  tokens: z.array(z.object({ id, creaturePath: z.string().optional(), x: z.number(), y: z.number(), hp: z.number().int(), hidden: z.boolean().default(false) })).default([]),
  ambience: z.array(z.object({ path: z.string(), volume: z.number().min(0).max(1) })).default([]),
});
export type SceneOverride = z.infer<typeof SceneOverrideSchema>;

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
