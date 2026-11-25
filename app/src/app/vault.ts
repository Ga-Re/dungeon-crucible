/**
 * The Asset Vault (E-27, DC-040): the library's assets with their sidecars, the catalog's filter
 * and selection, imports, and edits written straight into the sidecars (unknown fields survive).
 *
 * What counts as an asset: a file with an asset sidecar (or an older audio sidecar), and audio
 * without one. Maps (map sidecar, or an image without any sidecar) stay in the Map Forge.
 */
import { addToCollection, assetDefaults, filterAssets, kindFromFile, parseAssetSidecar, removeCollection, renameCollection, type CatalogFilter, type CatalogItem } from '../core/assets';
import { keepUnknown } from '../core/documents';
import { ASSET_VERSION, AssetSidecarSchema, type AssetSidecar } from '../core/sidecar';
import { importAssets, importDropped, isDesktop, listLibrary, writeText, type LibraryImport } from '../platform/bridge';
import { emit, log, state } from './store';

export interface VaultItem extends CatalogItem {
  size: number;
  mtimeMs: number;
  /** The sidecar as read (unknown fields survive writing); null: none yet. */
  raw: Record<string, unknown> | null;
}

export interface VaultState {
  items: VaultItem[];
  filter: CatalogFilter;
  /** Selected assets by path, in the order chosen. */
  selected: string[];
  /** Where a Shift-click range starts. */
  anchor: string | null;
  /** Thumbnail size in the catalog (px). */
  thumbPx: number;
  /** Collections created in the Browser but not used by any asset yet. */
  newCollections: string[];
}

const AUDIO = /\.(mp3|ogg|oga|opus|wav|m4a|aac|flac)$/i;

/** The library's assets (one call to the main process), sorted by name. */
export async function refreshVault(): Promise<void> {
  if (!isDesktop() || !state.root?.root) return;
  const items: VaultItem[] = [];
  for (const e of await listLibrary()) {
    const relPath = `library/${e.name}`;
    if (!kindFromFile(relPath)) continue;
    if (e.sidecar === null) {
      // Audio without a sidecar is a sound; an image without one is a map (Map Forge).
      if (AUDIO.test(e.name)) items.push({ relPath, size: e.size, mtimeMs: e.mtimeMs, raw: null, asset: defaultsFor(relPath) });
      continue;
    }
    const r = parseAssetSidecar(e.sidecar, relPath);
    // Maps, unreadable sidecars and ones from a newer app version are left alone.
    if (r.ok) items.push({ relPath, size: e.size, mtimeMs: e.mtimeMs, raw: r.raw, asset: r.value });
  }
  state.vault.items = items.sort((a, b) => a.asset.name.localeCompare(b.asset.name) || a.relPath.localeCompare(b.relPath));
  const known = new Set(items.map((i) => i.relPath));
  state.vault.selected = state.vault.selected.filter((p) => known.has(p));
  emit();
}

function defaultsFor(relPath: string): AssetSidecar {
  return AssetSidecarSchema.parse({ kind: 'asset', schemaVersion: ASSET_VERSION, ...assetDefaults(relPath) });
}

/** The catalog as shown: the items matching the filter. */
export function shownAssets(): VaultItem[] {
  return filterAssets(state.vault.items, state.vault.filter) as VaultItem[];
}

export function setVaultFilter(patch: Partial<CatalogFilter>): void {
  state.vault.filter = { ...state.vault.filter, ...patch };
  emit();
}

export function setThumbSize(px: number): void {
  state.vault.thumbPx = Math.max(64, Math.min(240, Math.round(px)));
  emit();
}

/** A click: select only this one, add/remove it (Ctrl/Cmd), or the range from the last click (Shift). */
export function selectAsset(relPath: string | null, mode: 'single' | 'toggle' | 'range'): void {
  const v = state.vault;
  if (relPath === null) {
    v.selected = [];
    v.anchor = null;
  } else if (mode === 'toggle') {
    v.selected = v.selected.includes(relPath) ? v.selected.filter((p) => p !== relPath) : [...v.selected, relPath];
    v.anchor = relPath;
  } else if (mode === 'range' && v.anchor) {
    const order = shownAssets().map((i) => i.relPath);
    const a = order.indexOf(v.anchor);
    const b = order.indexOf(relPath);
    v.selected = a < 0 || b < 0 ? [relPath] : order.slice(Math.min(a, b), Math.max(a, b) + 1);
  } else {
    v.selected = [relPath];
    v.anchor = relPath;
  }
  emit();
}

/** Writes an asset's sidecar; unknown fields of what was read survive. */
async function writeAsset(item: VaultItem, next: AssetSidecar): Promise<void> {
  const doc = AssetSidecarSchema.parse(next);
  const merged = keepUnknown(AssetSidecarSchema, item.raw ?? {}, doc) as Record<string, unknown>;
  await writeText(`${item.relPath}.dm.json`, JSON.stringify(merged, null, 2));
  item.asset = doc;
  item.raw = merged;
}

/** Changes the given assets (each through `change`) and saves them. */
async function updateAssets(paths: readonly string[], change: (a: AssetSidecar) => AssetSidecar): Promise<void> {
  const wanted = new Set(paths);
  for (const item of state.vault.items) {
    if (!wanted.has(item.relPath)) continue;
    const next = change(item.asset);
    if (next !== item.asset || item.raw === null) await writeAsset(item, next);
  }
  emit();
}

/** Edits every selected asset (Properties panel; a multi-selection gets the same change). */
export function updateSelectedAssets(change: (a: AssetSidecar) => AssetSidecar): Promise<void> {
  return updateAssets(state.vault.selected, change);
}

export function toggleFavorite(relPath: string): Promise<void> {
  return updateAssets([relPath], (a) => ({ ...a, favorite: !a.favorite }));
}

/** Puts assets into a collection (dragged onto it, or the selection). */
export function addAssetsToCollection(paths: readonly string[], name: string): Promise<void> {
  state.vault.newCollections = state.vault.newCollections.filter((c) => c.toLowerCase() !== name.toLowerCase());
  return updateAssets(paths, (a) => addToCollection(a, name));
}

/** A new, still empty collection in the Browser (it exists in files once an asset is in it). */
export function createCollection(name: string): void {
  const n = name.trim();
  if (!n) return;
  state.vault.newCollections = [...state.vault.newCollections.filter((c) => c.toLowerCase() !== n.toLowerCase()), n];
  emit();
}

export async function renameCollectionEverywhere(from: string, to: string): Promise<void> {
  if (!to.trim()) return;
  state.vault.newCollections = state.vault.newCollections.map((c) => (c === from ? to.trim() : c));
  const filter = state.vault.filter;
  if (filter.collection === from) state.vault.filter = { ...filter, collection: to.trim() };
  await updateAssets(state.vault.items.map((i) => i.relPath), (a) => renameCollection(a, from, to.trim()));
}

/** Deletes a collection: its assets stay, only without it. */
export async function deleteCollectionEverywhere(name: string): Promise<void> {
  state.vault.newCollections = state.vault.newCollections.filter((c) => c !== name);
  if (state.vault.filter.collection === name) state.vault.filter = { ...state.vault.filter, collection: undefined };
  await updateAssets(
    state.vault.items.filter((i) => i.asset.collections.some((c) => c.toLowerCase() === name.toLowerCase())).map((i) => i.relPath),
    (a) => removeCollection(a, name),
  );
}

/** Gives imported files without an asset sidecar their defaults, refreshes and selects them. */
async function afterImport(imported: readonly LibraryImport[]): Promise<void> {
  await refreshVault();
  const byPath = new Map(state.vault.items.map((i) => [i.relPath, i]));
  const paths: string[] = [];
  for (const f of imported) {
    if (!kindFromFile(f.relPath)) continue;
    let item = byPath.get(f.relPath);
    if (!item) {
      item = { relPath: f.relPath, size: 0, mtimeMs: 0, raw: null, asset: defaultsFor(f.relPath) };
      state.vault.items.push(item);
    }
    if (item.raw === null) await writeAsset(item, item.asset);
    paths.push(f.relPath);
  }
  if (imported.length) log('log.assetsImported', { n: imported.length, reused: imported.filter((f) => f.reused).length });
  await refreshVault();
  state.vault.selected = paths;
  state.vault.anchor = paths[0] ?? null;
  emit();
}

/** "Import": any number of files from the native dialog. */
export async function importVaultAssets(): Promise<void> {
  if (!isDesktop()) return;
  await afterImport(await importAssets());
}

/** Files dropped on the Vault: sent as bytes (never as paths). */
export async function importDroppedFiles(files: readonly File[]): Promise<void> {
  if (!isDesktop()) return;
  const out: LibraryImport[] = [];
  for (const f of files) {
    if (!kindFromFile(f.name)) continue;
    try {
      out.push(await importDropped(f.name, new Uint8Array(await f.arrayBuffer())));
    } catch {
      log('log.assetImportFailed', { file: f.name });
    }
  }
  await afterImport(out);
}
