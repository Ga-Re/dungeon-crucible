/**
 * The map catalog of the Map Forge (E-32, DC-117): filtering the library's maps by text, type,
 * tag, landscape and whether a scene of the open campaign uses them; the counts for the Browser.
 * Pure.
 */
import type { MapType } from './scene';

/** The map types (E-32: the Browser's kinds of maps). */
export const MAP_TYPES: readonly MapType[] = ['dungeon', 'building', 'region', 'world', 'arena'];

export interface CatalogMap {
  resource: string;
  name: string;
  tags: readonly string[];
  /** Landscape (the map's biome text). */
  region: string;
  mapType: MapType;
  /** Used by a scene of the open campaign. */
  used: boolean;
}

export interface MapFilter {
  query?: string;
  types?: readonly MapType[];
  tag?: string;
  region?: string;
  used?: 'used' | 'unused';
}

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

/** The maps matching every filter; the text looks at name, tags, landscape, type (also its `typeLabel`) and file. */
export function filterMaps<T extends CatalogMap>(maps: readonly T[], f: MapFilter, typeLabel: (t: MapType) => string = (t) => t): T[] {
  const words = (f.query ?? '').toLowerCase().split(/\s+/).filter(Boolean);
  return maps.filter((m) => {
    if (f.types && f.types.length > 0 && !f.types.includes(m.mapType)) return false;
    if (f.tag && !m.tags.some((x) => same(x, f.tag!))) return false;
    if (f.region && !same(m.region, f.region)) return false;
    if (f.used === 'used' && !m.used) return false;
    if (f.used === 'unused' && m.used) return false;
    const hay = [m.name, m.mapType, typeLabel(m.mapType), m.region, ...m.tags, m.resource].join(' ').toLowerCase();
    return words.every((w) => hay.includes(w));
  });
}

/** Distinct values with how many maps have them, sorted by value. */
export function countsOf(values: readonly string[]): { value: string; n: number }[] {
  const seen = new Map<string, { value: string; n: number }>();
  for (const v of values) {
    if (!v) continue;
    const k = v.toLowerCase();
    const e = seen.get(k);
    if (e) e.n++;
    else seen.set(k, { value: v, n: 1 });
  }
  return [...seen.values()].sort((a, b) => a.value.localeCompare(b.value));
}
