/**
 * The terrain of open maps at run time (E-55, E-56, E-84): decoded when a map is opened and taken
 * out of its document, so views, documents and undo snapshots never carry megabytes of Base64; one
 * state per map file, shared by every tab of that map. Every write of a map file puts it back,
 * encoding only blocks that changed. A map whose terrain cannot be read opens without it and is
 * never written back (DM 2026-11-27): it stays broken until it is opened again, whoever else reads
 * the file in between.
 */
import { EncodeCache, decodeTerrain, encodeTerrain, type TerrainState } from '../core/build/terrain/state';
import type { MapSidecar } from '../core/sidecar';

interface Held {
  state: TerrainState;
  cache: EncodeCache;
}

const terrains = new Map<string, Held>();
const broken = new Set<string>();

export type Taken = { ok: true; map: MapSidecar } | { ok: false; map: MapSidecar; error: string };

/** Decodes `map`'s terrain into the store for `mapFile` and gives the map back without it. */
export async function takeTerrain(mapFile: string, map: MapSidecar): Promise<Taken> {
  const { terrain, ...rest } = map;
  terrains.delete(mapFile);
  broken.delete(mapFile);
  if (!terrain) return { ok: true, map: rest };
  const cache = new EncodeCache();
  try {
    terrains.set(mapFile, { state: await decodeTerrain(terrain, cache), cache });
    return { ok: true, map: rest };
  } catch (e) {
    broken.add(mapFile);
    return { ok: false, map: rest, error: e instanceof Error ? e.message : String(e) };
  }
}

/** True if the map was opened without its terrain because it could not be read: never write it. */
export function terrainBroken(mapFile: string): boolean {
  return broken.has(mapFile);
}

/** The terrain of an open map, or null (none, or not read). */
export function terrainOf(mapFile: string): TerrainState | null {
  return terrains.get(mapFile)?.state ?? null;
}

/** A new state of a map's terrain (an edit, or a step of undo); null: the map has none. */
export function setTerrain(mapFile: string, state: TerrainState | null): void {
  if (!state) {
    terrains.delete(mapFile);
    return;
  }
  const held = terrains.get(mapFile);
  terrains.set(mapFile, { state, cache: held?.cache ?? new EncodeCache() });
}

/** `doc` (of `mapFile`) as it is written: with the terrain held for it, if there is one. */
export async function withTerrain<T extends MapSidecar>(mapFile: string, doc: T): Promise<T> {
  const held = terrains.get(mapFile);
  return held ? { ...doc, terrain: await encodeTerrain(held.state, held.cache) } : doc;
}

/** Forgets every map's terrain (the campaign closes). */
export function forgetTerrains(): void {
  terrains.clear();
  broken.clear();
}
