/**
 * What is drawn of a map's drawn walls (E-33): for the TV only what players may know – walls on
 * the scene's active layers, doors that are not secret or were found, and a crack where the DM
 * switched it on for an unfound secret door. An unfound secret door is never sent: there the wall
 * is whole. The DM window draws everything, secret doors marked. Pure.
 */
import { z } from 'zod';
import { activeLayers, elementLayer } from '../layers';
import type { MapLayer } from '../sidecar';
import { foundKey, MASONRY_STYLES, type BuildDoor, type Masonry } from './masonry';
import { CLIFF_FORMS, CLIFF_KINDS, type Cliff } from './cliffs';
import { WATER_KINDS, type Water } from './water';
import { areaContains } from '../areas';
import type { Polygon } from '../poly/types';

const point = z.object({ x: z.number(), y: z.number() });

/** The drawing as the TV gets it (part of the player frame). */
export const drawingSchema = z.object({
  origin: point,
  width: z.number().positive(),
  height: z.number().positive(),
  masonry: z.array(z.object({ id: z.string(), points: z.array(point).min(2), closed: z.boolean(), style: z.enum(MASONRY_STYLES), thickness: z.number().positive(), seed: z.number(), height: z.number().positive().optional(), fortified: z.boolean().optional() })),
  doors: z.array(z.object({ wall: z.string(), at: z.number(), width: z.number().positive(), open: z.boolean(), window: z.boolean().optional() })),
  cracks: z.array(z.object({ wall: z.string(), at: z.number(), width: z.number().positive() })),
  /** Cliffs and slopes on the shown layers (E-34): what anyone at the table may see. */
  cliffs: z.array(z.object({
    id: z.string(), points: z.array(point).min(2), closed: z.boolean(), kind: z.enum(CLIFF_KINDS), form: z.enum(CLIFF_FORMS), steep: z.boolean(),
    width: z.number().positive(), steps: z.number().int().min(1), inside: z.enum(['low', 'high']), growth: z.boolean(), seed: z.number(),
    /** The biome of the area it lies in; none: the map's. */
    biome: z.string().optional(),
  })).default([]),
  /** The biome cliffs take their look from (E-34). */
  biome: z.string().default('nebel'),
  /** Rivers, lakes and sea on the shown layers (E-35), and whether their water moves. */
  waters: z.array(z.object({ id: z.string(), kind: z.enum(WATER_KINDS), points: z.array(point).min(2), closed: z.boolean(), width: z.number().positive(), seed: z.number() })).default([]),
  waterAnimated: z.boolean().default(true),
  /** Where the light falls towards (degrees; E-35). */
  lightAngle: z.number().default(45),
});
export type Drawing = z.infer<typeof drawingSchema>;

/** The DM's drawing: all doors, secret ones marked. */
export interface DmDrawing extends Omit<Drawing, 'doors'> {
  doors: (Drawing['doors'][number] & { secret: boolean })[];
}

interface DrawnMap {
  /** A drawn map has its drawing even with no wall yet: it is its picture. */
  drawn?: boolean;
  masonry: readonly Masonry[];
  masonryDoors: readonly BuildDoor[];
  cliffs: readonly Cliff[];
  waters: readonly Water[];
  waterAnimated: boolean;
  lightAngle?: number;
  /** The map's fog biome: cliffs look after it. */
  biome: string;
  layers: readonly MapLayer[];
  origin?: { x: number; y: number };
  widthPx: number;
  heightPx: number;
}

/** An area with its own biome (the scene's shown areas). */
export interface BiomeArea {
  shape: readonly Polygon[];
  biome?: string;
  secret: boolean;
  discovered?: boolean;
}

/** The biome of the area the cliff's middle lies in, if any. */
function biomeOf(c: Cliff, areas: readonly BiomeArea[]): string | undefined {
  const mid = c.points[Math.floor((c.points.length - 1) / 2)];
  const next = c.points[Math.min(c.points.length - 1, Math.floor((c.points.length - 1) / 2) + 1)];
  const p = { x: (mid.x + next.x) / 2, y: (mid.y + next.y) / 2 };
  return [...areas].reverse().find((a) => a.biome && areaContains(a.shape, p))?.biome;
}

const wireCliff = ({ layer: _l, ...c }: Cliff, areas: readonly BiomeArea[]): Drawing['cliffs'][number] => {
  const biome = biomeOf({ ...c }, areas);
  return { ...c, points: c.points.map((p) => ({ x: p.x, y: p.y })), ...(biome ? { biome } : {}) };
};

const wire = (w: Masonry): Drawing['masonry'][number] => ({ id: w.id, points: w.points.map((p) => ({ x: p.x, y: p.y })), closed: w.closed, style: w.style, thickness: w.thickness, seed: w.seed, ...(w.height ? { height: w.height } : {}), ...(w.fortified ? { fortified: true } : {}) });

function area(map: DrawnMap) {
  return { origin: { x: map.origin?.x ?? 0, y: map.origin?.y ?? 0 }, width: map.widthPx, height: map.heightPx, biome: map.biome, lightAngle: map.lightAngle ?? 45 };
}

const empty = (map: DrawnMap) => !map.masonry.length && !map.cliffs.length && !map.waters.length && !map.drawn;

const wireWater = ({ layer: _l, ...w }: Water): Drawing['waters'][number] => ({ ...w, points: w.points.map((p) => ({ x: p.x, y: p.y })) });

/**
 * `areas`: the scene's shown areas – an undiscovered secret one never lends its biome, its look
 * would give it away.
 */
export function playerDrawing(map: DrawnMap, doorStates: Readonly<Record<string, boolean>>, layersOn: Readonly<Record<string, boolean>>, areas: readonly BiomeArea[] = []): Drawing | null {
  if (empty(map)) return null;
  const active = activeLayers(map.layers, layersOn);
  const shown = map.masonry.filter((w) => active.has(elementLayer(w)));
  const ids = new Set(shown.map((w) => w.id));
  const doors: Drawing['doors'] = [];
  const cracks: Drawing['cracks'] = [];
  for (const d of map.masonryDoors) {
    if (!ids.has(d.wall)) continue;
    // A window is always seen for what it is; a secret door only once found.
    if (d.window) {
      doors.push({ wall: d.wall, at: d.at, width: d.width, open: false, window: true });
      continue;
    }
    const known = !d.secret || doorStates[foundKey(d.id)] === true;
    if (known) doors.push({ wall: d.wall, at: d.at, width: d.width, open: doorStates[d.id] === true });
    else if (d.crack) cracks.push({ wall: d.wall, at: d.at, width: d.width });
  }
  const known = areas.filter((a) => !a.secret || a.discovered === true);
  const cliffs = map.cliffs.filter((c) => active.has(elementLayer(c))).map((c) => wireCliff(c, known));
  const waters = map.waters.filter((w) => active.has(elementLayer(w))).map(wireWater);
  return { ...area(map), masonry: shown.map(wire), doors, cracks, cliffs, waters, waterAnimated: map.waterAnimated };
}

/** `layersOn`: in a scene, only the walls of its active layers (like the scene's walls); none: all (the Map Forge). */
export function dmDrawing(map: DrawnMap, doorStates: Readonly<Record<string, boolean>>, layersOn?: Readonly<Record<string, boolean>>, areas: readonly BiomeArea[] = []): DmDrawing | null {
  if (empty(map)) return null;
  const active = layersOn ? activeLayers(map.layers, layersOn) : null;
  const shown = active ? map.masonry.filter((w) => active.has(elementLayer(w))) : map.masonry;
  const ids = new Set(shown.map((w) => w.id));
  const doors = map.masonryDoors.filter((d) => ids.has(d.wall)).map((d) => ({ wall: d.wall, at: d.at, width: d.width, open: doorStates[d.id] === true, secret: !d.window && d.secret, ...(d.window ? { window: true } : {}) }));
  const cliffs = (active ? map.cliffs.filter((c) => active.has(elementLayer(c))) : map.cliffs).map((c) => wireCliff(c, areas));
  const waters = (active ? map.waters.filter((w) => active.has(elementLayer(w))) : map.waters).map(wireWater);
  return { ...area(map), masonry: shown.map(wire), doors, cracks: [], cliffs, waters, waterAnimated: map.waterAnimated };
}
