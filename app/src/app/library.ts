/**
 * The global library in the root folder (`library/`, flat): maps with their sidecars. Lists them
 * for the Map Forge, finds which campaigns use one, opens one in a scene, moves one to the trash.
 */
import { readDocument } from '../core/documents';
import { mapSidecarPath } from '../core/persistence';
import { CampaignManifestSchema, MapSidecarSchema, SceneOverrideSchema, type MapSidecar } from '../core/sidecar';
import type { MapType } from '../core/scene';
import type { MapFilter } from '../core/mapCatalog';
import { isDesktop, listCampaignFolders, listFiles, listLibrary, readText, trashFile } from '../platform/bridge';
import { campaignPath, openMapTab, readDoc, writeDoc } from './campaign';
import { emit, state } from './store';

const MAP_FILE = /\.(png|jpe?g|webp|mp4|webm)$/i;

export interface LibraryMap {
  /** `library/<file>`, relative to the root folder. */
  resource: string;
  name: string;
  tags: string[];
  /** Landscape/theme, free text. */
  region: string;
  mapType: MapType;
  isVideo: boolean;
  /** The picture's file size and time (thumbnails). */
  size: number;
  mtimeMs: number;
  /** From its sidecar, if it has one yet. */
  widthPx: number | null;
  heightPx: number | null;
  cellPx: number | null;
  feetPerCell: number | null;
  hasSidecar: boolean;
  /** Used by a scene of the open campaign. */
  used: boolean;
}

/** The scenes of the open campaign by the map sidecar they use (E-32): shown in the catalog's details. */
export type MapScenes = Record<string, { path: string; name: string }[]>;

export interface MapUsage {
  campaign: string;
  scene: string;
}

/** Maps of the library with their catalog data (from the sidecar; file name without one). */
export async function refreshLibraryMaps(): Promise<void> {
  if (!isDesktop() || !state.root?.root) return;
  const scenes = await campaignMapScenes();
  const maps: LibraryMap[] = [];
  for (const e of await listLibrary()) {
    if (!MAP_FILE.test(e.name)) continue;
    const resource = `library/${e.name}`;
    const text = e.sidecar;
    // Files the Asset Vault holds (asset or audio sidecar) are no maps (E-27).
    if (text !== null && isAssetSidecar(text)) continue;
    let side: MapSidecar | null = null;
    if (text !== null) {
      const r = readDocument('map', MapSidecarSchema, text);
      if (r.ok) side = r.value;
    }
    maps.push({
      resource,
      name: side?.name ?? e.name.replace(/\.[^.]+$/, ''),
      tags: side?.tags ?? [],
      region: side?.biome ?? '',
      mapType: side?.mapType ?? 'dungeon',
      isVideo: /\.(mp4|webm)$/i.test(resource),
      size: e.size,
      mtimeMs: e.mtimeMs,
      widthPx: side?.widthPx ?? null,
      heightPx: side?.heightPx ?? null,
      cellPx: side?.grid.cellWidth ?? null,
      feetPerCell: side?.grid.feetPerCell ?? null,
      hasSidecar: side !== null,
      used: (scenes[mapSidecarPath(resource)] ?? []).length > 0,
    });
  }
  state.libraryMaps = maps.sort((a, b) => a.name.localeCompare(b.name));
  state.mapScenes = scenes;
  if (state.mapSelected && !maps.some((m) => m.resource === state.mapSelected)) state.mapSelected = null;
  emit();
}

/** The scenes of the open campaign, by the map sidecar each uses. */
async function campaignMapScenes(): Promise<MapScenes> {
  const out: MapScenes = {};
  if (!state.campaign) return out;
  for (const path of state.scenes) {
    const ov = await readDoc(campaignPath(path), 'scene', SceneOverrideSchema, { quiet: true });
    if (ov) (out[ov.mapSidecar] ??= []).push({ path, name: ov.name });
  }
  return out;
}

/* ---------- The catalog in the Map Forge (E-32, DC-117) ---------- */

/** Shows the map catalog in the Map Forge (the "Maps" tab). */
export function showMapCatalog(): void {
  state.forgeCatalog = true;
  emit();
  void refreshLibraryMaps();
}

export function selectCatalogMap(resource: string | null): void {
  state.mapSelected = resource;
  emit();
}

export function setMapFilter(patch: Partial<MapFilter>): void {
  state.mapFilter = { ...state.mapFilter, ...patch };
  emit();
}

/** Whether a map is open in a tab (its own or a scene's): its catalog data are then changed in the editor. */
export function mapIsOpen(resource: string): boolean {
  return state.mapResource === resource || state.tabs.some((t) => t.id === `map:${resource}`) || (state.mapScenes[mapSidecarPath(resource)] ?? []).some((s) => state.tabs.some((t) => t.id === s.path));
}

/** Changes a map's name, type or tags in its sidecar (file rules: unknown fields stay; never one from a newer app). */
export async function updateLibraryMap(resource: string, patch: Partial<Pick<MapSidecar, 'name' | 'mapType' | 'tags'>>): Promise<boolean> {
  if (mapIsOpen(resource)) return false;
  const path = mapSidecarPath(resource);
  const doc = await readDoc(path, 'map', MapSidecarSchema);
  if (!doc) return false;
  await writeDoc(path, MapSidecarSchema, { ...doc, ...patch });
  await refreshLibraryMaps();
  return true;
}

function isAssetSidecar(text: string): boolean {
  try {
    const kind = (JSON.parse(text) as { kind?: unknown }).kind;
    return kind === 'asset' || kind === 'audio';
  } catch {
    return false;
  }
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
export const openLibraryMap = openMapTab;
