/**
 * Polygon types of the fog engine, as in Dungeon-Manager's schema (`common.ts`, `entities.ts`).
 * Coordinates are map pixels; a polygon is an outer ring with holes; rings are open.
 */
import { z } from 'zod';

export const pointSchema = z.tuple([z.number(), z.number()]);
export const ringSchema = z.array(pointSchema).min(3);
export const polygonSchema = z.looseObject({ outer: ringSchema, holes: z.array(ringSchema) });
export const levelFogSchema = z.looseObject({ revealed: z.array(polygonSchema), remembered: z.array(polygonSchema) });

export type Point = z.infer<typeof pointSchema>;
export type Ring = z.infer<typeof ringSchema>;
export type Polygon = z.infer<typeof polygonSchema>;
export type LevelFog = z.infer<typeof levelFogSchema>;

/** A fog biome as played (T-168): which biome and how strong its effects are. */
export const fogEffectSchema = z.looseObject({ biome: z.string().min(1), strength: z.number().min(0).max(1) });
export type FogEffect = z.infer<typeof fogEffectSchema>;
