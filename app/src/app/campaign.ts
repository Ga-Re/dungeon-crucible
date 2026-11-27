/**
 * Campaigns in the root folder (desktop app). All paths below are relative to the root folder:
 *
 *   library/<file> + <file>.dm.json      maps and audio with their sidecars (global)
 *   library/<name>.creature.json         creatures and player characters (global)
 *   campaigns/<slug>/campaign.dm.json    manifest (name, active scene, table calibration)
 *   campaigns/<slug>/scenes/<name>.scene.json   per-session state on a library map
 *
 * Inside a campaign, scene paths are relative to the campaign folder (`scenes/x.scene.json`);
 * references into the library are relative to the root (`library/x.webp.dm.json`), so both stay
 * valid in another root folder and in archives.
 */
import { fileHash } from '../core/rescue';
import { keepRescue, offerRescue, savedOk } from './rescue';
import { manifestFromState, mapSidecarFromScene, mapSidecarPath, resetToStart, sceneFromDocuments, sceneIssues, sceneOverrideFromScene, startOf, tableFromManifest, BUILTIN_PREFIX, isDrawn } from '../core/persistence';
import { CAMPAIGN_FILE, CampaignManifestSchema, CreatureSchema, MAP_VERSION, MapSidecarSchema, SceneOverrideSchema, type Creature, type MapSidecar, type SceneOverride } from '../core/sidecar';
import { keepUnknown, newId, readDocument, slugId, type DocumentKind } from '../core/documents';
import { partyForNewScene } from '../core/party';
import type { z } from 'zod';
import { DEFAULT_GRID } from '../core/grid';
import type { Scene } from '../core/scene';
import {
  absolutePath, assetUrl, chooseRoot, createCampaignFolder, exportCampaignArchive, importCampaignArchive, importToLibrary, isDesktop, listCampaignFolders, listFiles,
  readText, rootInfo, trashCampaignFolder, trashFile, writeText, type CampaignError, type CampaignInfo,
} from '../platform/bridge';
import { emptyScene } from '../core/emptyScene';
import type { MessageKey } from '../i18n/en';
import { closeAssetTab, openAssetEditor, refreshVault } from './vault';
import { loadOpenTabs, saveOpenTabs, type OpenTabs } from './openTabs';
import { addRecent, loadRecent, saveRecent } from './recent';
import type { WorkspaceId } from './store';
import { createSampleScene } from '../sample/crypt';
import { SAMPLE_CREATURES } from '../sample/creatures';
import { setPictureResolver, activateSession, checkpoint, clearTabs, subscribe, closeCreatureTab, closeSessionTab, markDirty, openCreatureTab, commitView, emit, isSceneOpen, latestMap, layerFor, log, mapTabId, onDirty, openSceneDoc, refreshView, replaceScene, sessionSaved, fadeTvIn, setTvScene, setWorkspace, showLayer, soundScene, state, unsavedSessions } from './store';
import { applySceneAmbience, refreshAudioFiles, stopAll } from './soundboard';

const AUTOSAVE_MS = 1500;
export const CREATURE_SUFFIX = '.creature.json';

/** Path of a file of the open campaign, relative to the root folder. */
export function campaignPath(rel: string): string {
  if (!state.campaign) throw new Error('No campaign open');
  return `campaigns/${state.campaign.slug}/${rel}`;
}

export function creaturePath(c: Pick<Creature, 'name'>): string {
  return `library/${slugId(c.name, 'creature')}${CREATURE_SUFFIX}`;
}

// Pictures of map variants come from the library like map pictures (E-41).
setPictureResolver(async (path) => (isDesktop() ? assetUrl(await absolutePath(path)) : null));

/** The size of a picture or video at `url`. */
function pictureSize(url: string, video: boolean): Promise<{ w: number; h: number }> {
  return new Promise((resolve, reject) => {
    if (video) {
      const v = document.createElement('video');
      v.preload = 'metadata';
      v.onloadedmetadata = () => resolve({ w: v.videoWidth, h: v.videoHeight });
      v.onerror = () => reject(new Error('unreadable video'));
      v.src = url;
    } else {
      const img = new Image();
      img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
      img.onerror = () => reject(new Error('unreadable picture'));
      img.src = url;
    }
  });
}

/**
 * Picks the picture of a new map variant (E-41): into the library, and only if it has the map's
 * size – walls, areas and fog must fit it. Null: nothing picked.
 */
export async function pickVariantPicture(): Promise<{ path: string } | { error: 'variant.wrongSize' | 'variant.unreadable'; w?: number; h?: number } | null> {
  const f = await importToLibrary('map');
  if (!f) return null;
  const m = state.scene.map;
  try {
    const size = await pictureSize(await assetUrl(f.absPath), /\.(mp4|webm|m4v|mov)$/i.test(f.relPath));
    if (Math.round(size.w) !== Math.round(m.widthPx) || Math.round(size.h) !== Math.round(m.heightPx)) return { error: 'variant.wrongSize', w: size.w, h: size.h };
  } catch {
    return { error: 'variant.unreadable' };
  }
  return { path: f.relPath };
}

/** The URL the renderer loads a map picture from; none for a drawn map (E-33), which has no picture. */
async function urlForResource(resource: string): Promise<string | null> {
  if (isDrawn(resource)) return null;
  if (resource.startsWith(BUILTIN_PREFIX)) return resource;
  return assetUrl(await absolutePath(resource));
}

/* ---------------------------------------------------------------- documents (file rules) */

/** What each document looked like when read or last written: writing merges into it, so unknown fields survive. */
const originals = new Map<string, unknown>();
/** `fileHash` of each document as last read or written: what a rescue copy is based on (DC-003). */
const bases = new Map<string, string>();
/** Documents from a newer app version: shown if possible, never written back. */
const readOnly = new Set<string>();

/** Reads a JSON document (root-relative path): version check, migration, validation. Never throws. */
export async function readDoc<T>(rel: string, kind: DocumentKind, schema: z.ZodType<T>, opts: { quiet?: boolean } = {}): Promise<T | null> {
  let text: string;
  try {
    text = await readText(rel);
  } catch {
    return null;
  }
  const r = readDocument(kind, schema, text);
  if (r.ok) {
    originals.set(rel, r.raw);
    bases.set(rel, fileHash(text));
    readOnly.delete(rel);
    return r.value;
  }
  if (r.reason === 'newer') {
    readOnly.add(rel);
    if (!opts.quiet) log('log.newerFile', { file: rel });
  } else if (!opts.quiet) {
    log('log.invalidFile', { file: rel, error: r.errors[0] ?? '' });
  }
  return null;
}

/**
 * A map file larger than this is still written, with a note in the log (O-A1, E-83): rasters stay
 * in the map file until a real map outgrows it; then a binary file becomes a new decision.
 */
export const MAP_FILE_WARN_BYTES = 8 * 1024 * 1024;

/** Writes a JSON document, keeping the unknown fields it had; never one from a newer version; nothing if unchanged. */
export async function writeDoc(rel: string, schema: z.ZodType, value: unknown): Promise<void> {
  if (readOnly.has(rel)) return;
  const before = originals.get(rel);
  const out = keepUnknown(schema, before, value);
  if (before !== undefined && JSON.stringify(before) === JSON.stringify(out)) return;
  const text = JSON.stringify(out, null, 2);
  try {
    await writeText(rel, text);
  } catch (e) {
    // Not lost (DC-003): kept on this device and offered when the campaign opens again.
    await keepRescue(rel, JSON.stringify(out), bases.get(rel) ?? null);
    throw e;
  }
  await savedOk(rel);
  if (schema === MapSidecarSchema && text.length > MAP_FILE_WARN_BYTES) log('log.mapFileLarge', { file: rel, mb: Math.round(text.length / (1024 * 1024)) });
  bases.set(rel, fileHash(text));
  // A copy: `out` can share objects with `value`, which the app changes in place later.
  originals.set(rel, JSON.parse(text));
}

/* ---------------------------------------------------------------- root folder */

/** Loads the root folder's state into the store (start screen). */
export async function refreshRoot(): Promise<void> {
  if (!isDesktop()) return;
  state.root = await rootInfo();
  emit();
}

/** First start or "change folder": the suggested folder or one the user picks. */
export async function setRootFolder(useSuggested: boolean): Promise<void> {
  if (state.campaign) await closeCampaign({ toStart: true });
  const r = await chooseRoot(useSuggested);
  if (r) state.root = r;
  emit();
}

/* ---------------------------------------------------------------- campaigns on the start screen */

export interface CampaignEntry {
  slug: string;
  name: string;
  /** Last opened on this device (0: never), else the manifest's last change. */
  openedAt: number;
  modifiedAt: number;
  status: 'ok' | 'newer' | 'invalid';
}

function storage(): Storage | null {
  try {
    return localStorage;
  } catch {
    return null;
  }
}

/** Recent-list key of a campaign: root folder and slug (the list is per device, across root folders). */
function recentKey(slug: string): string {
  return `${state.root?.root ?? ''}::${slug}`;
}

/** The campaigns in the root folder, most recently opened first. */
export async function listCampaigns(): Promise<CampaignEntry[]> {
  if (!isDesktop() || !state.root?.root) return [];
  const recent = new Map(loadRecent(storage()).map((r) => [r.root, r.openedAt]));
  const out: CampaignEntry[] = [];
  for (const f of await listCampaignFolders()) {
    let status: CampaignEntry['status'] = 'ok';
    let name = f.slug;
    try {
      const r = readDocument('campaign', CampaignManifestSchema, await readText(`campaigns/${f.slug}/${CAMPAIGN_FILE}`));
      if (r.ok) name = r.value.name;
      else status = r.reason === 'newer' ? 'newer' : 'invalid';
    } catch {
      status = 'invalid';
    }
    out.push({ slug: f.slug, name, openedAt: recent.get(recentKey(f.slug)) ?? 0, modifiedAt: f.modifiedAt, status });
  }
  return out.sort((a, b) => b.openedAt - a.openedAt || a.name.localeCompare(b.name));
}

function remember(slug: string, name: string): void {
  state.recent = addRecent(loadRecent(storage()), { root: recentKey(slug), name, openedAt: Date.now() });
  saveRecent(storage(), state.recent);
}

/* ---------------------------------------------------------------- open, create, close */

function notice(key: MessageKey, params?: Record<string, string | number>): void {
  state.notice = { key, ...(params ? { params } : {}) };
  emit();
}

const ERROR_KEYS: Record<CampaignError, MessageKey> = {
  notCampaign: 'start.error.notCampaign',
  unsafe: 'start.error.unsafe',
  tooLarge: 'start.error.tooLarge',
  targetNotEmpty: 'start.error.targetNotEmpty',
  failed: 'start.error.failed',
};

/** Opens campaign `slug` of the root folder. */
export async function openCampaign(slug: string): Promise<void> {
  if (state.campaign) await closeCampaign({ toStart: false });
  const ok = await loadCampaign({ slug, name: slug });
  // Documents whose save failed last time are offered now (DC-003).
  if (ok) await offerRescue(slug);
  if (!ok) {
    const newer = readOnly.has(`campaigns/${slug}/${CAMPAIGN_FILE}`);
    state.campaign = null;
    notice(newer ? 'start.error.newer' : ERROR_KEYS.notCampaign);
  }
}

/**
 * Reads the open campaign again from its files without saving first: after a rescue copy was
 * written back (DC-003), what is in memory is older than the file.
 */
export async function reloadCampaign(): Promise<void> {
  const slug = state.campaign?.slug;
  if (!slug) return;
  await closeCampaign({ toStart: false, save: false });
  await openCampaign(slug);
}

/** Imports a campaign archive (.zip) into the root folder and opens it. */
export async function importCampaign(): Promise<void> {
  const r = await importCampaignArchive();
  if (!r) return;
  if (!r.ok) {
    notice(ERROR_KEYS[r.error]);
    return;
  }
  await openCampaign(r.slug);
  if (state.campaign) log('log.campaignImported', { added: r.library.added, reused: r.library.reused, renamed: r.library.renamed });
  emit();
}

/** Writes the open campaign as an archive: campaign data only, or with the library files it uses. */
export async function exportCampaign(withLibrary: boolean): Promise<void> {
  if (!state.campaign) return;
  await saveCampaign(true);
  const files = withLibrary ? await campaignLibraryFiles() : [];
  const r = await exportCampaignArchive(state.campaign.slug, state.campaign.name, files);
  if (!r) return;
  if (r.ok) log('log.campaignExported', { file: r.file, files: r.files });
  else log(r.error === 'insideRoot' ? 'log.exportInsideRoot' : 'log.exportFailed');
  emit();
}

/** Library files the open campaign uses: maps of its scenes, ambience, creatures of its tokens, its players' characters. */
async function campaignLibraryFiles(): Promise<string[]> {
  const out = new Set<string>();
  for (const p of state.scenes) {
    const ov = await readDoc(campaignPath(p), 'scene', SceneOverrideSchema, { quiet: true });
    if (!ov) continue;
    const map = await readDoc(ov.mapSidecar, 'map', MapSidecarSchema, { quiet: true });
    // A map copy (E-32) comes along with its picture.
    if (ov.mapSidecar.endsWith('.map.json')) out.add(ov.mapSidecar);
    if (map && map.resource.startsWith('library/')) out.add(map.resource);
    else if (ov.mapSidecar.startsWith('library/')) out.add(ov.mapSidecar.replace(/\.dm\.json$/, ''));
    for (const a of ov.ambience) if (a.path.startsWith('library/')) out.add(a.path);
    for (const t of ov.tokens) if (t.creatureId && creatureFiles.has(t.creatureId)) out.add(creatureFiles.get(t.creatureId)!);
  }
  for (const p of state.players) if (p.characterId && creatureFiles.has(p.characterId)) out.add(creatureFiles.get(p.characterId)!);
  return [...out];
}

/**
 * New campaign in the root folder. It starts empty (in the map forge, ready to import a map) or
 * with the sample crypt; sample creatures go into the library unless it has them.
 */
export async function newCampaign(name: string, withSample: boolean): Promise<void> {
  const clean = name.trim() || 'Campaign';
  if (state.campaign) await closeCampaign({ toStart: false });
  const slug = await createCampaignFolder(clean);
  state.campaign = { slug, name: clean };
  if (withSample) {
    // The crypt is a map like any other: the library has it once (with its walls, areas, lights).
    const sample = createSampleScene();
    const resource = 'builtin:crypt';
    const map = (await readDoc(mapSidecarPath(resource), 'map', MapSidecarSchema, { quiet: true })) ?? mapSidecarFromScene(sample, resource, 'map');
    const ov = sceneOverrideFromScene(sceneFromDocuments(map, null, null, sample.table, 'scene'), 'Session 1', mapSidecarPath(resource), { round: 1, turn: 0 }, map);
    ov.tokens = sample.tokens.map((t) => ({ ...t, conditions: [...t.conditions] }));
    ov.start = startOf(ov);
    await showDocs(map, ov, resource, { scenePath: 'scenes/session-1.scene.json' });
    await loadCreatures();
    for (const c of SAMPLE_CREATURES) if (!state.creatures.some((x) => x.id === c.id)) state.creatures.push(structuredClone(c));
  } else {
    replaceScene(emptyScene(state.scene.table), { resource: '', fileName: '', scenePath: null, sceneName: '' });
    await loadCreatures();
  }
  state.selectedCreatureIdx = 0;
  await saveCampaign(true);
  await refreshSceneList();
  await refreshAudioFiles();
  remember(slug, clean);
  log('log.campaignCreated', { name: clean });
  enterCampaign(withSample ? 'play' : 'forge');
}

/** Moves a campaign of the root folder to the trash. */
export async function trashCampaign(slug: string): Promise<void> {
  await trashCampaignFolder(slug);
}

/**
 * Opens the tabs kept for this campaign on this device (E-30) again – scenes and maps that are
 * gone are left out – and shows the tab and puts the scene on the TV that were so before.
 */
/** While a campaign opens and its kept tabs open again, the half-opened state is not kept. */
let restoring = false;

async function reopen(keptAsSaved: OpenTabs): Promise<void> {
  // Map tabs kept by their picture (before E-32) are by their map file now.
  const legacy = (id: string | null) => (id && id.startsWith('map:') && !id.endsWith('.json') ? `${id}.dm.json` : id);
  const kept: OpenTabs = { ...keptAsSaved, tabs: keptAsSaved.tabs.map((t) => ({ ...t, id: legacy(t.id)! })), active: legacy(keptAsSaved.active) };
  const ws = state.ws;
  // The campaign's own scene opened first; a tab the DM had closed stays closed.
  const opened = state.activeTab;
  for (const tab of kept.tabs) {
    if (isSceneOpen(tab.id)) continue;
    try {
      if (tab.kind === 'creature') {
        const c = state.creatures.find((x) => `creature:${x.id}` === tab.id);
        if (c) state.tabs = [...state.tabs, { id: tab.id, kind: 'creature', name: c.name }];
        else log('log.tabNotRestored', { name: tab.name });
      } else if (tab.kind === 'asset') {
        if (!state.vault.items.length) await refreshVault();
        const item = state.vault.items.find((x) => `asset:${x.relPath}` === tab.id);
        if (item) state.tabs = [...state.tabs, { id: tab.id, kind: 'asset', name: item.asset.name }];
        else log('log.tabNotRestored', { name: tab.name });
      } else if (tab.kind === 'map') await openMapTab(tab.id.slice('map:'.length));
      else if (state.scenes.includes(tab.id)) await loadScene(tab.id);
      else log('log.tabNotRestored', { name: tab.name });
    } catch {
      // A map whose picture is gone stays closed; the DM learns which.
      log('log.tabNotRestored', { name: tab.name });
    }
  }
  // In the order they were (the campaign's own scene opened first); then back to where the DM was –
  // opening a map switched to the Map Forge.
  const order = new Map(kept.tabs.map((t, i) => [t.id, i]));
  state.tabs = [...state.tabs].sort((a, b) => (order.get(a.id) ?? Infinity) - (order.get(b.id) ?? Infinity));
  state.ws = ws;
  const shown = kept.active && isSceneOpen(kept.active) ? kept.active : state.tabs.find((x) => x.kind === 'scene' || x.kind === 'map')?.id;
  if (shown && shown !== state.activeTab) activateSession(shown);
  else if (state.activeTab) {
    const tab = state.tabs.find((x) => x.id === state.activeTab);
    if (tab?.kind === 'map') state.ws = 'forge';
    showLayer(layerFor(state.ws));
  }
  if (opened && !kept.tabs.some((t) => t.id === opened) && state.tabs.length > 1) closeSessionTab(opened);
  if (kept.tv && isSceneOpen(kept.tv) && !kept.tv.startsWith('map:')) setTvScene(kept.tv);
}

/** Keeps the open tabs and the TV's scene of the open campaign on this device. */
function keepTabs(): void {
  if (state.campaign && !restoring) saveOpenTabs(storage(), recentKey(state.campaign.slug), { tabs: state.tabs, active: state.activeTab, tv: state.tvScenePath });
}

function enterCampaign(ws?: WorkspaceId): void {
  state.home = false;
  state.notice = null;
  if (ws) setWorkspace(ws);
  emit();
}

/** Saves and closes the open campaign; back to the start screen unless another one opens. */
export async function closeCampaign({ toStart = true, save = true } = {}): Promise<void> {
  if (state.campaign) {
    if (save) await saveCampaign(true);
    stopAll();
  }
  state.campaign = null;
  state.scenes = [];
  state.creatures = [];
  state.players = [];
  creatureFiles.clear();
  originals.clear();
  bases.clear();
  readOnly.clear();
  replaceScene(emptyScene(state.scene.table), { resource: '', fileName: '', scenePath: null, sceneName: '' });
  clearTabs();
  if (toStart) state.home = true;
  emit();
}

/** The file each library creature was read from or last written to, by creature id. */
const creatureFiles = new Map<string, string>();

/** All creatures of the library (global). A second file with an id already read is reported, not used. */
async function loadCreatures(): Promise<void> {
  const creatures: Creature[] = [];
  creatureFiles.clear();
  for (const f of (await listFiles('library')).filter((x) => x.endsWith(CREATURE_SUFFIX))) {
    const c = await readDoc(f, 'creature', CreatureSchema);
    if (!c) continue;
    if (creatureFiles.has(c.id)) {
      log('log.duplicateCreature', { file: f, other: creatureFiles.get(c.id)! });
      continue;
    }
    creatureFiles.set(c.id, f);
    creatures.push(c);
  }
  state.creatures = creatures.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Writes the library creatures. A creature's file is named after it; after a rename the new file
 * is written and the old one goes to the trash, so the library holds each creature once (DC-100).
 */
async function saveCreatures(): Promise<void> {
  const files = new Map<Creature, string>();
  const taken = new Set<string>();
  for (const c of state.creatures) {
    let file = creaturePath(c);
    // Two creatures with the same name: the second file also carries the id.
    if (taken.has(file)) file = file.replace(CREATURE_SUFFIX, `-${c.id}${CREATURE_SUFFIX}`);
    taken.add(file);
    files.set(c, file);
  }
  const renamed: string[] = [];
  // Every creature is tried; the first failure is reported once all were (DC-003).
  let failed: unknown = null;
  for (const [c, file] of files) {
    const before = creatureFiles.get(c.id);
    if (before && before !== file) {
      // The unknown fields of the old file move along to the new one.
      if (originals.has(before)) originals.set(file, originals.get(before)!);
    }
    try {
      await writeDoc(file, CreatureSchema, c);
    } catch (e) {
      // The old file stays until the new one is written.
      failed ??= e;
      continue;
    }
    if (before && before !== file) renamed.push(before);
    creatureFiles.set(c.id, file);
  }
  for (const old of renamed) {
    if (taken.has(old)) continue;
    await trashFile(old, false);
    originals.delete(old);
  }
  if (failed) throw failed;
}

/** Loads campaign `info.slug`; false if its folder holds no (readable) campaign. */
async function loadCampaign(info: CampaignInfo): Promise<boolean> {
  // The tabs kept last time, read before anything opens (opening changes the tabs).
  const kept = loadOpenTabs(storage(), recentKey(info.slug));
  restoring = true;
  let ok = false;
  try {
    ok = await openFiles(info, kept);
    return ok;
  } finally {
    restoring = false;
    // A campaign that failed to open keeps the tabs kept for it.
    if (ok) keepTabs();
  }
}

async function openFiles(info: CampaignInfo, kept: OpenTabs | null): Promise<boolean> {
  state.campaign = info;
  const manifest = await readDoc(campaignPath(CAMPAIGN_FILE), 'campaign', CampaignManifestSchema);
  if (!manifest) return false;
  state.campaign = { ...info, name: manifest.name };
  state.players = manifest.players;
  await loadCreatures();
  state.selectedCreatureIdx = 0;
  // The TV is black until the DM releases it (E-30): nothing shows while the campaign opens.
  state.scene.table.blackout = true;
  state.blackUntilRelease = true;
  if (manifest.activeScene) await loadScene(manifest.activeScene, { ...tableFromManifest(manifest), blackout: true });
  else replaceScene(emptyScene({ ...state.scene.table, ...tableFromManifest(manifest) }), { resource: '', fileName: '', scenePath: null, sceneName: '' });
  await refreshSceneList();
  if (kept) await reopen(kept);
  await applyTvAmbience();
  state.scene.table.blackout = true;
  state.dirty = false;
  await refreshAudioFiles();
  remember(info.slug, manifest.name);
  log('log.campaignOpened', { name: manifest.name });
  enterCampaign(manifest.activeScene ? undefined : 'forge');
  return true;
}

export async function refreshSceneList(): Promise<void> {
  if (!state.campaign) return;
  const prefix = campaignPath('');
  state.scenes = (await listFiles(campaignPath('scenes'))).filter((f) => f.endsWith('.scene.json')).map((f) => f.slice(prefix.length));
  emit();
}

/**
 * Shows a map and a scene on it in the layer of the current workspace (the Map Forge: the map;
 * otherwise the scene) and makes them the open documents.
 */
async function showDocs(map: MapSidecar, ov: SceneOverride, resource: string, opts: { scenePath: string; table?: Partial<Scene['table']> }): Promise<void> {
  const url = await urlForResource(resource);
  const table = opts.table ?? tvSettings();
  // A scene opens in its play state, on its map itself (E-40).
  state.editStart = false;
  state.storey = '';
  const scene = sceneFromDocuments(map, ov, url, table, layerFor(state.ws));
  scene.table = { ...state.scene.table, ...table, centerX: scene.table.centerX, centerY: scene.table.centerY, blackout: state.scene.table.blackout };
  replaceScene(scene, { resource, fileName: resource, scenePath: opts.scenePath, sceneName: ov.name, round: ov.combat.round, turn: ov.combat.turn, docs: { map, scene: ov } });
}

/**
 * "Edit start state" on or off (E-17): the view shows and edits the scene's start state, and the
 * soundboard plays the start's ambience; off returns to the play state and its ambience. The TV
 * keeps showing the play state.
 */
export async function setEditStart(on: boolean): Promise<void> {
  if (on === state.editStart || !state.sceneDoc) return;
  commitView();
  state.editStart = on;
  showLayer(layerFor(state.ws));
  const doc = state.sceneDoc;
  // The soundboard plays the TV's scene: the start's ambience only for the scene on the TV.
  if (state.scenePath === soundScene()) await applySceneAmbience(on ? startOf(doc).ambience : doc.ambience);
  emit();
}

/** "Reset scene": the play state becomes the start state again (undoable). */
export async function resetScene(): Promise<void> {
  if (!state.sceneDoc) return;
  if (state.editStart) await setEditStart(false);
  checkpoint();
  commitView();
  state.sceneDoc = resetToStart(state.sceneDoc!);
  refreshView();
  if (state.scenePath === soundScene()) await applySceneAmbience(state.sceneDoc.ambience);
  log('log.sceneReset', { scene: state.sceneName });
  emit();
}

/** Loads a scene of the open campaign (`scenes/x.scene.json`). */
/** The TV's settings without the centre: a scene opened is centred on its own map. */
function tvSettings(): Partial<Scene['table']> {
  const { centerX: _x, centerY: _y, ...rest } = state.scene.table;
  return rest;
}

export async function loadScene(scenePath: string, table: Partial<Scene['table']> = tvSettings()): Promise<void> {
  const ov = await readDoc(campaignPath(scenePath), 'scene', SceneOverrideSchema);
  if (!ov) return;
  const read = await readDoc(ov.mapSidecar, 'map', MapSidecarSchema);
  if (!read) return;
  // A map open in another tab may have changes newer than its file.
  const map = latestMap(ov.mapSidecar) ?? read;
  // Older scenes start where they are when first opened (E-3); saved with the next save.
  if (!ov.start) ov.start = startOf(ov);
  await showDocs(map, ov, map.resource, { scenePath, table });
  const issues = sceneIssues(map, ov);
  if (issues.orphaned.length > 0 || issues.invalid.length > 0) log('log.orphanedOverrides', { scene: ov.name, n: issues.orphaned.length + issues.invalid.length });
  // The soundboard plays the TV's scene (E-30), with nothing on the TV the scene shown.
  if (soundScene() === scenePath) void applySceneAmbience(ov.ambience);
}

/** The Map Forge shows its open map or scene again instead of the catalog (E-32). */
function leaveCatalog(): void {
  if (!state.forgeCatalog) return;
  state.forgeCatalog = false;
  emit();
}

/** Shows scene `scenePath` – or any open tab by its id: its tab if it is open (E-30), else it opens in a new tab. */
export async function switchScene(scenePath: string): Promise<void> {
  // Already shown – behind the map catalog, perhaps: shown again (E-32).
  if (scenePath === state.activeTab) {
    leaveCatalog();
    return;
  }
  await saveCampaign();
  // The TV stays on its scene (E-30); a scene the TV did not have yet is only shown here.
  if (isSceneOpen(scenePath)) activateSession(scenePath);
  else await loadScene(scenePath);
  // With nothing on the TV, the soundboard follows the scene shown.
  if (!state.tvScenePath) await applyTvAmbience();
  // In the Orchestrator the DM is asked whether this scene goes on the TV too.
  if (state.ws === 'play' && state.scenePath && state.tvScenePath && state.tvScenePath !== state.scenePath) state.tvAsk = state.scenePath;
  emit();
  await saveCampaign();
}

/** Puts an open scene on the TV (E-30); the soundboard plays its ambience. */
export async function putOnTv(scenePath: string | null): Promise<void> {
  // Putting a scene on the TV releases it after the start (E-30); it then fades in from black (E-38).
  const released = !!scenePath && state.blackUntilRelease;
  if (released) {
    state.blackUntilRelease = false;
    state.scene.table.blackout = false;
  }
  if (scenePath === state.tvScenePath) {
    // Only the fade in: map edits wait for "apply to the TV" (E-30).
    if (released) fadeTvIn();
    else emit();
    return;
  }
  await saveCampaign();
  setTvScene(scenePath, released);
  await applyTvAmbience();
  await saveCampaign(true);
}

/** The soundboard plays the TV's scene – with nothing on the TV the scene shown: its ambience (or none). */
async function applyTvAmbience(): Promise<void> {
  const scene = soundScene();
  const doc = scene ? openSceneDoc(scene) : null;
  const live = scene === state.scenePath;
  await applySceneAmbience(doc ? (live && state.editStart ? startOf(doc).ambience : doc.ambience) : []);
}

/**
 * Shows the tab `id` (E-30): a creature in the Creatures workspace; a scene or map where scenes
 * and maps were last shown (Map Forge or Orchestrator) when another workspace is open.
 */
export async function showTab(id: string): Promise<void> {
  const tab = state.tabs.find((x) => x.id === id);
  if (!tab) return;
  if (tab.kind === 'creature') {
    openCreatureTab(id.slice('creature:'.length));
    keepTabs();
    return;
  }
  if (tab.kind === 'asset') {
    if (!state.vault.items.length) await refreshVault();
    openAssetEditor(id.slice('asset:'.length));
    keepTabs();
    return;
  }
  if (state.ws !== 'forge' && state.ws !== 'play') setWorkspace(tab.kind === 'map' ? 'forge' : state.sceneWs);
  await switchScene(id);
}

/** A new library creature (a player character or a monster) from a template, with a new id; it opens as a tab. */
export function newCreature(role: 'pc' | 'monster', name: string): void {
  const tpl = structuredClone(SAMPLE_CREATURES.find((c) => c.role === role) ?? SAMPLE_CREATURES[0]);
  const taken = new Set(state.creatures.map((c) => c.id));
  tpl.id = newId(slugId(name, 'creature').slice(0, 40), (x) => taken.has(x));
  tpl.name = name;
  state.creatures.push(tpl);
  markDirty();
  openCreatureTab(tpl.id);
}

/** Closes tab `id`: a creature's (its neighbour shown if it was shown), else a scene's or map's. */
export async function closeTab(id: string): Promise<void> {
  if (id.startsWith('asset:')) {
    // Its draft is dropped (the tab bar asks first when it has changes).
    closeAssetTab(id.slice('asset:'.length));
    keepTabs();
    return;
  }
  if (!id.startsWith('creature:')) return closeScene(id);
  await saveCampaign();
  const next = closeCreatureTab(id);
  if (next) await showTab(next.id);
  keepTabs();
}

/** Closes the tab of scene `scenePath` (saved first); the one shown gives way to its neighbour. */
export async function closeScene(scenePath: string): Promise<void> {
  // Saved first – also a tab in the background with changes not saved yet.
  await saveCampaign();
  const sound = soundScene();
  closeSessionTab(scenePath);
  if (soundScene() !== sound) await applyTvAmbience();
  // The campaign remembers the scene shown now.
  await saveCampaign(true);
}

/** The save running now: the next one waits for it, so a tab is never put away half saved. */
let running: Promise<void> | null = null;

export async function saveCampaign(force = false): Promise<void> {
  while (running) await running;
  // The tabs are kept with every save, also when nothing else changed (a tab switched).
  keepTabs();
  const unsaved = unsavedSessions();
  if (!state.campaign || (!state.dirty && !force && !unsaved.length)) return;
  running = writeCampaign(unsaved);
  try {
    await running;
  } finally {
    running = null;
  }
}

async function writeCampaign(unsaved: ReturnType<typeof unsavedSessions>): Promise<void> {
  if (!state.campaign) return;
  state.saving = true;
  emit();
  const shown = state.activeTab;
  // Every document is tried, also after one failed: each failed one is kept as a rescue copy (DC-003).
  const errors: unknown[] = [];
  const attempt = async (write: () => Promise<void>): Promise<boolean> => {
    try {
      await write();
      return true;
    } catch (e) {
      errors.push(e);
      return false;
    }
  };
  try {
    const s = state.scene;
    const campaign = state.campaign;
    // A campaign without a map yet has no scene: only the manifest and creatures are written.
    commitView();
    // The document shown: a scene and its map, or a map open on its own (E-30).
    if (state.mapDoc && state.mapFile && (state.sceneDoc || !state.scenePath)) await attempt(() => writeDoc(state.mapFile, MapSidecarSchema, state.mapDoc));
    if (state.scenePath && state.sceneDoc) await attempt(() => writeDoc(campaignPath(state.scenePath!), SceneOverrideSchema, state.sceneDoc));
    // Documents put away with changes (E-30); a map the shown document has too is written once, as shown.
    const written = new Set(state.mapDoc ? [state.mapFile] : []);
    for (const u of unsaved) {
      let ok = true;
      if (u.mapDoc && u.mapFile && !written.has(u.mapFile)) {
        ok = await attempt(() => writeDoc(u.mapFile!, MapSidecarSchema, u.mapDoc));
        written.add(u.mapFile);
      }
      if (u.scenePath && u.sceneDoc) ok = (await attempt(() => writeDoc(campaignPath(u.scenePath!), SceneOverrideSchema, u.sceneDoc))) && ok;
      if (ok) sessionSaved(u.id);
    }
    await attempt(saveCreatures);
    // With a map on its own shown, the campaign keeps the scene on the TV as its scene.
    await attempt(() => writeDoc(campaignPath(CAMPAIGN_FILE), CampaignManifestSchema, manifestFromState(campaign.name, state.scenePath ?? state.tvScenePath, s.table, state.players)));
    if (!errors.length) {
      // Saved is what was shown when the save began; shown by now in a tab, that one is saved.
      if (state.activeTab === shown) state.dirty = false;
      else if (shown) sessionSaved(shown);
      state.lastSavedAt = Date.now();
    }
    for (const e of errors) log('log.saveFailed', { error: String(e) });
  } catch (e) {
    log('log.saveFailed', { error: String(e) });
  } finally {
    state.saving = false;
    emit();
  }
}

let timer: ReturnType<typeof setTimeout> | null = null;
/** The tabs as last kept: kept again whenever they, the scene behind them or the TV's scene change. */
let keptTabs: { tabs: unknown; active: string | null; tv: string | null } | null = null;

export function startAutosave(): void {
  subscribe(() => {
    if (keptTabs && keptTabs.tabs === state.tabs && keptTabs.active === state.activeTab && keptTabs.tv === state.tvScenePath) return;
    keptTabs = { tabs: state.tabs, active: state.activeTab, tv: state.tvScenePath };
    keepTabs();
  });
  onDirty(() => {
    if (!state.campaign) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => void saveCampaign(), AUTOSAVE_MS);
  });
}

/* ---------------------------------------------------------------- maps */

/** A free scene path for `name` in the open campaign. */
function freeScenePath(name: string): string {
  const base = slugId(name, 'scene');
  let p = `scenes/${base}.scene.json`;
  for (let i = 2; state.scenes.includes(p); i++) p = `scenes/${base}-${i}.scene.json`;
  return p;
}

/**
 * Imports a map into the library and starts a new scene on it. A file the library has already
 * keeps its sidecar (grid, walls, areas); a new one gets a fresh sidecar. Player tokens come along.
 */
export async function importMapIntoCampaign(): Promise<boolean> {
  if (!isDesktop()) return false;
  if (!state.campaign) {
    log('log.importNeedsCampaign');
    emit();
    return true;
  }
  const f = await importToLibrary('map');
  if (!f) return true;
  await openMapResource(f.relPath);
  log(f.reused ? 'log.mapReused' : 'log.mapImported', { file: f.relPath });
  emit();
  return true;
}

/**
 * Opens library map `resource` in the open campaign: its scene there if it has one, else a new
 * scene (which takes the map's grid, walls and areas from its sidecar if it has one).
 */
export async function openMapResource(resource: string): Promise<void> {
  if (!state.campaign) return;
  const sidecar = mapSidecarPath(resource);
  for (const p of state.scenes) {
    const ov = await readDoc(campaignPath(p), 'scene', SceneOverrideSchema, { quiet: true });
    if (ov?.mapSidecar === sidecar) {
      await switchScene(p);
      return;
    }
  }
  await saveCampaign();
  await openMapInNewScene(resource, await readDoc(sidecar, 'map', MapSidecarSchema, { quiet: true }));
}

/** Library map `resource` as in its sidecar, or a fresh sidecar for a picture that has none yet. */
async function mapOf(resource: string, sidecar: MapSidecar | null): Promise<{ map: MapSidecar; url: string | null }> {
  const url = await urlForResource(resource);
  if (sidecar) return { map: sidecar, url };
  // A drawn map always has its map file; only a picture can come without one.
  if (url === null) throw new Error(`Map file missing: ${resource}`);
  const isVideo = /\.(mp4|webm)$/i.test(resource);
  const { w, h } = await mediaSize(url, isVideo);
  const name = resource.split('/').pop()!.replace(/\.[^.]+$/, '');
  return {
    url,
    map: {
      kind: 'map', schemaVersion: MAP_VERSION, name, resource, isVideo, widthPx: w, heightPx: h,
      tags: [], biome: '', mapType: 'dungeon', fogBiome: 'nebel', fogStrength: 1, grid: { ...DEFAULT_GRID }, layers: [], walls: [], zones: [], pois: [], assets: [], lights: [], sounds: [], variants: [], storeys: [], stairs: [], ambient: 'dark', waterAnimated: true, lightAngle: 45,
    },
  };
}

/**
 * Opens library map `resource` on its own as a tab in the Map Forge (E-30): no scene is made
 * for it; "new scene on this map" makes one.
 */
export async function openMapTab(mapOrPicture: string): Promise<void> {
  if (!state.campaign) return;
  await saveCampaign();
  // A map file (E-32), or a picture: its sidecar (tabs kept before map files were picture paths).
  const mapFile = toMapFile(mapOrPicture);
  const id = mapTabId(mapFile);
  if (isSceneOpen(id)) {
    if (id === state.activeTab) leaveCatalog();
    else activateSession(id);
    keepTabs();
    return;
  }
  const doc = latestMap(mapFile) ?? (await readDoc(mapFile, 'map', MapSidecarSchema, { quiet: true }));
  // A map file must be readable; a picture without a sidecar yet gets a fresh one.
  if (!doc && isMapFile(mapFile)) {
    log('log.tabNotRestored', { name: mapFile.replace(/^library\//, '') });
    emit();
    return;
  }
  const resource = doc?.resource ?? pictureOf(mapOrPicture);
  const { map, url } = await mapOf(resource, doc);
  state.ws = 'forge';
  state.areaCommand = null;
  state.wallCommand = null;
  state.tool = 'select';
  const scene = sceneFromDocuments(map, null, url, tvSettings(), 'map');
  scene.table = { ...state.scene.table, centerX: scene.table.centerX, centerY: scene.table.centerY };
  replaceScene(scene, { resource, fileName: resource, scenePath: null, sceneName: map.name, docs: { map, scene: null }, mapTab: true, mapFile });
  keepTabs();
}

/** A map file `library/<name>.map.json` (E-32), not a picture's sidecar. */
function isMapFile(path: string): boolean {
  return path.endsWith('.map.json');
}

/** The map file of a map given by its map file or its picture. */
function toMapFile(mapOrPicture: string): string {
  return isMapFile(mapOrPicture) || mapOrPicture.endsWith('.dm.json') ? mapOrPicture : mapSidecarPath(mapOrPicture);
}

/** The picture of a map without a readable map file: a sidecar's picture is its own name without `.dm.json`. */
export function pictureOf(mapOrPicture: string): string {
  return mapOrPicture.endsWith('.dm.json') ? mapOrPicture.slice(0, -'.dm.json'.length) : mapOrPicture;
}

/** "New scene on this map" (E-30): a new scene on a library map (map file or picture), with its walls, areas and lights. */
export async function newSceneOnMap(mapOrPicture: string): Promise<void> {
  if (!state.campaign) return;
  await saveCampaign();
  const mapFile = toMapFile(mapOrPicture);
  const doc = latestMap(mapFile) ?? (await readDoc(mapFile, 'map', MapSidecarSchema, { quiet: true }));
  if (!doc && isMapFile(mapFile)) return;
  await openMapInNewScene(doc?.resource ?? pictureOf(mapOrPicture), doc, mapFile);
}

/** Starts a new scene of the open campaign on library map `resource` (with its sidecar if it has one; its own map file if a copy). */
export async function openMapInNewScene(resource: string, sidecar: MapSidecar | null = null, mapFile = mapSidecarPath(resource)): Promise<void> {
  const { map, url } = await mapOf(resource, sidecar);
  // A new scene starts with the map's start fog and the party: the characters of the players
  // present, with their hit points from the scene played so far (DC-096).
  // All of them, on every storey (E-40).
  const before = state.layer === 'scene' ? [...state.scene.tokens, ...(state.scene.offStoreyTokens ?? [])] : (state.sceneDoc?.tokens ?? []);
  const ov = sceneOverrideFromScene(sceneFromDocuments(map, null, url, tvSettings(), 'scene'), map.name, mapFile, { round: 1, turn: 0 }, map);
  const taken = new Set<string>();
  // The middle of the map's area (a drawn map's may start left of or above 0, E-33).
  const mid = { x: (map.origin?.x ?? 0) + map.widthPx / 2, y: (map.origin?.y ?? 0) + map.heightPx / 2 };
  ov.tokens = state.players.length === 0
    // A campaign without players yet: the player characters of the scene so far come along.
    ? before.filter((t) => t.kind === 'pc').map((t, i) => ({ ...structuredClone(t), x: mid.x + (i - 1) * map.grid.cellWidth, y: mid.y }))
    : partyForNewScene(state.players, state.creatures, before, {
    at: mid,
    cell: map.grid.cellWidth,
    newId: (prefix) => {
      const id = newId(prefix.slice(0, 40), (x) => taken.has(x));
      taken.add(id);
      return id;
    },
  });
  ov.start = startOf(ov);
  await showDocs(map, ov, resource, { scenePath: freeScenePath(map.name) });
  await saveCampaign(true);
  await refreshSceneList();
}

function mediaSize(url: string, isVideo: boolean): Promise<{ w: number; h: number }> {
  return new Promise((resolve, reject) => {
    if (isVideo) {
      const v = document.createElement('video');
      v.onloadedmetadata = () => resolve({ w: v.videoWidth, h: v.videoHeight });
      v.onerror = () => reject(new Error('video'));
      v.src = url;
    } else {
      const img = new Image();
      img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
      img.onerror = () => reject(new Error('image'));
      img.src = url;
    }
  });
}
