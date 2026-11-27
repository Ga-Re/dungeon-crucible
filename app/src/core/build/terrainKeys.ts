/**
 * The terrain's keys and small schemas, shared by the map file (`intent.ts`) and the TV frame
 * (`projection.ts`) – a leaf, so the table bundle does not pull in the map file's schema. Pure.
 */
import { z } from 'zod';

/** Terrain biomes (A.5 "Geländebiom"; not the fog biome, not the catalog's landscape). */
export const TERRAIN_BIOMES = ['temperate', 'dungeon', 'swamp', 'desert', 'winter'] as const;
export type TerrainBiome = (typeof TERRAIN_BIOMES)[number];

/** A block's key: `<bx>_<by>` in blocks of 32 × 32 cells, signed – the area grows left and up too (A.4). One spelling per block. */
export const BLOCK_KEY = /^(0|-?[1-9]\d{0,5})_(0|-?[1-9]\d{0,5})$/;

/** Height of one step (E-46). */
export const stepFtSchema = z.union([z.literal(5), z.literal(10), z.literal(15), z.literal(20)]);

/** The biomes the cells' weights refer to: at most 4, each once (A.6). */
export const biomePaletteSchema = z.array(z.enum(TERRAIN_BIOMES)).min(1).max(4).refine((p) => new Set(p).size === p.length, 'each biome once');
