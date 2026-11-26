/**
 * The global library in the root folder (`library/`, flat): maps with their sidecars. Lists them
 * for the Map Forge, finds which campaigns use one, opens one in a scene, moves one to the trash.
 */
import { readDocument } from '../core/documents';
import { DRAWN_RESOURCE, isDrawn, mapSidecarPath } from '../core/persistence';
import { drawnBounds } from '../core/build/masonry';
import { dmDrawing, type DmDrawing } from '../core/build/playerDrawing';
import { DEFAULT_GRID } from '../core/grid';
import { MAP_VERSION } from '../core/sidecar';
import { CampaignManifestSchema, MapSidecarSchema, SceneOverrideSchema, type MapSidecar } from '../core/sidecar';
import type { MapType } from '../core/scene';
import type { MapFilter } from '../core/mapCatalog';
import { isDesktop, listCampaignFolders, listFiles, listLibrary, readText, trashFile } from '../platform/bridge';
import { campaignPath, openMapTab, readDoc, saveCampaign, writeDoc } from './campaign';
import { duplicateMap, mapFileFor } from '../core/mapCopy';
import { newId } from '../core/documents';
import { emit, latestMap, log, state } from './store';

const MAP_FILE = /\.(png|jpe?g|webp|mp4|webm)$/i;

export interface LibraryMap {
  /** The map's own file (E-32): the picture's sidecar, or a copy's `library/<name>.map.json`. */
  mapFile: string;
  /** Its picture, `library/<file>`, relative to the root folder. */
  resource: string;
  name: string;
  tags: string[];
  /** Landscape/theme, free text. */
  region: string;
  mapType: MapType;
  isVideo: boolean;
  /** A copy with its own map file (on a picture other maps may use too). */
  copy: boolean;
  /** A drawn map (E-33): its own map file, no picture – its drawn walls are its picture. */
  drawn: boolean;
  /** A drawn map's drawing, for its preview in the catalog. */
  drawing?: DmDrawing;
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
  const entries = await listLibrary();
  libraryNames = new Set(entries.map((e) => `library/${e.name}`));
  unreadableCopies = 0;
  const pictures = new Map(entries.map((e) => [`library/${e.name}`, e]));
  for (const e of entries) {
    // Copies (E-32): their own map files, on a picture of the library.
    if (e.name.endsWith(MAP_COPY_SUFFIX)) {
      const mapFile = `library/${e.name}`;
      const side = await readDoc(mapFile, 'map', MapSidecarSchema, { quiet: true });
      if (side && isDrawn(side.resource)) {
        // The map file's `biome` is its landscape (free text); cliffs look after the fog biome.
        const drawing = dmDrawing({ ...side, biome: side.fogBiome, drawn: true }, {}) ?? undefined;
        maps.push({ ...catalogEntry(mapFile, side.resource, side, e, false, scenes, true), drawing });
        continue;
      }
      const pic = side ? pictures.get(side.resource) : undefined;
      if (!side || !pic) {
        log('log.mapUnreadable', { file: e.name });
        unreadableCopies++;
        continue;
      }
      maps.push(catalogEntry(mapFile, side.resource, side, pic, true, scenes));
      continue;
    }
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
    maps.push(catalogEntry(mapSidecarPath(resource), resource, side, e, false, scenes));
  }
  state.libraryMaps = maps.sort((a, b) => a.name.localeCompare(b.name));
  state.mapScenes = scenes;
  if (state.mapSelected && !maps.some((m) => m.mapFile === state.mapSelected)) state.mapSelected = null;
  emit();
}

const MAP_COPY_SUFFIX = '.map.json';
/** Every file of the library as last listed: a new copy never takes one's name, read or not. */
let libraryNames = new Set<string>();
/** Copies that could not be read: their pictures are unknown, so no picture goes to the trash meanwhile. */
let unreadableCopies = 0;

function catalogEntry(mapFile: string, resource: string, side: MapSidecar | null, pic: { name: string; size: number; mtimeMs: number }, copy: boolean, scenes: MapScenes, drawn = false): LibraryMap {
  return {
    mapFile,
    resource,
    copy,
    drawn,
    name: side?.name ?? pic.name.replace(/\.[^.]+$/, ''),
    tags: side?.tags ?? [],
    region: side?.biome ?? '',
    mapType: side?.mapType ?? 'dungeon',
    isVideo: /\.(mp4|webm)$/i.test(resource),
    size: pic.size,
    mtimeMs: pic.mtimeMs,
    widthPx: side?.widthPx ?? null,
    heightPx: side?.heightPx ?? null,
    cellPx: side?.grid.cellWidth ?? null,
    feetPerCell: side?.grid.feetPerCell ?? null,
    hasSidecar: side !== null,
    used: (scenes[mapFile] ?? []).length > 0,
  };
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
export function mapIsOpen(mapFile: string): boolean {
  return state.mapFile === mapFile || state.tabs.some((t) => t.id === `map:${mapFile}`) || (state.mapScenes[mapFile] ?? []).some((s) => state.tabs.some((t) => t.id === s.path));
}

/** Changes a map's name, type or tags in its map file (file rules: unknown fields stay; never one from a newer app). */
export async function updateLibraryMap(mapFile: string, patch: Partial<Pick<MapSidecar, 'name' | 'mapType' | 'tags'>>): Promise<boolean> {
  if (mapIsOpen(mapFile)) return false;
  const path = mapFile;
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

/** Every scene, in any campaign of the root folder, that uses map file `mapFile`. */
export async function mapUsage(mapFile: string): Promise<MapUsage[]> {
  const sidecar = mapFile;
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

/** Why a map cannot go to the trash (E-32): a copy scenes use, or a picture copies still use. */
export function trashBlocked(m: LibraryMap, usage: readonly MapUsage[]): 'copyUsed' | 'pictureShared' | null {
  if (m.copy || m.drawn) return usage.length > 0 ? 'copyUsed' : null;
  return unreadableCopies > 0 || state.libraryMaps.some((x) => x.copy && x.resource === m.resource) ? 'pictureShared' : null;
}

/**
 * Moves a library map to the trash. A copy: its map file (only while no scene uses it). A
 * picture's map: unused, with its sidecar; still used, only the picture – the scenes keep its
 * grid, walls and areas and show the map as missing until it is restored.
 */
export async function trashLibraryMap(mapFile: string): Promise<void> {
  const m = state.libraryMaps.find((x) => x.mapFile === mapFile);
  if (!m) return;
  const usage = await mapUsage(mapFile);
  if (trashBlocked(m, usage)) return;
  if (m.copy || m.drawn) {
    await trashFile(mapFile, false);
    await refreshLibraryMaps();
    return;
  }
  const used = usage.length > 0;
  await trashFile(m.resource, !used);
  if (used && state.mapResource === m.resource) {
    // The open scene keeps working; only its picture is gone.
    state.scene.map.imageUrl = null;
  }
  await refreshLibraryMaps();
}

/** Opens a library map in the open campaign (its scene, or a new one). */
export const openLibraryMap = openMapTab;

/**
 * Duplicates a map (E-32, DC-118) as a map file of its own on the same picture: "only the map"
 * (picture, grid, type, tags, landscape) or "with everything" (also its content, under new ids).
 * Changes not yet saved are saved first. The copy is picked in the catalog.
 */
export async function duplicateLibraryMap(mapFile: string, name: string, withContent: boolean): Promise<string | null> {
  await saveCampaign();
  const doc = latestMap(mapFile) ?? (await readDoc(mapFile, 'map', MapSidecarSchema));
  if (!doc) return null;
  const taken = new Set([...libraryNames, ...state.libraryMaps.map((m) => m.mapFile)]);
  const ids = new Set([...doc.walls, ...doc.zones, ...doc.lights, ...doc.assets, ...doc.layers, ...doc.pois].map((x) => x.id));
  const fresh = (prefix: string) => {
    const id = newId(prefix, (x) => ids.has(x));
    ids.add(id);
    return id;
  };
  const file = mapFileFor(name.trim() || doc.name, taken);
  await writeDoc(file, MapSidecarSchema, duplicateMap(doc, name.trim() || doc.name, withContent, fresh));
  log('log.mapDuplicated', { name: name.trim() || doc.name });
  await refreshLibraryMaps();
  state.mapSelected = file;
  emit();
  return file;
}

/**
 * "New drawn map" (E-33): a map file of its own without a picture – its drawn walls will be its
 * picture. It starts as an empty area of the default grid and opens in a tab of the Map Forge.
 */
export async function createDrawnMap(name: string): Promise<string | null> {
  if (!isDesktop() || !state.root?.root) return null;
  const taken = new Set([...libraryNames, ...state.libraryMaps.map((m) => m.mapFile)]);
  const file = mapFileFor(name, taken);
  const area = drawnBounds([], DEFAULT_GRID.cellWidth, 0);
  const doc: MapSidecar = {
    kind: 'map', schemaVersion: MAP_VERSION, name, resource: DRAWN_RESOURCE, isVideo: false,
    widthPx: area.w, heightPx: area.h, origin: { x: area.x, y: area.y },
    tags: [], biome: '', mapType: 'dungeon', fogBiome: 'nebel', fogStrength: 1, grid: { ...DEFAULT_GRID },
    layers: [], walls: [], zones: [], pois: [], lights: [], ambient: 'dark', assets: [], masonry: [], masonryDoors: [], cliffs: [], waters: [], waterAnimated: true,
  };
  await writeDoc(file, MapSidecarSchema, doc);
  log('log.drawnMapCreated', { name });
  await refreshLibraryMaps();
  state.mapSelected = file;
  await openMapTab(file);
  return file;
}
