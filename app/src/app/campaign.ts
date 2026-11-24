/**
 * Campaign folder handling (desktop app). Layout:
 *
 *   campaign.dm.json                 manifest (name, active scene, table calibration)
 *   maps/<file>  + <file>.dm.json    map image/video and its sidecar (grid, walls, zones)
 *   scenes/<name>.scene.json         per-session state (fog, doors, tokens, combat)
 *   creatures/<name>.dm.json         2024 stat blocks entered by the DM
 */
import {
  BUILTIN_PREFIX, manifestFromState, mapSidecarFromScene, mapSidecarPath, sceneFromDocuments, sceneOverrideFromScene, slugify, tableFromManifest,
} from '../core/persistence';
import { CAMPAIGN_FILE, CampaignManifestSchema, CreatureSchema, MapSidecarSchema, SceneOverrideSchema, type Creature, type MapSidecar } from '../core/sidecar';
import { keepUnknown, readDocument, type DocumentKind } from '../core/documents';
import type { z } from 'zod';
import { DEFAULT_GRID } from '../core/grid';
import type { Scene } from '../core/scene';
import {
  assetUrl, campaignStatus, closeCampaignFolder, createCampaignFolder, exportCampaignArchive, importCampaignArchive, importMapFileNative, isDesktop, listFiles,
  openCampaignFolder, pickCampaignFolder, readText, writeText, type CampaignError, type CampaignInfo, type RecentStatus,
} from '../platform/bridge';
import { emptyScene } from '../core/emptyScene';
import type { MessageKey } from '../i18n/en';
import { addRecent, loadRecent, removeRecent, saveRecent } from './recent';
import type { WorkspaceId } from './store';
import { createSampleScene } from '../sample/crypt';
import { SAMPLE_CREATURES } from '../sample/creatures';
import { emit, log, onDirty, replaceScene, setWorkspace, state } from './store';
import { applySceneAmbience, refreshAudioFiles, sceneAmbience, stopAll } from './soundboard';

const AUTOSAVE_MS = 1500;

async function urlForResource(resource: string): Promise<string> {
  if (resource.startsWith(BUILTIN_PREFIX)) return resource;
  const { absolutePath } = await import('../platform/bridge');
  return assetUrl(await absolutePath(resource));
}

/* ---------------------------------------------------------------- documents (file rules) */

/** What each document looked like when read: writing merges into it, so unknown fields survive. */
const originals = new Map<string, unknown>();
/** Documents from a newer app version: shown if possible, never written back. */
const readOnly = new Set<string>();

/** Reads a JSON document: version check, migration, validation. Problems are logged, never thrown. */
async function readDoc<T>(rel: string, kind: DocumentKind, schema: z.ZodType<T>): Promise<T | null> {
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
    log('log.newerFile', { file: rel });
  } else {
    log('log.invalidFile', { file: rel, error: r.errors[0] ?? '' });
  }
  return null;
}

/** Writes a JSON document, keeping the unknown fields it had; never one from a newer version. */
async function writeDoc(rel: string, schema: z.ZodType, value: unknown): Promise<void> {
  if (readOnly.has(rel)) return;
  const out = keepUnknown(schema, originals.get(rel), value);
  await writeText(rel, JSON.stringify(out, null, 2));
  originals.set(rel, out);
}

function creaturePath(c: Creature): string {
  return `creatures/${slugify(c.name)}.dm.json`;
}

/* ---------------------------------------------------------------- recent campaigns */

function storage(): Storage | null {
  try {
    return localStorage;
  } catch {
    return null;
  }
}

/** Loads the recent list and checks which folders still hold a campaign. */
export async function refreshRecent(): Promise<Map<string, RecentStatus>> {
  state.recent = loadRecent(storage());
  emit();
  const status = new Map<string, RecentStatus>();
  if (!isDesktop() || state.recent.length === 0) return status;
  const r = await campaignStatus(state.recent.map((x) => x.root));
  state.recent.forEach((x, i) => status.set(x.root, r[i] ?? 'missing'));
  return status;
}

function remember(info: CampaignInfo, name: string): void {
  state.recent = addRecent(loadRecent(storage()), { root: info.root, name, openedAt: Date.now() });
  saveRecent(storage(), state.recent);
}

export function forgetRecent(root: string): void {
  state.recent = removeRecent(state.recent, root);
  saveRecent(storage(), state.recent);
  emit();
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

/** Ctrl/⌘+O and "Open campaign": a folder that holds a campaign. */
export async function openCampaignDialog(): Promise<void> {
  if (!isDesktop()) {
    log('log.desktopOnly');
    emit();
    return;
  }
  const info = await pickCampaignFolder();
  if (info) await openCampaign(info);
}

/** Opens a campaign from the recent list. */
export async function openRecent(root: string): Promise<void> {
  let info: CampaignInfo;
  try {
    info = await openCampaignFolder(root);
  } catch {
    notice('start.error.missing');
    return;
  }
  await openCampaign(info);
}

async function openCampaign(info: CampaignInfo): Promise<void> {
  if (state.campaign) await closeCampaign({ toStart: false });
  const ok = await loadCampaign(info);
  if (!ok) {
    await closeCampaignFolder();
    state.campaign = null;
    notice(readOnly.has(CAMPAIGN_FILE) ? 'start.error.newer' : ERROR_KEYS.notCampaign);
  }
}

/** Imports a campaign archive (.zip) into a new folder and opens it. */
export async function importCampaign(): Promise<void> {
  const r = await importCampaignArchive();
  if (!r) return;
  if (!r.ok) {
    notice(ERROR_KEYS[r.error]);
    return;
  }
  await openCampaign(r.campaign);
}

/** Writes the open campaign as an archive (.zip). */
export async function exportCampaign(): Promise<void> {
  if (!state.campaign) return;
  await saveCampaign(true);
  const r = await exportCampaignArchive(state.campaign.name);
  if (!r) return;
  if (r.ok) log('log.campaignExported', { file: r.file, files: r.files });
  else log(r.error === 'insideCampaign' ? 'log.exportInsideCampaign' : 'log.exportFailed');
  emit();
}

/**
 * New campaign: the user picks where its folder goes. It starts empty (in the map forge, ready
 * to import a map) or with the sample crypt and creatures.
 */
export async function newCampaign(name: string, withSample: boolean): Promise<void> {
  const clean = name.trim() || 'Campaign';
  const r = await createCampaignFolder(clean);
  if (!r) return;
  if (!r.ok) {
    notice(ERROR_KEYS[r.error]);
    return;
  }
  if (state.campaign) await closeCampaign({ toStart: false });
  state.campaign = { ...r.campaign, name: clean };
  if (withSample) {
    const scene = createSampleScene();
    scene.map.imageUrl = 'builtin:crypt';
    state.creatures = structuredClone(SAMPLE_CREATURES);
    const scenePath = `scenes/${slugify('Session 1')}.scene.json`;
    replaceScene(scene, { resource: 'builtin:crypt', fileName: 'builtin:crypt', scenePath, sceneName: 'Session 1' });
  } else {
    state.creatures = [];
    replaceScene(emptyScene(state.scene.table), { resource: '', fileName: '', scenePath: null, sceneName: '' });
  }
  state.selectedCreatureIdx = 0;
  await saveCampaign(true);
  await refreshSceneList();
  await refreshAudioFiles();
  remember(state.campaign, clean);
  log('log.campaignCreated', { name: clean });
  enterCampaign(withSample ? 'play' : 'forge');
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
    await closeCampaignFolder();
  }
  state.campaign = null;
  state.scenes = [];
  state.creatures = [];
  originals.clear();
  readOnly.clear();
  replaceScene(emptyScene(state.scene.table), { resource: '', fileName: '', scenePath: null, sceneName: '' });
  if (toStart) {
    state.home = true;
    void refreshRecent();
  }
  emit();
}

/** Loads the campaign in `info`; false if the folder holds no campaign. */
async function loadCampaign(info: CampaignInfo): Promise<boolean> {
  state.campaign = info;
  const manifest = await readDoc(CAMPAIGN_FILE, 'campaign', CampaignManifestSchema);
  if (!manifest) return false;
  state.campaign = { ...info, name: manifest.name };
  const files = await listFiles('creatures');
  const creatures: Creature[] = [];
  for (const f of files.filter((x) => x.endsWith('.dm.json'))) {
    const c = await readDoc(f, 'creature', CreatureSchema);
    if (c) creatures.push(c);
  }
  state.creatures = creatures;
  state.selectedCreatureIdx = 0;
  if (manifest.activeScene) await loadScene(manifest.activeScene, tableFromManifest(manifest));
  else replaceScene(emptyScene({ ...state.scene.table, ...tableFromManifest(manifest) }), { resource: '', fileName: '', scenePath: null, sceneName: '' });
  await refreshSceneList();
  state.dirty = false;
  await refreshAudioFiles();
  remember(info, manifest.name);
  log('log.campaignOpened', { name: manifest.name });
  enterCampaign(manifest.activeScene ? undefined : 'forge');
  return true;
}

export async function refreshSceneList(): Promise<void> {
  if (!state.campaign) return;
  state.scenes = (await listFiles('scenes')).filter((f) => f.endsWith('.scene.json'));
  emit();
}

export async function loadScene(scenePath: string, table: Partial<Scene['table']> = state.scene.table): Promise<void> {
  const ov = await readDoc(scenePath, 'scene', SceneOverrideSchema);
  if (!ov) return;
  const map = await readDoc(ov.mapSidecar, 'map', MapSidecarSchema);
  if (!map) return;
  const url = await urlForResource(map.resource);
  const scene = sceneFromDocuments(map, ov, url, table);
  scene.table = { ...state.scene.table, ...table, centerX: scene.table.centerX, centerY: scene.table.centerY, blackout: state.scene.table.blackout };
  replaceScene(scene, { resource: map.resource, fileName: map.resource, scenePath, sceneName: ov.name, round: ov.combat.round, turn: ov.combat.turn });
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
    if (state.scenePath) {
      const sidecar = mapSidecarPath(state.mapResource);
      await writeDoc(sidecar, MapSidecarSchema, mapSidecarFromScene(s, state.mapResource));
      await writeDoc(state.scenePath, SceneOverrideSchema, { ...sceneOverrideFromScene(s, state.sceneName, sidecar, { round: state.round, turn: state.turn }), ambience: sceneAmbience() });
    }
    for (const c of state.creatures) await writeDoc(creaturePath(c), CreatureSchema, c);
    await writeDoc(CAMPAIGN_FILE, CampaignManifestSchema, manifestFromState(state.campaign.name, state.scenePath, s.table));
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

/** Imports a map into the campaign and starts a new scene on it. Player tokens come along. */
export async function importMapIntoCampaign(): Promise<boolean> {
  if (!isDesktop()) return false;
  if (!state.campaign) {
    log('log.importNeedsCampaign');
    emit();
    return true;
  }
  const f = await importMapFileNative();
  if (!f) return true;
  const url = await assetUrl(f.absPath);
  const isVideo = /\.(mp4|webm)$/i.test(f.relPath);
  const { w, h } = await mediaSize(url, isVideo);
  const name = f.relPath.split('/').pop()!.replace(/\.[^.]+$/, '');
  const map: MapSidecar = {
    kind: 'map', schemaVersion: 1, name, resource: f.relPath, isVideo, widthPx: w, heightPx: h,
    tags: [], biome: '', mapType: 'dungeon', fogBiome: 'nebel', fogStrength: 1, grid: { ...DEFAULT_GRID }, walls: [], zones: [], pois: [], assets: [], lights: [], ambient: 'dark',
  };
  await saveCampaign();
  const scene = sceneFromDocuments(map, null, url, state.scene.table);
  scene.tokens = state.scene.tokens.filter((t) => t.kind === 'pc').map((t, i) => ({ ...t, x: w / 2 + (i - 1) * DEFAULT_GRID.cellWidth, y: h / 2 }));
  const scenePath = `scenes/${slugify(name)}.scene.json`;
  replaceScene(scene, { resource: f.relPath, fileName: f.relPath, scenePath, sceneName: name });
  log('log.mapImported', { file: f.relPath });
  await saveCampaign(true);
  await refreshSceneList();
  return true;
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
