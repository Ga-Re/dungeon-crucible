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
import { manifestFromState, mapSidecarFromScene, mapSidecarPath, resetToStart, sceneFromDocuments, sceneIssues, sceneOverrideFromScene, startOf, tableFromManifest, BUILTIN_PREFIX } from '../core/persistence';
import { CAMPAIGN_FILE, CampaignManifestSchema, CreatureSchema, MapSidecarSchema, SceneOverrideSchema, type Creature, type MapSidecar, type SceneOverride } from '../core/sidecar';
import { keepUnknown, readDocument, slugId, type DocumentKind } from '../core/documents';
import type { z } from 'zod';
import { DEFAULT_GRID } from '../core/grid';
import type { Scene } from '../core/scene';
import {
  absolutePath, assetUrl, chooseRoot, createCampaignFolder, exportCampaignArchive, importCampaignArchive, importToLibrary, isDesktop, listCampaignFolders, listFiles,
  readText, rootInfo, trashCampaignFolder, writeText, type CampaignError, type CampaignInfo,
} from '../platform/bridge';
import { emptyScene } from '../core/emptyScene';
import type { MessageKey } from '../i18n/en';
import { addRecent, loadRecent, saveRecent } from './recent';
import type { WorkspaceId } from './store';
import { createSampleScene } from '../sample/crypt';
import { SAMPLE_CREATURES } from '../sample/creatures';
import { checkpoint, commitView, emit, layerFor, log, onDirty, refreshView, replaceScene, setWorkspace, showLayer, state } from './store';
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

async function urlForResource(resource: string): Promise<string> {
  if (resource.startsWith(BUILTIN_PREFIX)) return resource;
  return assetUrl(await absolutePath(resource));
}

/* ---------------------------------------------------------------- documents (file rules) */

/** What each document looked like when read or last written: writing merges into it, so unknown fields survive. */
const originals = new Map<string, unknown>();
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

/** Writes a JSON document, keeping the unknown fields it had; never one from a newer version; nothing if unchanged. */
export async function writeDoc(rel: string, schema: z.ZodType, value: unknown): Promise<void> {
  if (readOnly.has(rel)) return;
  const before = originals.get(rel);
  const out = keepUnknown(schema, before, value);
  if (before !== undefined && JSON.stringify(before) === JSON.stringify(out)) return;
  await writeText(rel, JSON.stringify(out, null, 2));
  originals.set(rel, out);
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
  if (!ok) {
    const newer = readOnly.has(`campaigns/${slug}/${CAMPAIGN_FILE}`);
    state.campaign = null;
    notice(newer ? 'start.error.newer' : ERROR_KEYS.notCampaign);
  }
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

/** Library files the open campaign uses: maps of its scenes, ambience, creatures of its tokens. */
async function campaignLibraryFiles(): Promise<string[]> {
  const out = new Set<string>();
  for (const p of state.scenes) {
    const ov = await readDoc(campaignPath(p), 'scene', SceneOverrideSchema, { quiet: true });
    if (!ov) continue;
    const map = await readDoc(ov.mapSidecar, 'map', MapSidecarSchema, { quiet: true });
    if (map && map.resource.startsWith('library/')) out.add(map.resource);
    else if (ov.mapSidecar.startsWith('library/')) out.add(ov.mapSidecar.replace(/\.dm\.json$/, ''));
    for (const a of ov.ambience) if (a.path.startsWith('library/')) out.add(a.path);
    for (const t of ov.tokens) if (t.creatureId) out.add(`library/${t.creatureId}${CREATURE_SUFFIX}`);
  }
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
    for (const c of SAMPLE_CREATURES) if (!state.creatures.some((x) => creaturePath(x) === creaturePath(c))) state.creatures.push(structuredClone(c));
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

function enterCampaign(ws?: WorkspaceId): void {
  state.home = false;
  state.notice = null;
  if (ws) setWorkspace(ws);
  emit();
}

/** Saves and closes the open campaign; back to the start screen unless another one opens. */
export async function closeCampaign({ toStart = true } = {}): Promise<void> {
  if (state.campaign) {
    await saveCampaign(true);
    stopAll();
  }
  state.campaign = null;
  state.scenes = [];
  state.creatures = [];
  originals.clear();
  readOnly.clear();
  replaceScene(emptyScene(state.scene.table), { resource: '', fileName: '', scenePath: null, sceneName: '' });
  if (toStart) state.home = true;
  emit();
}

/** All creatures of the library (global). */
async function loadCreatures(): Promise<void> {
  const creatures: Creature[] = [];
  for (const f of (await listFiles('library')).filter((x) => x.endsWith(CREATURE_SUFFIX))) {
    const c = await readDoc(f, 'creature', CreatureSchema);
    if (c) creatures.push(c);
  }
  state.creatures = creatures.sort((a, b) => a.name.localeCompare(b.name));
}

/** Loads campaign `info.slug`; false if its folder holds no (readable) campaign. */
async function loadCampaign(info: CampaignInfo): Promise<boolean> {
  state.campaign = info;
  const manifest = await readDoc(campaignPath(CAMPAIGN_FILE), 'campaign', CampaignManifestSchema);
  if (!manifest) return false;
  state.campaign = { ...info, name: manifest.name };
  await loadCreatures();
  state.selectedCreatureIdx = 0;
  if (manifest.activeScene) await loadScene(manifest.activeScene, tableFromManifest(manifest));
  else replaceScene(emptyScene({ ...state.scene.table, ...tableFromManifest(manifest) }), { resource: '', fileName: '', scenePath: null, sceneName: '' });
  await refreshSceneList();
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
  const table = opts.table ?? state.scene.table;
  // A scene opens in its play state.
  state.editStart = false;
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
  await applySceneAmbience(on ? startOf(doc).ambience : doc.ambience);
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
  await applySceneAmbience(state.sceneDoc.ambience);
  log('log.sceneReset', { scene: state.sceneName });
  emit();
}

/** Loads a scene of the open campaign (`scenes/x.scene.json`). */
export async function loadScene(scenePath: string, table: Partial<Scene['table']> = state.scene.table): Promise<void> {
  const ov = await readDoc(campaignPath(scenePath), 'scene', SceneOverrideSchema);
  if (!ov) return;
  const map = await readDoc(ov.mapSidecar, 'map', MapSidecarSchema);
  if (!map) return;
  // Older scenes start where they are when first opened (E-3); saved with the next save.
  if (!ov.start) ov.start = startOf(ov);
  await showDocs(map, ov, map.resource, { scenePath, table });
  const issues = sceneIssues(map, ov);
  if (issues.orphaned.length > 0 || issues.invalid.length > 0) log('log.orphanedOverrides', { scene: ov.name, n: issues.orphaned.length + issues.invalid.length });
  void applySceneAmbience(ov.ambience);
}

export async function switchScene(scenePath: string): Promise<void> {
  if (scenePath === state.scenePath) return;
  await saveCampaign();
  // Blackout during the switch so the table never shows a half-loaded scene.
  const black = state.scene.table.blackout;
  state.scene.table.blackout = true;
  emit();
  await loadScene(scenePath);
  state.scene.table.blackout = black;
  emit();
  await saveCampaign();
}

export async function saveCampaign(force = false): Promise<void> {
  if (!state.campaign || state.saving || (!state.dirty && !force)) return;
  state.saving = true;
  emit();
  try {
    const s = state.scene;
    // A campaign without a map yet has no scene: only the manifest and creatures are written.
    commitView();
    if (state.scenePath && state.mapDoc && state.sceneDoc) {
      await writeDoc(mapSidecarPath(state.mapResource), MapSidecarSchema, state.mapDoc);
      await writeDoc(campaignPath(state.scenePath), SceneOverrideSchema, state.sceneDoc);
    }
    for (const c of state.creatures) await writeDoc(creaturePath(c), CreatureSchema, c);
    await writeDoc(campaignPath(CAMPAIGN_FILE), CampaignManifestSchema, manifestFromState(state.campaign.name, state.scenePath, s.table));
    state.dirty = false;
    state.lastSavedAt = Date.now();
  } catch (e) {
    log('log.saveFailed', { error: String(e) });
  } finally {
    state.saving = false;
    emit();
  }
}

let timer: ReturnType<typeof setTimeout> | null = null;
export function startAutosave(): void {
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

/** Starts a new scene of the open campaign on library map `resource` (with its sidecar if it has one). */
export async function openMapInNewScene(resource: string, sidecar: MapSidecar | null = null): Promise<void> {
  const url = await urlForResource(resource);
  let map = sidecar;
  if (!map) {
    const isVideo = /\.(mp4|webm)$/i.test(resource);
    const { w, h } = await mediaSize(url, isVideo);
    const name = resource.split('/').pop()!.replace(/\.[^.]+$/, '');
    map = {
      kind: 'map', schemaVersion: 1, name, resource, isVideo, widthPx: w, heightPx: h,
      tags: [], biome: '', mapType: 'dungeon', fogBiome: 'nebel', fogStrength: 1, grid: { ...DEFAULT_GRID }, walls: [], zones: [], pois: [], assets: [], lights: [], ambient: 'dark',
    };
  }
  // A new scene starts with the map's start fog; the player characters come along.
  const pcs = (state.layer === 'scene' ? state.scene.tokens : (state.sceneDoc?.tokens ?? [])).filter((t) => t.kind === 'pc');
  const ov = sceneOverrideFromScene(sceneFromDocuments(map, null, url, state.scene.table, 'scene'), map.name, mapSidecarPath(resource), { round: 1, turn: 0 }, map);
  ov.tokens = pcs.map((t, i) => ({ ...t, conditions: [...t.conditions], x: map.widthPx / 2 + (i - 1) * map.grid.cellWidth, y: map.heightPx / 2 }));
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
