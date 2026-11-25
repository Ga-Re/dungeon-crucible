/**
 * The Asset Vault (E-27, DC-040): the library's assets with their sidecars, the catalog's filter
 * and selection, imports, and edits written straight into the sidecars (unknown fields survive).
 *
 * What counts as an asset: a file with an asset sidecar (or an older audio sidecar), and audio
 * without one. Maps (map sidecar, or an image without any sidecar) stay in the Map Forge.
 */
import { addToCollection, assetDefaults, filterAssets, kindFromFile, packDefaults, parseAssetSidecar, removeCollection, renameCollection, type CatalogFilter, type CatalogItem, type Labels } from '../core/assets';
import { applyObjects, catalogEntries, objectFileFor, objectsFromGroups, parseAssetObject, sharedOf, type CatalogEntry, type ObjectFile } from '../core/assetObjects';
import { keepUnknown } from '../core/documents';
import { ASSET_VERSION, AssetObjectSchema, AssetSidecarSchema, OBJECT_VERSION, type AssetObject, type AssetSidecar } from '../core/sidecar';
import { absolutePath, assetUrl, cancelPack, importAssets, importDropped, importPack, isDesktop, listLibrary, onPackProgress, pickPack, readText, trashFile, writeText, type LibraryImport } from '../platform/bridge';
import type { PackImported, PackScanInfo } from '../platform/desktop-api';
import { emit, log, setAssetInfo, setAssetUrl, setWorkspace, state, type AssetInfo } from './store';

export interface VaultItem extends CatalogItem {
  size: number;
  mtimeMs: number;
  /** The sidecar as read (unknown fields survive writing); null: none yet. */
  raw: Record<string, unknown> | null;
}

/** An object file of the library (E-31) with what was read (unknown fields survive writing). */
export interface VaultObject extends ObjectFile {
  raw: Record<string, unknown>;
}

export interface VaultState {
  items: VaultItem[];
  /** Objects bundling items as variants (E-31, DC-112). */
  objects: VaultObject[];
  /** The object picked in the catalog (its variants are `selected`, or one of them). */
  object: string | null;
  filter: CatalogFilter;
  /** Selected assets by path, in the order chosen. */
  selected: string[];
  /** Where a Shift-click range starts. */
  anchor: string | null;
  /** Thumbnail size in the catalog (px). */
  thumbPx: number;
  /** Collections created in the Browser but not used by any asset yet. */
  newCollections: string[];
  /** The "import pack" dialog while open (DC-040b). */
  pack: PackDialog | null;
  /** The asset editor while open (DC-109): the asset's changes, saved on OK. */
  editor: AssetEditor | null;
  /** Editors of asset tabs not shown (E-30, DC-034c): their drafts stay until OK or Cancel. */
  drafts: Record<string, AssetEditor>;
}

export type EditorTool = 'select' | 'circle' | 'polygon' | 'light' | 'anchor' | 'door' | 'inner';

export interface AssetEditor {
  relPath: string;
  draft: AssetSidecar;
  tool: EditorTool;
  /** The draft as opened (JSON): it differs once something was changed and not yet saved with OK. */
  base: string;
}

export interface PackDialog {
  token: string;
  /** Pack name for the "pack: …" tag and the variant groups (the folder's name, editable). */
  name: string;
  folders: PackScanInfo['folders'];
  /** Folders to import. */
  chosen: Set<string>;
  phase: 'choose' | 'running' | 'done';
  progress: { done: number; total: number; file: string } | null;
  result: { imported: number; reused: number; skipped: number; cancelled: boolean } | null;
}

const AUDIO = /\.(mp3|ogg|oga|opus|wav|m4a|aac|flac)$/i;

/** The library's assets (one call to the main process), sorted by name. */
export async function refreshVault(): Promise<void> {
  if (!isDesktop() || !state.root?.root) return;
  const items: VaultItem[] = [];
  const objects: VaultObject[] = [];
  for (const e of await listLibrary()) {
    const relPath = `library/${e.name}`;
    if (e.name.endsWith(OBJECT_SUFFIX)) {
      const o = await readObject(relPath);
      if (o) objects.push(o);
      continue;
    }
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
  // Groups of files from before (E-27) become objects (E-31): written once, then read as objects.
  const taken = new Set(objects.map((o) => o.relPath));
  for (const doc of objectsFromGroups(items, objects)) {
    const relPath = objectFileFor(doc.name, taken);
    taken.add(relPath);
    const o = await writeObject({ relPath, doc, raw: {} });
    if (o) objects.push(o);
  }
  state.vault.objects = objects;
  state.vault.items = applyObjects(items, objects).sort((a, b) => a.asset.name.localeCompare(b.asset.name) || a.relPath.localeCompare(b.relPath));
  const known = new Set(items.map((i) => i.relPath));
  state.vault.selected = state.vault.selected.filter((p) => known.has(p));
  if (state.vault.object && !taken.has(state.vault.object)) state.vault.object = null;
  updateAssetInfo();
  emit();
}

const OBJECT_SUFFIX = '.object.json';

/** An object file; one that cannot be read (or is from a newer app) is left out, and said so. */
async function readObject(relPath: string): Promise<VaultObject | null> {
  try {
    const r = parseAssetObject(await readText(relPath));
    if (r.ok) return { relPath, doc: r.value, raw: r.raw };
  } catch {
    /* reported below */
  }
  log('log.objectUnreadable', { file: relPath.replace(/^library\//, '') });
  return null;
}

/** Writes an object file (unknown fields survive); a failed write is reported. */
async function writeObject(o: VaultObject): Promise<VaultObject | null> {
  try {
    const doc = AssetObjectSchema.parse(o.doc);
    const merged = keepUnknown(AssetObjectSchema, o.raw, doc) as Record<string, unknown>;
    await writeText(o.relPath, JSON.stringify(merged, null, 2));
    return { relPath: o.relPath, doc, raw: merged };
  } catch {
    log('log.assetWriteFailed');
    return null;
  }
}

/** How the catalog shows built-in keys: set by the view that shows it (translated). */
let labelsInUse: Labels | undefined;

/**
 * The catalog as shown (E-31): each object once, each other asset by itself; those matching the
 * filter – an object by any of its variants, or by its own name.
 */
export function shownEntries(labels: Labels | undefined = labelsInUse): CatalogEntry<VaultItem>[] {
  labelsInUse = labels;
  const f = state.vault.filter;
  const match = new Set(filterAssets(state.vault.items, f, labels));
  const q = (f.query ?? '').trim().toLowerCase();
  const others = q ? new Set(filterAssets(state.vault.items, { ...f, query: undefined }, labels)) : match;
  return catalogEntries(state.vault.items, state.vault.objects).filter((e) => e.variants.some((v) => match.has(v)) || (!!e.object && !!q && e.name.toLowerCase().includes(q) && e.variants.some((v) => others.has(v))));
}

/** The object an item is a variant of, if any. */
export function objectOf(relPath: string): VaultObject | null {
  const file = relPath.replace(/^library\//, '');
  return state.vault.objects.find((o) => o.doc.variants.some((v) => v.file === file)) ?? null;
}

/** Picks an entry of the catalog: an object takes all its variants into the selection. */
export function selectEntry(entry: CatalogEntry<VaultItem>, mode: 'single' | 'toggle' | 'range'): void {
  const paths = entry.variants.map((v) => v.relPath);
  const v = state.vault;
  if (mode === 'single') {
    v.selected = paths;
    v.object = entry.object?.relPath ?? null;
    v.anchor = entry.key;
  } else if (mode === 'toggle') {
    const on = paths.every((p) => v.selected.includes(p));
    v.selected = on ? v.selected.filter((p) => !paths.includes(p)) : [...v.selected, ...paths.filter((p) => !v.selected.includes(p))];
    v.object = null;
    v.anchor = entry.key;
  } else {
    const order = shownEntries();
    const a = order.findIndex((e) => e.key === v.anchor);
    const b = order.findIndex((e) => e.key === entry.key);
    v.selected = a < 0 || b < 0 ? paths : order.slice(Math.min(a, b), Math.max(a, b) + 1).flatMap((e) => e.variants.map((x) => x.relPath));
    v.object = null;
  }
  emit();
}

/** One variant of the object picked: its own properties (tags, editor). */
export function selectVariant(relPath: string): void {
  state.vault.selected = [relPath];
  emit();
}

/** After variants changed: their objects take the shared fields and names, every variant shows them. */
async function syncObjects(changed: readonly VaultItem[]): Promise<void> {
  const objects = [...state.vault.objects];
  for (let k = 0; k < objects.length; k++) {
    const o = objects[k];
    const mine = changed.filter((c) => o.doc.variants.some((v) => `library/${v.file}` === c.relPath));
    if (!mine.length) continue;
    const variants = o.doc.variants.map((v) => ({ ...v, name: mine.find((c) => c.relPath === `library/${v.file}`)?.asset.name ?? v.name }));
    const doc: AssetObject = { ...o.doc, ...sharedOf(mine[0].asset), variants };
    if (!mine[0].asset.subkind) delete doc.subkind;
    if (!mine[0].asset.sizeCells) delete doc.sizeCells;
    if (JSON.stringify(doc) === JSON.stringify(o.doc)) continue;
    objects[k] = (await writeObject({ ...o, doc })) ?? o;
  }
  state.vault.objects = objects;
  state.vault.items = applyObjects(state.vault.items, objects);
}

async function saveObject(o: VaultObject, doc: AssetObject): Promise<boolean> {
  const saved = await writeObject({ ...o, doc });
  if (!saved) return false;
  const exists = state.vault.objects.some((x) => x.relPath === o.relPath);
  state.vault.objects = exists ? state.vault.objects.map((x) => (x.relPath === o.relPath ? saved : x)) : [...state.vault.objects, saved];
  state.vault.items = applyObjects(state.vault.items, state.vault.objects);
  updateAssetInfo();
  emit();
  return true;
}

/** The asset's group is cleared in its sidecar (so it does not form an object again by itself). */
async function clearGroup(relPath: string): Promise<void> {
  await updateAssets([relPath], (a) => {
    const { group: _g, ...rest } = a;
    return rest;
  });
}

/**
 * Adds asset `variant` to `target`: the object picked, or – for a single asset – a new object named
 * after it with both as variants (E-31). The added variant takes the object's shared fields.
 */
export async function addVariant(target: string, variant: string): Promise<boolean> {
  if (objectOf(variant)) return false;
  const file = (p: string) => p.replace(/^library\//, '');
  const item = (p: string) => state.vault.items.find((i) => i.relPath === p);
  const added = item(variant);
  if (!added) return false;
  const existing = state.vault.objects.find((o) => o.relPath === target);
  if (existing) {
    const ok = await saveObject(existing, { ...existing.doc, variants: [...existing.doc.variants, { file: file(variant), name: added.asset.name }] });
    if (ok) state.vault.selected = [...state.vault.selected, variant];
    return ok;
  }
  const first = item(target);
  if (!first) return false;
  const relPath = objectFileFor(first.asset.name, new Set(state.vault.objects.map((o) => o.relPath)));
  const doc: AssetObject = {
    kind: 'object', schemaVersion: OBJECT_VERSION, name: first.asset.name, ...sharedOf(first.asset), main: file(target),
    variants: [{ file: file(target), name: first.asset.name }, { file: file(variant), name: added.asset.name }],
  };
  const ok = await saveObject({ relPath, doc, raw: {} }, doc);
  if (ok) {
    state.vault.object = relPath;
    state.vault.selected = [target, variant];
    emit();
  }
  return ok;
}

/** Takes a variant out of its object (it stays in the library as a single asset); an object left with one variant is dissolved. */
export async function removeVariant(relPath: string): Promise<boolean> {
  const o = objectOf(relPath);
  if (!o) return false;
  const file = relPath.replace(/^library\//, '');
  const variants = o.doc.variants.filter((v) => v.file !== file);
  await clearGroup(relPath);
  if (variants.length < 2) {
    try {
      await trashFile(o.relPath, false);
    } catch {
      log('log.assetWriteFailed');
      return false;
    }
    for (const v of variants) await clearGroup(`library/${v.file}`);
    state.vault.objects = state.vault.objects.filter((x) => x.relPath !== o.relPath);
    if (state.vault.object === o.relPath) state.vault.object = null;
    state.vault.selected = state.vault.selected.filter((p) => p !== relPath);
    emit();
    return true;
  }
  const ok = await saveObject(o, { ...o.doc, variants, main: o.doc.main === file ? variants[0].file : o.doc.main });
  if (ok) state.vault.selected = state.vault.selected.filter((p) => p !== relPath);
  return ok;
}

/** The variant shown for its object and placed by default. */
export async function setMainVariant(relPath: string): Promise<boolean> {
  const o = objectOf(relPath);
  return o ? saveObject(o, { ...o.doc, main: relPath.replace(/^library\//, '') }) : false;
}

export async function renameObject(objectPath: string, name: string): Promise<boolean> {
  const o = state.vault.objects.find((x) => x.relPath === objectPath);
  const n = name.trim();
  return o && n ? saveObject(o, { ...o.doc, name: n }) : false;
}

/** The path placed for a catalog entry: an object's main variant, else the asset itself. */
export function placedPathOf(entry: CatalogEntry<VaultItem>): string {
  return entry.variants[0].relPath;
}

/** What placements need of each asset (DC-041), from the catalog; URLs already known are kept. */
function updateAssetInfo(): void {
  const info: Record<string, AssetInfo> = {};
  for (const { relPath, asset: a } of state.vault.items) {
    info[relPath] = {
      name: a.name, kind: a.assetKind, video: /\.(webm|mp4)$/i.test(relPath), url: state.assetInfo[relPath]?.url ?? null,
      ...(a.sizeCells ? { sizeCells: a.sizeCells } : {}), ...(a.group ? { group: a.group } : {}), ...(a.cover ? { cover: a.cover } : {}), ...(a.light ? { light: a.light } : {}), ...(a.anchor ? { anchor: a.anchor } : {}), ...(a.door ? { door: a.door } : {}), ...(a.interior ? { interior: a.interior } : {}), // An effect never set in the editor loops.
      ...(a.effect || a.assetKind === 'effect' ? { effect: a.effect ?? { loop: true, trigger: false } } : {}),
    };
  }
  setAssetInfo(info);
}

const resolving = new Set<string>();

/** Finds the URLs of placed assets once (only those placed, not the whole library). */
export function requestAssetUrls(paths: readonly string[]): void {
  for (const p of paths) {
    const known = state.assetInfo[p];
    if (!known || known.url || resolving.has(p)) continue;
    resolving.add(p);
    void absolutePath(p)
      .then(assetUrl)
      .then((url) => setAssetUrl(p, url))
      .catch(() => undefined)
      .finally(() => resolving.delete(p));
  }
}

function defaultsFor(relPath: string): AssetSidecar {
  return AssetSidecarSchema.parse({ kind: 'asset', schemaVersion: ASSET_VERSION, ...assetDefaults(relPath) });
}

export function setVaultFilter(patch: Partial<CatalogFilter>): void {
  state.vault.filter = { ...state.vault.filter, ...patch };
  emit();
}

export function setThumbSize(px: number): void {
  state.vault.thumbPx = Math.max(64, Math.min(240, Math.round(px)));
  emit();
}

/** Writes an asset's sidecar (unknown fields of what was read survive) and returns the item as now saved. */
async function writeAsset(item: VaultItem, next: AssetSidecar): Promise<VaultItem> {
  const doc = AssetSidecarSchema.parse(next);
  const merged = keepUnknown(AssetSidecarSchema, item.raw ?? {}, doc) as Record<string, unknown>;
  await writeText(`${item.relPath}.dm.json`, JSON.stringify(merged, null, 2));
  return { ...item, asset: doc, raw: merged };
}

/**
 * Changes the given assets (each through `change`) and saves them; the catalog gets a new list,
 * so every view updates. A failed write is reported; what was saved before it stays.
 */
async function updateAssets(paths: readonly string[], change: (a: AssetSidecar) => AssetSidecar): Promise<boolean> {
  const wanted = new Set(paths);
  const items = [...state.vault.items];
  // An asset no longer in the catalog (removed, or from a newer app) cannot be written: said so.
  if (paths.some((p) => !items.some((i) => i.relPath === p))) {
    log('log.assetWriteFailed');
    emit();
    return false;
  }
  let ok = true;
  try {
    for (let k = 0; k < items.length; k++) {
      const item = items[k];
      if (!wanted.has(item.relPath)) continue;
      const next = change(item.asset);
      if (next !== item.asset || item.raw === null) items[k] = await writeAsset(item, next);
    }
  } catch {
    ok = false;
    log('log.assetWriteFailed');
  } finally {
    state.vault.items = items;
    // Shared fields changed on a variant go to its object and from there to the other variants.
    await syncObjects(items.filter((i) => wanted.has(i.relPath)));
    // Placed assets follow (size, mask, light, group).
    updateAssetInfo();
    emit();
  }
  return ok;
}

/** Edits every selected asset (Properties panel; a multi-selection gets the same change). */
export function updateSelectedAssets(change: (a: AssetSidecar) => AssetSidecar): Promise<boolean> {
  return updateAssets(state.vault.selected, change);
}

export function toggleFavorite(relPath: string): Promise<boolean> {
  return updateAssets([relPath], (a) => ({ ...a, favorite: !a.favorite }));
}

/** Puts assets into a collection (dragged onto it, or the selection). */
export function addAssetsToCollection(paths: readonly string[], name: string): Promise<boolean> {
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
  await updateAssets(inCollection(from), (a) => renameCollection(a, from, to.trim()));
}

/** Deletes a collection: its assets stay, only without it. */
export async function deleteCollectionEverywhere(name: string): Promise<void> {
  state.vault.newCollections = state.vault.newCollections.filter((c) => c !== name);
  if (state.vault.filter.collection === name) state.vault.filter = { ...state.vault.filter, collection: undefined };
  await updateAssets(inCollection(name), (a) => removeCollection(a, name));
}

function inCollection(name: string): string[] {
  return state.vault.items.filter((i) => i.asset.collections.some((c) => c.toLowerCase() === name.toLowerCase())).map((i) => i.relPath);
}

/**
 * After an import: files copied just now get a sidecar with their defaults (plus `extra` from a
 * pack); a file the library had already keeps what it has – a map, an unreadable sidecar or one
 * from a newer app version is never written over (file rules) and stays out of the Vault.
 * Returns the assets now in the Vault and how many files were left alone.
 */
async function afterImport(imported: readonly LibraryImport[], extra?: (relPath: string) => Partial<AssetSidecar>): Promise<{ paths: string[]; skipped: number }> {
  await refreshVault();
  const byPath = new Map(state.vault.items.map((i) => [i.relPath, i]));
  const paths: string[] = [];
  let skipped = 0;
  // Files copied just now first: a reused file may be one of them (the same picture twice).
  const ordered = [...imported.filter((f) => !f.reused), ...imported.filter((f) => f.reused)];
  try {
    for (const f of ordered) {
      if (!kindFromFile(f.relPath)) continue;
      const item = byPath.get(f.relPath) ?? (f.reused ? null : { relPath: f.relPath, size: 0, mtimeMs: 0, raw: null, asset: defaultsFor(f.relPath) });
      if (!item) {
        skipped++;
        continue;
      }
      byPath.set(f.relPath, item.raw === null ? await writeAsset(item, { ...item.asset, ...extra?.(f.relPath) }) : item);
      if (!paths.includes(f.relPath)) paths.push(f.relPath);
    }
  } catch {
    log('log.assetWriteFailed');
  }
  if (skipped) log('log.assetsNotAssets', { n: skipped });
  await refreshVault();
  return { paths, skipped };
}

async function importedFiles(imported: readonly LibraryImport[]): Promise<void> {
  const { paths } = await afterImport(imported);
  if (paths.length) log('log.assetsImported', { n: paths.length, reused: imported.filter((f) => f.reused && paths.includes(f.relPath)).length });
  state.vault.selected = paths;
  state.vault.anchor = paths[0] ?? null;
  emit();
}

/** "Import": any number of files from the native dialog. */
export async function importVaultAssets(): Promise<void> {
  if (!isDesktop()) return;
  let imported: LibraryImport[];
  try {
    imported = await importAssets();
  } catch {
    log('log.assetsImportFailed');
    emit();
    return;
  }
  await importedFiles(imported);
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
  await importedFiles(out);
}

/* ---------- Asset editor (DC-109) ---------- */

/**
 * Opens the editor for an asset in the Vault's centre. A light source without a light gets one in
 * its middle (a torch), an effect without settings a loop – both only saved on OK.
 */
export function assetTabId(relPath: string): string {
  return `asset:${relPath}`;
}

/** Whether an asset editor's draft has changes not saved with OK yet. */
export function draftChanged(e: AssetEditor): boolean {
  return JSON.stringify(e.draft) !== e.base;
}

/** The editor shown goes back into its tab (its draft kept). */
function putEditorAway(): void {
  const e = state.vault.editor;
  if (e) state.vault.drafts = { ...state.vault.drafts, [e.relPath]: e };
  state.vault.editor = null;
  state.assetTab = null;
}

/**
 * Opens an asset in the editor as a tab (E-30, DC-034c), in the Asset Vault: a tab already open
 * shows its draft as it was left.
 */
export function openAssetEditor(relPath: string): void {
  const item = state.vault.items.find((i) => i.relPath === relPath);
  if (!item) return;
  const shown = state.vault.editor?.relPath === relPath;
  if (!shown) putEditorAway();
  const id = assetTabId(relPath);
  if (!state.tabs.some((x) => x.id === id)) state.tabs = [...state.tabs, { id, kind: 'asset', name: item.asset.name }];
  state.assetTab = id;
  if (state.ws !== 'vault') setWorkspace('vault');
  // Already in the editor: it stays as it is, draft and all.
  if (shown) {
    state.vault.selected = [relPath];
    emit();
    return;
  }
  const kept = state.vault.drafts[relPath];
  if (kept) {
    const { [relPath]: _k, ...rest } = state.vault.drafts;
    state.vault.drafts = rest;
    state.vault.editor = kept;
    state.vault.selected = [relPath];
    emit();
    return;
  }
  const a = item.asset;
  const size = a.sizeCells ?? { w: 1, h: 1 };
  const draft: AssetSidecar = {
    ...a,
    sizeCells: size,
    ...(a.assetKind === 'light' && !a.light ? { light: { x: size.w / 2, y: size.h / 2, brightFt: 20, dimFt: 40, color: '#ffb14a', flicker: 0.3 } } : {}),
    ...(a.assetKind === 'effect' && !a.effect ? { effect: { loop: true, trigger: false } } : {}),
  };
  state.vault.editor = { relPath, draft, tool: 'select', base: JSON.stringify(draft) };
  state.vault.selected = [relPath];
  emit();
}

export function updateEditorDraft(change: (a: AssetSidecar) => AssetSidecar): void {
  const e = state.vault.editor;
  if (!e) return;
  state.vault.editor = { ...e, draft: change(e.draft) };
  emit();
}

export function setEditorTool(tool: EditorTool): void {
  if (state.vault.editor) state.vault.editor = { ...state.vault.editor, tool };
  emit();
}

/** OK: writes the asset's sidecar and returns to the catalog (the tab stays); on a failed write the editor stays open. */
export async function saveAssetEditor(): Promise<void> {
  const e = state.vault.editor;
  if (!e || !(await updateAssets([e.relPath], (current) => withDraftChanges(current, e)))) return;
  state.vault.editor = null;
  state.assetTab = null;
  emit();
}

/**
 * The asset as it is now with what the editor changed: only the fields the draft changed since it
 * was opened – edits made meanwhile elsewhere (name, tags, collections in the Properties) stay.
 */
export function withDraftChanges(current: AssetSidecar, e: AssetEditor): AssetSidecar {
  const base = JSON.parse(e.base) as Record<string, unknown>;
  const draft = e.draft as Record<string, unknown>;
  const next: Record<string, unknown> = { ...current };
  for (const k of new Set([...Object.keys(base), ...Object.keys(draft)])) {
    if (JSON.stringify(base[k]) === JSON.stringify(draft[k])) continue;
    if (draft[k] === undefined) delete next[k];
    else next[k] = draft[k];
  }
  return next as AssetSidecar;
}

/** "Back to the catalog": the editor goes back into its tab, its draft kept. */
export function backToCatalog(): void {
  putEditorAway();
  emit();
}

/** Cancel: the draft is dropped and its tab closed. */
export function closeAssetEditor(): void {
  const e = state.vault.editor;
  if (e) closeAssetTab(e.relPath);
}

/** Closes an asset's tab, dropping its draft; the caller asks first if it has changes. */
export function closeAssetTab(relPath: string): void {
  const id = assetTabId(relPath);
  state.tabs = state.tabs.filter((x) => x.id !== id);
  if (state.vault.editor?.relPath === relPath) state.vault.editor = null;
  const { [relPath]: _d, ...rest } = state.vault.drafts;
  state.vault.drafts = rest;
  if (state.assetTab === id) state.assetTab = null;
  emit();
}

/* ---------- Pack import (DC-040b) ---------- */

/** "Import pack": picks a folder and opens the dialog with its folders (those with files chosen). */
export async function startPackImport(): Promise<void> {
  if (!isDesktop()) return;
  let scan: PackScanInfo | null;
  try {
    scan = await pickPack();
  } catch {
    log('log.assetsImportFailed');
    emit();
    return;
  }
  if (!scan) return;
  state.vault.pack = {
    token: scan.token, name: scan.name, folders: scan.folders, chosen: new Set(scan.folders.filter((f) => f.files > 0).map((f) => f.path)),
    phase: 'choose', progress: null, result: null,
  };
  emit();
}

export function setPackName(name: string): void {
  if (state.vault.pack) state.vault.pack = { ...state.vault.pack, name };
  emit();
}

/** Ticks a folder on or off; its subfolders follow. */
export function togglePackFolder(path: string): void {
  const p = state.vault.pack;
  if (!p || p.phase !== 'choose') return;
  const on = !p.chosen.has(path);
  const chosen = new Set(p.chosen);
  for (const f of p.folders) {
    if (f.path !== path && !(path === '' || f.path.startsWith(`${path}/`))) continue;
    if (on && f.files > 0) chosen.add(f.path);
    else chosen.delete(f.path);
  }
  if (on) chosen.add(path);
  state.vault.pack = { ...p, chosen };
  emit();
}

export function setAllPackFolders(on: boolean): void {
  const p = state.vault.pack;
  if (!p || p.phase !== 'choose') return;
  state.vault.pack = { ...p, chosen: new Set(on ? p.folders.filter((f) => f.files > 0).map((f) => f.path) : []) };
  emit();
}

/** Copies the chosen folders, then gives the new files their pack tags and variant groups. */
export async function runPackImport(): Promise<void> {
  const p = state.vault.pack;
  if (!p || p.phase !== 'choose' || p.chosen.size === 0) return;
  const name = p.name.trim() || 'Pack';
  state.vault.pack = { ...p, phase: 'running', progress: { done: 0, total: p.folders.filter((f) => p.chosen.has(f.path)).reduce((n, f) => n + f.files, 0), file: '' } };
  emit();
  const off = onPackProgress((pr) => {
    const cur = state.vault.pack;
    if (!cur || pr.token !== cur.token) return;
    state.vault.pack = { ...cur, progress: { done: pr.done, total: pr.total, file: pr.file } };
    emit();
  });
  let files: PackImported[] = [];
  try {
    const r = await importPack(p.token, [...p.chosen].sort());
    files = r.files;
    if (r.failed) log('log.packFileFailed', { file: r.failed });
  } catch {
    log('log.assetsImportFailed');
  } finally {
    off();
  }
  const total = state.vault.pack?.progress?.total ?? files.length;
  const defaults = packDefaults(name, files.map((f) => f.packPath));
  // A library file's pack path is that of the file actually copied (not of a later equal one).
  const byRel = new Map([...files.filter((f) => f.reused), ...files.filter((f) => !f.reused)].map((f) => [f.relPath, f.packPath]));
  const { paths, skipped } = await afterImport(
    files.map((f) => ({ relPath: f.relPath, absPath: '', reused: f.reused })),
    (relPath) => defaults.get(byRel.get(relPath) ?? '') ?? {},
  );
  const fresh = new Set(files.filter((f) => !f.reused).map((f) => f.relPath));
  const reused = files.filter((f) => f.reused && paths.includes(f.relPath)).length;
  const result = { imported: paths.filter((p) => fresh.has(p)).length, reused, skipped, cancelled: files.length < total };
  log('log.packImported', { pack: name, n: result.imported, reused });
  state.vault.pack = state.vault.pack && { ...state.vault.pack, phase: 'done', result };
  emit();
}

/** Stops a running pack import after the current file (files already copied stay). */
export function cancelPackImport(): void {
  const p = state.vault.pack;
  if (p?.phase === 'running') void cancelPack(p.token).catch(() => undefined);
}

export function closePackImport(): void {
  if (state.vault.pack?.phase === 'running') return;
  state.vault.pack = null;
  emit();
}
