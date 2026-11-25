/**
 * DM application state. A tiny external store: components subscribe via
 * `useStore`, actions mutate state and call `emit()`.
 */
import { useSyncExternalStore } from 'react';
import type { Point } from '../core/geometry';
import { gridFromBox, shiftGrid, snapToCell, tableZoomForPhysicalGrid, type GridBox, type GridConfig } from '../core/grid';
import { buildPlayerFrame, type PlayerFrame } from '../core/projection';
import type { AreaTemplate, FogBiome, MapAssetPlacement, MapType, Scene, TableRotation, TemplateShape, Token, Wall, WallKind } from '../core/scene';
import { assetDoorId, assetDoorWalls, wallsWithAssetDoors } from '../core/assetDoors';
import type { InteriorTrigger } from '../core/sidecar';
import { drawnPlacements, footprintPolygon, interiorChanges, interiorOf, interiorWalls } from '../core/interiors';
import { rotateAboutAnchor, scaleAboutAnchor, snapAnchored } from '../core/anchor';
import { assetShapes, footprintOf, hitsPlacement, nextVariant, snapPlacement } from '../core/placement';
import { rollDice, type RollResult } from '../core/rules/dice';
import type { Condition } from '../core/rules/rules2024';
import { litSources, updateVision, visiblePolygons, type LitSource, type ViewerVision, type VisionExtras } from '../core/vision';
import { placementCovers, placementLights } from '../core/cover';
import { forgetIn, hideAll, hideIn, rememberSeen, revealAll, revealIn } from '../core/fogModel';
import { lockedAreas } from '../core/persistence';
import { newId, slugId } from '../core/documents';
import { chainOf, moveEnds, removeWalls, withoutDegenerate, type WallEnd } from '../core/walls';
import { addShape, areaContains, distanceToArea, moveVertex, normalizeShape, subtractShape, type AreaTool, type VertexRef } from '../core/areas';
import type { Polygon } from '../core/poly/types';
import { readFogLook, saveCoverFrom, saveFadeSeconds, saveFogEdge, saveFogMotion, saveFogQuality, saveFogSpeed, saveSoftEdges, type CoverFrom, type FogLook, type FogQuality } from './fog-settings';
import { lookToWire } from '../render/fogOptions';
import type { MonitorInfo } from '../platform/bridge';
import { emptyScene } from '../core/emptyScene';
import { createSampleScene } from '../sample/crypt';
import { SAMPLE_CREATURES } from '../sample/creatures';
import type { AssetKind, AssetSidecar, Creature, MapLayer, Player } from '../core/sidecar';
import { missingPartyTokens, tokenFromCreature } from '../core/party';
import type { MessageKey } from '../i18n/en';
import { initialSoundboard, type SoundboardState } from './soundboard';
import { History } from '../core/history';
import { activeLayers, BASE_LAYER, drawOrder, triggerChanges } from '../core/layers';
import { allPlacements, elementsFromSidecar, resetElement, sceneChanges, sceneIssues, withoutOrphans, type ElementChange } from '../core/persistence';
import { commitStart, layerOf, mapSidecarFromScene, mapSidecarPath, sceneFromDocuments, sceneOverrideFromScene, startOf, type ViewLayer } from '../core/persistence';
import type { MapSidecar, SceneOverride } from '../core/sidecar';
import type { CampaignInfo, RootInfo } from '../platform/bridge';
import type { RecentCampaign } from './recent';
import type { LibraryMap } from './library';
import type { VaultState } from './vault';

export type WorkspaceId = 'forge' | 'vault' | 'creatures' | 'atlas' | 'play';

export type ToolId =
  | 'select' | 'pan' | 'measure' | 'ping' | 'calibrate'
  | 'area' | 'wall' | 'hide'
  | 'fog-rect' | 'fog-ellipse' | 'fog-polygon' | 'fog-lasso' | 'fog-brush' | 'reveal-room'
  | 'cone' | 'sphere' | 'line' | 'cube' | 'light';

export interface LogEntry {
  at: number;
  key: MessageKey;
  params?: Record<string, string | number>;
}

export interface AppState {
  ws: WorkspaceId;
  tool: ToolId;
  snap: boolean;
  showGrid: boolean;
  viewAsPlayer: boolean;
  dmSeeThrough: boolean;
  /** The DM sees through houses' roofs to their interior (E-29); the TV never does. */
  roofsSeeThrough: boolean;
  /** The fog's look on this device (Dungeon-Manager's fog settings). */
  fogLook: FogLook;
  memoryOpacity: number;
  brushCells: number;
  /** "Nebel ausblenden" (key N): fog hidden in the DM window only; the TV never changes. */
  dmFogHidden: boolean;
  /** Whether fog tools reveal or hide (Alt inverts while drawing). */
  fogMode: 'reveal' | 'hide';
  /** What players see right now (fog polygons from token sight). */
  visible: Polygon[];
  /** Lights that are on, with the areas they light. */
  lights: LitSource[];
  /** The last fog change came from token movement (switches quickly, no ragged spread). */
  fogQuick: boolean;
  moveLock: boolean;
  selectedTokenId: string | null;
  selectedZoneId: string | null;
  /** "Create area" while it runs (Map Forge, DC-013). */
  areaCommand: AreaCommand | null;
  selectedLightId: string | null;
  turn: number;
  round: number;
  scene: Scene;
  vision: ViewerVision[];
  /** "Calibrate grid" while it runs (Map Forge, E-7). */
  calibration: CalibrationCommand | null;
  /** "Draw walls" while it runs (Map Forge, DC-014). */
  wallCommand: WallCommand | null;
  /** Selected walls of the map (Map Forge): one, several (Shift) or a chain (double-click). */
  selectedWallIds: string[];
  log: LogEntry[];
  rolls: RollResult[];
  monitors: MonitorInfo[];
  tableOpen: boolean;
  tableMonitor: number | null;
  frame: PlayerFrame | null;
  frameSeq: number;
  creatures: Creature[];
  /** The open campaign's players and their characters (DC-096). */
  players: Player[];
  /** The "Map settings" dialog is open (Map Forge, DC-011). */
  mapSettingsOpen: boolean;
  selectedCreatureIdx: number;
  mapFileName: string;
  /** Map resource: path relative to the campaign folder or `builtin:<id>`. */
  mapResource: string;
  campaign: CampaignInfo | null;
  scenePath: string | null;
  sceneName: string;
  scenes: string[];
  dirty: boolean;
  saving: boolean;
  lastSavedAt: number | null;
  canUndo: boolean;
  canRedo: boolean;
  soundboard: SoundboardState;
  /** Increments whenever a different scene is loaded (views refit). */
  sceneVersion: number;
  /** The start screen is shown (desktop app: at start and after closing a campaign). */
  home: boolean;
  /** The root folder (desktop app); null until loaded. */
  root: RootInfo | null;
  /** Maps of the library (Map Forge browser). */
  libraryMaps: LibraryMap[];
  /** The open map as in its file (the map layer), updated from the view when it changes layer or is saved. */
  mapDoc: MapSidecar | null;
  /** The open scene as in its file (its changes of the map and its state). */
  sceneDoc: SceneOverride | null;
  /** What `scene` shows: the map (Map Forge), the scene's play state, or its start state. */
  layer: ViewLayer;
  /** "Edit start state" in the Game-Orchestrator (E-17). */
  editStart: boolean;
  /** What the app knows of each library asset placed on maps (size, group, URL …), by path (DC-041). */
  assetInfo: Record<string, AssetInfo>;
  /** The placed asset selected in the Map Forge. */
  selectedAssetId: string | null;
  /** The layer new elements go on in the Map Forge (E-28). */
  currentLayer: string;
  /** Play-once effects started in this session, by placement id → when (DC-110; not saved). */
  effectRuns: Record<string, number>;
  /** Houses a player character came into whose interior waits for the DM's yes (E-29; not saved). */
  interiorAsks: { id: string; name: string }[];
  /** Open documents as tabs (E-30, DC-034), in order; the active one is what `scene` shows. */
  tabs: DocTab[];
  /** The scene or map behind the tabs: a scene's path, or `map:<resource>` for a map open on its own. */
  activeTab: string | null;
  /** The creature tab shown in the Creatures workspace (E-30, DC-034b), if any. */
  creatureTab: string | null;
  /** The asset tab shown in the Asset Vault (its editor, DC-034c), if any. */
  assetTab: string | null;
  /** Where scene and map tabs are shown: the workspace last used for them. */
  sceneWs: 'forge' | 'play';
  /** The scene on the TV (E-30): changed only by command; none: the TV is black. */
  tvScenePath: string | null;
  /** After switching tabs in the Orchestrator: "this scene on the TV?" waits for the DM's answer. */
  tvAsk: string | null;
  /** The TV is black since the campaign was opened, until the DM puts a scene there or lifts the blackout (E-30). */
  blackUntilRelease: boolean;
  /** The map of the TV's scene was changed in the Map Forge: the TV keeps the map before, until "on the TV" (E-30). */
  tvMapPending: boolean;
  /** The Asset Vault: catalog, filter, selection (E-27, DC-040). */
  vault: VaultState;
  /** Recently used campaigns (start screen). */
  recent: RecentCampaign[];
  /** A message on the start screen (e.g. why an import failed). */
  notice: { key: MessageKey; params?: Record<string, string | number> } | null;
}

function initial(): AppState {
  const scene = createSampleScene();
  scene.map.imageUrl = 'builtin:crypt';
  // Start with the entrance hall explored.
  const s: AppState = {
    ws: 'play',
    tool: 'select',
    snap: true,
    showGrid: true,
    viewAsPlayer: false,
    dmSeeThrough: true,
    roofsSeeThrough: true,
    fogLook: readFogLook(typeof localStorage === 'undefined' ? undefined : localStorage),
    memoryOpacity: 0.6,
    brushCells: 1.5,
    dmFogHidden: false,
    fogMode: 'reveal',
    visible: [],
    lights: [],
    fogQuick: false,
    moveLock: false,
    selectedTokenId: null,
    selectedZoneId: null,
    areaCommand: null,
    selectedLightId: null,
    turn: 0,
    round: 1,
    scene,
    vision: [],
    calibration: null,
    wallCommand: null,
    selectedWallIds: [],
    log: [],
    rolls: [],
    monitors: [],
    tableOpen: false,
    tableMonitor: null,
    frame: null,
    frameSeq: 0,
    creatures: SAMPLE_CREATURES,
    players: [],
    mapSettingsOpen: false,
    selectedCreatureIdx: 0,
    mapFileName: 'builtin: crypt-of-vhal-durn',
    mapResource: 'builtin:crypt',
    campaign: null,
    scenePath: null,
    sceneName: 'Session 3',
    scenes: [],
    dirty: false,
    saving: false,
    lastSavedAt: null,
    canUndo: false,
    canRedo: false,
    sceneVersion: 0,
    home: false,
    root: null,
    libraryMaps: [],
    mapDoc: null,
    sceneDoc: null,
    layer: 'scene',
    editStart: false,
    recent: [],
    notice: null,
    assetInfo: {},
    selectedAssetId: null,
    currentLayer: BASE_LAYER,
    effectRuns: {},
    interiorAsks: [],
    tabs: [],
    activeTab: null,
    creatureTab: null,
    assetTab: null,
    sceneWs: 'play',
    tvScenePath: null,
    tvAsk: null,
    tvMapPending: false,
    blackUntilRelease: false,
    vault: { items: [], filter: {}, selected: [], anchor: null, thumbPx: 120, newCollections: [], pack: null, editor: null, drafts: {} },
    soundboard: initialSoundboard(),
  };
  s.vision = updateVision(scene);
  s.visible = visiblePolygons(s.vision);
  s.lights = litSources(scene);
  scene.fog = rememberSeen(scene.fog, s.visible);
  // The sample (browser mode) is a map and a scene on it, like a campaign's.
  s.mapDoc = mapSidecarFromScene(scene, 'builtin:crypt', 'map');
  s.sceneDoc = sceneOverrideFromScene(scene, s.sceneName, mapSidecarPath('builtin:crypt'), { round: 1, turn: 0 }, s.mapDoc);
  return s;
}

export const state: AppState = initial();
let version = 0;
const listeners = new Set<() => void>();

/** Changes with every state change: views compare it to know when to push to the renderer. */
export function getVersion(): number {
  return version;
}

export function setFogMode(m: 'reveal' | 'hide'): void {
  state.fogMode = m;
  emit();
}

export function emit(): void {
  version++;
  for (const l of listeners) l();
}

/** Calls `l` after every state change (outside React). */
export function subscribe(l: () => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function useStore<T>(select: (s: AppState) => T): T {
  useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => version,
  );
  return select(state);
}

export function log(key: MessageKey, params?: Record<string, string | number>): void {
  state.log.unshift({ at: Date.now(), key, params });
  if (state.log.length > 200) state.log.pop();
}

/* ---------- Undo / redo & dirty tracking ---------- */

let history = new History<string>(100);
const dirtyListeners = new Set<() => void>();

export function onDirty(fn: () => void): () => void {
  dirtyListeners.add(fn);
  return () => dirtyListeners.delete(fn);
}

/** Counts changes of the view (for the TV's scene while the Map Forge shows the map). */
let viewVersion = 0;

export function markDirty(): void {
  viewVersion++;
  state.dirty = true;
  // A change of the TV scene's map waits for the DM before it reaches the TV (E-30).
  if (state.layer === 'map' && state.tvScenePath && state.mapResource === tvResource()) state.tvMapPending = true;
  for (const f of dirtyListeners) f();
}

/** What a view of the scene was built from: its changes of the map and the hidden ids of the layer shown. */
function previousLayer(doc: SceneOverride | null) {
  if (!doc) return undefined;
  return { ...layerOf(doc), hidden: state.layer === 'start' ? startOf(doc).hidden : doc.hidden };
}

function snapshot(): string {
  return JSON.stringify(docsFromView());
}

/** Call before every undoable change. */
export function checkpoint(): void {
  history.push(snapshot());
  state.canUndo = history.canUndo;
  state.canRedo = history.canRedo;
  markDirty();
}

function restore(snap: string): void {
  const { map, ov } = JSON.parse(snap) as { map: MapSidecar; ov: SceneOverride | null };
  // The scene file too: it holds what the view does not show (orphaned changes, the other state).
  if (ov) state.sceneDoc = ov;
  const keepTable = state.scene.table;
  state.scene = sceneFromDocuments(map, ov, state.scene.map.imageUrl, keepTable, state.layer);
  state.scene.table = keepTable;
  if (ov) {
    state.round = ov.combat.round;
    state.turn = ov.combat.turn;
  }
  // Selected walls that the step back (or forward) took away are no longer selected.
  const walls = new Set(state.scene.walls.map((w) => w.id));
  state.selectedWallIds = state.selectedWallIds.filter((id) => walls.has(id));
  if (state.selectedAssetId && !editableAssets().some((a) => a.id === state.selectedAssetId)) state.selectedAssetId = null;
  // Who is in which house as of this step (E-29): stepping back into a house is no new entering.
  interiorInside = charactersInHouses();
  recomputeVision();
  state.canUndo = history.canUndo;
  state.canRedo = history.canRedo;
  markDirty();
  emit();
}

export function undo(): void {
  const prev = history.undo(snapshot());
  if (prev) restore(prev);
}

export function redo(): void {
  const next = history.redo(snapshot());
  if (next) restore(next);
}

export function clearHistory(): void {
  history.clear();
  state.canUndo = state.canRedo = false;
}

/** Replaces the whole scene (open campaign, switch scene, import map). */
/** A new element id that no wall, area, light, template or token of the scene has (lowercase, random). */
function freshId(prefix: string): string {
  const sc = state.scene;
  const taken = new Set<string>([...sc.walls, ...sc.zones, ...sc.lights, ...sc.templates, ...sc.tokens, ...sc.map.assets, ...sc.ownAssets, ...sc.hidden.assets].map((x) => x.id));
  return newId(slugId(prefix, 'el').slice(0, 40), (id) => taken.has(id));
}

/**
 * Replaces the whole view (open campaign, switch scene, import map). `scene` must show
 * `layerFor(state.ws)`; `docs` are the map and scene as in their files (none: no map open).
 */
export function replaceScene(scene: Scene, opts: { resource: string; fileName: string; scenePath: string | null; sceneName: string; round?: number; turn?: number; docs?: { map: MapSidecar | null; scene: SceneOverride | null }; mapTab?: boolean }): void {
  // The document shown so far stays open in its tab (E-30).
  const tabId = opts.scenePath ?? (opts.mapTab ? mapTabId(opts.resource) : null);
  if (state.activeTab && state.activeTab !== tabId) stashSession();
  state.activeTab = tabId;
  state.scene = scene;
  state.mapDoc = opts.docs?.map ?? null;
  state.sceneDoc = opts.docs?.scene ?? null;
  state.editStart = false;
  state.layer = layerFor(state.ws);
  viewVersion++;
  state.mapResource = opts.resource;
  state.mapFileName = opts.fileName;
  state.scenePath = opts.scenePath;
  state.sceneName = opts.sceneName;
  state.round = opts.round ?? 1;
  state.turn = opts.turn ?? 0;
  state.selectedTokenId = null;
  state.selectedZoneId = null;
  clearWallEditing();
  recomputeVision();
  layerInside = charactersInTriggers();
  interiorInside = charactersInHouses();
  state.interiorAsks = [];
  state.effectRuns = {};
  // A scene of its own: its own undo history; the one before keeps its history in its tab.
  history = new History<string>(100);
  clearHistory();
  if (tabId && !state.tabs.some((x) => x.id === tabId)) state.tabs = [...state.tabs, { id: tabId, kind: opts.scenePath ? 'scene' : 'map', name: opts.sceneName }];
  state.sceneVersion++;
  emit();
}

/* ---------- Document tabs (E-30, DC-034) ---------- */

/** An open document: a scene of the campaign (by its path) or a library map on its own (`map:<resource>`). */
export interface DocTab {
  id: string;
  kind: 'scene' | 'map' | 'creature' | 'asset';
  name: string;
  /** Put away with changes not saved yet (the tab shown tells by `dirty`). */
  unsaved?: boolean;
}

export function creatureTabId(creatureId: string): string {
  return `creature:${creatureId}`;
}

/**
 * Opens a library creature as a tab (E-30, DC-034b), shown in the Creatures workspace. The scene
 * or map open stays as it is behind it, the TV too.
 */
export function openCreatureTab(creatureId: string): void {
  const i = state.creatures.findIndex((c) => c.id === creatureId);
  if (i < 0) return;
  const id = creatureTabId(creatureId);
  if (!state.tabs.some((x) => x.id === id)) state.tabs = [...state.tabs, { id, kind: 'creature', name: state.creatures[i].name }];
  state.selectedCreatureIdx = i;
  state.creatureTab = id;
  if (state.ws !== 'creatures') setWorkspace('creatures');
  emit();
}

/** Closes a creature's tab; the one shown gives way to its neighbour (the caller shows that). */
export function closeCreatureTab(id: string): DocTab | null {
  const i = state.tabs.findIndex((x) => x.id === id);
  if (i < 0) return null;
  state.tabs = state.tabs.filter((x) => x.id !== id);
  if (state.creatureTab !== id || state.ws !== 'creatures') {
    if (state.creatureTab === id) state.creatureTab = null;
    emit();
    return null;
  }
  state.creatureTab = null;
  emit();
  // The nearest creature tab takes its place – only in the Creatures workspace (nothing else changes).
  if (state.ws !== 'creatures') return null;
  const creatures = state.tabs.filter((x) => x.kind === 'creature');
  const before = state.tabs.slice(0, i).filter((x) => x.kind === 'creature').length;
  return creatures[Math.min(before, creatures.length - 1)] ?? null;
}

export function mapTabId(resource: string): string {
  return `map:${resource}`;
}

/** What an open document keeps while another tab is shown: its files, its undo history and its unsaved state. */
interface Session {
  scenePath: string | null;
  sceneName: string;
  mapResource: string;
  mapFileName: string;
  imageUrl: string | null;
  sceneDoc: SceneOverride | null;
  mapDoc: MapSidecar | null;
  round: number;
  turn: number;
  editStart: boolean;
  history: History<string>;
  dirty: boolean;
  effectRuns: Record<string, number>;
  interiorAsks: { id: string; name: string }[];
  /** Where the TV is centred on this scene's map (the other table settings belong to the TV). */
  center: { x: number; y: number };
  /** The layer its undo history was recorded in: shown in another one, the history starts anew. */
  layer: ViewLayer;
}

const sessions = new Map<string, Session>();
/** The maps of open scenes by resource: scenes on the same map share its latest edits. */
const openMaps = new Map<string, MapSidecar>();

/** Puts the scene shown away into its tab (its view becomes its files again). */
function stashSession(): void {
  if (!state.activeTab) return;
  dropCalibration();
  commitView();
  if (state.mapDoc) openMaps.set(state.mapResource, state.mapDoc);
  sessions.set(state.activeTab, {
    scenePath: state.scenePath, sceneName: state.sceneName, mapResource: state.mapResource, mapFileName: state.mapFileName, imageUrl: state.scene.map.imageUrl,
    sceneDoc: state.sceneDoc, mapDoc: state.mapDoc, round: state.round, turn: state.turn, editStart: state.editStart, history, dirty: state.dirty,
    effectRuns: state.effectRuns, interiorAsks: state.interiorAsks, center: { x: state.scene.table.centerX, y: state.scene.table.centerY }, layer: state.layer,
  });
  if (state.dirty) {
    const id = state.activeTab;
    state.tabs = state.tabs.map((x) => (x.id === id ? { ...x, unsaved: true } : x));
  }
}

/** The open documents put away with changes not saved yet: their files to write (E-30). */
export function unsavedSessions(): { id: string; mapResource: string; mapDoc: MapSidecar | null; scenePath: string | null; sceneDoc: SceneOverride | null }[] {
  return [...sessions.entries()].filter(([, s]) => s.dirty).map(([id, s]) => ({ id, mapResource: s.mapResource, mapDoc: openMaps.get(s.mapResource) ?? s.mapDoc, scenePath: s.scenePath, sceneDoc: s.sceneDoc }));
}

/** A document put away was saved. */
export function sessionSaved(id: string): void {
  const s = sessions.get(id);
  if (s) s.dirty = false;
  state.tabs = state.tabs.map((x) => (x.id === id && x.unsaved ? { id: x.id, kind: x.kind, name: x.name } : x));
}

/** The newest map of `resource` among the open documents (the one shown first), if one is open. */
export function latestMap(resource: string): MapSidecar | null {
  if (resource === state.mapResource && state.mapDoc) {
    commitView();
    return state.mapDoc;
  }
  return openMaps.get(resource) ?? null;
}

/** Whether a document is open in a tab (shown or not), by tab id. */
export function isSceneOpen(tabId: string): boolean {
  return state.tabs.some((x) => x.id === tabId);
}

/**
 * Shows the open document of tab `tabId` (put away by `stashSession`), in the current workspace's
 * layer; a map on its own always in the Map Forge (E-30).
 */
export function activateSession(tabId: string): boolean {
  const s = sessions.get(tabId);
  if (!s || tabId === state.activeTab) return false;
  stashSession();
  sessions.delete(tabId);
  state.activeTab = tabId;
  if (!s.scenePath && state.ws !== 'forge') {
    state.ws = 'forge';
    state.areaCommand = null;
    state.wallCommand = null;
    state.tool = 'select';
  }
  const mapDoc = openMaps.get(s.mapResource) ?? s.mapDoc;
  state.mapDoc = mapDoc;
  state.sceneDoc = s.sceneDoc;
  state.scenePath = s.scenePath;
  state.sceneName = s.sceneName;
  state.mapResource = s.mapResource;
  state.mapFileName = s.mapFileName;
  state.round = s.round;
  state.turn = s.turn;
  state.editStart = s.editStart;
  state.layer = layerFor(state.ws);
  state.effectRuns = s.effectRuns;
  state.interiorAsks = s.interiorAsks;
  // Undo stays in the layer it was recorded in (as when switching layers): a map edit is not undone in a scene.
  history = s.layer === state.layer ? s.history : new History<string>(100);
  state.canUndo = history.canUndo;
  state.canRedo = history.canRedo;
  const table = { ...state.scene.table, centerX: s.center.x, centerY: s.center.y };
  if (mapDoc) {
    state.scene = sceneFromDocuments(mapDoc, s.sceneDoc, s.imageUrl, table, state.layer);
    state.scene.table = table;
  }
  viewVersion++;
  state.selectedTokenId = null;
  state.selectedZoneId = null;
  state.selectedLightId = null;
  state.selectedAssetId = null;
  clearWallEditing();
  recomputeVision();
  layerInside = charactersInTriggers();
  interiorInside = charactersInHouses();
  state.dirty = s.dirty;
  state.tabs = state.tabs.map((x) => (x.id === tabId && x.unsaved ? { id: x.id, kind: x.kind, name: x.name } : x));
  state.sceneVersion++;
  // What was put away unsaved gets saved soon (autosave).
  if (sessions.size && [...sessions.values()].some((x) => x.dirty)) for (const f of dirtyListeners) f();
  emit();
  return true;
}

/**
 * Closes the tab of `scenePath`: a tab in the background is just dropped (it was saved when it was
 * put away); the one shown gives way to its neighbour, or to no scene. The caller saves first.
 */
export function closeSessionTab(tabId: string): void {
  const i = state.tabs.findIndex((x) => x.id === tabId);
  if (i < 0) return;
  state.tabs = state.tabs.filter((x) => x.id !== tabId);
  // The TV's scene closed: the TV is black until another scene is put there.
  if (tabId === state.tvScenePath) setTvScene(null);
  if (state.tvAsk === tabId) state.tvAsk = null;
  if (tabId !== state.activeTab) {
    sessions.delete(tabId);
    emit();
    return;
  }
  // The nearest scene or map takes its place (a creature or asset tab shows no scene).
  const isDoc = (x: DocTab) => x.kind === 'scene' || x.kind === 'map';
  const docs = state.tabs.filter(isDoc);
  const before = state.tabs.slice(0, i).filter(isDoc).length;
  const next = docs[Math.min(before, docs.length - 1)];
  // Nothing of the closed document is kept: activating the next must not put it away again.
  state.activeTab = null;
  state.scenePath = null;
  if (next && activateSession(next.id)) return;
  replaceScene(emptyScene(state.scene.table), { resource: '', fileName: '', scenePath: null, sceneName: '' });
}

/** All tabs closed (the campaign closes). */
export function clearTabs(): void {
  sessions.clear();
  openMaps.clear();
  state.tabs = [];
  state.activeTab = null;
  state.creatureTab = null;
  state.assetTab = null;
  // Asset drafts belong to the campaign's tabs.
  state.vault.editor = null;
  state.vault.drafts = {};
  state.tvScenePath = null;
  state.tvAsk = null;
}

/** Puts scene `scenePath` on the TV (an open tab), or none (black). */
export function setTvScene(scenePath: string | null): void {
  if (scenePath && !isSceneOpen(scenePath)) return;
  state.tvScenePath = scenePath;
  state.tvAsk = null;
  snapshotTvMap();
  emit();
}

/** The map the TV shows (E-30): the TV scene's map as when it went there or was last taken over. */
let tvMap: MapSidecar | null = null;

/** The map resource of the TV's scene. */
function tvResource(): string | null {
  if (!state.tvScenePath) return null;
  if (state.tvScenePath === state.scenePath) return state.mapResource;
  return sessions.get(state.tvScenePath)?.mapResource ?? null;
}

/** The latest map of an open scene: as being edited if it is shown (its own tab or a tab of the same map). */
function currentMapOf(scenePath: string): MapSidecar | null {
  const resource = scenePath === state.scenePath ? state.mapResource : sessions.get(scenePath)?.mapResource;
  if (!resource) return null;
  if (resource === state.mapResource && state.mapDoc) return state.layer === 'map' ? mapSidecarFromScene(state.scene, state.mapResource, 'map', state.mapDoc) : state.mapDoc;
  const s = sessions.get(scenePath);
  return s ? (openMaps.get(s.mapResource) ?? s.mapDoc) : null;
}

/** The TV takes its scene's map as it is now. */
function snapshotTvMap(): void {
  const map = state.tvScenePath ? currentMapOf(state.tvScenePath) : null;
  tvMap = map ? structuredClone(map) : null;
  state.tvMapPending = false;
  tvCache = null;
  backgroundTv = null;
}

/** "On the TV": the changes of the TV scene's map go there (E-30). */
export function applyMapToTv(): void {
  if (!state.tvMapPending) return;
  snapshotTvMap();
  log('log.mapToTv');
  emit();
}

/** The DM's answer to "this scene on the TV?". */
export function answerTvAsk(yes: boolean): void {
  if (yes && state.tvAsk) setTvScene(state.tvAsk);
  state.tvAsk = null;
  emit();
}

/** The scene the soundboard plays (E-30): the TV's, else – with nothing on the TV – the scene shown. */
export function soundScene(): string | null {
  return state.tvScenePath ?? state.scenePath;
}

/** The scene file of an open scene, shown or in its tab. */
export function openSceneDoc(scenePath: string): SceneOverride | null {
  if (scenePath === state.scenePath) return state.sceneDoc;
  return sessions.get(scenePath)?.sceneDoc ?? null;
}


/* ---------- Workspace & tools ---------- */

/** The Map Forge edits the map; every other workspace the scene (E-16). */
export function layerFor(ws: WorkspaceId): ViewLayer {
  if (ws === 'forge') return 'map';
  return ws === 'play' && state.editStart ? 'start' : 'scene';
}

/** The ambience playing now, as a scene file stores it. */
function playingAmbience(): { path: string; volume: number }[] {
  return state.soundboard.ambience.filter((a) => a.playing).map((a) => ({ path: a.id, volume: a.volume }));
}

/**
 * Takes what the view shows into the document of its layer: the map, the scene's play state, or
 * its start state. The ambience playing belongs to the start while "edit start state" is on,
 * else to the play state.
 */
export function commitView(): void {
  if (!state.mapDoc) return;
  const { map, ov } = docsFromView();
  if (state.sceneDoc) state.sceneDoc = ov;
  state.mapDoc = map;
}

/**
 * The files for what the view shows, as saving writes them – the map's and the scene's; undo
 * snapshots are taken the same way. A view without a scene file gives one from the view alone.
 */
function docsFromView(): { map: MapSidecar; ov: SceneOverride | null } {
  // A grid being calibrated is only a preview until OK.
  const cal = state.calibration;
  const s = cal ? { ...state.scene, map: { ...state.scene.map, grid: cal.before } } : state.scene;
  const map = mapSidecarFromScene(s, state.mapResource, state.layer, state.mapDoc);
  const doc = state.sceneDoc;
  // The soundboard plays the TV's scene (E-30): another scene shown keeps its own ambience.
  const live = state.scenePath !== null && state.scenePath === soundScene();
  if (state.layer !== 'map') {
    const fromView = sceneOverrideFromScene(s, state.sceneName, mapSidecarPath(state.mapResource), { round: state.round, turn: state.turn }, map, previousLayer(doc));
    if (!doc) return { map, ov: fromView };
    if (state.layer === 'start') return { map, ov: commitStart(doc, fromView, live ? playingAmbience() : startOf(doc).ambience) };
    return { map, ov: { ...fromView, ambience: state.editStart || !live ? doc.ambience : playingAmbience(), ...(doc.start ? { start: doc.start } : {}) } };
  }
  if (!doc) return { map, ov: null };
  if (!live) return { map, ov: doc };
  return { map, ov: state.editStart ? { ...doc, start: { ...startOf(doc), ambience: playingAmbience() } } : { ...doc, ambience: playingAmbience() } };
}

/** Builds the view of the current layer from the documents (after a reset, a new start …). */
export function refreshView(): void {
  if (!state.mapDoc) return;
  viewVersion++;
  const table = state.scene.table;
  state.scene = sceneFromDocuments(state.mapDoc, state.sceneDoc, state.scene.map.imageUrl, table, state.layer);
  state.scene.table = table;
  if (state.sceneDoc && state.layer === 'scene') {
    state.round = state.sceneDoc.combat.round;
    state.turn = state.sceneDoc.combat.turn;
  }
  state.selectedTokenId = null;
  state.selectedZoneId = null;
  state.selectedLightId = null;
  clearWallEditing();
  recomputeVision();
}

/** Shows another layer: the map alone (Map Forge), the scene's play state, or its start state. */
export function showLayer(layer: ViewLayer): void {
  if (layer === state.layer) return;
  dropCalibration();
  commitView();
  state.layer = layer;
  viewVersion++;
  if (!state.mapDoc) return;
  const table = state.scene.table;
  state.scene = sceneFromDocuments(state.mapDoc, state.sceneDoc, state.scene.map.imageUrl, table, layer);
  state.scene.table = table;
  state.selectedTokenId = null;
  state.selectedZoneId = null;
  state.selectedLightId = null;
  clearWallEditing();
  recomputeVision();
  layerInside = charactersInTriggers();
  interiorInside = charactersInHouses();
  state.interiorAsks = [];
  clearHistory();
}

export function setWorkspace(ws: WorkspaceId): void {
  // The Map Forge or the Orchestrator was the last place for scenes and maps (tabs go back there).
  if (ws === 'forge' || ws === 'play') state.sceneWs = ws;
  // A map on its own is edited in the Map Forge only (E-30): the Orchestrator shows a scene – the
  // TV's, else the last scene tab.
  const tab = state.tabs.find((x) => x.id === state.activeTab);
  if (ws === 'play' && tab?.kind === 'map') {
    const scene = state.tabs.find((x) => x.id === state.tvScenePath) ?? [...state.tabs].reverse().find((x) => x.kind === 'scene');
    state.ws = ws;
    state.areaCommand = null;
    state.wallCommand = null;
    state.tool = 'select';
    if (!(scene && activateSession(scene.id))) {
      // No scene open: nothing to show there; the map stays in its tab.
      replaceScene(emptyScene(state.scene.table), { resource: '', fileName: '', scenePath: null, sceneName: '' });
    }
    emit();
    return;
  }
  state.ws = ws;
  state.areaCommand = null;
  state.wallCommand = null;
  state.tool = 'select';
  showLayer(layerFor(ws));
  emit();
}

export function setTool(tool: ToolId): void {
  // One command at a time: another tool ends "create area" and "draw walls".
  if (tool !== 'area') state.areaCommand = null;
  if (tool !== 'wall') state.wallCommand = null;
  if (tool !== 'calibrate') dropCalibration();
  state.tool = tool;
  emit();
}

export function toggle(key: 'snap' | 'showGrid' | 'viewAsPlayer' | 'dmSeeThrough' | 'roofsSeeThrough' | 'moveLock'): void {
  state[key] = !state[key];
  emit();
}

export function setFogOption(key: 'memoryOpacity' | 'brushCells', v: number): void {
  state[key] = v;
  emit();
}

/** Device fog settings, stored like in Dungeon-Manager (`dm.fog.*` keys in local storage). */
export function setFogLook(patch: Partial<FogLook>): void {
  const st = typeof localStorage === 'undefined' ? undefined : localStorage;
  if (patch.softEdges !== undefined) saveSoftEdges(st, patch.softEdges);
  if (patch.fadeSeconds !== undefined) saveFadeSeconds(st, patch.fadeSeconds);
  if (patch.quality !== undefined) saveFogQuality(st, patch.quality as FogQuality);
  if (patch.edge !== undefined) saveFogEdge(st, patch.edge);
  if (patch.motion !== undefined) saveFogMotion(st, patch.motion);
  if (patch.speed !== undefined) saveFogSpeed(st, patch.speed);
  if (patch.coverFrom !== undefined) saveCoverFrom(st, patch.coverFrom as CoverFrom);
  state.fogLook = readFogLook(st);
  emit();
}

export function toggleDmFog(): void {
  state.dmFogHidden = !state.dmFogHidden;
  emit();
}

/* ---------- Scene edits ---------- */

let lastRemember = 0;
/**
 * Recomputes token sight. What players see becomes memory fog once they leave it; the union is
 * throttled while dragging and always done for a final position.
 */
let visionCost = 0;
let visionAt = 0;

export function recomputeVision(final = true): void {
  // While dragging, a slow computation (many masks) runs less often; the final position always.
  if (!final && Date.now() - visionAt < visionCost * 2) return;
  const started = performance.now();
  const extras = assetExtras(state.scene);
  const seen = withAssetDoors(state.scene);
  state.vision = updateVision(seen, extras);
  state.visible = visiblePolygons(state.vision);
  state.lights = litSources(seen, extras);
  visionCost = performance.now() - started;
  visionAt = Date.now();
  const now = Date.now();
  if (final || now - lastRemember > 150) {
    state.scene.fog = rememberSeen(state.scene.fog, state.visible);
    lastRemember = now;
  }
  state.fogQuick = true;
}

export function snapPoint(p: Point): Point {
  return state.snap ? snapToCell(state.scene.map.grid, p) : p;
}

export function moveToken(id: string, p: Point, final: boolean): void {
  const t = state.scene.tokens.find((x) => x.id === id);
  if (!t) return;
  const q = final ? snapPoint(p) : p;
  t.x = q.x;
  t.y = q.y;
  if (t.kind === 'pc') recomputeVision(final);
  // A character that stepped into or out of a trigger area switches its layer (E-28).
  if (final && t.kind === 'pc') applyLayerTriggers();
  // Likewise a house with an interior (E-29).
  if (final && t.kind === 'pc') applyInteriorTriggers();
  emit();
}

export function toggleDoor(id: string): void {
  if (assetDoors(state.scene).some((d) => d.id === id)) {
    // An asset's door (E-29): scene state.
    checkpoint();
    const open = !state.scene.assetDoorsOpen[id];
    state.scene.assetDoorsOpen = { ...state.scene.assetDoorsOpen, [id]: open };
    log(open ? 'log.doorOpened' : 'log.doorClosed');
    recomputeVision();
    emit();
    return;
  }
  const w = state.scene.walls.find((x) => x.id === id);
  if (!w || (w.kind !== 'door' && w.kind !== 'secret-door')) return;
  checkpoint();
  w.open = !w.open;
  log(w.open ? 'log.doorOpened' : 'log.doorClosed');
  recomputeVision();
  emit();
}

/* ---------- "Draw walls" command and editing walls (DC-014) ---------- */

/** The running "draw walls" command: options and the walls drawn so far (not saved yet). */
export interface WallCommand {
  kind: WallKind;
  /** Each click continues from the last point; off: two clicks per piece. */
  chain: boolean;
  /** Cliffs: saved the other way round, so the upper side is right of the drawing direction. */
  flip: boolean;
  /** Drawn pieces; they get their ids on OK. */
  walls: Omit<Wall, 'id'>[];
  /** Where the next piece starts, if one was begun. */
  start: Point | null;
}

/** Walls, windows and cliffs run on; doors are placed one by one. */
function chainsByDefault(kind: WallKind): boolean {
  return kind === 'wall' || kind === 'window' || kind === 'cliff';
}

function reversed<T extends Pick<Wall, 'x1' | 'y1' | 'x2' | 'y2'>>(w: T): T {
  return { ...w, x1: w.x2, y1: w.y2, x2: w.x1, y2: w.y1 };
}

/** A different scene or layer is shown: running Map Forge commands and the wall selection end. */
function clearWallEditing(): void {
  state.wallCommand = null;
  state.selectedWallIds = [];
  state.selectedAssetId = null;
  state.calibration = null;
}

/** Starts "draw walls" in the Map Forge (one command at a time: another tool ends it). */
export function startWallCommand(): void {
  if (state.layer !== 'map') return;
  const kind = state.wallCommand?.kind ?? 'wall';
  state.wallCommand = { kind, chain: chainsByDefault(kind), flip: false, walls: [], start: null };
  state.areaCommand = null;
  dropCalibration();
  state.tool = 'wall';
  emit();
}

/** Changes the command's options; a new kind brings its own chain default unless `chain` is given. */
export function updateWallCommand(patch: Partial<Pick<WallCommand, 'kind' | 'chain' | 'flip'>>): void {
  const c = state.wallCommand;
  if (!c) return;
  const chain = patch.chain ?? (patch.kind && patch.kind !== c.kind ? chainsByDefault(patch.kind) : c.chain);
  state.wallCommand = { ...c, ...patch, chain, start: chain ? c.start : null };
  emit();
}

/** A click on the map: starts a piece, or ends it there (and goes on from there in a chain). */
export function addWallPoint(p: Point): void {
  const c = state.wallCommand;
  if (!c) return;
  if (!c.start) {
    state.wallCommand = { ...c, start: p };
  } else if (Math.hypot(c.start.x - p.x, c.start.y - p.y) >= 2) {
    const piece: Omit<Wall, 'id'> = { kind: c.kind, x1: c.start.x, y1: c.start.y, x2: p.x, y2: p.y, ...(c.kind === 'door' || c.kind === 'secret-door' ? { open: false } : {}) };
    state.wallCommand = { ...c, walls: [...c.walls, piece], start: c.chain ? p : null };
  }
  emit();
}

/** Esc, double-click: the chain ends; the next click starts a new one. */
export function endWallChain(): void {
  const c = state.wallCommand;
  if (!c?.start) return;
  state.wallCommand = { ...c, start: null };
  emit();
}

/** Takes the last drawn piece back (its start is where drawing goes on). */
export function undoWallPoint(): void {
  const c = state.wallCommand;
  if (!c) return;
  const last = c.walls.at(-1);
  if (!last) {
    state.wallCommand = { ...c, start: null };
  } else {
    state.wallCommand = { ...c, walls: c.walls.slice(0, -1), start: c.chain ? { x: last.x1, y: last.y1 } : null };
  }
  emit();
}

/** OK: adds the drawn walls to the map under new random ids, as one undoable step. */
export function finishWallCommand(): boolean {
  const c = state.wallCommand;
  if (!c || state.layer !== 'map') return false;
  if (c.walls.length > 0) {
    checkpoint();
    const ids: string[] = [];
    for (const w of c.walls) {
      const id = freshId('wall');
      // Pieces are kept in click order while drawing; "flip" applies to the cliffs on OK.
      state.scene.walls.push({ ...(c.flip && w.kind === 'cliff' ? reversed(w) : w), id, ...onCurrentLayer() });
      ids.push(id);
    }
    state.selectedWallIds = ids;
    log('log.wallsAdded', { n: ids.length });
    recomputeVision();
  }
  state.wallCommand = null;
  state.tool = 'select';
  emit();
  return true;
}

export function cancelWallCommand(): void {
  if (!state.wallCommand) return;
  state.wallCommand = null;
  if (state.tool === 'wall') state.tool = 'select';
  emit();
}

/** Selects a wall of the map; `toggle` (Shift) adds it to the selection or takes it out. */
export function selectWall(id: string | null, toggle = false): void {
  if (state.layer !== 'map') return;
  const sel = state.selectedWallIds;
  if (id !== null) state.selectedAssetId = null;
  if (id === null) state.selectedWallIds = toggle ? sel : [];
  else if (toggle) state.selectedWallIds = sel.includes(id) ? sel.filter((x) => x !== id) : [...sel, id];
  else state.selectedWallIds = [id];
  emit();
}

/** Selects every wall joined to `id` end to end (double-click). */
export function selectWallChain(id: string): void {
  if (state.layer !== 'map') return;
  state.selectedWallIds = chainOf(state.scene.walls, id);
  emit();
}

/**
 * Moves wall ends (a joint) live while dragging; `done` drops walls whose ends met. The caller
 * sets a checkpoint when the drag starts, so the whole drag is one undoable step.
 */
export function moveWallEnds(ends: readonly WallEnd[], to: Point, done: boolean): void {
  if (state.layer !== 'map' || ends.length === 0) return;
  const moved = moveEnds(state.scene.walls, ends, to);
  state.scene.walls = done ? withoutDegenerate(moved) : moved;
  if (done) {
    const left = new Set(state.scene.walls.map((w) => w.id));
    state.selectedWallIds = state.selectedWallIds.filter((id) => left.has(id));
  }
  markDirty();
  recomputeVision(done);
  emit();
}

/** Changes the kind of the selected walls (one step); doors start closed. */
export function setWallKind(kind: WallKind): void {
  const sel = new Set(state.selectedWallIds);
  if (state.layer !== 'map' || sel.size === 0) return;
  checkpoint();
  state.scene.walls = state.scene.walls.map((w) => {
    if (!sel.has(w.id)) return w;
    const { open: _open, ...rest } = w;
    return kind === 'door' || kind === 'secret-door' ? { ...rest, kind, open: false } : { ...rest, kind };
  });
  recomputeVision();
  emit();
}

/** Turns the selected cliffs round (one step): their upper and lower sides swap. */
export function flipSelectedCliffs(): void {
  const sel = new Set(state.selectedWallIds);
  if (state.layer !== 'map' || !state.scene.walls.some((w) => sel.has(w.id) && w.kind === 'cliff')) return;
  checkpoint();
  state.scene.walls = state.scene.walls.map((w) => (sel.has(w.id) && w.kind === 'cliff' ? reversed(w) : w));
  recomputeVision();
  emit();
}

/** Deletes the selected walls (one step). Scene overrides of them stay in their files, orphaned. */
export function deleteSelectedWalls(): void {
  const sel = new Set(state.selectedWallIds);
  if (state.layer !== 'map' || sel.size === 0) return;
  checkpoint();
  state.scene.walls = removeWalls(state.scene.walls, sel);
  state.selectedWallIds = [];
  log('log.wallsDeleted', { n: sel.size });
  recomputeVision();
  emit();
}

/* ---------- "Create area" command (DC-013) ---------- */

/** The running "create area" or "edit area" command: options and shape so far (not saved yet). */
export interface AreaCommand {
  /** The area being edited; `null` creates a new one. */
  areaId: string | null;
  tool: AreaTool;
  /** Whether a drawn part is added to the shape or cut out of it. */
  op: 'add' | 'subtract';
  name: string;
  secret: boolean;
  /** The area's own fog look; none uses the map's. */
  biome: FogBiome | null;
  color: string;
  shape: Polygon[];
}

const AREA_COLOR = '#7fd9cf';

/**
 * Starts "create area" – or "edit area" for `areaId` – in the Map Forge (one command at a time:
 * another tool ends it).
 */
export function startAreaCommand(areaId?: string): void {
  if (state.layer !== 'map') return;
  const z = areaId ? state.scene.zones.find((q) => q.id === areaId) : undefined;
  if (areaId && !z) return;
  state.areaCommand = z
    ? { areaId: z.id, tool: 'rect', op: 'add', name: z.name, secret: z.secret, biome: z.biome ?? null, color: z.color, shape: z.shape }
    : { areaId: null, tool: 'rect', op: 'add', name: '', secret: false, biome: null, color: AREA_COLOR, shape: [] };
  if (z) state.selectedZoneId = z.id;
  state.tool = 'area';
  state.wallCommand = null;
  dropCalibration();
  emit();
}

export function updateAreaCommand(patch: Partial<Omit<AreaCommand, 'shape'>>): void {
  if (!state.areaCommand) return;
  state.areaCommand = { ...state.areaCommand, ...patch };
  emit();
}

/** A part drawn on the map: added to the shape or cut out of it (not undoable step by step: OK saves all). */
export function drawAreaPart(part: Polygon | null): void {
  const c = state.areaCommand;
  if (!c || !part) return;
  state.areaCommand = { ...c, shape: c.op === 'add' ? addShape(c.shape, part) : subtractShape(c.shape, part) };
  emit();
}

/** Why OK is not possible yet, if so. */
export function areaCommandProblem(c: AreaCommand): 'name' | 'shape' | null {
  if (!c.name.trim()) return 'name';
  if (c.shape.length === 0) return 'shape';
  return null;
}

/** A corner of the shape moved (live while dragging; `done` cleans the shape up at the end). */
export function moveAreaCorner(at: VertexRef, to: Point, done: boolean): void {
  const c = state.areaCommand;
  if (!c) return;
  const moved = moveVertex(c.shape, at, to);
  state.areaCommand = { ...c, shape: done ? normalizeShape(moved) : moved };
  emit();
}

/** OK: saves the new area under a new random id, or the edited one, as one undoable step. */
export function finishAreaCommand(): boolean {
  const c = state.areaCommand;
  if (!c || areaCommandProblem(c) || state.layer !== 'map') return false;
  const fields = { name: c.name.trim(), shape: c.shape, secret: c.secret, color: c.color };
  const existing = c.areaId ? state.scene.zones.find((z) => z.id === c.areaId) : undefined;
  if (c.areaId && !existing) return false;
  checkpoint();
  let id: string;
  if (existing) {
    id = existing.id;
    Object.assign(existing, fields, { discovered: !c.secret || existing.discovered });
    if (c.biome) existing.biome = c.biome;
    else delete existing.biome;
    log('log.areaChanged', { name: fields.name });
  } else {
    id = freshId('area');
    state.scene.zones.push({ id, ...fields, ...(c.biome ? { biome: c.biome } : {}), discovered: !c.secret, ...onCurrentLayer() });
    log('log.areaCreated', { name: fields.name });
  }
  state.selectedZoneId = id;
  state.areaCommand = null;
  state.tool = 'select';
  recomputeVision();
  emit();
  return true;
}

/* ---------- Layers in the Map Forge (E-28, DC-101) ---------- */

/** New elements of the Map Forge go on the current layer (none: the base layer). */
function onCurrentLayer(): { layer?: string } {
  return state.layer === 'map' && state.currentLayer !== BASE_LAYER && state.scene.map.layers.some((l) => l.id === state.currentLayer) ? { layer: state.currentLayer } : {};
}

/** Whether an element can be seen and changed in the Map Forge: its layer is neither hidden in the editor nor locked. */
export function editableInForge(el: { layer?: string }): boolean {
  if (!el.layer) return true;
  const l = state.scene.map.layers.find((x) => x.id === el.layer);
  return !l || (!l.editorHidden && !l.locked);
}

/** Whether a click may pick the element here: in the Map Forge only on layers neither hidden nor locked. */
export function editableHere(el: { layer?: string }): boolean {
  return state.layer !== 'map' || editableInForge(el);
}

/** Whether an element is drawn in the Map Forge (its layer not hidden in the editor). */
export function shownInForge(el: { layer?: string }): boolean {
  if (!el.layer) return true;
  return !state.scene.map.layers.find((x) => x.id === el.layer)?.editorHidden;
}

/** A new layer on top of the others, made current (one undoable step). */
export function createLayer(name: string): string | null {
  if (state.layer !== 'map' || !name.trim()) return null;
  checkpoint();
  const layers = state.scene.map.layers;
  const taken = new Set([BASE_LAYER, ...layers.map((l) => l.id)]);
  const id = newId(slugId(name, 'layer').slice(0, 40), (x) => taken.has(x));
  layers.push({ id, name: name.trim(), height: Math.max(0, ...layers.map((l) => l.height)) + 1, defaultActive: true, editorHidden: false, locked: false });
  state.currentLayer = id;
  emit();
  return id;
}

export function setCurrentLayer(id: string): void {
  state.currentLayer = id === BASE_LAYER || state.scene.map.layers.some((l) => l.id === id) ? id : BASE_LAYER;
  emit();
}

export type LayerPatch = Partial<Pick<MapLayer, 'name' | 'height' | 'defaultActive' | 'trigger' | 'counter' | 'editorHidden' | 'locked'>>;

/**
 * Changes a layer (one undoable step). A counter layer is mutual: setting one links both ways and
 * unlinks what either was linked to before; `undefined` in the patch removes a setting.
 */
export function updateLayer(id: string, patch: LayerPatch): void {
  if (state.layer !== 'map') return;
  const layers = state.scene.map.layers;
  const l = layers.find((x) => x.id === id);
  if (!l) return;
  checkpoint();
  const { counter, ...rest } = patch;
  if ('counter' in patch) {
    const byId = (x: string | undefined) => layers.find((y) => y.id === x);
    // Unlink this layer and the new partner from whatever they were paired with.
    for (const one of [l, byId(counter)]) {
      if (!one) continue;
      const old = byId(one.counter);
      if (old?.counter === one.id) delete old.counter;
      delete one.counter;
    }
    const partner = counter !== id ? byId(counter) : undefined;
    if (partner) {
      l.counter = partner.id;
      partner.counter = id;
    }
  }
  for (const [k, v] of Object.entries(rest) as [keyof LayerPatch, unknown][]) {
    if (v === undefined) delete l[k];
    else (l as Record<string, unknown>)[k] = v;
  }
  emit();
}

/** Swaps a layer's height with its neighbour above or below. */
export function moveLayer(id: string, dir: 'up' | 'down'): void {
  if (state.layer !== 'map') return;
  const sorted = [...state.scene.map.layers].sort((a, b) => a.height - b.height);
  const i = sorted.findIndex((l) => l.id === id);
  const j = dir === 'up' ? i + 1 : i - 1;
  if (i < 0 || j < 0 || j >= sorted.length) return;
  checkpoint();
  [sorted[i].height, sorted[j].height] = [sorted[j].height, sorted[i].height];
  if (sorted[i].height === sorted[j].height) sorted[dir === 'up' ? i : j].height += 1;
  emit();
}

/** Deletes a layer: its elements go on the base layer; links to it as counter layer go too. */
export function deleteLayer(id: string): void {
  if (state.layer !== 'map' || !state.scene.map.layers.some((l) => l.id === id)) return;
  checkpoint();
  const sc = state.scene;
  sc.map.layers = sc.map.layers.filter((l) => l.id !== id);
  for (const l of sc.map.layers) if (l.counter === id) delete l.counter;
  for (const el of [...sc.walls, ...sc.zones, ...sc.lights, ...sc.map.assets]) if (el.layer === id) delete el.layer;
  if (state.currentLayer === id) state.currentLayer = BASE_LAYER;
  recomputeVision();
  emit();
}

/** Moves map elements (walls, areas, lights, placed assets) onto a layer (one undoable step). */
export function setElementsLayer(ids: readonly string[], layerId: string): void {
  if (state.layer !== 'map') return;
  const want = new Set(ids);
  const sc = state.scene;
  const target = layerId !== BASE_LAYER && sc.map.layers.some((l) => l.id === layerId) ? layerId : null;
  checkpoint();
  for (const el of [...sc.walls, ...sc.zones, ...sc.lights, ...sc.map.assets]) {
    if (!want.has(el.id)) continue;
    if (target) el.layer = target;
    else delete el.layer;
  }
  emit();
}

/* ---------- Layers in a scene (E-28, DC-101) ---------- */

/** Layers whose trigger area has a living character in it now: switching happens on entering and leaving. */
let layerInside = new Set<string>();

function triggerAreas(): Map<string, Polygon[]> {
  // The map's areas, also those a scene hides: a trigger is the DM's tool, not something players see.
  return new Map((state.mapDoc?.zones ?? []).map((z) => [z.id, z.shape]));
}

function characters(): Point[] {
  return state.scene.tokens.filter((t) => t.kind === 'pc' && t.hp > 0);
}

function charactersInTriggers(): Set<string> {
  if (state.layer === 'map') return new Set();
  return triggerChanges(state.scene.map.layers, triggerAreas(), characters(), new Set()).inside;
}

function layerActive(id: string): boolean {
  return activeLayers(state.scene.map.layers, state.scene.layersOn).has(id);
}

/**
 * Switches a layer in this scene (its counter layer goes the other way), one undoable step: while
 * editing the start state for the start, else for the play state.
 */
export function setLayerActive(id: string, on: boolean): void {
  const l = state.scene.map.layers.find((x) => x.id === id);
  if (state.layer === 'map' || !state.sceneDoc || !l) return;
  checkpoint();
  commitView();
  const doc = state.sceneDoc;
  const change: Record<string, boolean> = { [id]: on, ...(l.counter ? { [l.counter]: !on } : {}) };
  if (state.layer === 'start') {
    const start = startOf(doc);
    state.sceneDoc = { ...doc, start: { ...start, layers: { ...start.layers, ...change } } };
  } else {
    state.sceneDoc = { ...doc, layers: { ...doc.layers, ...change } };
  }
  // The view is rebuilt from the files; the selected token stays selected.
  const selected = state.selectedTokenId;
  refreshView();
  state.selectedTokenId = selected;
  log(on ? 'log.layerOn' : 'log.layerOff', { name: l.name });
  emit();
}

function applyLayerTriggers(): void {
  if (state.layer === 'map' || !state.scene.map.layers.some((l) => l.trigger)) return;
  const r = triggerChanges(state.scene.map.layers, triggerAreas(), characters(), layerInside);
  layerInside = r.inside;
  for (const id of r.on) if (!layerActive(id)) setLayerActive(id, true);
  for (const id of r.off) if (layerActive(id)) setLayerActive(id, false);
}

/* ---------- Assets placed on the map (DC-041) ---------- */

/** A library asset as placements need it: its size, variant group, picture (URL) and what it brings. */
export interface AssetInfo {
  name: string;
  kind: AssetKind;
  sizeCells?: { w: number; h: number };
  group?: string;
  /** Asset-protocol URL of the file; null until known or when the file is gone. */
  url: string | null;
  video: boolean;
  cover?: AssetSidecar['cover'];
  light?: AssetSidecar['light'];
  effect?: AssetSidecar['effect'];
  anchor?: AssetSidecar['anchor'];
  door?: AssetSidecar['door'];
  interior?: AssetSidecar['interior'];
}

export function setAssetInfo(info: Record<string, AssetInfo>): void {
  state.assetInfo = info;
  // Who is in which house needs the houses' sizes and triggers: a campaign opened before the
  // library was read would otherwise count everyone inside as just entered on the first move.
  interiorInside = charactersInHouses();
  // Masks and lights of placed assets may have changed (DC-108) – here and in the TV's view.
  viewVersion++;
  recomputeVision();
  emit();
}

/** A placed asset's file URL became known: only drawing changes, not sight. */
export function setAssetUrl(path: string, url: string): void {
  const cur = state.assetInfo[path];
  if (!cur) return;
  state.assetInfo = { ...state.assetInfo, [path]: { ...cur, url } };
  emit();
}

/** What the scene's shown placed assets add to sight and light: their masks and lights (DC-108). */
export function assetExtras(scene: Scene): VisionExtras {
  const placed = allPlacements(scene);
  if (!placed.length) return {};
  // The same lists while nothing changed: sight and light keep what they built for them.
  const g = scene.map.grid;
  const key = `${g.cellWidth},${g.cellHeight}|${placed.map((a) => `${a.assetPath},${a.x},${a.y},${a.rotation},${a.scale}`).join(';')}|${JSON.stringify(scene.assetLightsOn)}|${JSON.stringify(scene.interiorsOn)}`;
  if (extrasCache && extrasCache.key === key && extrasCache.info === state.assetInfo) return extrasCache.extras;
  // An asset's light may be switched off in the scene (DC-110).
  const lights = placementLights(placed, state.assetInfo, g).map((l) => ({ ...l, on: scene.assetLightsOn[l.id] ?? true }));
  // A house showing its interior has no cover mask: its inner walls count instead (E-29).
  const covered = placed.filter((a) => !(scene.interiorsOn[a.id] && state.assetInfo[a.assetPath]?.interior));
  const extras = { covers: placementCovers(covered, state.assetInfo, g), lights };
  extrasCache = { key, info: state.assetInfo, extras };
  return extras;
}

let extrasCache: { key: string; info: Record<string, AssetInfo>; extras: VisionExtras } | null = null;

/* ---------- Interiors (E-29, DC-042) ---------- */

let interiorInside = new Set<string>();

function charactersInHouses(): Set<string> {
  if (state.layer === 'map') return new Set();
  return interiorChanges(allPlacements(state.scene), state.assetInfo, state.scene.map.grid, characters(), new Set()).inside;
}

/** Shows a house's interior or its outside, one undoable step (scene state; the Map Forge shows outsides). */
export function setInterior(id: string, on: boolean): void {
  const a = allPlacements(state.scene).find((x) => x.id === id);
  const info = a && state.assetInfo[a.assetPath];
  if (state.layer === 'map' || !a || !info?.interior || !!state.scene.interiorsOn[id] === on) return;
  checkpoint();
  state.scene.interiorsOn = { ...state.scene.interiorsOn, [id]: on };
  // Inside is unexplored until seen from inside (DM decision 2026-11-25): seeing the roof from
  // outside remembered the whole footprint, which would show the floor plan dimmed on the TV.
  if (on) state.scene.fog = forgetIn(state.scene.fog, footprintPolygon(a, info.sizeCells, state.scene.map.grid));
  state.interiorAsks = state.interiorAsks.filter((x) => x.id !== id);
  log(on ? 'log.interiorOn' : 'log.interiorOff', { name: info.name });
  recomputeVision();
  emit();
}

/** A placed house's own interior trigger, or none for its asset's (one undoable step). */
export function setPlacementInteriorTrigger(id: string, trigger: InteriorTrigger | undefined): void {
  const a = placed(id);
  if (!a) return;
  checkpoint();
  if (trigger) a.interiorTrigger = { ...trigger };
  else delete a.interiorTrigger;
  markDirty();
  emit();
}

/** The DM's answer to "show the interior?" after a player character came in. */
export function answerInteriorAsk(id: string, yes: boolean): void {
  if (yes) setInterior(id, true);
  state.interiorAsks = state.interiorAsks.filter((x) => x.id !== id);
  emit();
}

/** After a player character moved: houses they came into show their interior (or ask first), houses all left their outside. */
function applyInteriorTriggers(): void {
  if (state.layer === 'map') return;
  const placed = allPlacements(state.scene);
  const r = interiorChanges(placed, state.assetInfo, state.scene.map.grid, characters(), interiorInside);
  interiorInside = r.inside;
  for (const id of r.entered) {
    const p = placed.find((x) => x.id === id)!;
    const i = interiorOf(p, state.assetInfo)!;
    if (state.scene.interiorsOn[id]) continue;
    if (i.trigger.confirm) {
      if (!state.interiorAsks.some((x) => x.id === id)) state.interiorAsks = [...state.interiorAsks, { id, name: state.assetInfo[p.assetPath]?.name ?? id }];
    } else setInterior(id, true);
  }
  for (const id of r.left) {
    const p = placed.find((x) => x.id === id);
    state.interiorAsks = state.interiorAsks.filter((x) => x.id !== id);
    if (p && interiorOf(p, state.assetInfo)?.trigger.leaveOff) setInterior(id, false);
  }
}

/** The walls sight and light use (E-29): the scene's, cut open where placed assets bring doors, plus those doors. */
export function sightWalls(scene: Scene): readonly Wall[] {
  const placed = allPlacements(scene);
  const inner = interiorWalls(placed, state.assetInfo, scene.map.grid, scene.interiorsOn, scene.assetDoorsOpen);
  return wallsWithAssetDoors(scene.walls, placed, state.assetInfo, scene.map.grid, scene.assetDoorsOpen, inner);
}

/** The scene with the walls sight and light use (itself if no asset brings a door). */
export function withAssetDoors(scene: Scene): Scene {
  const walls = sightWalls(scene);
  // The list itself, not a copy: sight and light keep what they computed for the same list.
  return walls === scene.walls ? scene : { ...scene, walls: walls as Wall[] };
}

/** The doors placed assets bring – door assets and shown interiors – as walls. */
export function assetDoors(scene: Scene): Wall[] {
  const placed = allPlacements(scene);
  const inner = interiorWalls(placed, state.assetInfo, scene.map.grid, scene.interiorsOn, scene.assetDoorsOpen).filter((w) => w.kind === 'door');
  return [...assetDoorWalls(placed, state.assetInfo, scene.map.grid, scene.assetDoorsOpen), ...inner];
}

function footprint(a: MapAssetPlacement) {
  return footprintOf(a, state.assetInfo[a.assetPath]?.sizeCells, state.scene.map.grid);
}

/** The placed asset at `p` (the topmost), if any. */
export function placedAssetAt(p: Point): string | null {
  const hit = [...drawOrder(editableAssets(), state.scene.map.layers)].reverse().find((a) => editableHere(a) && hitsPlacement(footprint(a), p));
  return hit?.id ?? null;
}

/**
 * Where a placement dropped with its centre at `p` comes to lie: an anchored asset (E-29) snaps
 * its anchor – onto a near wall if the asset says so, turned along it – else the footprint snaps.
 */
function snappedPlace(a: Pick<MapAssetPlacement, 'assetPath' | 'scale' | 'rotation'>, p: Point): { x: number; y: number; rotation: number } {
  if (!state.snap) return { ...p, rotation: a.rotation };
  const info = state.assetInfo[a.assetPath];
  const walls = state.scene.walls.filter((w) => w.kind !== 'cliff');
  return snapAnchored({ ...p, rotation: a.rotation, scale: a.scale }, info ?? {}, state.scene.map.grid, walls)
    ?? { ...snapPlacement(state.scene.map.grid, p, info?.sizeCells, a.scale, a.rotation), rotation: a.rotation };
}

/**
 * The placed assets this view edits: the map's in the Map Forge, the scene's own elsewhere – while
 * editing the start state those of the start, else those of the play state (DC-110).
 */
export function editableAssets(): MapAssetPlacement[] {
  return state.layer === 'map' ? state.scene.map.assets : state.scene.ownAssets;
}

function setEditableAssets(list: MapAssetPlacement[]): void {
  if (state.layer === 'map') state.scene.map.assets = list;
  else state.scene.ownAssets = list;
}

/** Places a library asset at `p` (snapped to the grid), as one undoable step: on the map in the Map Forge, else in the scene. */
export function placeAsset(assetPath: string, p: Point): string | null {
  checkpoint();
  const id = freshId('asset');
  const at = snappedPlace({ assetPath, scale: 1, rotation: 0 }, p);
  editableAssets().push({ id, assetPath, x: at.x, y: at.y, rotation: at.rotation, scale: 1, ...onCurrentLayer() });
  state.selectedAssetId = id;
  state.selectedWallIds = [];
  state.selectedZoneId = null;
  rememberRecentAsset(assetPath);
  log(state.layer === 'map' ? 'log.assetPlaced' : 'log.assetPlacedScene', { name: state.assetInfo[assetPath]?.name ?? assetPath });
  recomputeVision();
  emit();
  return id;
}

export function selectPlacedAsset(id: string | null): void {
  if (id && !editableAssets().some((a) => a.id === id)) return;
  state.selectedAssetId = id;
  if (id) {
    state.selectedWallIds = [];
    state.selectedZoneId = null;
  }
  emit();
}

function placed(id: string): MapAssetPlacement | undefined {
  return editableAssets().find((a) => a.id === id);
}

/** Moves a placed asset (live while dragging; `final` snaps it). The caller sets the checkpoint for a drag. */
export function moveAssetTo(id: string, p: Point, final: boolean): void {
  const a = placed(id);
  if (!a) return;
  const at = final ? snappedPlace(a, p) : { ...p, rotation: a.rotation };
  a.x = at.x;
  a.y = at.y;
  a.rotation = at.rotation;
  markDirty();
  // Its mask and light move with it (DC-108).
  recomputeVision(final);
  emit();
}

export function rotatePlacedAsset(id: string, delta: number): void {
  const a = placed(id);
  if (!a) return;
  checkpoint();
  // About the anchor (E-29); without one about the centre.
  Object.assign(a, rotateAboutAnchor(a, state.assetInfo[a.assetPath] ?? {}, state.scene.map.grid, delta));
  recomputeVision();
  emit();
}

export function scalePlacedAsset(id: string, factor: number): void {
  const a = placed(id);
  if (!a) return;
  checkpoint();
  Object.assign(a, scaleAboutAnchor(a, state.assetInfo[a.assetPath] ?? {}, state.scene.map.grid, factor));
  recomputeVision();
  emit();
}

/** The next variant of the asset's group (same place, turn and scale). */
export function cycleAssetVariant(id: string): void {
  const a = placed(id);
  const group = a && state.assetInfo[a.assetPath]?.group;
  if (!a || !group) return;
  const files = Object.entries(state.assetInfo).filter(([, i]) => i.group === group).map(([path]) => path);
  const next = nextVariant(files, a.assetPath);
  if (next === a.assetPath) return;
  checkpoint();
  a.assetPath = next;
  rememberRecentAsset(next);
  recomputeVision();
  emit();
}

export function deletePlacedAsset(id: string): void {
  const a = placed(id);
  if (!a) return;
  checkpoint();
  setEditableAssets(editableAssets().filter((x) => x.id !== id));
  if (state.selectedAssetId === id) state.selectedAssetId = null;
  recomputeVision();
  emit();
}

/**
 * A click on a placed asset in a scene (DC-110): a play-once effect plays, a looping effect is
 * switched on or off, a light switched on or off (each undoable; playing once is not saved).
 * Whether the asset had something to switch.
 */
export function activateAsset(id: string): boolean {
  if (state.layer === 'map') return false;
  const a = allPlacements(state.scene).find((x) => x.id === id);
  const info = a && state.assetInfo[a.assetPath];
  if (!a || !info) return false;
  // A house shows its interior or its outside (E-29).
  if (info.interior) {
    setInterior(id, !state.scene.interiorsOn[id]);
    return true;
  }
  // A door asset opens and closes (E-29).
  if (info.door) {
    toggleDoor(assetDoorId(id));
    return true;
  }
  if (info.effect && !info.effect.loop && info.effect.trigger) {
    state.effectRuns = { ...state.effectRuns, [id]: Date.now() };
    log('log.effectPlayed', { name: info.name });
    emit();
    return true;
  }
  if (info.effect?.loop) {
    checkpoint();
    const on = state.scene.effectsOn[id] === false;
    state.scene.effectsOn = { ...state.scene.effectsOn, [id]: on };
    log(on ? 'log.effectOn' : 'log.effectOff', { name: info.name });
    emit();
    return true;
  }
  if (info.light) {
    checkpoint();
    const key = `${id}:light`;
    const on = state.scene.assetLightsOn[key] === false;
    state.scene.assetLightsOn = { ...state.scene.assetLightsOn, [key]: on };
    log(on ? 'log.lightOn' : 'log.lightOff');
    recomputeVision();
    emit();
    return true;
  }
  return false;
}

/** The shown placed asset (the map's or the scene's own) at `p`, the topmost. */
export function anyAssetAt(p: Point): string | null {
  const hit = [...allPlacements(state.scene)].reverse().find((a) => hitsPlacement(footprint(a), p));
  return hit?.id ?? null;
}

const RECENT_KEY = 'dc.recentAssets';
const RECENT_MAX = 12;

/** "Recently used" assets: a device setting (E-27), newest first. */
export function recentAssets(): string[] {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]');
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').slice(0, RECENT_MAX) : [];
  } catch {
    return [];
  }
}

function rememberRecentAsset(path: string): void {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify([path, ...recentAssets().filter((p) => p !== path)].slice(0, RECENT_MAX)));
  } catch {
    /* a device setting only: no storage, no list */
  }
}

/* ---------- Hiding map elements in a scene (DC-103) ---------- */

/**
 * Hides a map element in the scene, or shows it again: while preparing ("edit start state") for
 * the start, else for the play state. Not in the Map Forge, which edits the map itself.
 */
export function toggleHidden(id: string): void {
  if (state.layer === 'map') return;
  const sc = state.scene;
  const h = sc.hidden;
  const hide = [...sc.walls, ...sc.zones, ...sc.lights, ...sc.map.assets, ...sc.ownAssets].some((x) => x.id === id);
  if (!hide && ![...h.walls, ...h.zones, ...h.lights, ...h.assets].some((x) => x.id === id)) return;
  checkpoint();
  // Moves the element (whichever kind it is) from one list to the other.
  const split = <T extends { id: string }>(from: T[], to: T[]): [T[], T[]] => [from.filter((x) => x.id !== id), [...to, ...from.filter((x) => x.id === id)]];
  if (hide) {
    [sc.walls, h.walls] = split(sc.walls, h.walls);
    [sc.zones, h.zones] = split(sc.zones, h.zones);
    [sc.lights, h.lights] = split(sc.lights, h.lights);
    [sc.map.assets, h.assets] = split(sc.map.assets, h.assets);
    [sc.ownAssets, h.assets] = split(sc.ownAssets, h.assets);
    if (state.selectedAssetId === id) state.selectedAssetId = null;
    state.selectedWallIds = state.selectedWallIds.filter((x) => x !== id);
    if (state.selectedZoneId === id) state.selectedZoneId = null;
    if (state.selectedLightId === id) state.selectedLightId = null;
  } else {
    [h.walls, sc.walls] = split(h.walls, sc.walls);
    [h.zones, sc.zones] = split(h.zones, sc.zones);
    [h.lights, sc.lights] = split(h.lights, sc.lights);
    // A placed asset goes back where it belongs: the map's, or the scene's own.
    const mapIds = new Set(state.mapDoc?.assets.map((a) => a.id) ?? []);
    const back = h.assets.filter((a) => a.id === id);
    h.assets = h.assets.filter((a) => a.id !== id);
    if (back.length && mapIds.has(id)) sc.map.assets = [...sc.map.assets, ...back];
    else sc.ownAssets = [...sc.ownAssets, ...back];
  }
  log(hide ? 'log.elementHidden' : 'log.elementShown');
  recomputeVision();
  emit();
}

/** "Reset to map": the element takes the map's fields again (its state stays). */
export function resetToMap(id: string): void {
  if (state.layer === 'map' || !state.mapDoc) return;
  checkpoint();
  state.scene = resetElement(state.scene, elementsFromSidecar(state.mapDoc), id);
  log('log.elementReset');
  recomputeVision();
  emit();
}

/** "Clean up": removes the scene's changes that no longer fit the map (one undoable step). */
export function cleanUpOrphans(): void {
  if (state.layer === 'map' || !state.mapDoc) return;
  commitView();
  const doc = state.sceneDoc;
  if (!doc) return;
  const { orphaned, invalid } = sceneIssues(state.mapDoc, doc);
  if (orphaned.length + invalid.length === 0) return;
  checkpoint();
  state.sceneDoc = withoutOrphans(doc, state.mapDoc);
  log('log.orphansCleaned', { n: orphaned.length + invalid.length });
  emit();
}

let changesCache: { version: number; changes: ElementChange[] } | null = null;

/** How the elements of the scene shown differ from the map (none in the Map Forge); cached per state. */
export function currentChanges(): ElementChange[] {
  if (state.layer === 'map' || !state.mapDoc) return [];
  if (changesCache?.version !== version) changesCache = { version, changes: sceneChanges(elementsFromSidecar(state.mapDoc), state.scene) };
  return changesCache.changes;
}

/** Deletes an area of the map (undoable). Scene overrides of it stay in their files, orphaned. */
export function deleteArea(id: string): void {
  const z = state.scene.zones.find((q) => q.id === id);
  if (!z || state.layer !== 'map') return;
  checkpoint();
  state.scene.zones = state.scene.zones.filter((q) => q.id !== id);
  if (state.selectedZoneId === id) state.selectedZoneId = null;
  if (state.areaCommand?.areaId === id) state.areaCommand = null;
  if (state.tool === 'area') state.tool = 'select';
  log('log.areaDeleted', { name: z.name });
  recomputeVision();
  emit();
}

export function cancelAreaCommand(): void {
  if (!state.areaCommand) return;
  state.areaCommand = null;
  if (state.tool === 'area') state.tool = 'select';
  emit();
}

export function zoneAt(p: Point): string | null {
  const z = [...state.scene.zones].reverse().find((z) => editableHere(z) && areaContains(z.shape, p));
  return z?.id ?? null;
}

function locked(): Polygon[] {
  // A hidden secret area stays locked: hiding it must not let the fog reveal it.
  return lockedAreas([...state.scene.zones, ...state.scene.hidden.zones]);
}

/** A DM fog tool: reveals or hides `area` (it spreads at the device's speed). */
export function applyFogArea(area: Polygon | null, mode: 'reveal' | 'hide'): void {
  if (!area) return;
  checkpoint();
  // Aimed on purpose, so it may reveal a secret room too.
  state.scene.fog = mode === 'reveal' ? revealIn(state.scene.fog, area, locked(), true) : hideIn(state.scene.fog, area, false);
  state.fogQuick = false;
  emit();
}

export function revealZone(id: string): void {
  const z = state.scene.zones.find((q) => q.id === id);
  if (!z || (z.secret && !z.discovered)) return;
  checkpoint();
  // Aimed on purpose: every part of the area.
  for (const part of z.shape) state.scene.fog = revealIn(state.scene.fog, part, locked(), true);
  state.fogQuick = false;
  emit();
}

/** Discovering a secret zone unlocks it, opens secret doors touching it and reveals it. */
export function discoverZone(id: string): void {
  const z = state.scene.zones.find((q) => q.id === id);
  if (!z) return;
  checkpoint();
  z.discovered = true;
  for (const w of state.scene.walls) {
    if (w.kind !== 'secret-door') continue;
    const touches = [{ x: w.x1, y: w.y1 }, { x: w.x2, y: w.y2 }].some((p) => distanceToArea(z.shape, p) <= 1);
    if (touches) w.open = true;
  }
  recomputeVision();
  for (const part of z.shape) state.scene.fog = revealIn(state.scene.fog, part, [], true);
  state.fogQuick = false;
  emit();
}

export function fogAll(reveal: boolean): void {
  checkpoint();
  const m = state.scene.map;
  state.scene.fog = reveal ? revealAll(state.scene.fog, m.widthPx, m.heightPx, locked()) : hideAll();
  state.fogQuick = false;
  recomputeVision();
  state.fogQuick = false;
  emit();
}

/** In the Map Forge the map's default; while playing a live change for this scene. */
export function setBiome(b: FogBiome): void {
  checkpoint();
  if (state.ws === 'forge') state.scene.map.biome = b;
  else state.scene.fogEffect = { biome: b, strength: state.scene.fogEffect?.strength ?? state.scene.map.biomeStrength };
  emit();
}

export function setBiomeStrength(v: number): void {
  if (state.ws === 'forge') state.scene.map.biomeStrength = v;
  else state.scene.fogEffect = { biome: state.scene.fogEffect?.biome ?? state.scene.map.biome, strength: v };
  markDirty();
  emit();
}

/** "Reset scene": the scene takes the map's fog look again. */
export function resetSceneFogEffect(): void {
  checkpoint();
  state.scene.fogEffect = null;
  emit();
}

/* ---------- "Calibrate grid" command (E-7, DC-021) ---------- */

/** The running "calibrate grid" command; the map's grid shows its result live until OK. */
export interface CalibrationCommand {
  /** How many cells the box spans in each direction (1–10). */
  cells: number;
  /** The box laid over the printed grid; none before one is dragged or after typing values. */
  box: GridBox | null;
  /** The grid before the command, for Cancel and for saving while it runs. */
  before: GridConfig;
}

export const CALIBRATION_CELLS = { min: 1, max: 10, default: 3 };

export function startCalibration(): void {
  if (state.layer !== 'map') return;
  state.areaCommand = null;
  state.wallCommand = null;
  if (!state.calibration) state.calibration = { cells: CALIBRATION_CELLS.default, box: null, before: { ...state.scene.map.grid } };
  state.tool = 'calibrate';
  emit();
}

function previewGrid(grid: GridConfig): void {
  state.scene.map.grid = grid;
  emit();
}

/** A box dragged over the printed grid (live while dragging). */
export function setCalibrationBox(box: GridBox): void {
  const c = state.calibration;
  if (!c) return;
  state.calibration = { ...c, box };
  previewGrid(gridFromBox(state.scene.map.grid, box, c.cells));
}

export function setCalibrationCells(cells: number): void {
  const c = state.calibration;
  if (!c || !Number.isInteger(cells) || cells < CALIBRATION_CELLS.min || cells > CALIBRATION_CELLS.max) return;
  state.calibration = { ...c, cells };
  if (c.box) previewGrid(gridFromBox(state.scene.map.grid, c.box, cells));
  else emit();
}

/** Fine adjustment (arrow keys, dragging the box): moves the box and the grid together. */
export function moveCalibration(dx: number, dy: number): void {
  const c = state.calibration;
  if (!c) return;
  if (c.box) state.calibration = { ...c, box: { ...c.box, x: c.box.x + dx, y: c.box.y + dy } };
  previewGrid(shiftGrid(state.scene.map.grid, dx, dy));
}

/** Values typed in the panel; the box no longer matches them and goes away. */
export function setCalibrationGrid(patch: { cellWidth?: number; originX?: number; originY?: number }): void {
  const c = state.calibration;
  if (!c) return;
  const g = state.scene.map.grid;
  const cell = patch.cellWidth !== undefined && patch.cellWidth >= 4 ? patch.cellWidth : g.cellWidth;
  state.calibration = { ...c, box: null };
  previewGrid({ ...g, cellWidth: cell, cellHeight: cell, rotationDeg: 0, originX: patch.originX ?? g.originX, originY: patch.originY ?? g.originY });
}

/** OK: the previewed grid becomes the map's, as one undoable step. */
export function finishCalibration(): boolean {
  const c = state.calibration;
  if (!c || state.layer !== 'map') return false;
  const grid = state.scene.map.grid;
  // The undo step must hold the grid from before the preview.
  state.scene.map.grid = c.before;
  checkpoint();
  state.scene.map.grid = grid;
  state.calibration = null;
  state.tool = 'select';
  log('log.calibrated');
  recomputeVision();
  emit();
  return true;
}

/** Cancel: the grid from before the command comes back. */
export function cancelCalibration(): void {
  if (!dropCalibration()) return;
  if (state.tool === 'calibrate') state.tool = 'select';
  emit();
}

/** Ends a running calibration without saving it; whether one ran. */
function dropCalibration(): boolean {
  const c = state.calibration;
  if (!c) return false;
  state.scene.map.grid = c.before;
  state.calibration = null;
  return true;
}

const TPL_COLORS: Record<TemplateShape, string> = { cone: '#e2554c', sphere: '#e2a03c', line: '#3f9de2', cube: '#a77bf3' };
export function addTemplate(shape: TemplateShape, origin: Point, to: Point): AreaTemplate | null {
  const g = state.scene.map.grid;
  const lenPx = Math.hypot(to.x - origin.x, to.y - origin.y);
  const sizeFt = Math.max(g.feetPerCell, Math.round(lenPx / g.cellWidth) * g.feetPerCell);
  if (lenPx < g.cellWidth * 0.4) return null;
  checkpoint();
  const t: AreaTemplate = { id: freshId('tpl'), shape, x: origin.x, y: origin.y, angle: Math.atan2(to.y - origin.y, to.x - origin.x), sizeFt, color: TPL_COLORS[shape] };
  state.scene.templates.push(t);
  emit();
  return t;
}

export function clearTemplates(): void {
  checkpoint();
  state.scene.templates = [];
  emit();
}

export function addPing(p: Point): void {
  state.scene.pings.push({ id: String(Date.now()), x: p.x, y: p.y, at: Date.now() });
  emit();
}

/* ---------- Combat ---------- */

export function initiativeOrder(): Token[] {
  return [...state.scene.tokens].sort((a, b) => b.initiative - a.initiative || (a.kind === 'pc' ? -1 : 1));
}

export function nextTurn(): void {
  markDirty();
  const order = initiativeOrder();
  state.turn++;
  if (state.turn >= order.length) {
    state.turn = 0;
    state.round++;
    log('log.round', { n: state.round });
  }
  log('log.turn', { name: order[state.turn].name });
  emit();
}

export function changeHp(id: string, delta: number): void {
  const t = state.scene.tokens.find((x) => x.id === id);
  if (!t) return;
  checkpoint();
  t.hp = Math.max(0, Math.min(t.maxHp, t.hp + delta));
  if (t.kind === 'pc') recomputeVision();
  emit();
}

export function toggleCondition(id: string, c: Condition): void {
  const t = state.scene.tokens.find((x) => x.id === id);
  if (!t) return;
  checkpoint();
  t.conditions = t.conditions.includes(c) ? t.conditions.filter((x) => x !== c) : [...t.conditions, c];
  if (c === 'exhaustion') t.exhaustion = t.conditions.includes('exhaustion') ? Math.max(1, t.exhaustion ?? 1) : 0;
  emit();
}

export function selectToken(id: string | null): void {
  state.selectedTokenId = id;
  emit();
}

/* ---------- Lights ---------- */

export function addLight(p: Point): void {
  checkpoint();
  const id = freshId('light');
  // A torch by default (2024: bright 20 ft, dim 20 ft further).
  state.scene.lights.push({ id, x: p.x, y: p.y, brightFt: 20, dimFt: 40, color: '#ffb14a', on: true, ...onCurrentLayer() });
  state.selectedLightId = id;
  recomputeVision();
  emit();
}

export function lightAt(p: Point): string | null {
  const r = state.scene.map.grid.cellWidth * 0.45;
  return state.scene.lights.find((l) => editableHere(l) && Math.hypot(l.x - p.x, l.y - p.y) < r)?.id ?? null;
}

export function toggleLight(id: string): void {
  const l = state.scene.lights.find((x) => x.id === id);
  if (!l) return;
  checkpoint();
  l.on = !l.on;
  log(l.on ? 'log.lightOn' : 'log.lightOff');
  recomputeVision();
  emit();
}

export function updateLight(id: string, patch: Partial<Omit<Scene['lights'][number], 'id'>>): void {
  const l = state.scene.lights.find((x) => x.id === id);
  if (!l) return;
  Object.assign(l, patch);
  markDirty();
  recomputeVision();
  emit();
}

export function removeLight(id: string): void {
  checkpoint();
  state.scene.lights = state.scene.lights.filter((l) => l.id !== id);
  if (state.selectedLightId === id) state.selectedLightId = null;
  recomputeVision();
  emit();
}

export function selectLight(id: string | null): void {
  state.selectedLightId = id;
  emit();
}

/** What the "Map settings" dialog edits (DC-011). */
export interface MapSettings {
  name: string;
  mapType: MapType;
  region: string;
  tags: string[];
  biome: FogBiome;
  ambient: Scene['ambient'];
}

export function openMapSettings(open = true): void {
  state.mapSettingsOpen = open && state.layer === 'map';
  emit();
}

export function currentMapSettings(): MapSettings {
  const m = state.scene.map;
  return { name: m.name, mapType: m.mapType, region: m.region, tags: [...m.tags], biome: m.biome, ambient: state.scene.ambient };
}

/** Applies the dialog as one undoable step; only in the Map Forge (the map's data). */
export function applyMapSettings(s: MapSettings): boolean {
  const name = s.name.trim();
  if (state.layer !== 'map' || !name) return false;
  checkpoint();
  const m = state.scene.map;
  m.name = name;
  m.mapType = s.mapType;
  m.region = s.region.trim();
  m.tags = [...s.tags];
  m.biome = s.biome;
  state.scene.ambient = s.ambient;
  recomputeVision();
  markDirty();
  emit();
  return true;
}

/* ---------- Tokens from creatures ---------- */

/** Where new tokens go: the centre of what the TV shows, else of the map. */
function tableCentre(): Point {
  const m = state.scene.map;
  return { x: state.scene.table.centerX || m.widthPx / 2, y: state.scene.table.centerY || m.heightPx / 2 };
}

/* ---------- Players of the campaign (DC-096) ---------- */

/** A new player without a character yet; returns its id. */
export function addPlayer(name: string): string {
  const id = newId('player', (x) => state.players.some((p) => p.id === x));
  state.players = [...state.players, { id, name, present: true }];
  markDirty();
  emit();
  return id;
}

export function updatePlayer(id: string, patch: Partial<Omit<Player, 'id'>>): void {
  state.players = state.players.map((p) => {
    if (p.id !== id) return p;
    const next = { ...p, ...patch };
    if (!next.characterId) delete next.characterId;
    return next;
  });
  markDirty();
  emit();
}

/** Removes a player from the campaign; the character stays in the library and its tokens stay. */
export function removePlayer(id: string): void {
  state.players = state.players.filter((p) => p.id !== id);
  markDirty();
  emit();
}

/** "Place party": the present players' characters that the scene does not have yet (DC-096). */
export function placeParty(): void {
  if (state.layer === 'map') {
    log('log.tokensInScene');
    emit();
    return;
  }
  const c = snapPoint(tableCentre());
  const added = missingPartyTokens(state.players, state.creatures, state.scene.tokens, { at: c, cell: state.scene.map.grid.cellWidth, newId: freshId });
  if (added.length === 0) {
    log('log.partyComplete');
    emit();
    return;
  }
  checkpoint();
  state.scene.tokens.push(...added);
  log('log.partyPlaced', { count: added.length });
  recomputeVision();
  emit();
}

/** Puts a creature from the library on the map; initiative is rolled (d20 + Dex). */
export function addCreatureToken(index: number, at?: Point): void {
  const c = state.creatures[index];
  if (!c) return;
  // Tokens belong to scenes; the Map Forge shows the map alone.
  if (state.layer === 'map') {
    log('log.tokensInScene');
    emit();
    return;
  }
  checkpoint();
  const same = state.scene.tokens.filter((t) => t.creatureId === c.id).length;
  const id = freshId(c.id);
  state.scene.tokens.push(tokenFromCreature(c, id, snapPoint(at ?? tableCentre()), same));
  state.selectedTokenId = id;
  log('log.tokenAdded', { name: c.name });
  recomputeVision();
  emit();
}

export function removeToken(id: string): void {
  const t = state.scene.tokens.find((x) => x.id === id);
  if (!t) return;
  checkpoint();
  const order = initiativeOrder();
  const idx = order.findIndex((x) => x.id === id);
  state.scene.tokens = state.scene.tokens.filter((x) => x.id !== id);
  if (idx >= 0 && idx < state.turn) state.turn--;
  if (state.turn >= state.scene.tokens.length) state.turn = 0;
  if (state.selectedTokenId === id) state.selectedTokenId = null;
  log('log.tokenRemoved', { name: t.name });
  recomputeVision();
  emit();
}

export function selectZone(id: string | null): void {
  state.selectedZoneId = id;
  // One kind of selection at a time in the Properties panel.
  if (id) {
    state.selectedWallIds = [];
    state.selectedAssetId = null;
  }
  emit();
}

export function roll(expr: string): RollResult | null {
  try {
    const r = rollDice(expr);
    state.rolls.unshift(r);
    if (state.rolls.length > 50) state.rolls.pop();
    emit();
    return r;
  } catch {
    return null;
  }
}

/* ---------- Table output ---------- */

export function setTableRotation(r: TableRotation): void {
  markDirty();
  state.scene.table.rotation = r;
  emit();
}

export function rotateTable(): void {
  markDirty();
  state.scene.table.rotation = (((state.scene.table.rotation + 90) % 360) as TableRotation);
  emit();
}

export function toggleBlackout(): void {
  state.scene.table.blackout = !state.scene.table.blackout;
  // Lifting the blackout releases the TV after the start (E-30).
  if (!state.scene.table.blackout) state.blackUntilRelease = false;
  emit();
}

export function updateTable(patch: Partial<Scene['table']>): void {
  markDirty();
  state.scene.table = { ...state.scene.table, ...patch };
  emit();
}

/** The TV's zoom for a true-size grid: of `grid` (the TV scene's), else of the scene shown. */
export function tableZoom(grid = state.scene.map.grid): number {
  const t = state.scene.table;
  return tableZoomForPhysicalGrid(grid, t.display, t.inchesPerCell, t.ppiCorrection);
}

/** Builds the next frame for the table (and the preview). */
export function produceFrame(now: number): PlayerFrame {
  // Drop pings older than 2 s.
  state.scene.pings = state.scene.pings.filter((p) => now - p.at < 2000);
  state.frameSeq++;
  // No scene on the TV: black, and nothing of any scene in the frame.
  const tv = tvView() ?? { scene: emptyScene({ ...state.scene.table, blackout: true }), visible: [], lights: [], turn: 0, resource: '', runs: {} };
  state.frame = buildPlayerFrame(tv.scene, {
    seq: state.frameSeq,
    now,
    showGrid: state.showGrid,
    memoryOpacity: state.memoryOpacity,
    movementLocked: state.moveLock,
    zoom: tableZoom(tv.scene.map.grid),
    look: lookToWire(state.fogLook),
    visible: tv.visible,
    quick: state.fogQuick,
    activeTokenId: state.ws === 'play' && tv.scene === state.scene ? initiativeOrder()[tv.turn]?.id ?? null : null,
    seedKey: tv.resource,
    lights: tv.lights,
    // Only the scene's shown placements: assets it hides never reach the TV.
    // Houses as switched in the scene (E-29); the TV never sees through a roof.
    assets: assetShapes(drawnPlacements(allPlacements(tv.scene), state.assetInfo, tv.scene.interiorsOn, false), state.assetInfo, tv.scene.map.grid, { effectsOn: tv.scene.effectsOn, runs: tv.runs }),
    covers: assetExtras(tv.scene).covers,
  });
  return state.frame;
}

interface TvView {
  scene: Scene;
  visible: Polygon[];
  lights: LitSource[];
  turn: number;
  resource: string;
  runs: Record<string, number>;
}

let tvCache: { version: string; scene: Scene; visible: Polygon[]; lights: LitSource[] } | null = null;
let backgroundTv: { session: Session; info: Record<string, AssetInfo>; map: MapSidecar | null; view: TvView } | null = null;

/**
 * What the TV shows: the TV's scene (E-30). The scene shown in the DM window in its play state is
 * used as it is; while the Map Forge shows its map, that is the map being edited with the scene's
 * changes and state (fog, tokens) – rebuilt only when something changed. A scene in a tab in the
 * background is built from its files (it does not change while another tab is shown).
 */
function tvView(): TvView | null {
  // Without any scene file (the sample before a campaign is opened) the TV shows what is shown.
  const untabbed = state.scenePath === null && state.tabs.length === 0;
  if (!state.tvScenePath && !untabbed) return null;
  if (state.tvScenePath && state.tvScenePath !== state.scenePath) return backgroundView(state.tvScenePath);
  const own = { turn: state.turn, resource: state.mapResource, runs: state.effectRuns };
  const pending = state.tvMapPending && tvMap;
  if (!state.mapDoc || (state.layer === 'scene' && !pending)) return { scene: state.scene, visible: state.visible, lights: state.lights, ...own };
  // The scene as shown (its state changes go to the TV at once), on the map the TV has.
  const stamp = pending ? `p${version}` : `v${viewVersion}`;
  if (!tvCache || tvCache.version !== stamp) {
    // Editing the map or the start state: the TV shows the play state, with the map as the TV
    // has it (its changes wait for the DM, E-30) and the scene's changes as they are being edited.
    const map = pending ? tvMap! : mapSidecarFromScene(state.scene, state.mapResource, state.layer, state.mapDoc);
    let ov = state.layer === 'scene' ? docsFromView().ov : state.sceneDoc;
    if (ov && state.layer === 'start') {
      const fromView = sceneOverrideFromScene(state.scene, state.sceneName, ov.mapSidecar, { round: state.round, turn: state.turn }, map, layerOf(ov));
      ov = { ...ov, overrides: fromView.overrides, added: fromView.added };
    }
    const scene = sceneFromDocuments(map, ov, state.scene.map.imageUrl, state.scene.table, 'scene');
    const extras = assetExtras(scene);
    const seen = withAssetDoors(scene);
    const vision = updateVision(seen, extras);
    tvCache = { version: stamp, scene, visible: visiblePolygons(vision), lights: litSources(seen, extras) };
  }
  // Table settings (blackout, rotation, centre) and the DM's pings stay live.
  tvCache.scene.table = state.scene.table;
  tvCache.scene.pings = state.scene.pings;
  return { ...tvCache, ...own };
}

function backgroundView(scenePath: string): TvView | null {
  const s = sessions.get(scenePath);
  if (!s) return null;
  const map = tvMap ?? openMaps.get(s.mapResource) ?? s.mapDoc;
  if (!map) return null;
  if (!backgroundTv || backgroundTv.session !== s || backgroundTv.info !== state.assetInfo || backgroundTv.map !== map) {
    const scene = sceneFromDocuments(map, s.sceneDoc, s.imageUrl, state.scene.table, 'scene');
    const extras = assetExtras(scene);
    const seen = withAssetDoors(scene);
    const vision = updateVision(seen, extras);
    backgroundTv = { session: s, info: state.assetInfo, map, view: { scene, visible: visiblePolygons(vision), lights: litSources(seen, extras), turn: s.turn, resource: s.mapResource, runs: s.effectRuns } };
  }
  // The TV's settings stay live; the centre is the scene's own.
  backgroundTv.view.scene.table = { ...state.scene.table, centerX: s.center.x, centerY: s.center.y };
  return backgroundTv.view;
}

export function setMapImage(url: string, isVideo: boolean, w: number, h: number, name: string): void {
  const m = state.scene.map;
  m.imageUrl = url;
  m.isVideo = isVideo;
  m.widthPx = w;
  m.heightPx = h;
  state.mapFileName = name;
  emit();
}
