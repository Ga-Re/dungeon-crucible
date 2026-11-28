/**
 * DM application state. A tiny external store: components subscribe via
 * `useStore`, actions mutate state and call `emit()`.
 */
import type { RescueCopy } from '../core/rescue';
import { useSyncExternalStore } from 'react';
import type { Point } from '../core/geometry';
import { gridFromBox, shiftGrid, snapToCell, tableZoomForPhysicalGrid, toCellSpace, type GridBox, type GridConfig } from '../core/grid';
import { buildPlayerFrame, type PlayerFrame, type ProjectionOptions, type StoreyFrame } from '../core/projection';
import type { AreaTemplate, FogBiome, MapAssetPlacement, MapType, Scene, SoundSource, TableRotation, TemplateShape, Token, Wall, WallKind } from '../core/scene';
import { isSoundRef } from '../core/sound';
import { findLeaks, type Leak } from '../core/leaks';
import { storeyFootprint, storeysBelow } from '../core/storeyShape';
import { otherEnd, stairAt } from '../core/stairs';
import { DEFAULT_TRANSITION, type Transition, type TransitionKind, type TransitionPlay } from '../core/transition';
import { assetDoorId, assetDoorWalls, wallsWithAssetDoors } from '../core/assetDoors';
import type { InteriorTrigger } from '../core/sidecar';
import { randomChoices, rollPlacement, type PlaceOptions } from '../core/assetObjects';
import { drawnPlacements, footprintPolygon, interiorChanges, interiorOf, interiorWalls } from '../core/interiors';
import { anchorPoint, rotateAboutAnchor, scaleAboutAnchor, snapAnchored } from '../core/anchor';
import { assetShapes, footprintOf, hitsPlacement, nextVariant, snapPlacement, type Footprint } from '../core/placement';
import { rollDice, type RollResult } from '../core/rules/dice';
import type { Condition } from '../core/rules/rules2024';
import { litSources, updateVision, visiblePolygons, type LitSource, type ViewerVision, type VisionExtras } from '../core/vision';
import { placementCovers, placementLights } from '../core/cover';
import { rectPolygon, forgetIn, hideAll, hideIn, rememberSeen, revealAll, revealIn } from '../core/fogModel';
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
import type { AssetKind, AssetSidecar, Creature, MapLayer, MapLook, MapStorey, MapVariant, Player, Stair } from '../core/sidecar';
import { missingPartyTokens, tokenFromCreature } from '../core/party';
import type { MessageKey } from '../i18n/en';
import { initialSoundboard, type SoundboardState } from './soundboard';
import { History } from '../core/history';
import { setTerrain, terrainBroken, terrainOf } from './terrain';
import { emptyTerrain, shownStack, type TerrainState } from '../core/build/terrain/state';
import { applyStroke, brushPoints, lassoPoints, snapLasso, stepAt, strokeStep, type BrushShape, type StepMode } from '../core/build/terrain/stepTool';
import { biomeWeightsAt, brushCells, brushWeights, fillPoints, paintBiome, paintGround, supportPointAt, type GroundClass } from '../core/build/terrain/groundTool';
import type { TerrainBiome } from '../core/build/terrainKeys';
import { CLIFF_NOISE_CELLS, CliffCache, cliffLines, cliffWalls } from '../core/build/terrain/cliffs';
import type { TerrainShape } from '../render/pixi/terrain';
import { tvRaster } from '../core/build/terrain/tvRaster';
import type { RasterBlock } from '../core/build/terrain/block';
import { activeLayers, BASE_LAYER, drawOrder, triggerChanges } from '../core/layers';
import { defaultTerrainBiome, intentIds } from '../core/build/intent';
import { BAND_PER_10_FT } from '../core/build/geom/band';
import { allPlacements, elementsFromSidecar, resetElement, sceneChanges, sceneIssues, withoutOrphans, type ElementChange } from '../core/persistence';
import { commitStart, layerOf, mapSidecarFromScene, mapSidecarPath, sceneFromDocuments, sceneOverrideFromScene, startOf, type ViewLayer } from '../core/persistence';
import type { MapSidecar, SceneOverride } from '../core/sidecar';
import type { CampaignInfo, RootInfo } from '../platform/bridge';
import type { RecentCampaign } from './recent';
import type { LibraryMap, MapScenes } from './library';
import type { MapFilter } from '../core/mapCatalog';
import type { VaultState } from './vault';

export type WorkspaceId = 'forge' | 'vault' | 'creatures' | 'atlas' | 'play';

export type ToolId =
  | 'select' | 'pan' | 'measure' | 'ping' | 'calibrate'
  | 'area' | 'wall' | 'hide'
  | 'fog-rect' | 'fog-ellipse' | 'fog-polygon' | 'fog-lasso' | 'fog-brush' | 'reveal-room'
  | 'cone' | 'sphere' | 'line' | 'cube' | 'light'
  | 'stair' | 'terrain';

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
  /** The selected sound source (E-37). */
  selectedSoundId: string | null;
  /** The map's sounds silenced by "stop all" or the Map sounds panel (not saved, DC-104c). */
  mapSoundsMuted: boolean;
  /** The TV's last change of picture (DC-105, E-38): counter, what it plays, how long (ms). */
  tvCut: { n: number; play: TransitionPlay; ms: number };
  /** The transition of the next change of scene only, instead of the new map's (E-38); none: the map's. */
  nextTransition: TransitionKind | null;
  turn: number;
  round: number;
  scene: Scene;
  vision: ViewerVision[];
  /** "Calibrate grid" while it runs (Map Forge, E-7). */
  calibration: CalibrationCommand | null;
  /** "Draw walls" while it runs (Map Forge, DC-014). */
  wallCommand: WallCommand | null;
  /** The terrain tool "Stufe" while it runs (Map Forge, E-87). */
  terrainCommand: TerrainCommand | null;
  /** Lasso and square brush snap to quarter cells instead of cells (E-87). */
  terrainQuarter: boolean;
  /** While painting: the cliffs grow along (device setting, E-87) or only an outline shows until let go. */
  terrainPreview: TerrainPreview;
  /** The biome under the pointer while a ground tool runs (its palette shows that biome's textures, E-88). */
  terrainHover: TerrainBiome | null;
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
  /**
   * The open map's own file (E-32): its sidecar `<picture>.dm.json`, or a map file
   * `library/<name>.map.json` on a picture other maps may share. '' without a map.
   */
  mapFile: string;
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
  /** The Map Forge shows the map catalog (E-32, DC-117) instead of a map. */
  forgeCatalog: boolean;
  /** The map picked in the catalog, by resource. */
  mapSelected: string | null;
  mapFilter: MapFilter;
  /** The scenes of the open campaign by the map sidecar they use. */
  mapScenes: MapScenes;
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
  /** The placing mode while on (E-31, DC-116): an asset placed with each click, previewed under the pointer. */
  placing: Placing | null;
  /** The Map Forge's leak check (DC-025): open, with its test figure (not saved). */
  leakCheck: { figure: Point | null; darkvisionFt: number } | null;
  /** "Adjust picture" (DC-022): open with its preview, or not. */
  lookCommand: LookCommand | null;
  /** The storey the DM works on (E-40); "": the map itself. Not saved; the TV's is the scene's. */
  storey: string;
  /** The placing mode's options as last used (kept for the next time, this session). */
  placeOptions: Omit<PlaceOptions, 'variant'> & { snap: boolean };
  /** Houses a player character came into whose interior waits for the DM's yes (E-29; not saved). */
  interiorAsks: { id: string; name: string }[];
  /** Figures set down on stairs, waiting for the DM's yes to change storey (E-44; not saved). */
  stairAsks: { tokenId: string; name: string; to: string; toName: string }[];
  /** The stair selected in the Map Forge (E-44). */
  selectedStairId: string | null;
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
  /** Rescue copies offered for the campaign just opened (DC-003). */
  rescueOffer: RescueCopy[];
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
    selectedSoundId: null,
    mapSoundsMuted: false,
    tvCut: { n: 0, play: 'cut', ms: 0 },
    nextTransition: null,
    turn: 0,
    round: 1,
    scene,
    vision: [],
    calibration: null,
    wallCommand: null,
    terrainCommand: null,
    terrainQuarter: false,
    terrainPreview: readTerrainPreview(),
    terrainHover: null,
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
    mapFile: mapSidecarPath('builtin:crypt'),
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
    forgeCatalog: false,
    mapSelected: null,
    mapFilter: {},
    mapScenes: {},
    mapDoc: null,
    sceneDoc: null,
    layer: 'scene',
    editStart: false,
    recent: [],
    notice: null,
    rescueOffer: [],
    assetInfo: {},
    selectedAssetId: null,
    currentLayer: BASE_LAYER,
    effectRuns: {},
    interiorAsks: [],
    stairAsks: [],
    selectedStairId: null,
    placing: null,
    leakCheck: null,
    lookCommand: null,
    storey: '',
    placeOptions: { randomRotation: false, rotationStep: 90, rotation: 0, randomScale: false, scaleSpread: 0.1, snap: true },
    tabs: [],
    activeTab: null,
    creatureTab: null,
    assetTab: null,
    sceneWs: 'play',
    tvScenePath: null,
    tvAsk: null,
    tvMapPending: false,
    blackUntilRelease: false,
    vault: { items: [], objects: [], object: null, objectFiles: [], filter: {}, selected: [], anchor: null, thumbPx: 120, newCollections: [], pack: null, editor: null, drafts: {} },
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

let history = new History<Snapshot>(100);
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
  if (state.layer === 'map' && state.tvScenePath && state.mapFile === tvMapFile()) state.tvMapPending = true;
  for (const f of dirtyListeners) f();
}

/** What a view of the scene was built from: its changes of the map and the hidden ids of the layer shown. */
function previousLayer(doc: SceneOverride | null) {
  if (!doc) return undefined;
  return { ...layerOf(doc), hidden: state.layer === 'start' ? startOf(doc).hidden : doc.hidden };
}

/**
 * A step of undo: the documents as JSON, and on the map layer the map's terrain by reference – it
 * never changes, so steps share every block an edit did not touch (E-56). A scene's steps leave the
 * terrain alone, as they leave the map: it may have changed in another tab since.
 */
interface Snapshot {
  docs: string;
  terrain?: TerrainState | null;
}

function snapshot(): Snapshot {
  const docs = JSON.stringify(docsFromView());
  return state.layer === 'map' && state.mapFile ? { docs, terrain: terrainOf(state.mapFile) } : { docs };
}

/** Call before every undoable change. */
export function checkpoint(): void {
  history.push(snapshot());
  state.canUndo = history.canUndo;
  state.canRedo = history.canRedo;
  markDirty();
}

function restore(snap: Snapshot): void {
  const { map, ov } = JSON.parse(snap.docs) as { map: MapSidecar; ov: SceneOverride | null };
  if (state.mapFile && snap.terrain !== undefined) setTerrain(state.mapFile, snap.terrain);
  // The scene file too: it holds what the view does not show (orphaned changes, the other state).
  if (ov) state.sceneDoc = ov;
  const keepTable = state.scene.table;
  state.scene = sceneFromDocuments(map, ov, state.scene.map.imageUrl, keepTable, state.layer, state.storey);
  state.scene.table = keepTable;
  if (ov) {
    state.round = ov.combat.round;
    state.turn = ov.combat.turn;
  }
  // Selected walls that the step back (or forward) took away are no longer selected.
  const walls = new Set(state.scene.walls.map((w) => w.id));
  state.selectedWallIds = state.selectedWallIds.filter((id) => walls.has(id));
  if (state.selectedAssetId && !editableAssets().some((a) => a.id === state.selectedAssetId)) state.selectedAssetId = null;
  // Stairs (E-44): a selection or a question that this step took away goes too.
  if (state.selectedStairId && !state.scene.map.stairs?.some((s) => s.id === state.selectedStairId)) state.selectedStairId = null;
  state.stairAsks = state.stairAsks.filter((a) => stairAskStands(a));
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
/** A new element id that no wall, area, light, sound source, template or token of the scene has (lowercase, random). */
export function freshId(prefix: string): string {
  const sc = state.scene;
  const taken = new Set<string>([...[...sc.walls, ...sc.zones, ...sc.lights, ...sc.sounds, ...sc.hidden.sounds, ...sc.templates, ...sc.tokens, ...sc.map.assets, ...sc.ownAssets, ...sc.hidden.assets, ...sc.ownPaths].map((x) => x.id), ...intentIds(sc.map.intent ?? {})]);
  return newId(slugId(prefix, 'el').slice(0, 40), (id) => taken.has(id));
}

/**
 * Replaces the whole view (open campaign, switch scene, import map). `scene` must show
 * `layerFor(state.ws)`; `docs` are the map and scene as in their files (none: no map open).
 */
export function replaceScene(scene: Scene, opts: { resource: string; fileName: string; scenePath: string | null; sceneName: string; round?: number; turn?: number; docs?: { map: MapSidecar | null; scene: SceneOverride | null }; mapTab?: boolean; mapFile?: string }): void {
  // The map's own file (E-32): given, else the scene's, else its picture's sidecar.
  const mapFile = opts.mapFile ?? opts.docs?.scene?.mapSidecar ?? (opts.resource ? mapSidecarPath(opts.resource) : '');
  // The document shown so far stays open in its tab (E-30).
  const tabId = opts.scenePath ?? (opts.mapTab ? mapTabId(mapFile) : null);
  if (state.activeTab && state.activeTab !== tabId) stashSession();
  state.activeTab = tabId;
  // Another document: no draft of the old one carries over, the DM works on its map itself (E-40).
  dropMapDrafts();
  state.storey = '';
  // A map or scene opened: the Map Forge shows it, not the catalog (E-32); none: the catalog.
  state.forgeCatalog = tabId === null;
  state.scene = scene;
  state.mapDoc = opts.docs?.map ?? null;
  state.sceneDoc = opts.docs?.scene ?? null;
  state.editStart = false;
  state.layer = layerFor(state.ws);
  viewVersion++;
  state.mapResource = opts.resource;
  state.mapFile = mapFile;
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
  state.stairAsks = [];
  state.selectedStairId = null;
  state.effectRuns = {};
  // A scene of its own: its own undo history; the one before keeps its history in its tab.
  history = new History<Snapshot>(100);
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

/** The tab of a map open on its own, by its map file (E-32). */
export function mapTabId(mapFile: string): string {
  return `map:${mapFile}`;
}

/** What an open document keeps while another tab is shown: its files, its undo history and its unsaved state. */
interface Session {
  scenePath: string | null;
  sceneName: string;
  mapResource: string;
  mapFile: string;
  mapFileName: string;
  imageUrl: string | null;
  sceneDoc: SceneOverride | null;
  mapDoc: MapSidecar | null;
  round: number;
  turn: number;
  editStart: boolean;
  history: History<Snapshot>;
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
  if (state.mapDoc) openMaps.set(state.mapFile, state.mapDoc);
  sessions.set(state.activeTab, {
    scenePath: state.scenePath, sceneName: state.sceneName, mapResource: state.mapResource, mapFile: state.mapFile, mapFileName: state.mapFileName, imageUrl: state.scene.map.imageUrl,
    sceneDoc: state.sceneDoc, mapDoc: state.mapDoc, round: state.round, turn: state.turn, editStart: state.editStart, history, dirty: state.dirty,
    effectRuns: state.effectRuns, interiorAsks: state.interiorAsks, center: { x: state.scene.table.centerX, y: state.scene.table.centerY }, layer: state.layer,
  });
  if (state.dirty) {
    const id = state.activeTab;
    state.tabs = state.tabs.map((x) => (x.id === id ? { ...x, unsaved: true } : x));
  }
}

/** The open documents put away with changes not saved yet: their files to write (E-30). */
export function unsavedSessions(): { id: string; mapFile: string; mapDoc: MapSidecar | null; scenePath: string | null; sceneDoc: SceneOverride | null }[] {
  return [...sessions.entries()].filter(([, s]) => s.dirty).map(([id, s]) => ({ id, mapFile: s.mapFile, mapDoc: openMaps.get(s.mapFile) ?? s.mapDoc, scenePath: s.scenePath, sceneDoc: s.sceneDoc }));
}

/** A document put away was saved. */
export function sessionSaved(id: string): void {
  const s = sessions.get(id);
  if (s) s.dirty = false;
  state.tabs = state.tabs.map((x) => (x.id === id && x.unsaved ? { id: x.id, kind: x.kind, name: x.name } : x));
}

/** The newest state of map file `mapFile` among the open documents (the one shown first), if one is open. */
export function latestMap(mapFile: string): MapSidecar | null {
  if (mapFile === state.mapFile && state.mapDoc) {
    commitView();
    return state.mapDoc;
  }
  return openMaps.get(mapFile) ?? null;
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
  state.forgeCatalog = false;
  if (!s.scenePath && state.ws !== 'forge') {
    state.ws = 'forge';
    state.areaCommand = null;
    state.wallCommand = null;
    state.terrainCommand = null;
    state.tool = 'select';
  }
  const mapDoc = openMaps.get(s.mapFile) ?? s.mapDoc;
  state.mapDoc = mapDoc;
  state.sceneDoc = s.sceneDoc;
  state.scenePath = s.scenePath;
  state.sceneName = s.sceneName;
  state.mapResource = s.mapResource;
  state.mapFile = s.mapFile;
  state.mapFileName = s.mapFileName;
  state.round = s.round;
  state.turn = s.turn;
  state.editStart = s.editStart;
  state.layer = layerFor(state.ws);
  state.effectRuns = s.effectRuns;
  state.interiorAsks = s.interiorAsks;
  // Undo stays in the layer it was recorded in (as when switching layers): a map edit is not undone in a scene.
  history = s.layer === state.layer ? s.history : new History<Snapshot>(100);
  state.canUndo = history.canUndo;
  state.canRedo = history.canRedo;
  const table = { ...state.scene.table, centerX: s.center.x, centerY: s.center.y };
  // Another tab: the DM works on its map itself first (E-40), with no draft of the tab before.
  state.storey = '';
  dropMapDrafts();
  if (mapDoc) {
    state.scene = sceneFromDocuments(mapDoc, s.sceneDoc, s.imageUrl, table, state.layer);
    state.scene.table = table;
  }
  viewVersion++;
  state.selectedTokenId = null;
  state.selectedZoneId = null;
  state.selectedLightId = null;
  state.selectedSoundId = null;
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
  state.nextTransition = null;
}

/**
 * Puts scene `scenePath` on the TV (an open tab), or none (black). The TV changes with the new
 * map's transition, or the one chosen for this change (E-38); from black it fades in, to none out.
 * `fromBlack`: the TV was black until now (released with this scene).
 */
export function setTvScene(scenePath: string | null, fromBlack = false): void {
  if (scenePath && !isSceneOpen(scenePath)) return;
  const before = state.tvScenePath;
  // Fading out to nothing goes as the map leaving says.
  const leaving = tvTransition();
  state.tvScenePath = scenePath;
  state.tvAsk = null;
  snapshotTvMap();
  if (scenePath !== before || fromBlack) {
    if (!scenePath) cutTv('out', leaving);
    else if (!before || fromBlack) cutTv('in');
    else cutTv(state.nextTransition ?? tvTransition().kind);
    state.nextTransition = null;
  }
  emit();
}

/** The TV, black until now, fades in on the scene it has (E-38) – its map stays as the TV has it (E-30). */
export function fadeTvIn(): void {
  cutTv('in');
  emit();
}

/** The transition of the TV scene's map (E-38), or the default. */
function tvTransition(): Transition {
  return tvView()?.scene.map.transition ?? DEFAULT_TRANSITION;
}

/**
 * The TV changes its picture: `play` (a cut: at once) for as long as `t` – the TV scene's map –
 * says. A fade chosen for this change only also plays on a map that cuts, at the default length.
 */
function cutTv(play: TransitionPlay, t: Transition = tvTransition()): void {
  const seconds = t.kind === 'cut' ? (play === 'fade' || play === 'black' ? DEFAULT_TRANSITION.seconds : 0) : t.seconds;
  const ms = play === 'cut' ? 0 : Math.round(seconds * 1000);
  state.tvCut = { n: state.tvCut.n + 1, play: ms === 0 ? 'cut' : play, ms };
}

/** The transition of the next change of scene only (E-38); null: the new map's. */
export function setNextTransition(kind: TransitionKind | null): void {
  state.nextTransition = kind;
  emit();
}

/** The map the TV shows (E-30): the TV scene's map as when it went there or was last taken over. */
let tvMap: MapSidecar | null = null;

/** The map file of the TV's scene. */
function tvMapFile(): string | null {
  if (!state.tvScenePath) return null;
  if (state.tvScenePath === state.scenePath) return state.mapFile;
  return sessions.get(state.tvScenePath)?.mapFile ?? null;
}

/** The latest map of an open scene: as being edited if it is shown (its own tab or a tab of the same map). */
function currentMapOf(scenePath: string): MapSidecar | null {
  const file = scenePath === state.scenePath ? state.mapFile : sessions.get(scenePath)?.mapFile;
  if (!file) return null;
  if (file === state.mapFile && state.mapDoc) return state.layer === 'map' ? mapSidecarFromScene(state.scene, state.mapResource, 'map', state.mapDoc) : state.mapDoc;
  const s = sessions.get(scenePath);
  return s ? (openMaps.get(s.mapFile) ?? s.mapDoc) : null;
}

/** The TV takes its scene's map as it is now. */
function snapshotTvMap(): void {
  const map = state.tvScenePath ? currentMapOf(state.tvScenePath) : null;
  tvMap = map ? structuredClone(map) : null;
  // Its terrain is held with it: the TV shows it until the next "on the TV" too.
  const file = tvMapFile();
  tvTerrain = file ? terrainOf(file) : null;
  tvMapVersion++;
  state.tvMapPending = false;
  tvCache = null;
  backgroundTv = null;
}

/** Counts the maps the TV took over: what is drawn from them is rebuilt then. */
let tvMapVersion = 0;

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
    const fromView = sceneOverrideFromScene(s, state.sceneName, state.mapFile, { round: state.round, turn: state.turn }, map, previousLayer(doc));
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
  state.scene = sceneFromDocuments(state.mapDoc, state.sceneDoc, state.scene.map.imageUrl, table, state.layer, state.storey);
  state.scene.table = table;
  if (state.sceneDoc && state.layer === 'scene') {
    state.round = state.sceneDoc.combat.round;
    state.turn = state.sceneDoc.combat.turn;
  }
  state.selectedTokenId = null;
  state.selectedZoneId = null;
  state.selectedLightId = null;
  state.selectedSoundId = null;
  state.selectedStairId = null;
  // Another storey or view: open questions about stairs are moot (E-44).
  state.stairAsks = [];
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
  state.scene = sceneFromDocuments(state.mapDoc, state.sceneDoc, state.scene.map.imageUrl, table, layer, state.storey);
  state.scene.table = table;
  state.selectedTokenId = null;
  state.selectedZoneId = null;
  state.selectedLightId = null;
  state.selectedSoundId = null;
  clearWallEditing();
  recomputeVision();
  layerInside = charactersInTriggers();
  interiorInside = charactersInHouses();
  state.interiorAsks = [];
  state.stairAsks = [];
  state.selectedStairId = null;
  clearHistory();
}

/** Drafts and checks of the Map Forge that belong to the map shown (DC-022, DC-025). */
function dropMapDrafts(): void {
  state.lookCommand = null;
  state.leakCheck = null;
}

export function setWorkspace(ws: WorkspaceId): void {
  if (ws !== state.ws) dropMapDrafts();
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
    state.terrainCommand = null;
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
  state.terrainCommand = null;
  state.tool = 'select';
  // Placing goes on in the Map Forge and the Orchestrator only (DC-116).
  if (ws !== 'forge' && ws !== 'play') state.placing = null;
  // The Map Forge without a map or scene open shows the map catalog (E-32).
  if (ws === 'forge' && !state.activeTab) state.forgeCatalog = true;
  showLayer(layerFor(ws));
  emit();
}

export function setTool(tool: ToolId): void {
  // Another tool ends the placing mode (DC-116); a map open behind the catalog comes to the front.
  state.placing = null;
  if (state.forgeCatalog && state.activeTab) state.forgeCatalog = false;
  // One command at a time: another tool ends "create area" and "draw walls".
  if (tool !== 'area') state.areaCommand = null;
  if (tool !== 'wall') state.wallCommand = null;
  if (tool !== 'terrain') endTerrainCommand();
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
  const seen = withAssetDoors(state.scene, ownTerrain());
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
  // Set down on stairs in a scene (E-44): the DM is asked whether it goes to the other storey.
  if (final) askStairs(t);
  emit();
}

/** A figure set down on stairs asks the DM (E-44); off them again, the question goes. */
function askStairs(t: Token): void {
  if (state.layer === 'map') return;
  const here = state.scene.map.storey ?? '';
  const stair = stairAt(state.scene.map.stairs ?? [], here, t);
  state.stairAsks = state.stairAsks.filter((a) => a.tokenId !== t.id);
  if (!stair) return;
  const to = otherEnd(stair, here);
  const toName = to ? (state.scene.map.storeys?.find((s) => s.id === to)?.name ?? to) : '';
  state.stairAsks = [...state.stairAsks, { tokenId: t.id, name: t.name, to, toName }];
}

/**
 * The DM's answer for a figure on stairs (E-44): yes puts it on the other storey; with all player
 * characters there now, the TV follows them there (with its transition).
 */
export function answerStairAsk(tokenId: string, yes: boolean): void {
  const ask = state.stairAsks.find((a) => a.tokenId === tokenId);
  state.stairAsks = state.stairAsks.filter((a) => a.tokenId !== tokenId);
  // Only while it still stands: the figure here, on stairs leading there (not removed, undone, moved off).
  if (!ask || !yes || !stairAskStands(ask)) {
    emit();
    return;
  }
  const t = state.scene.tokens.find((x) => x.id === tokenId)!;
  // One undoable step: the figure over, and the TV after it.
  checkpoint();
  putOnStorey(tokenId, ask.to);
  log('log.tookStairs', { name: ask.name });
  // The TV follows the player characters (not other figures): when all of them are there now.
  const pcs = [...state.scene.tokens, ...(state.scene.offStoreyTokens ?? [])].filter((x) => x.kind === 'pc');
  const allThere = t.kind === 'pc' && pcs.length > 0 && pcs.every((x) => (x.storey ?? '') === ask.to);
  if (allThere && state.scenePath && state.scenePath === state.tvScenePath && (state.scene.tvStorey ?? '') !== ask.to) {
    if (ask.to) state.scene.tvStorey = ask.to;
    else delete state.scene.tvStorey;
    if (state.layer === 'scene') cutTv(state.nextTransition ?? tvTransition().kind);
    state.nextTransition = null;
  }
  markDirty();
  recomputeVision();
  emit();
}

/** Whether a question about stairs still stands: its figure on this storey, on stairs leading there. */
function stairAskStands(a: { tokenId: string; to: string }): boolean {
  const t = state.scene.tokens.find((x) => x.id === a.tokenId);
  if (!t) return false;
  if (a.to && !state.scene.map.storeys?.some((s) => s.id === a.to)) return false;
  const here = state.scene.map.storey ?? '';
  const stair = stairAt(state.scene.map.stairs ?? [], here, t);
  return !!stair && otherEnd(stair, here) === a.to;
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
  state.terrainCommand = null;
  state.selectedWallIds = [];
  state.selectedAssetId = null;
  state.calibration = null;
}

/* ---------- The terrain tool "Stufe" (E-87) ---------- */

export type TerrainPreview = 'live' | 'outline';
export type TerrainTool = 'step' | 'ground' | 'biome' | 'fill';

export interface TerrainCommand {
  /** Which terrain tool (E-87, E-88): steps, ground classes, biomes, or filling ground. */
  tool: TerrainTool;
  mode: StepMode;
  shape: BrushShape;
  /** Brush size in cells (round: diameter; square: side). */
  sizeCells: number;
  /** The ground class painted or filled. */
  groundClass: GroundClass;
  /** The biome painted. */
  biome: TerrainBiome;
  /** How strongly a stroke paints (0…1). */
  strength: number;
  /** Share of the brush's radius that fades out (0…1). */
  softness: number;
  /** How different ground filling still takes (0…1). */
  tolerance: number;
  /** The step "set" sets. */
  picked: number;
  /** The next click on the map picks `picked` from the ground there. */
  picking: boolean;
  /** The terrain when the command started: Cancel goes back to it. */
  readonly before: TerrainState | null;
}

const TERRAIN_PREVIEW_KEY = 'dc.terrain.preview';

function readTerrainPreview(): TerrainPreview {
  try {
    return localStorage.getItem(TERRAIN_PREVIEW_KEY) === 'outline' ? 'outline' : 'live';
  } catch {
    return 'live';
  }
}

/** Whether painting shows the cliffs as they grow or an outline until let go – stored on this device. */
export function setTerrainPreview(preview: TerrainPreview): void {
  state.terrainPreview = preview;
  try {
    localStorage.setItem(TERRAIN_PREVIEW_KEY, preview);
  } catch {
    // Without storage it holds until the app closes.
  }
  emit();
}

/** Whether the terrain tools can work here: a drawn map in the Map Forge, its terrain readable (E-87). */
export function terrainEditable(): boolean {
  return state.layer === 'map' && !!state.scene.map.drawn && !!state.mapFile && !terrainBroken(state.mapFile);
}

type TerrainOptions = Omit<TerrainCommand, 'tool' | 'picking' | 'before'>;
const TERRAIN_OPTION_KEYS = ['mode', 'shape', 'sizeCells', 'picked', 'groundClass', 'biome', 'strength', 'softness', 'tolerance'] as const;
let lastTerrainOptions: TerrainOptions = { mode: 'raise', shape: 'round', sizeCells: 2, picked: 1, groundClass: 'grass', biome: 'temperate', strength: 1, softness: 0.5, tolerance: 0.2 };

/** Starts a terrain tool (one command at a time: another tool ends it). */
export function startTerrainCommand(tool: TerrainTool = 'step'): void {
  if (!terrainEditable()) {
    if (state.mapFile && terrainBroken(state.mapFile)) log('log.terrainReadOnly');
    return;
  }
  stroke = null;
  // Another terrain tool while one runs: the strokes so far stay, Cancel still goes back to before them.
  const before = state.terrainCommand ? state.terrainCommand.before : ownTerrain();
  state.terrainCommand = { ...lastTerrainOptions, tool, picking: false, before };
  state.wallCommand = null;
  state.areaCommand = null;
  dropCalibration();
  state.tool = 'terrain';
  emit();
}

export function updateTerrainCommand(patch: Partial<Omit<TerrainCommand, 'tool' | 'before'>>): void {
  const c = state.terrainCommand;
  if (!c) return;
  const next = { ...c, ...patch };
  state.terrainCommand = next;
  lastTerrainOptions = Object.fromEntries(TERRAIN_OPTION_KEYS.map((k) => [k, next[k]])) as TerrainOptions;
  emit();
}

/** The biome of the ground at map point `p` (the palette's first where none is painted). */
export function terrainBiomeAt(p: Point): TerrainBiome {
  const sc = state.scene;
  const t = ownTerrain();
  const palette = t?.biomePalette ?? [defaultTerrainBiome(sc.map.mapType, sc.map.biome)];
  if (!t) return palette[0]!;
  const c = toCellSpace(sc.map.grid, p);
  const w = biomeWeightsAt(t, sc.map.storey ?? 'map', Math.floor(c.x), Math.floor(c.y));
  return palette[w.indexOf(Math.max(...w))] ?? palette[0]!;
}

/** The pointer moved over the map with a ground tool: the palette follows the biome there. */
export function hoverTerrainBiome(p: Point): void {
  const biome = terrainBiomeAt(p);
  if (biome === state.terrainHover) return;
  state.terrainHover = biome;
  emit();
}

/** The map's biomes (its terrain's palette; the default one before anything is painted). */
export function terrainPalette(): readonly TerrainBiome[] {
  return ownTerrain()?.biomePalette ?? [defaultTerrainBiome(state.scene.map.mapType, state.scene.map.biome)];
}

/** The map's area in support points (filling stays inside it). */
function areaPoints(): { x0: number; y0: number; x1: number; y1: number } {
  const m = state.scene.map;
  const o = m.origin ?? { x: 0, y: 0 };
  const corners = [o, { x: o.x + m.widthPx, y: o.y }, { x: o.x, y: o.y + m.heightPx }, { x: o.x + m.widthPx, y: o.y + m.heightPx }].map((p) => supportPointAt(m.grid, p));
  return { x0: Math.min(...corners.map((c) => c[0])), y0: Math.min(...corners.map((c) => c[1])), x1: Math.max(...corners.map((c) => c[0])), y1: Math.max(...corners.map((c) => c[1])) };
}

export function setTerrainQuarter(on: boolean): void {
  state.terrainQuarter = on;
  emit();
}

/** OK: the strokes stay (each one a step of undo). */
export function finishTerrainCommand(): void {
  endTerrainCommand();
  if (state.tool === 'terrain') state.tool = 'select';
  emit();
}

/** Cancel: the terrain goes back to how it was when the command started – undoable as one step. */
export function cancelTerrainCommand(): void {
  const c = state.terrainCommand;
  if (c && state.mapFile && ownTerrain() !== c.before) {
    checkpoint();
    setTerrain(state.mapFile, c.before);
    terrainChanged(true);
  }
  finishTerrainCommand();
}

function endTerrainCommand(): void {
  stroke = null;
  state.terrainCommand = null;
  state.terrainHover = null;
}

/** A stroke being painted: the terrain it started from, the stack and the step it sets. */
let stroke: {
  /** The map it paints: a stroke never outlives its map or its command. */
  readonly mapFile: string;
  /** The terrain before it (null: none yet) and the one it paints on. */
  readonly before: TerrainState | null;
  readonly base: TerrainState;
  readonly stack: string;
  readonly startStep: number;
  path: Point[];
  /**
   * What the brush covered so far, with the strongest touch: support points (biome: cells).
   * A lasso works its points out from its path each time.
   */
  covered: Map<string, readonly [number, number, number]>;
  /** Its step of undo is taken with its first change, so a stroke changing nothing leaves none. */
  undoTaken: boolean;
} | null = null;

/** The stroke if it belongs to the command running on the map shown. */
function liveStroke(): NonNullable<typeof stroke> | null {
  return stroke && state.terrainCommand && stroke.mapFile === state.mapFile ? stroke : null;
}

/**
 * A press on the map with "Stufe": with the pipette armed, picks the step there; else starts a
 * stroke (one step of undo) – the step it sets comes from where it starts (plateau logic). True if
 * a stroke started.
 */
export function beginTerrainStroke(p: Point): boolean {
  stroke = null;
  const c = state.terrainCommand;
  if (!c || !terrainEditable() || !state.mapFile) return false;
  const stack = state.scene.map.storey ?? 'map';
  const own = ownTerrain();
  if (c.picking) {
    updateTerrainCommand({ picked: stepAt(own, stack, state.scene.map.grid, p), picking: false, mode: 'set' });
    return false;
  }
  const base = own ?? emptyTerrain([defaultTerrainBiome(state.scene.map.mapType, state.scene.map.biome)]);
  if (c.tool === 'fill') {
    // One click, one step of undo: the connected ground of the same mix on the same step (E-88).
    const [x, y] = supportPointAt(state.scene.map.grid, p);
    const points = fillPoints(base, stack, x, y, c.tolerance, areaPoints());
    const next = paintGround(base, stack, points.map(([px, py]) => [px, py, 1] as const), c.groundClass);
    if (next !== base) {
      checkpoint();
      setTerrain(state.mapFile, next);
      terrainChanged(true);
    }
    return false;
  }
  stroke = { mapFile: state.mapFile, before: own, base, stack, startStep: stepAt(base, stack, state.scene.map.grid, p), path: [p], covered: new Map(), undoTaken: false };
  cover(c, stroke, [p]);
  return true;
}

/** Adds what the brush covers along `path` (map px) to the stroke, keeping each place's strongest touch. */
function cover(c: TerrainCommand, s: NonNullable<typeof stroke>, path: readonly Point[]): void {
  const grid = state.scene.map.grid;
  if (c.tool === 'step' && c.shape === 'lasso') return;
  const touched =
    c.tool === 'ground' ? brushWeights(path, c.sizeCells, c.softness, grid)
    : c.tool === 'biome' ? brushCells(path, c.sizeCells, c.softness, grid)
    : brushPoints(path, c.shape === 'square' ? 'square' : 'round', c.sizeCells, grid, state.terrainQuarter).map(([x, y]) => [x, y, 1] as [number, number, number]);
  for (const pt of touched) {
    const key = `${pt[0]},${pt[1]}`;
    const had = s.covered.get(key);
    if (!had || had[2] < pt[2]) s.covered.set(key, pt);
  }
}

/** The stroke's terrain: `base` painted with what it covered, the way its tool paints (null: refused). */
function painted(c: TerrainCommand, s: NonNullable<typeof stroke>, invert: boolean): TerrainState | null {
  const grid = state.scene.map.grid;
  const scaled = [...s.covered.values()].map(([x, y, w]) => [x, y, w * c.strength] as const);
  if (c.tool === 'ground') return paintGround(s.base, s.stack, scaled, invert ? 'auto' : c.groundClass);
  // Alt takes cells back to the map's first biome.
  if (c.tool === 'biome') return paintBiome(s.base, s.stack, scaled, invert ? s.base.biomePalette[0]! : c.biome);
  const points = c.shape === 'lasso' ? lassoPoints(s.path.map((q) => snapLasso(q, grid, state.terrainQuarter)), grid) : [...s.covered.values()].map(([x, y]) => [x, y] as const);
  const mode = invert && c.mode !== 'set' ? (c.mode === 'raise' ? 'lower' : 'raise') : c.mode;
  return applyStroke(s.base, s.stack, points, mode, strokeStep(mode, s.startStep, c.picked));
}

/**
 * The stroke goes on to `p` (`straight`: only from its start to `p`; `invert`: lowering instead
 * of raising and the other way round). Live, the terrain changes at once; with the outline
 * preview only when `final`. Only the new piece of the path is brushed: raising and lowering
 * give the same however often a point is covered.
 */
export function moveTerrainStroke(p: Point, opts: { straight: boolean; invert: boolean }, final: boolean): void {
  const c = state.terrainCommand;
  const s = liveStroke();
  if (!c || !s) return;
  if (opts.straight && !(c.tool === 'step' && c.shape === 'lasso')) {
    s.path = [s.path[0]!, p];
    s.covered = new Map();
    cover(c, s, s.path);
  } else {
    cover(c, s, [s.path[s.path.length - 1]!, p]);
    s.path.push(p);
  }
  if (final) stroke = null;
  // The outline preview is for steps (their cliffs are what costs); ground and biomes paint at once.
  if (!final && state.terrainPreview === 'outline' && c.tool === 'step') return emit();
  const next = painted(c, s, opts.invert);
  if (!next) {
    // A fifth biome: the palette holds four (E-88).
    stroke = null;
    log('log.biomePaletteFull');
    if (s.undoTaken) {
      setTerrain(s.mapFile, s.before);
      terrainChanged(true);
    }
    return emit();
  }
  // Nothing painted yet and nothing to paint: no change, no step of undo.
  if (next === s.base && !s.undoTaken) return emit();
  if (!s.undoTaken) {
    checkpoint();
    s.undoTaken = true;
  }
  setTerrain(s.mapFile, next === s.base ? s.before : next);
  terrainChanged(final);
}

/** Escape while painting: the stroke goes, the terrain is as before it. */
export function abortTerrainStroke(): void {
  const s = liveStroke();
  stroke = null;
  if (s?.undoTaken) {
    setTerrain(s.mapFile, s.before);
    terrainChanged(true);
  } else emit();
}

/** The stroke being painted, for the outline preview (map px), or null. */
export function terrainStrokePath(): readonly Point[] | null {
  return liveStroke()?.path ?? null;
}

/** After the terrain changed: the map is unsaved, the TV's map waits (E-30), sight sees the new cliffs. */
function terrainChanged(final: boolean): void {
  markDirty();
  recomputeVision(final);
  emit();
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
  state.terrainCommand = null;
  state.tool = 'select';
  emit();
  return true;
}

export function cancelWallCommand(): void {
  if (!state.wallCommand) return;
  state.wallCommand = null;
  state.terrainCommand = null;
  if (state.tool === 'wall') state.tool = 'select';
  emit();
}

/** Selects a wall of the map; `toggle` (Shift) adds it to the selection or takes it out. */
export function selectWall(id: string | null, toggle = false): void {
  if (state.layer !== 'map') return;
  const sel = state.selectedWallIds;
  if (id !== null) state.selectedAssetId = null;
  if (id !== null) state.selectedSoundId = null;
  if (id !== null) state.selectedStairId = null;
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
  state.terrainCommand = null;
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
function onCurrentLayer(): { layer?: string; storey?: string } {
  const layer = state.layer === 'map' && state.currentLayer !== BASE_LAYER && state.scene.map.layers.some((l) => l.id === state.currentLayer) ? { layer: state.currentLayer } : {};
  // New elements go on the storey the DM works on (E-40).
  return { ...layer, ...onCurrentStorey() };
}

/** The storey new elements and figures go on (E-40). */
function onCurrentStorey(): { storey?: string } {
  return state.scene.map.storey ? { storey: state.scene.map.storey } : {};
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
  for (const el of [...sc.walls, ...sc.zones, ...sc.lights, ...sc.sounds, ...sc.map.assets]) if (el.layer === id) delete el.layer;
  if (state.currentLayer === id) state.currentLayer = BASE_LAYER;
  recomputeVision();
  emit();
}

/** Moves map elements (walls, areas, lights, sound sources, placed assets) onto a layer (one undoable step). */
export function setElementsLayer(ids: readonly string[], layerId: string): void {
  if (state.layer !== 'map') return;
  const want = new Set(ids);
  const sc = state.scene;
  const target = layerId !== BASE_LAYER && sc.map.layers.some((l) => l.id === layerId) ? layerId : null;
  checkpoint();
  for (const el of [...sc.walls, ...sc.zones, ...sc.lights, ...sc.sounds, ...sc.map.assets]) {
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

/**
 * The walls sight and light use: the scene's, cut open where placed assets bring doors, plus those
 * doors (E-29). Walls from the drawing's rasters and wall lines join with DC-129.
 */
export function sightWalls(scene: Scene, terrain: TerrainState | null = null): readonly Wall[] {
  const placed = allPlacements(scene);
  const inner = interiorWalls(placed, state.assetInfo, scene.map.grid, scene.interiorsOn, scene.assetDoorsOpen);
  return withCliffs(wallsWithAssetDoors(scene.walls, placed, state.assetInfo, scene.map.grid, scene.assetDoorsOpen, inner), cliffWallsOf(scene, terrain));
}

/**
 * The scene with the walls sight and light use (itself if nothing adds any): drawn walls, asset
 * doors and, with its map's `terrain`, the one-way walls of its cliffs (E-87).
 */
export function withAssetDoors(scene: Scene, terrain: TerrainState | null = null): Scene {
  const walls = sightWalls(scene, terrain);
  // The list itself, not a copy: sight and light keep what they computed for the same list.
  return walls === scene.walls ? scene : { ...scene, walls: walls as Wall[] };
}

/** The stack (`map` or a storey) and the active layers, lowest first, a scene shows of its terrain. */
function terrainView(scene: Scene): { stack: string; activeLayers: string[] } {
  const active = activeLayers(scene.map.layers, scene.layersOn);
  return { stack: scene.map.storey ?? 'map', activeLayers: scene.map.layers.filter((l) => active.has(l.id)).sort((a, b) => a.height - b.height).map((l) => l.id) };
}

/**
 * The blocks of `terrain` as `scene` shows them, kept per terrain state and view: the same map
 * while nothing changed (layers' patches make new blocks). Kept with the state itself, so the
 * DM's view and the TV's never push each other out; gone with the state.
 */
const shownMemo = new WeakMap<TerrainState, Map<string, ReadonlyMap<string, RasterBlock>>>();

function shownTerrain(scene: Scene, terrain: TerrainState): ReadonlyMap<string, RasterBlock> {
  const v = terrainView(scene);
  const key = JSON.stringify(v);
  let views = shownMemo.get(terrain);
  if (!views) shownMemo.set(terrain, (views = new Map()));
  let blocks = views.get(key);
  if (!blocks) views.set(key, (blocks = shownStack(terrain, v.stack, v.activeLayers)));
  return blocks;
}

const NO_BLOCKS: ReadonlyMap<string, RasterBlock> = new Map();

/** What the map view draws of the terrain (E-87): on a drawn map its biome's ground, and its cliffs once painted. */
export function terrainShape(): TerrainShape | null {
  const sc = state.scene;
  if (!sc.map.drawn) return null;
  const terrain = ownTerrain();
  return {
    source: { blocks: terrain ? shownTerrain(sc, terrain) : NO_BLOCKS, missingIsUnknown: false },
    grid: sc.map.grid,
    palette: terrain?.biomePalette ?? [defaultTerrainBiome(sc.map.mapType, sc.map.biome)],
    stepFt: terrain?.stepFt ?? 10,
    perspective: sc.map.intent?.cliffPerspective ?? BAND_PER_10_FT,
    lightAngle: sc.map.lightAngle,
    area: { x: sc.map.origin?.x ?? 0, y: sc.map.origin?.y ?? 0, width: sc.map.widthPx, height: sc.map.heightPx },
  };
}

/** One-way walls per shown blocks and grid (kept with the blocks); segments per view, so storeys never push each other out. */
const cliffMemo = new WeakMap<ReadonlyMap<string, RasterBlock>, { grid: string; walls: readonly Wall[] }>();
const cliffCaches = new Map<string, CliffCache>();

/** The one-way walls of the cliffs `scene` shows of `terrain` (E-87); the same list while they stay. */
function cliffWallsOf(scene: Scene, terrain: TerrainState | null): readonly Wall[] {
  if (!terrain) return [];
  const blocks = shownTerrain(scene, terrain);
  const grid = JSON.stringify(scene.map.grid);
  const hit = cliffMemo.get(blocks);
  if (hit?.grid === grid) return hit.walls;
  const view = JSON.stringify(terrainView(scene));
  let cache = cliffCaches.get(view);
  if (!cache) cliffCaches.set(view, (cache = new CliffCache()));
  const walls = cliffWalls(cliffLines({ blocks, missingIsUnknown: false }, { grid: scene.map.grid, noiseCells: CLIFF_NOISE_CELLS }, cache), scene.map.grid);
  cliffMemo.set(blocks, { grid, walls });
  return walls;
}

const joined = new WeakMap<readonly Wall[], { cliffs: readonly Wall[]; all: readonly Wall[] }>();

/** `walls` and `cliffs` as one list – the same list again for the same two. */
function withCliffs(walls: readonly Wall[], cliffs: readonly Wall[]): readonly Wall[] {
  if (!cliffs.length) return walls;
  const hit = joined.get(walls);
  if (hit?.cliffs === cliffs) return hit.all;
  const all = [...walls, ...cliffs];
  joined.set(walls, { cliffs, all });
  return all;
}

/** The terrain of the map shown in the DM window, if any. */
function ownTerrain(): TerrainState | null {
  return state.mapFile ? terrainOf(state.mapFile) : null;
}

/** The terrain the TV shows: held with its map while the map's changes wait (E-30), else its map's. */
function tvTerrainNow(): TerrainState | null {
  const file = tvMapFile();
  return state.tvMapPending && tvTerrain !== undefined ? tvTerrain : file ? terrainOf(file) : null;
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
  return placedAt(a, p, state.snap);
}

function placedAt(a: Pick<MapAssetPlacement, 'assetPath' | 'scale' | 'rotation'>, p: Point, snap: boolean): { x: number; y: number; rotation: number } {
  if (!snap) return { ...p, rotation: a.rotation };
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

/**
 * Places a library asset at `p` (snapped to the grid unless `snap` is off), turned and sized as
 * given, as one undoable step: on the map in the Map Forge, else in the scene.
 */
export function placeAsset(assetPath: string, p: Point, how: { rotation?: number; scale?: number; snap?: boolean } = {}): string | null {
  // A sound is placed as a sound source (E-37).
  if (isSoundRef(assetPath)) return addSound(how.snap ?? state.snap ? snapPoint(p) : p, assetPath);
  checkpoint();
  const id = freshId('asset');
  const scale = how.scale ?? 1;
  const at = placedAt({ assetPath, scale, rotation: how.rotation ?? 0 }, p, how.snap ?? state.snap);
  editableAssets().push({ id, assetPath, x: at.x, y: at.y, rotation: at.rotation, scale, ...onCurrentLayer() });
  state.selectedAssetId = id;
  state.selectedWallIds = [];
  state.selectedZoneId = null;
  rememberRecentAsset(assetPath);
  log(state.layer === 'map' ? 'log.assetPlaced' : 'log.assetPlacedScene', { name: state.assetInfo[assetPath]?.name ?? assetPath });
  recomputeVision();
  emit();
  return id;
}

/* ---------- Placing mode (E-31, DC-116) ---------- */

export interface Placing {
  /** What is placed: an object's main variant or a single asset (as the catalog lists it). */
  path: string;
  name: string;
  /** Its variants (an object's, else the asset alone) and those "random" chooses from (no house's inside). */
  variants: string[];
  random: string[];
  variant: string | 'random';
  /** What the next click places (already rolled, so the preview shows it). */
  next: { path: string; rotation: number; scale: number };
  /** Where the preview is (snapped as it will be placed); null: the pointer is off the map. */
  at: { x: number; y: number; rotation: number } | null;
}

function placeOptions(): PlaceOptions {
  const o = state.placeOptions;
  return { variant: state.placing?.variant ?? 'random', randomRotation: o.randomRotation, rotationStep: o.rotationStep, rotation: o.rotation, randomScale: o.randomScale, scaleSpread: o.scaleSpread };
}

function rollNext(): void {
  const p = state.placing;
  if (p) p.next = rollPlacement(placeOptions(), p.random, Math.random);
}

/**
 * Starts placing `path` (a catalog entry: an object's main variant or a single asset) with each
 * click; an object starts with a random variant, a single asset as it is.
 */
export function startPlacing(path: string, name: string): void {
  const o = state.vault.objects.find((x) => x.doc.variants.some((v) => `library/${v.file}` === path));
  const variants = o ? o.doc.variants.map((v) => `library/${v.file}`).filter((v) => state.vault.items.some((i) => i.relPath === v)) : [path];
  state.areaCommand = null;
  state.wallCommand = null;
  state.terrainCommand = null;
  state.placing = { path, name, variants, random: randomChoices(path, state.vault.items, state.vault.objects), variant: variants.length > 1 ? 'random' : path, next: { path, rotation: 0, scale: 1 }, at: null };
  rollNext();
  emit();
}

/** Changes the placing mode's options; what is placed next is rolled anew. */
export function setPlacing(patch: Partial<Omit<PlaceOptions, 'variant'> & { snap: boolean }> & { variant?: string }): void {
  if (!state.placing) return;
  const { variant, ...rest } = patch;
  state.placeOptions = { ...state.placeOptions, ...rest };
  if (variant !== undefined) state.placing.variant = variant;
  rollNext();
  emit();
}

/** The preview follows the pointer (snapped as it will be placed); null: off the map. */
export function previewPlacing(p: Point | null): void {
  const pl = state.placing;
  if (!pl) return;
  const at = p ? placedAt({ assetPath: pl.next.path, scale: pl.next.scale, rotation: pl.next.rotation }, p, state.placeOptions.snap) : null;
  // Redrawn only when the preview moves (snapped, most pointer moves change nothing).
  if (at?.x === pl.at?.x && at?.y === pl.at?.y && at?.rotation === pl.at?.rotation) return;
  pl.at = at;
  emit();
}

/** A click: places what the preview shows there, and rolls the next. */
export function placeHere(p: Point): void {
  const pl = state.placing;
  if (!pl) return;
  placeAsset(pl.next.path, p, { rotation: pl.next.rotation, scale: pl.next.scale, snap: state.placeOptions.snap });
  // Placing a row: the one just placed is not selected (no frame or handle in the way).
  state.selectedAssetId = null;
  rollNext();
  previewPlacing(p);
}

/** Esc, a right click or ✕: the placing mode ends. */
export function stopPlacing(): void {
  if (!state.placing) return;
  state.placing = null;
  emit();
}

export function selectPlacedAsset(id: string | null): void {
  if (id && !editableAssets().some((a) => a.id === id)) return;
  state.selectedAssetId = id;
  if (id) {
    state.selectedSoundId = null;
    state.selectedStairId = null;
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

/** The point a placed asset turns about: its anchor (E-29), else its centre. */
export function placedPivot(id: string): Point | null {
  const a = placed(id);
  return a ? anchorPoint(a, state.assetInfo[a.assetPath] ?? {}, state.scene.map.grid) : null;
}

/** The footprint of a placed asset the DM edits here, if any. */
export function placedFootprint(id: string): Footprint | null {
  const a = placed(id);
  return a ? footprint(a) : null;
}

/** Turns a placed asset to `rotation` about its anchor (live while dragging the handle, DC-113; the caller sets the checkpoint). */
export function turnPlacedAssetTo(id: string, rotation: number, final: boolean): void {
  const a = placed(id);
  if (!a) return;
  Object.assign(a, rotateAboutAnchor(a, state.assetInfo[a.assetPath] ?? {}, state.scene.map.grid, rotation - a.rotation));
  markDirty();
  recomputeVision(final);
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
  const hide = [...sc.walls, ...sc.zones, ...sc.lights, ...sc.sounds, ...sc.map.assets, ...sc.ownAssets].some((x) => x.id === id);
  if (!hide && ![...h.walls, ...h.zones, ...h.lights, ...h.sounds, ...h.assets].some((x) => x.id === id)) return;
  checkpoint();
  // Moves the element (whichever kind it is) from one list to the other.
  const split = <T extends { id: string }>(from: T[], to: T[]): [T[], T[]] => [from.filter((x) => x.id !== id), [...to, ...from.filter((x) => x.id === id)]];
  if (hide) {
    [sc.walls, h.walls] = split(sc.walls, h.walls);
    [sc.zones, h.zones] = split(sc.zones, h.zones);
    [sc.lights, h.lights] = split(sc.lights, h.lights);
    [sc.sounds, h.sounds] = split(sc.sounds, h.sounds);
    [sc.map.assets, h.assets] = split(sc.map.assets, h.assets);
    [sc.ownAssets, h.assets] = split(sc.ownAssets, h.assets);
    if (state.selectedAssetId === id) state.selectedAssetId = null;
    state.selectedWallIds = state.selectedWallIds.filter((x) => x !== id);
    if (state.selectedZoneId === id) state.selectedZoneId = null;
    if (state.selectedLightId === id) state.selectedLightId = null;
    if (state.selectedSoundId === id) state.selectedSoundId = null;
  } else {
    [h.walls, sc.walls] = split(h.walls, sc.walls);
    [h.zones, sc.zones] = split(h.zones, sc.zones);
    [h.lights, sc.lights] = split(h.lights, sc.lights);
    [h.sounds, sc.sounds] = split(h.sounds, sc.sounds);
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
  state.scene.fog = reveal ? revealAll(state.scene.fog, m.widthPx, m.heightPx, locked(), m.origin) : hideAll();
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
  state.terrainCommand = null;
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
  if (id) state.selectedSoundId = null;
  if (id) state.selectedStairId = null;
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
  if (id) state.selectedSoundId = null;
  if (id) state.selectedStairId = null;
  emit();
}

/* ---------- Storeys (DC-020, E-40) ---------- */

/** Works on storey `id` ("": the map itself) – in the Map Forge and in scenes alike. Nothing is changed. */
export function setWorkingStorey(id: string): void {
  if (!state.mapDoc || (state.storey === id && (state.scene.map.storey ?? '') === id)) return;
  commitView();
  state.storey = id;
  refreshView();
  emit();
}

/** A new storey above the highest (`up`) or below the lowest, worked on at once (Map Forge, one undoable step). */
export function addStorey(name: string, up: boolean): void {
  if (state.layer !== 'map') return;
  checkpoint();
  const storeys = state.scene.map.storeys ?? [];
  const levels = storeys.map((s) => s.level);
  const level = up ? Math.max(0, ...levels) + 1 : Math.min(0, ...levels) - 1;
  const id = newId('storey', (x) => storeys.some((s) => s.id === x));
  state.scene.map.storeys = [...storeys, { id, name: name.trim() || (up ? `+${level}` : `${level}`), level, footprint: [] }];
  commitView();
  state.storey = id;
  refreshView();
  markDirty();
  emit();
}

export function renameStorey(id: string, name: string): void {
  const s = state.scene.map.storeys?.find((x) => x.id === id);
  if (state.layer !== 'map' || !s || !name.trim() || s.name === name.trim()) return;
  checkpoint();
  s.name = name.trim();
  markDirty();
  emit();
}

/** Removes a storey and everything on it (Map Forge, one undoable step); the DM works on the map itself then. */
export function deleteStorey(id: string): void {
  if (state.layer !== 'map' || !state.scene.map.storeys?.some((x) => x.id === id)) return;
  checkpoint();
  commitView();
  const doc = state.mapDoc!;
  const keep = <T extends { storey?: string }>(xs: T[]) => xs.filter((x) => x.storey !== id);
  state.mapDoc = {
    ...doc,
    storeys: doc.storeys.filter((x) => x.id !== id),
    walls: keep(doc.walls), zones: keep(doc.zones), lights: keep(doc.lights), sounds: keep(doc.sounds), assets: keep(doc.assets),
    // Stairs to or from it lead nowhere now (E-44).
    stairs: doc.stairs.filter((x) => x.from !== id && x.to !== id),
  };
  state.storey = '';
  refreshView();
  markDirty();
  emit();
}

/**
 * Shows storey `id` ("": the map itself) on the TV (E-40): for the start while preparing, else for
 * the play state; on the TV it changes with a transition. One undoable step.
 */
export function setTvStorey(id: string): void {
  if (state.layer === 'map' || !state.mapDoc || (state.scene.tvStorey ?? '') === id) return;
  if (id && !state.scene.map.storeys?.some((x) => x.id === id)) return;
  checkpoint();
  if (id) state.scene.tvStorey = id;
  else delete state.scene.tvStorey;
  markDirty();
  if (state.layer === 'scene' && state.scenePath && state.scenePath === state.tvScenePath) {
    cutTv(state.nextTransition ?? tvTransition().kind);
    state.nextTransition = null;
  }
  emit();
}

/** Puts a figure of this storey on storey `id` (E-40); it leaves the view of this one. One undoable step. */
export function moveTokenToStorey(tokenId: string, id: string): void {
  const t = state.scene.tokens.find((x) => x.id === tokenId);
  if (!t || (state.scene.map.storey ?? '') === id) return;
  if (id && !state.scene.map.storeys?.some((x) => x.id === id)) return;
  checkpoint();
  putOnStorey(tokenId, id);
  markDirty();
  recomputeVision();
  emit();
}

/** Moves a figure of this storey onto storey `id` (no undo step of its own). */
function putOnStorey(tokenId: string, id: string): void {
  const t = state.scene.tokens.find((x) => x.id === tokenId);
  if (!t) return;
  const moved = { ...t, ...(id ? { storey: id } : {}) };
  if (!id) delete moved.storey;
  state.scene.tokens = state.scene.tokens.filter((x) => x.id !== tokenId);
  state.scene.offStoreyTokens = [...(state.scene.offStoreyTokens ?? []), moved];
  if (state.selectedTokenId === tokenId) state.selectedTokenId = null;
  state.stairAsks = state.stairAsks.filter((a) => a.tokenId !== tokenId);
}

/**
 * Adds area `zoneId` to the footprint of the storey worked on (E-40) and removes the area – it was
 * drawn for that (Map Forge, one undoable step).
 */
export function areaToFootprint(zoneId: string): void {
  const m = state.scene.map;
  const def = m.storey ? m.storeys?.find((x) => x.id === m.storey) : undefined;
  const zone = state.scene.zones.find((z) => z.id === zoneId);
  if (state.layer !== 'map' || !def || !zone) return;
  checkpoint();
  def.footprint = [...def.footprint, ...structuredClone(zone.shape)];
  state.scene.zones = state.scene.zones.filter((z) => z.id !== zoneId);
  if (state.selectedZoneId === zoneId) state.selectedZoneId = null;
  markDirty();
  recomputeVision();
  emit();
}

/** Sets (or, with null, removes) the picture of storey `id` (Map Forge, one undoable step). */
export function setStoreyImage(id: string, image: string | null): void {
  const def = state.scene.map.storeys?.find((x) => x.id === id);
  if (state.layer !== 'map' || !def || (def.image ?? null) === image) return;
  checkpoint();
  if (image) def.image = image;
  else delete def.image;
  markDirty();
  emit();
}

/** Clears the hand-drawn part of the footprint of the storey worked on (Map Forge, one undoable step). */
export function clearFootprint(): void {
  const m = state.scene.map;
  const def = m.storey ? m.storeys?.find((x) => x.id === m.storey) : undefined;
  if (state.layer !== 'map' || !def || !def.footprint.length) return;
  checkpoint();
  def.footprint = [];
  markDirty();
  emit();
}

/* ---------- Stairs (DC-026, E-44) ---------- */

/**
 * New stairs over `rect` (Map Forge) from the storey worked on to the nearest storey above it
 * (else below); selected at once. None without another storey to lead to.
 */
export function addStair(rect: { x: number; y: number; w: number; h: number }): string | null {
  if (state.layer !== 'map') return null;
  const storeys = state.scene.map.storeys ?? [];
  const here = state.scene.map.storey ?? '';
  const level = here ? (storeys.find((s) => s.id === here)?.level ?? 0) : 0;
  const all = [{ id: '', level: 0 }, ...storeys].filter((s) => s.id !== here);
  const above = all.filter((s) => s.level > level).sort((a, b) => a.level - b.level)[0];
  const below = all.filter((s) => s.level < level).sort((a, b) => b.level - a.level)[0];
  const target = above ?? below;
  if (!target) {
    log('log.stairNeedsStorey');
    emit();
    return null;
  }
  checkpoint();
  const id = newId('stair', (x) => (state.scene.map.stairs ?? []).some((s) => s.id === x));
  // The way up points towards the higher storey: from the lower end, "up" is north as drawn.
  const [from, to] = target.level > level ? [here, target.id] : [target.id, here];
  state.scene.map.stairs = [...(state.scene.map.stairs ?? []), { id, ...rect, ...(from ? { from } : {}), ...(to ? { to } : {}), dir: 'n' }];
  state.selectedStairId = id;
  markDirty();
  emit();
  return id;
}

/** The stair under `p` on the storey worked on (Map Forge). */
export function stairUnder(p: Point): string | null {
  return stairAt(state.scene.map.stairs ?? [], state.scene.map.storey ?? '', p)?.id ?? null;
}

export function selectStair(id: string | null): void {
  state.selectedStairId = id;
  if (id) {
    state.selectedLightId = null;
    state.selectedTokenId = null;
    state.selectedWallIds = [];
    state.selectedZoneId = null;
    state.selectedAssetId = null;
    state.selectedSoundId = null;
  }
  emit();
}

/** Changes a stair (Map Forge, one undoable step): its way up, or the storey at its other end. */
export function updateStair(id: string, patch: Partial<Pick<Stair, 'dir' | 'from' | 'to'>>): void {
  const s = state.scene.map.stairs?.find((x) => x.id === id);
  if (state.layer !== 'map' || !s) return;
  checkpoint();
  Object.assign(s, patch);
  // "from" stays the lower end; turned round, the way up turns with it.
  const level = (id2: string | undefined) => (id2 ? (state.scene.map.storeys?.find((x) => x.id === id2)?.level ?? 0) : 0);
  if (patch.dir === undefined && level(s.from) > level(s.to)) {
    [s.from, s.to] = [s.to, s.from];
    s.dir = ({ n: 's', s: 'n', e: 'w', w: 'e' } as const)[s.dir];
  }
  if (!s.from) delete s.from;
  if (!s.to) delete s.to;
  markDirty();
  emit();
}

export function removeStair(id: string): void {
  if (state.layer !== 'map' || !state.scene.map.stairs?.some((x) => x.id === id)) return;
  checkpoint();
  state.scene.map.stairs = state.scene.map.stairs.filter((x) => x.id !== id);
  if (state.selectedStairId === id) state.selectedStairId = null;
  markDirty();
  emit();
}

/* ---------- Map variants (DC-023, E-41) ---------- */

/** Library pictures by path → their URL (null: cannot be shown); looked up once. */
const pictures = new Map<string, string | null>();
let resolvePicture: ((path: string) => Promise<string | null>) | null = null;

/** How a library picture becomes a URL the renderer loads (set by the campaign layer). */
export function setPictureResolver(fn: (path: string) => Promise<string | null>): void {
  resolvePicture = fn;
}

const VIDEO_FILE = /\.(mp4|webm|m4v|mov)$/i;

/**
 * The picture a scene shows: its variant's (E-41) or the map's own. A variant's picture not looked
 * up yet shows nothing (black) until it is – never the other picture for a moment.
 */
export function pictureOf(scene: Pick<Scene, 'map' | 'variant'>): { url: string | null; isVideo: boolean } {
  // A storey (E-40) shows its own picture, if it has one – never the map's beneath it.
  const storey = scene.map.storey ? scene.map.storeys?.find((x) => x.id === scene.map.storey) : undefined;
  if (scene.map.storey) return storey?.image ? libraryPicture(storey.image) : { url: null, isVideo: false };
  const v = scene.variant ? scene.map.variants?.find((x) => x.id === scene.variant) : undefined;
  if (!v) return { url: scene.map.imageUrl, isVideo: scene.map.isVideo };
  return libraryPicture(v.image);
}

/** A library picture's URL once looked up (none until then, never another picture meanwhile). */
function libraryPicture(image: string): { url: string | null; isVideo: boolean } {
  const isVideo = VIDEO_FILE.test(image);
  if (pictures.has(image)) return { url: pictures.get(image) ?? null, isVideo };
  if (resolvePicture) {
    pictures.set(image, null);
    const path = image;
    void resolvePicture(path)
      .catch(() => null)
      .then((url) => {
        pictures.set(path, url);
        if (!url) log('log.variantMissing', { file: path });
        emit();
      });
  }
  return { url: null, isVideo };
}

/** The scene with the picture it shows in place of the map's (for the TV's frame). */
function withPicture(scene: Scene): Scene {
  if (!scene.variant && !scene.map.storey) return scene;
  const p = pictureOf(scene);
  return { ...scene, map: { ...scene.map, imageUrl: p.url, isVideo: p.isVideo } };
}

/**
 * Shows a variant of the map in this scene, or the map's own picture (null): for the start while
 * preparing, else for the play state. Its light counts; on the TV it changes with a transition.
 */
export function setSceneVariant(id: string | null): void {
  if (state.layer === 'map' || !state.mapDoc) return;
  const v = id ? state.scene.map.variants?.find((x) => x.id === id) : undefined;
  if ((v?.id ?? undefined) === state.scene.variant) return;
  checkpoint();
  if (v) state.scene.variant = v.id;
  else delete state.scene.variant;
  state.scene.ambient = v?.ambient ?? state.mapDoc.ambient;
  markDirty();
  recomputeVision();
  if (state.layer === 'scene' && state.scenePath && state.scenePath === state.tvScenePath) {
    cutTv(state.nextTransition ?? tvTransition().kind);
    state.nextTransition = null;
  }
  emit();
}

/* ---------- The picture's look (DC-022, E-42) ---------- */

/** "Adjust picture": the look as edited (a preview until OK) and as it was. */
export interface LookCommand {
  draft: MapLook;
  /** A cut is being dragged on the map. */
  cropping?: boolean;
}

/** The look the DM window shows: the one being edited, else the map's. */
export function shownLook(): MapLook | undefined {
  return state.lookCommand?.draft ?? state.scene.map.look;
}

export function startLookCommand(): void {
  if (state.layer !== 'map') return;
  state.areaCommand = null;
  state.wallCommand = null;
  state.terrainCommand = null;
  state.placing = null;
  state.lookCommand = { draft: structuredClone(state.scene.map.look ?? { rotation: 0 }) };
  emit();
}

/** Changes the preview (nothing saved yet). */
export function updateLook(patch: Partial<MapLook>): void {
  if (!state.lookCommand) return;
  state.lookCommand = { draft: { ...state.lookCommand.draft, ...patch } };
  emit();
}

/** Starts (or ends) dragging a cut on the map. */
export function setCropping(on: boolean): void {
  if (!state.lookCommand) return;
  state.lookCommand = { ...state.lookCommand, cropping: on };
  emit();
}

/** OK: the look as one undoable step; unchanged parts (no turn, no cut, no adjustment) are left out. */
export function finishLookCommand(): void {
  const c = state.lookCommand;
  if (!c) return;
  if (state.layer !== 'map') {
    state.lookCommand = null;
    emit();
    return;
  }
  state.lookCommand = null;
  checkpoint();
  const plain = c.draft.rotation === 0 && !c.draft.crop && !c.draft.adjust;
  if (plain) delete state.scene.map.look;
  else state.scene.map.look = structuredClone(c.draft);
  markDirty();
  emit();
}

export function cancelLookCommand(): void {
  state.lookCommand = null;
  emit();
}

/* ---------- Leak check (DC-025, E-43) ---------- */

/** Opens or closes the leak check (Map Forge). */
export function setLeakCheck(open: boolean): void {
  state.leakCheck = open ? (state.leakCheck ?? { figure: null, darkvisionFt: 60 }) : null;
  emit();
}

/** Puts the test figure at `p` (none: away) or changes its darkvision. Nothing of it is saved. */
export function updateLeakCheck(patch: Partial<NonNullable<AppState['leakCheck']>>): void {
  if (!state.leakCheck) return;
  state.leakCheck = { ...state.leakCheck, ...patch };
  emit();
}

let leaksCache: { walls: readonly Wall[]; cell: number; leaks: Leak[] } | null = null;

/** The leaks of the walls sight uses (drawn walls and asset doors included); computed when they change. */
export function currentLeaks(): Leak[] {
  const walls = sightWalls(state.scene, ownTerrain());
  const cell = state.scene.map.grid.cellWidth;
  if (leaksCache?.walls !== walls || leaksCache.cell !== cell) leaksCache = { walls, cell, leaks: findLeaks(walls, cell / 2) };
  return leaksCache.leaks;
}

let sightCache: { key: string; walls: readonly Wall[]; lights: unknown; sight: Polygon[] } | null = null;

/** What the test figure sees now: as a player character there would (light, darkvision, walls). */
export function testFigureSight(): Polygon[] {
  const lc = state.leakCheck;
  if (!lc?.figure) return [];
  // The same while figure, walls and lights stay: the overlay asks every frame.
  const key = `${lc.figure.x},${lc.figure.y},${lc.darkvisionFt},${state.scene.ambient}`;
  const walls = sightWalls(state.scene, ownTerrain());
  if (sightCache?.key === key && sightCache.walls === walls && sightCache.lights === state.scene.lights) return sightCache.sight;
  const probe: Token = { id: '__test', name: '', label: '', kind: 'pc', x: lc.figure.x, y: lc.figure.y, size: 1, ringColor: '#ffffff', visionFt: lc.darkvisionFt, hp: 1, maxHp: 1, ac: 10, initiative: 0, conditions: [] };
  const seen = withAssetDoors(state.scene, ownTerrain());
  const sight = visiblePolygons(updateVision({ ...seen, tokens: [probe] }, assetExtras(state.scene)));
  sightCache = { key, walls, lights: state.scene.lights, sight };
  return sight;
}

/* ---------- Sound sources (E-37, DC-104) ---------- */

/** Places a sound source (a library audio file or `builtin:<key>`) and selects it; returns its id. */
export function addSound(p: Point, sound: string): string {
  checkpoint();
  const id = freshId('sound');
  state.scene.sounds.push({ id, sound, x: p.x, y: p.y, radiusFt: 30, volume: 0.8, fade: true, ...onCurrentLayer() });
  selectSound(id);
  rememberRecentAsset(sound);
  log('log.soundPlaced');
  emit();
  return id;
}

/** The sound source under `p` (one that can be edited here; in a scene also a switched-off one), if any. */
export function soundAt(p: Point): string | null {
  const r = state.scene.map.grid.cellWidth * 0.45;
  const sc = state.scene;
  const all = state.layer === 'map' ? sc.sounds : [...sc.hidden.sounds, ...sc.sounds];
  return [...all].reverse().find((x) => editableHere(x) && Math.hypot(x.x - p.x, x.y - p.y) < r)?.id ?? null;
}

/**
 * Switches a sound source on or off in the scene (DC-104c): off is hidden, as other map elements
 * are (DC-103) – for the start while preparing, else for the play state. It stays selected.
 */
export function setSoundPlaying(id: string, on: boolean): void {
  if (state.layer === 'map' || state.scene.sounds.some((x) => x.id === id) === on) return;
  toggleHidden(id);
  state.selectedTokenId = null;
  selectSound(id);
}

/**
 * A source's volume in this scene (DC-104c): state like a light being on – for the start while
 * preparing, else for the play state; "reset scene" brings the start's back. One undoable step.
 */
export function setSoundLevel(id: string, level: number): void {
  const x = state.layer === 'map' ? undefined : state.scene.sounds.find((q) => q.id === id);
  if (!x) return;
  checkpoint();
  x.level = Math.max(0, Math.min(1, level));
  markDirty();
  emit();
}

/** "Stop all" and the Map sounds panel: the map's sounds silent until switched on again (this session). */
export function setMapSoundsMuted(muted: boolean): void {
  state.mapSoundsMuted = muted;
  emit();
}

/**
 * The scene whose map sounds play (E-37, DM 2026-11-26): the TV's – also while another tab is
 * prepared or the Map Forge is open, as the soundboard does (E-30); without one, the scene open
 * in the Orchestrator. Null: none.
 */
export function soundView(): Scene | null {
  const tv = tvView();
  if (tv) return tv.scene;
  return state.ws === 'play' && state.layer !== 'map' && state.mapDoc ? state.scene : null;
}

/**
 * The scene's sound everywhere (DC-104c): its own, `"none"` for silence, or null for the map's.
 * One undoable step; in a scene only (the Map Forge sets the map's in Map settings).
 */
export function setSceneAmbientSound(v: { sound: string; volume: number } | 'none' | null): void {
  if (state.layer === 'map') return;
  checkpoint();
  if (v === null) delete state.scene.ambientOverride;
  else state.scene.ambientOverride = v === 'none' ? 'none' : { ...v };
  markDirty();
  emit();
}

export function selectSound(id: string | null): void {
  state.selectedSoundId = id;
  if (id) {
    state.selectedStairId = null;
    state.selectedTokenId = null;
    state.selectedLightId = null;
    state.selectedAssetId = null;
    state.selectedWallIds = [];
    state.selectedZoneId = null;
  }
  emit();
}

/**
 * Changes a sound source. `step`: a new undoable step (a field set in the panel); without, the
 * change joins the step already taken (dragging it or its radius).
 */
export function updateSound(id: string, patch: Partial<Omit<SoundSource, 'id'>>, step = true): void {
  const x = state.scene.sounds.find((s) => s.id === id);
  if (!x) return;
  if (step) checkpoint();
  Object.assign(x, patch);
  markDirty();
  emit();
}

export function removeSound(id: string): void {
  if (!state.scene.sounds.some((x) => x.id === id)) return;
  checkpoint();
  state.scene.sounds = state.scene.sounds.filter((x) => x.id !== id);
  if (state.selectedSoundId === id) state.selectedSoundId = null;
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
  /** The map's sound everywhere (E-37); none: silent. */
  ambientSound: { sound: string; volume: number } | null;
  /** How the TV changes to a scene on this map (E-38). */
  transition: Transition;
  /** Other pictures of the map (E-41). */
  variants: MapVariant[];
  /** The cliff band's width, cells per 10 ft drop (E-87). */
  cliffPerspective: number;
}

export function openMapSettings(open = true): void {
  state.mapSettingsOpen = open && state.layer === 'map';
  emit();
}

export function currentMapSettings(): MapSettings {
  const m = state.scene.map;
  return { name: m.name, mapType: m.mapType, region: m.region, tags: [...m.tags], biome: m.biome, ambient: state.scene.ambient, ambientSound: m.ambientSound ? { ...m.ambientSound } : null, transition: { ...(m.transition ?? DEFAULT_TRANSITION) }, variants: (m.variants ?? []).map((v) => ({ ...v })), cliffPerspective: m.intent?.cliffPerspective ?? BAND_PER_10_FT };
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
  if (s.ambientSound) m.ambientSound = { ...s.ambientSound };
  else delete m.ambientSound;
  // Written only when it is not the default, so maps keep no field they do not need.
  // A variant without a name would make the map file unreadable: its picture's name then.
  m.variants = s.variants.map((v) => ({ ...v, name: v.name.trim() || v.image.split('/').pop()!.replace(/\.[^.]+$/, '') || v.id }));
  const plain = s.transition.kind === DEFAULT_TRANSITION.kind && s.transition.seconds === DEFAULT_TRANSITION.seconds;
  if (plain && !m.transition) delete m.transition;
  else m.transition = { ...s.transition };
  state.scene.ambient = s.ambient;
  // Like the transition: in the file only when it is not the default (E-87).
  const { cliffPerspective: _old, ...intent } = m.intent ?? {};
  m.intent = s.cliffPerspective === BAND_PER_10_FT ? intent : { ...intent, cliffPerspective: s.cliffPerspective };
  recomputeVision();
  markDirty();
  emit();
  return true;
}

/* ---------- Tokens from creatures ---------- */

/** Where new tokens go: the centre of what the TV shows, else of the map. */
function tableCentre(): Point {
  const m = state.scene.map;
  return { x: state.scene.table.centerX || (m.origin?.x ?? 0) + m.widthPx / 2, y: state.scene.table.centerY || (m.origin?.y ?? 0) + m.heightPx / 2 };
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
  // Figures on other storeys count too: never a second copy of a character (E-40).
  const added = missingPartyTokens(state.players, state.creatures, [...state.scene.tokens, ...(state.scene.offStoreyTokens ?? [])], { at: c, cell: state.scene.map.grid.cellWidth, newId: freshId });
  if (added.length === 0) {
    log('log.partyComplete');
    emit();
    return;
  }
  checkpoint();
  state.scene.tokens.push(...added.map((t) => ({ ...t, ...onCurrentStorey() })));
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
  state.scene.tokens.push({ ...tokenFromCreature(c, id, snapPoint(at ?? tableCentre()), same), ...onCurrentStorey() });
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
    state.selectedSoundId = null;
    state.selectedStairId = null;
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
  // The TV fades out to black and in again (E-38).
  cutTv(state.scene.table.blackout ? 'out' : 'in');
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
  const top = frameOf(tv, now, state.ws === 'play' && tv.scene === state.scene ? initiativeOrder()[tv.turn]?.id ?? null : null, tvRasterOf(tv.scene));
  // A storey on the TV (E-40): it covers its footprint; the storeys below show outside it, each
  // with its own fog only.
  const st = tv.scene.map.storey;
  const def = st ? tv.scene.map.storeys?.find((x) => x.id === st) : undefined;
  state.frame = def ? { ...top, storeyClip: tvFootprint(def), below: framesBelow(tv, now) } : top;
  return state.frame;
}

/** The TV's terrain while it waits for the DM to take map changes over (E-30): held with `tvMap`. */
let tvTerrain: TerrainState | null | undefined;

const rasterMemo: { terrain: TerrainState | null; fog: unknown; key: string; blocks: ReadonlyMap<string, RasterBlock>; frame: Omit<NonNullable<ProjectionOptions['raster']>, 'perspective' | 'lightAngle'> | null } = {
  terrain: null,
  fog: null,
  key: '',
  blocks: new Map(),
  frame: null,
};

/**
 * What of its terrain the TV may know (E-85): worked out again only when the terrain, the fog, the
 * secret areas, the layers, the storey or the grid changed. Terrain and fog are replaced on every
 * change, so they compare by identity; areas are changed in place, so the rest compares by content.
 * Undiscovered secret areas count also when hidden in the scene or on an inactive layer.
 */
function tvRasterOf(scene: Scene): NonNullable<ProjectionOptions['raster']> | null {
  const terrain = tvTerrainNow();
  // Terrain is drawn on drawn maps only for now (E-87): there it has its ground even before the first step.
  if (!terrain && !scene.map.drawn) return null;
  const look = { perspective: scene.map.intent?.cliffPerspective ?? BAND_PER_10_FT, lightAngle: scene.map.lightAngle };
  if (!terrain) {
    rasterMemo.blocks = new Map();
    Object.assign(rasterMemo, { terrain: null, fog: null, key: '', frame: null });
    return { stepFt: 10, palette: [defaultTerrainBiome(scene.map.mapType, scene.map.biome)], ...look, blocks: {} };
  }
  const active = activeLayers(scene.map.layers, scene.layersOn);
  const view = {
    stack: scene.map.storey ?? 'map',
    activeLayers: scene.map.layers.filter((l) => active.has(l.id)).sort((a, b) => a.height - b.height).map((l) => l.id),
    shown: [...scene.fog.revealed, ...scene.fog.remembered],
    hidden: lockedAreas([...scene.zones, ...scene.hidden.zones, ...scene.inactive.zones]),
    grid: scene.map.grid,
  };
  const key = JSON.stringify([view.stack, view.activeLayers, view.hidden, view.grid]);
  if (terrain !== rasterMemo.terrain || scene.fog !== rasterMemo.fog || key !== rasterMemo.key || !rasterMemo.frame) {
    Object.assign(rasterMemo, { terrain, fog: scene.fog, key });
    const r = tvRaster(terrain, view);
    rasterMemo.blocks = new Map([...r.values()].map((v) => [v.checksum, v.block]));
    // The TV learns a biome's name only if its blocks use it (E-88): one painted only where it may
    // not look stays unnamed.
    const used = new Set([0]);
    for (const { block } of r.values()) (['biome2', 'biome3', 'biome4'] as const).forEach((ch, k) => block.planes[ch].some((v) => v > 0) && used.add(k + 1));
    rasterMemo.frame = { stepFt: terrain.stepFt, palette: terrain.biomePalette.map((b, i) => (used.has(i) ? b : null)), blocks: Object.fromEntries([...r].map(([k, v]) => [k, v.checksum])) };
  }
  return { ...rasterMemo.frame, ...look };
}

/** The terrain blocks the TV's last frame names, by checksum: `pushRaster` sends those it lacks. */
export function tvRasterBlocks(): ReadonlyMap<string, RasterBlock> {
  return rasterMemo.blocks;
}

/** The TV's frame of one view: its storey with its own fog, light and figures; the TV's own carries its terrain. */
function frameOf(tv: TvView, now: number, activeTokenId: string | null, raster: ProjectionOptions['raster'] = null): PlayerFrame {
  // The picture the scene shows: a variant's or the map's own (E-41).
  return buildPlayerFrame(withPicture(tv.scene), {
    seq: state.frameSeq,
    now,
    showGrid: state.showGrid,
    memoryOpacity: state.memoryOpacity,
    movementLocked: state.moveLock,
    zoom: tableZoom(tv.scene.map.grid),
    look: lookToWire(state.fogLook),
    visible: tv.visible,
    quick: state.fogQuick,
    activeTokenId,
    seedKey: tv.resource,
    lights: tv.lights,
    // Only the scene's shown placements: assets it hides never reach the TV.
    // Houses as switched in the scene (E-29); the TV never sees through a roof.
    assets: assetShapes(drawnPlacements(allPlacements(tv.scene), state.assetInfo, tv.scene.interiorsOn, false), state.assetInfo, tv.scene.map.grid, { effectsOn: tv.scene.effectsOn, runs: tv.runs }),
    covers: assetExtras(tv.scene).covers,
    cut: state.tvCut,
    raster,
  });
}

let belowCache: { key: string; views: TvView[] } | null = null;

/**
 * The frames of the storeys below the TV's (E-40), nearest first: each built from the scene file
 * like the TV's own, with its own fog – only what players found there. Rebuilt when anything changed.
 */
function framesBelow(tv: TvView, now: number): StoreyFrame[] {
  const storeys = tv.scene.map.storeys ?? [];
  const ids = storeysBelow(storeys, tv.scene.map.storey ?? '');
  if (!ids.length) return [];
  // Storeys below change with the documents only, never with a pointer move.
  // The DM working in the TV's scene on a storey below it (fog, figures): every change goes to the
  // TV at once – never an old picture with more revealed than now.
  const live = state.layer === 'scene' && state.tvScenePath === state.scenePath && ids.includes(state.storey) ? version : '';
  const key = `${viewVersion}|${tvMapVersion}|${state.tvScenePath}|${state.tvMapPending}|${live}|${ids.join(',')}`;
  if (belowCache?.key !== key) {
    const docs = tvDocs();
    belowCache = {
      key,
      views: docs
        ? ids.map((id) => {
            const scene = sceneFromDocuments(docs.map, docs.ov, tv.scene.map.imageUrl, tv.scene.table, 'scene', id);
            const extras = assetExtras(scene);
            const seen = withAssetDoors(scene, tvTerrainNow());
            const vision = updateVision(seen, extras);
            return { scene, visible: visiblePolygons(vision), lights: litSources(seen, extras), turn: 0, resource: tv.resource, runs: tv.runs };
          })
        : [],
    };
  }
  return belowCache.views.map((v) => {
    const def = storeys.find((x) => x.id === v.scene.map.storey);
    const f = frameOf(v, now, null);
    return def ? { ...f, storeyClip: tvFootprint(def) } : f;
  });
}

const footprints = new WeakMap<object, Polygon[]>();

/**
 * The footprint of a storey as the TV may show it (E-40): the area drawn by hand (from what players
 * may know of the drawing again with DC-129). Kept while the storey stays the same.
 */
function tvFootprint(def: MapStorey): Polygon[] {
  const hit = footprints.get(def.footprint);
  if (hit) return hit;
  const fp = storeyFootprint(def);
  footprints.set(def.footprint, fp);
  return fp;
}

let dmBelow: { key: string; frames: StoreyFrame[] } | null = null;
let dmSeq = 0;

/**
 * For the DM window (E-40): the storeys below the one the DM works on, as frames with nothing
 * fogged (the DM sees all), placed by the DM window's camera `cam` (CSS px). Null: none below.
 */
export function dmFramesBelow(cam: { centerX: number; centerY: number; zoom: number; rotation: 0 | 90 | 180 | 270; width: number; height: number }): PlayerFrame | null {
  const ids = storeysBelow(state.scene.map.storeys ?? [], state.scene.map.storey ?? '');
  if (!ids.length || !state.mapDoc) return null;
  const key = `${viewVersion}|${state.storey}|${state.layer}|${ids.join(',')}`;
  if (dmBelow?.key !== key) {
    const docs = docsFromView();
    const m = state.scene.map;
    const o = m.origin ?? { x: 0, y: 0 };
    const all = rectPolygon(o.x, o.y, o.x + m.widthPx, o.y + m.heightPx);
    dmSeq++;
    dmBelow = {
      key,
      frames: ids.map((id) => {
        const scene = sceneFromDocuments(docs.map, docs.ov, state.scene.map.imageUrl, state.scene.table, state.layer, id);
        // The DM sees everything there: no fog, no darkness.
        scene.fog = { revealed: [all], remembered: [] };
        scene.ambient = 'lit';
        const def = scene.map.storeys?.find((x) => x.id === id);
        // Its own counter, no transitions of the TV's (DM window only).
        const f = { ...frameOf({ scene, visible: [all], lights: [], turn: 0, resource: state.mapResource, runs: {} }, Date.now(), null), seq: dmSeq, cut: { n: 0, play: 'cut' as const, ms: 0 } };
        return def ? { ...f, storeyClip: storeyFootprint(def) } : f;
      }),
    };
  }
  const now = Date.now();
  // Placed as the DM window shows the map; fresh, so the view never takes them as stale.
  const frames = dmBelow.frames.map((f) => ({ ...f, issuedAt: now, zoom: cam.zoom, center: { x: cam.centerX, y: cam.centerY }, rotation: cam.rotation, display: { widthPx: Math.max(1, Math.round(cam.width)), heightPx: Math.max(1, Math.round(cam.height)) }, blackout: false }));
  return { ...frames[0], below: frames };
}

/** The footprint of the storey the DM works on (E-40); none for the map itself. */
export function workingFootprint(): Polygon[] | null {
  const m = state.scene.map;
  const def = m.storey ? m.storeys?.find((x) => x.id === m.storey) : undefined;
  return def ? storeyFootprint(def) : null;
}

/** The files of the TV's scene, as the TV has them: the map it was put there with, the scene as it is. */
function tvDocs(): { map: MapSidecar; ov: SceneOverride | null } | null {
  if (state.tvScenePath && state.tvScenePath !== state.scenePath) {
    const s = sessions.get(state.tvScenePath);
    const map = s ? (tvMap ?? openMaps.get(s.mapFile) ?? s.mapDoc) : null;
    return s && map ? { map, ov: s.sceneDoc } : null;
  }
  if (!state.mapDoc) return null;
  const docs = docsFromView();
  return { map: state.tvMapPending && tvMap ? tvMap : docs.map, ov: docs.ov };
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
let backgroundTv: { session: Session; info: Record<string, AssetInfo>; map: MapSidecar | null; terrain: TerrainState | null; view: TvView } | null = null;

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
  // The DM may work on another storey than the TV shows (E-40): then the TV's is built apart.
  const otherStorey = (state.scene.map.storey ?? '') !== (state.scene.tvStorey ?? '');
  if (!state.mapDoc || (state.layer === 'scene' && !pending && !otherStorey)) return { scene: state.scene, visible: state.visible, lights: state.lights, ...own };
  // The scene as shown (its state changes go to the TV at once), on the map the TV has.
  // Working on another storey changes nothing of the TV's: rebuilt with the view, not every move.
  const stamp = pending ? `p${version}` : otherStorey ? `s${viewVersion}|${state.scene.tvStorey ?? ''}|${state.scene.table.blackout}` : `v${viewVersion}`;
  if (!tvCache || tvCache.version !== stamp) {
    // Editing the map or the start state: the TV shows the play state, with the map as the TV
    // has it (its changes wait for the DM, E-30) and the scene's changes as they are being edited.
    const map = pending ? tvMap! : mapSidecarFromScene(state.scene, state.mapResource, state.layer, state.mapDoc);
    let ov = state.layer === 'scene' ? docsFromView().ov : state.sceneDoc;
    if (ov && state.layer === 'start') {
      const fromView = sceneOverrideFromScene(state.scene, state.sceneName, ov.mapSidecar, { round: state.round, turn: state.turn }, map, layerOf(ov));
      ov = { ...ov, overrides: fromView.overrides, added: fromView.added };
    }
    const scene = sceneFromDocuments(map, ov, state.scene.map.imageUrl, state.scene.table, 'scene', ov?.tvStorey ?? '');
    const extras = assetExtras(scene);
    const seen = withAssetDoors(scene, tvTerrainNow());
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
  const map = tvMap ?? openMaps.get(s.mapFile) ?? s.mapDoc;
  if (!map) return null;
  const terrain = tvTerrainNow();
  if (!backgroundTv || backgroundTv.session !== s || backgroundTv.info !== state.assetInfo || backgroundTv.map !== map || backgroundTv.terrain !== terrain) {
    const scene = sceneFromDocuments(map, s.sceneDoc, s.imageUrl, state.scene.table, 'scene', s.sceneDoc?.tvStorey ?? '');
    const extras = assetExtras(scene);
    const seen = withAssetDoors(scene, terrain);
    const vision = updateVision(seen, extras);
    backgroundTv = { session: s, info: state.assetInfo, map, terrain, view: { scene, visible: visiblePolygons(vision), lights: litSources(seen, extras), turn: s.turn, resource: s.mapResource, runs: s.effectRuns } };
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
