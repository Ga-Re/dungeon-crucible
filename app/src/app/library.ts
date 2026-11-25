/**
 * The global library in the root folder (`library/`, flat): maps with their sidecars. Lists them
 * for the Map Forge, finds which campaigns use one, opens one in a scene, moves one to the trash.
 */
import { readDocument } from '../core/documents';
import { mapSidecarPath } from '../core/persistence';
import { CampaignManifestSchema, MapSidecarSchema, SceneOverrideSchema, type MapSidecar } from '../core/sidecar';
import type { MapType } from '../core/scene';
import { isDesktop, listCampaignFolders, listFiles, readText, trashFile } from '../platform/bridge';
import { openMapResource } from './campaign';
import { emit, state } from './store';

const MAP_FILE = /\.(png|jpe?g|webp|mp4|webm)$/i;

export interface LibraryMap {
  /** `library/<file>`, relative to the root folder. */
  resource: string;
  name: string;
  tags: string[];
  mapType: MapType;
  isVideo: boolean;
}

export interface MapUsage {
  campaign: string;
  scene: string;
}

/** Maps of the library with their catalog data (from the sidecar; file name without one). */
export async function refreshLibraryMaps(): Promise<void> {
  if (!isDesktop() || !state.root?.root) return;
  const files = (await listFiles('library')).filter((f) => MAP_FILE.test(f));
  const maps: LibraryMap[] = [];
  for (const resource of files) {
    let side: MapSidecar | null = null;
    try {
      const r = readDocument('map', MapSidecarSchema, await readText(mapSidecarPath(resource)));
      if (r.ok) side = r.value;
    } catch {
      /* no sidecar yet */
    }
    maps.push({
      resource,
      name: side?.name ?? resource.slice('library/'.length).replace(/\.[^.]+$/, ''),
      tags: side?.tags ?? [],
      mapType: side?.mapType ?? 'dungeon',
      isVideo: /\.(mp4|webm)$/i.test(resource),
    });
  }
  state.libraryMaps = maps.sort((a, b) => a.name.localeCompare(b.name));
  emit();
}

/** Library maps matching a search: words in name, tags or type, all of them (case-insensitive). */
export function filterLibraryMaps(maps: readonly LibraryMap[], query: string): LibraryMap[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [...maps];
  return maps.filter((m) => {
    const hay = [m.name, m.mapType, ...m.tags, m.resource].join(' ').toLowerCase();
    return words.every((w) => hay.includes(w));
  });
}

/** Every scene, in any campaign of the root folder, that uses `resource`. */
export async function mapUsage(resource: string): Promise<MapUsage[]> {
  const sidecar = mapSidecarPath(resource);
  const out: MapUsage[] = [];
  for (const c of await listCampaignFolders()) {
    let campaign = c.slug;
    try {
      const m = readDocument('campaign', CampaignManifestSchema, await readText(`campaigns/${c.slug}/campaign.dm.json`));
      if (m.ok) campaign = m.value.name;
    } catch {
      /* name unknown: slug */
    }
    for (const f of (await listFiles(`campaigns/${c.slug}/scenes`)).filter((x) => x.endsWith('.scene.json'))) {
      try {
        const r = readDocument('scene', SceneOverrideSchema, await readText(f));
        if (r.ok && r.value.mapSidecar === sidecar) out.push({ campaign, scene: r.value.name });
      } catch {
        /* unreadable scene: not counted */
      }
    }
  }
  return out;
}

/**
 * Moves a library map to the trash. Unused: with its sidecar. Still used: only the picture –
 * the scenes keep its grid, walls and areas and show the map as missing until it is restored.
 */
export async function trashLibraryMap(resource: string): Promise<void> {
  const used = (await mapUsage(resource)).length > 0;
  await trashFile(resource, !used);
  if (used && state.mapResource === resource) {
    // The open scene keeps working; only its picture is gone.
    state.scene.map.imageUrl = null;
  }
  await refreshLibraryMaps();
}

/** Opens a library map in the open campaign (its scene, or a new one). */
export const openLibraryMap = openMapResource;
