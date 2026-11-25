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

const point = z.object({ x: z.number(), y: z.number() });

/** The drawing as the TV gets it (part of the player frame). */
export const drawingSchema = z.object({
  origin: point,
  width: z.number().positive(),
  height: z.number().positive(),
  masonry: z.array(z.object({ id: z.string(), points: z.array(point).min(2), closed: z.boolean(), style: z.enum(MASONRY_STYLES), thickness: z.number().positive(), seed: z.number() })),
  doors: z.array(z.object({ wall: z.string(), at: z.number(), width: z.number().positive(), open: z.boolean() })),
  cracks: z.array(z.object({ wall: z.string(), at: z.number(), width: z.number().positive() })),
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
  layers: readonly MapLayer[];
  origin?: { x: number; y: number };
  widthPx: number;
  heightPx: number;
}

const wire = (w: Masonry): Drawing['masonry'][number] => ({ id: w.id, points: w.points.map((p) => ({ x: p.x, y: p.y })), closed: w.closed, style: w.style, thickness: w.thickness, seed: w.seed });

function area(map: DrawnMap) {
  return { origin: { x: map.origin?.x ?? 0, y: map.origin?.y ?? 0 }, width: map.widthPx, height: map.heightPx };
}

export function playerDrawing(map: DrawnMap, doorStates: Readonly<Record<string, boolean>>, layersOn: Readonly<Record<string, boolean>>): Drawing | null {
  if (!map.masonry.length && !map.drawn) return null;
  const active = activeLayers(map.layers, layersOn);
  const shown = map.masonry.filter((w) => active.has(elementLayer(w)));
  const ids = new Set(shown.map((w) => w.id));
  const doors: Drawing['doors'] = [];
  const cracks: Drawing['cracks'] = [];
  for (const d of map.masonryDoors) {
    if (!ids.has(d.wall)) continue;
    const known = !d.secret || doorStates[foundKey(d.id)] === true;
    if (known) doors.push({ wall: d.wall, at: d.at, width: d.width, open: doorStates[d.id] === true });
    else if (d.crack) cracks.push({ wall: d.wall, at: d.at, width: d.width });
  }
  return { ...area(map), masonry: shown.map(wire), doors, cracks };
}

/** `layersOn`: in a scene, only the walls of its active layers (like the scene's walls); none: all (the Map Forge). */
export function dmDrawing(map: DrawnMap, doorStates: Readonly<Record<string, boolean>>, layersOn?: Readonly<Record<string, boolean>>): DmDrawing | null {
  if (!map.masonry.length && !map.drawn) return null;
  const active = layersOn ? activeLayers(map.layers, layersOn) : null;
  const shown = active ? map.masonry.filter((w) => active.has(elementLayer(w))) : map.masonry;
  const ids = new Set(shown.map((w) => w.id));
  const doors = map.masonryDoors.filter((d) => ids.has(d.wall)).map((d) => ({ wall: d.wall, at: d.at, width: d.width, open: doorStates[d.id] === true, secret: d.secret }));
  return { ...area(map), masonry: shown.map(wire), doors, cracks: [] };
}
