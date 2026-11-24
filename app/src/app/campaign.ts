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
import { CAMPAIGN_FILE, CampaignManifestSchema, CreatureSchema, MapSidecarSchema, SceneOverrideSchema, parseSidecar, type Creature, type MapSidecar } from '../core/sidecar';
import { DEFAULT_GRID } from '../core/grid';
import type { Scene } from '../core/scene';
import {
  assetUrl, importMapFileNative, isTauri, listFiles, openCampaignFolder, pickCampaignFolder, readText, writeText, type CampaignInfo,
} from '../platform/bridge';
import { createSampleScene } from '../sample/crypt';
import { SAMPLE_CREATURES } from '../sample/creatures';
import { emit, log, onDirty, replaceScene, state } from './store';
import { applySceneAmbience, refreshAudioFiles, sceneAmbience } from './soundboard';

const LAST_KEY = 'dc.lastCampaign';
const AUTOSAVE_MS = 1500;

async function urlForResource(resource: string): Promise<string> {
  if (resource.startsWith(BUILTIN_PREFIX)) return resource;
  const { absolutePath } = await import('../platform/bridge');
  return assetUrl(await absolutePath(resource));
}

async function readJson<T>(rel: string, schema: Parameters<typeof parseSidecar<T>>[0]): Promise<T | null> {
  let text: string;
  try {
    text = await readText(rel);
  } catch {
    return null;
  }
  const r = parseSidecar(schema, text);
  if (!r.ok) {
    log('log.invalidFile', { file: rel, error: r.errors[0] ?? '' });
    return null;
  }
  return r.value;
}

function creaturePath(c: Creature): string {
  return `creatures/${slugify(c.name)}.dm.json`;
}

/** Shows the folder picker. A folder without campaign.dm.json becomes a new campaign. */
export async function openCampaignDialog(): Promise<void> {
  if (!isTauri()) {
    log('log.desktopOnly');
    emit();
    return;
  }
  const info = await pickCampaignFolder();
  if (info) await loadCampaign(info);
}

export async function reopenLastCampaign(): Promise<void> {
  if (!isTauri()) return;
  let last: string | null = null;
  try {
    last = localStorage.getItem(LAST_KEY);
  } catch {
    /* ignore */
  }
  if (!last) return;
  try {
    await loadCampaign(await openCampaignFolder(last));
  } catch {
    /* folder moved or deleted: start without campaign */
  }
}

async function loadCampaign(info: CampaignInfo): Promise<void> {
  state.campaign = info;
  try {
    localStorage.setItem(LAST_KEY, info.root);
  } catch {
    /* ignore */
  }
  const manifest = await readJson(CAMPAIGN_FILE, CampaignManifestSchema);
  if (!manifest) {
    await createCampaign(info.name);
    log('log.campaignCreated', { name: info.name });
    emit();
    return;
  }
  const files = await listFiles('creatures');
  const creatures: Creature[] = [];
  for (const f of files.filter((x) => x.endsWith('.dm.json'))) {
    const c = await readJson(f, CreatureSchema);
    if (c) creatures.push(c);
  }
  state.creatures = creatures;
  state.selectedCreatureIdx = 0;
  if (manifest.activeScene) await loadScene(manifest.activeScene, tableFromManifest(manifest));
  await refreshSceneList();
  state.dirty = false;
  await refreshAudioFiles();
  log('log.campaignOpened', { name: manifest.name });
  emit();
}

export async function refreshSceneList(): Promise<void> {
  if (!state.campaign) return;
  state.scenes = (await listFiles('scenes')).filter((f) => f.endsWith('.scene.json'));
  emit();
}

export async function loadScene(scenePath: string, table: Partial<Scene['table']> = state.scene.table): Promise<void> {
  const ov = await readJson(scenePath, SceneOverrideSchema);
  if (!ov) return;
  const map = await readJson(ov.mapSidecar, MapSidecarSchema);
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

/** New campaign: the sample crypt and sample creatures become its first scene. */
async function createCampaign(name: string): Promise<void> {
  const scene = createSampleScene();
  scene.map.imageUrl = 'builtin:crypt';
  state.creatures = structuredClone(SAMPLE_CREATURES);
  const scenePath = `scenes/${slugify('Session 1')}.scene.json`;
  replaceScene(scene, { resource: 'builtin:crypt', fileName: 'builtin:crypt', scenePath, sceneName: 'Session 1' });
  state.campaign = { ...(state.campaign as CampaignInfo), name };
  await saveCampaign(true);
  await refreshSceneList();
}

export async function saveCampaign(force = false): Promise<void> {
  if (!state.campaign || !state.scenePath || state.saving || (!state.dirty && !force)) return;
  state.saving = true;
  emit();
  try {
    const s = state.scene;
    const sidecar = mapSidecarPath(state.mapResource);
    await writeText(sidecar, JSON.stringify(mapSidecarFromScene(s, state.mapResource), null, 2));
    await writeText(state.scenePath, JSON.stringify({ ...sceneOverrideFromScene(s, state.sceneName, sidecar, { round: state.round, turn: state.turn }), ambience: sceneAmbience() }, null, 2));
    for (const c of state.creatures) await writeText(creaturePath(c), JSON.stringify(c, null, 2));
    await writeText(CAMPAIGN_FILE, JSON.stringify(manifestFromState(state.campaign.name, state.scenePath, s.table), null, 2));
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
  if (!isTauri()) return false;
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
