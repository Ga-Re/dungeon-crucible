/**
 * DM application state. A tiny external store: components subscribe via
 * `useStore`, actions mutate state and call `emit()`.
 */
import { useSyncExternalStore } from 'react';
import type { Point } from '../core/geometry';
import { gridFromBox, shiftGrid, snapToCell, tableZoomForPhysicalGrid, type GridBox, type GridConfig } from '../core/grid';
import { buildPlayerFrame, type PlayerFrame } from '../core/projection';
import type { AreaTemplate, FogBiome, MapAssetPlacement, MapType, Scene, TableRotation, TemplateShape, Token, Wall, WallKind } from '../core/scene';
import { assetShapes, footprintOf, hitsPlacement, nextVariant, rotateBy, scaleBy, snapPlacement } from '../core/placement';
import { rollDice, type RollResult } from '../core/rules/dice';
import type { Condition } from '../core/rules/rules2024';
import { litSources, updateVision, visiblePolygons, type LitSource, type ViewerVision, type VisionExtras } from '../core/vision';
import { placementCovers, placementLights } from '../core/cover';
import { hideAll, hideIn, rememberSeen, revealAll, revealIn } from '../core/fogModel';
import { lockedAreas } from '../core/persistence';
import { newId, slugId } from '../core/documents';
import { chainOf, moveEnds, removeWalls, withoutDegenerate, type WallEnd } from '../core/walls';
import { addShape, areaContains, distanceToArea, moveVertex, normalizeShape, subtractShape, type AreaTool, type VertexRef } from '../core/areas';
import type { Polygon } from '../core/poly/types';
import { readFogLook, saveCoverFrom, saveFadeSeconds, saveFogEdge, saveFogMotion, saveFogQuality, saveFogSpeed, saveSoftEdges, type CoverFrom, type FogLook, type FogQuality } from './fog-settings';
import { lookToWire } from '../render/fogOptions';
import type { MonitorInfo } from '../platform/bridge';
import { createSampleScene } from '../sample/crypt';
import { SAMPLE_CREATURES } from '../sample/creatures';
import type { AssetKind, AssetSidecar, Creature, Player } from '../core/sidecar';
import { missingPartyTokens, tokenFromCreature } from '../core/party';
import type { MessageKey } from '../i18n/en';
import { initialSoundboard, type SoundboardState } from './soundboard';
import { History } from '../core/history';
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
  /** Play-once effects started in this session, by placement id → when (DC-110; not saved). */
  effectRuns: Record<string, number>;
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
    effectRuns: {},
    vault: { items: [], filter: {}, selected: [], anchor: null, thumbPx: 120, newCollections: [], pack: null, editor: null },
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

const history = new History<string>(100);
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
export function replaceScene(scene: Scene, opts: { resource: string; fileName: string; scenePath: string | null; sceneName: string; round?: number; turn?: number; docs?: { map: MapSidecar | null; scene: SceneOverride | null } }): void {
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
  clearHistory();
  state.sceneVersion++;
  emit();
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
  if (state.layer !== 'map') {
    const fromView = sceneOverrideFromScene(s, state.sceneName, mapSidecarPath(state.mapResource), { round: state.round, turn: state.turn }, map, previousLayer(doc));
    if (!doc) return { map, ov: fromView };
    if (state.layer === 'start') return { map, ov: commitStart(doc, fromView, playingAmbience()) };
    return { map, ov: { ...fromView, ambience: state.editStart ? doc.ambience : playingAmbience(), ...(doc.start ? { start: doc.start } : {}) } };
  }
  if (!doc) return { map, ov: null };
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
  clearHistory();
}

export function setWorkspace(ws: WorkspaceId): void {
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

export function toggle(key: 'snap' | 'showGrid' | 'viewAsPlayer' | 'dmSeeThrough' | 'moveLock'): void {
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
  state.vision = updateVision(state.scene, extras);
  state.visible = visiblePolygons(state.vision);
  state.lights = litSources(state.scene, extras);
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
  emit();
}

export function toggleDoor(id: string): void {
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
      state.scene.walls.push({ ...(c.flip && w.kind === 'cliff' ? reversed(w) : w), id });
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
    state.scene.zones.push({ id, ...fields, ...(c.biome ? { biome: c.biome } : {}), discovered: !c.secret });
    log('log.areaCreated', { name: fields.name });
  }
  state.selectedZoneId = id;
  state.areaCommand = null;
  state.tool = 'select';
  recomputeVision();
  emit();
  return true;
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
}

export function setAssetInfo(info: Record<string, AssetInfo>): void {
  state.assetInfo = info;
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
  const key = `${g.cellWidth},${g.cellHeight}|${placed.map((a) => `${a.assetPath},${a.x},${a.y},${a.rotation},${a.scale}`).join(';')}|${JSON.stringify(scene.assetLightsOn)}`;
  if (extrasCache && extrasCache.key === key && extrasCache.info === state.assetInfo) return extrasCache.extras;
  // An asset's light may be switched off in the scene (DC-110).
  const lights = placementLights(placed, state.assetInfo, g).map((l) => ({ ...l, on: scene.assetLightsOn[l.id] ?? true }));
  const extras = { covers: placementCovers(placed, state.assetInfo, g), lights };
  extrasCache = { key, info: state.assetInfo, extras };
  return extras;
}

let extrasCache: { key: string; info: Record<string, AssetInfo>; extras: VisionExtras } | null = null;

function footprint(a: MapAssetPlacement) {
  return footprintOf(a, state.assetInfo[a.assetPath]?.sizeCells, state.scene.map.grid);
}

/** The placed asset at `p` (the topmost), if any. */
export function placedAssetAt(p: Point): string | null {
  const hit = [...editableAssets()].reverse().find((a) => hitsPlacement(footprint(a), p));
  return hit?.id ?? null;
}

function snappedCentre(a: Pick<MapAssetPlacement, 'assetPath' | 'scale' | 'rotation'>, p: Point): Point {
  return state.snap ? snapPlacement(state.scene.map.grid, p, state.assetInfo[a.assetPath]?.sizeCells, a.scale, a.rotation) : p;
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
  const at = snappedCentre({ assetPath, scale: 1, rotation: 0 }, p);
  editableAssets().push({ id, assetPath, x: at.x, y: at.y, rotation: 0, scale: 1 });
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
  const at = final ? snappedCentre(a, p) : p;
  a.x = at.x;
  a.y = at.y;
  markDirty();
  // Its mask and light move with it (DC-108).
  recomputeVision(final);
  emit();
}

export function rotatePlacedAsset(id: string, delta: number): void {
  const a = placed(id);
  if (!a) return;
  checkpoint();
  a.rotation = rotateBy(a.rotation, delta);
  recomputeVision();
  emit();
}

export function scalePlacedAsset(id: string, factor: number): void {
  const a = placed(id);
  if (!a) return;
  checkpoint();
  a.scale = scaleBy(a.scale, factor);
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
  const z = [...state.scene.zones].reverse().find((z) => areaContains(z.shape, p));
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
  state.scene.lights.push({ id, x: p.x, y: p.y, brightFt: 20, dimFt: 40, color: '#ffb14a', on: true });
  state.selectedLightId = id;
  recomputeVision();
  emit();
}

export function lightAt(p: Point): string | null {
  const r = state.scene.map.grid.cellWidth * 0.45;
  return state.scene.lights.find((l) => Math.hypot(l.x - p.x, l.y - p.y) < r)?.id ?? null;
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
  emit();
}

export function updateTable(patch: Partial<Scene['table']>): void {
  markDirty();
  state.scene.table = { ...state.scene.table, ...patch };
  emit();
}

export function tableZoom(): number {
  const t = state.scene.table;
  return tableZoomForPhysicalGrid(state.scene.map.grid, t.display, t.inchesPerCell, t.ppiCorrection);
}

/** Builds the next frame for the table (and the preview). */
export function produceFrame(now: number): PlayerFrame {
  // Drop pings older than 2 s.
  state.scene.pings = state.scene.pings.filter((p) => now - p.at < 2000);
  state.frameSeq++;
  const tv = tvView();
  state.frame = buildPlayerFrame(tv.scene, {
    seq: state.frameSeq,
    now,
    showGrid: state.showGrid,
    memoryOpacity: state.memoryOpacity,
    movementLocked: state.moveLock,
    zoom: tableZoom(),
    look: lookToWire(state.fogLook),
    visible: tv.visible,
    quick: state.fogQuick,
    activeTokenId: state.ws === 'play' ? initiativeOrder()[state.turn]?.id ?? null : null,
    seedKey: state.mapResource,
    lights: tv.lights,
    // Only the scene's shown placements: assets it hides never reach the TV.
    assets: assetShapes(allPlacements(tv.scene), state.assetInfo, tv.scene.map.grid, { effectsOn: tv.scene.effectsOn, runs: state.effectRuns }),
    covers: assetExtras(tv.scene).covers,
  });
  return state.frame;
}

let tvCache: { version: number; scene: Scene; visible: Polygon[]; lights: LitSource[] } | null = null;

/**
 * What the TV shows: the scene. While the Map Forge shows the map, that is the map being edited
 * with the scene's changes and state (fog, tokens) – rebuilt only when something changed.
 */
function tvView(): { scene: Scene; visible: Polygon[]; lights: LitSource[] } {
  if (state.layer === 'scene' || !state.mapDoc) return { scene: state.scene, visible: state.visible, lights: state.lights };
  if (!tvCache || tvCache.version !== viewVersion) {
    // Editing the map or the start state: the TV shows the play state, with the map (and the
    // scene's changes of it) as they are being edited.
    const map = mapSidecarFromScene(state.scene, state.mapResource, state.layer, state.mapDoc);
    let ov = state.sceneDoc;
    if (ov && state.layer === 'start') {
      const fromView = sceneOverrideFromScene(state.scene, state.sceneName, ov.mapSidecar, { round: state.round, turn: state.turn }, map, layerOf(ov));
      ov = { ...ov, overrides: fromView.overrides, added: fromView.added };
    }
    const scene = sceneFromDocuments(map, ov, state.scene.map.imageUrl, state.scene.table, 'scene');
    const extras = assetExtras(scene);
    const vision = updateVision(scene, extras);
    tvCache = { version: viewVersion, scene, visible: visiblePolygons(vision), lights: litSources(scene, extras) };
  }
  // Table settings (blackout, rotation, centre) stay live.
  tvCache.scene.table = state.scene.table;
  return tvCache;
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
