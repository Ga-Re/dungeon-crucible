/**
 * DM application state. A tiny external store: components subscribe via
 * `useStore`, actions mutate state and call `emit()`.
 */
import { useSyncExternalStore } from 'react';
import type { Point } from '../core/geometry';
import { applyCalibration, calibrateFromThreePoints, snapToCell, tableZoomForPhysicalGrid, type GridType } from '../core/grid';
import { buildPlayerFrame, type PlayerFrame } from '../core/projection';
import type { AreaTemplate, FogBiome, Scene, TableRotation, TemplateShape, Token, Wall, WallKind } from '../core/scene';
import { rollDice, type RollResult } from '../core/rules/dice';
import type { Condition } from '../core/rules/rules2024';
import { litSources, updateVision, visiblePolygons, type LitSource, type ViewerVision } from '../core/vision';
import { hideAll, hideIn, rectPolygon, rememberSeen, revealAll, revealIn } from '../core/fogModel';
import { lockedAreas, slugify } from '../core/persistence';
import { newId, slugId } from '../core/documents';
import type { Polygon } from '../core/poly/types';
import { readFogLook, saveCoverFrom, saveFadeSeconds, saveFogEdge, saveFogMotion, saveFogQuality, saveFogSpeed, saveSoftEdges, type CoverFrom, type FogLook, type FogQuality } from './fog-settings';
import { lookToWire } from '../render/fogOptions';
import type { MonitorInfo } from '../platform/bridge';
import { createSampleScene } from '../sample/crypt';
import { SAMPLE_CREATURES } from '../sample/creatures';
import type { Creature } from '../core/sidecar';
import type { MessageKey } from '../i18n/en';
import { initialSoundboard, type SoundboardState } from './soundboard';
import { History } from '../core/history';
import { mapSidecarFromScene, mapSidecarPath, sceneFromDocuments, sceneOverrideFromScene } from '../core/persistence';
import type { CampaignInfo } from '../platform/bridge';
import type { RecentCampaign } from './recent';

export type WorkspaceId = 'forge' | 'vault' | 'creatures' | 'atlas' | 'play';

export type ToolId =
  | 'select' | 'pan' | 'measure' | 'ping' | 'calibrate'
  | 'zone' | 'wall' | 'door' | 'secret-door' | 'window'
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
  selectedLightId: string | null;
  turn: number;
  round: number;
  scene: Scene;
  vision: ViewerVision[];
  calibPoints: Point[];
  lastCalibration: { w: number; h: number; r: number } | null;
  wallStart: Point | null;
  log: LogEntry[];
  rolls: RollResult[];
  monitors: MonitorInfo[];
  tableOpen: boolean;
  tableMonitor: number | null;
  frame: PlayerFrame | null;
  frameSeq: number;
  creatures: Creature[];
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
    selectedLightId: null,
    turn: 0,
    round: 1,
    scene,
    vision: [],
    calibPoints: [],
    lastCalibration: null,
    wallStart: null,
    log: [],
    rolls: [],
    monitors: [],
    tableOpen: false,
    tableMonitor: null,
    frame: null,
    frameSeq: 0,
    creatures: SAMPLE_CREATURES,
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
    recent: [],
    notice: null,
    soundboard: initialSoundboard(),
  };
  s.vision = updateVision(scene);
  s.visible = visiblePolygons(s.vision);
  s.lights = litSources(scene);
  scene.fog = rememberSeen(scene.fog, s.visible);
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

export function markDirty(): void {
  state.dirty = true;
  for (const f of dirtyListeners) f();
}

function snapshot(): string {
  const s = state.scene;
  return JSON.stringify({
    map: mapSidecarFromScene(s, state.mapResource),
    ov: sceneOverrideFromScene(s, state.sceneName, mapSidecarPath(state.mapResource), { round: state.round, turn: state.turn }),
  });
}

/** Call before every undoable change. */
export function checkpoint(): void {
  history.push(snapshot());
  state.canUndo = history.canUndo;
  state.canRedo = history.canRedo;
  markDirty();
}

function restore(snap: string): void {
  const { map, ov } = JSON.parse(snap);
  const keepTable = state.scene.table;
  state.scene = sceneFromDocuments(map, ov, state.scene.map.imageUrl, keepTable);
  state.scene.table = keepTable;
  state.round = ov.combat.round;
  state.turn = ov.combat.turn;
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
  const taken = new Set<string>([...sc.walls, ...sc.zones, ...sc.lights, ...sc.templates, ...sc.tokens].map((x) => x.id));
  return newId(slugId(prefix, 'el').slice(0, 40), (id) => taken.has(id));
}

export function replaceScene(scene: Scene, opts: { resource: string; fileName: string; scenePath: string | null; sceneName: string; round?: number; turn?: number }): void {
  state.scene = scene;
  state.mapResource = opts.resource;
  state.mapFileName = opts.fileName;
  state.scenePath = opts.scenePath;
  state.sceneName = opts.sceneName;
  state.round = opts.round ?? 1;
  state.turn = opts.turn ?? 0;
  state.selectedTokenId = null;
  state.selectedZoneId = null;
  state.wallStart = null;
  recomputeVision();
  clearHistory();
  state.sceneVersion++;
  emit();
}

/* ---------- Workspace & tools ---------- */

export function setWorkspace(ws: WorkspaceId): void {
  state.ws = ws;
  state.tool = 'select';
  state.wallStart = null;
  emit();
}

export function setTool(tool: ToolId): void {
  state.tool = tool;
  state.wallStart = null;
  state.calibPoints = [];
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
export function recomputeVision(final = true): void {
  state.vision = updateVision(state.scene);
  state.visible = visiblePolygons(state.vision);
  state.lights = litSources(state.scene);
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

export function addWall(kind: WallKind, a: Point, b: Point): void {
  if (Math.hypot(a.x - b.x, a.y - b.y) < 2) return;
  checkpoint();
  const w: Wall = { id: freshId('wall'), kind, x1: a.x, y1: a.y, x2: b.x, y2: b.y, open: false };
  state.scene.walls.push(w);
  recomputeVision();
  emit();
}

export function removeLastUserWall(): void {
  checkpoint();
  const i = state.scene.walls.map((w) => w.id.startsWith('u')).lastIndexOf(true);
  if (i >= 0) state.scene.walls.splice(i, 1);
  recomputeVision();
  emit();
}

export function addZone(x0: number, y0: number, x1: number, y1: number): void {
  const x = Math.min(x0, x1);
  const y = Math.min(y0, y1);
  const w = Math.abs(x1 - x0);
  const h = Math.abs(y1 - y0);
  if (w < 10 || h < 10) return;
  checkpoint();
  const id = freshId('area');
  state.scene.zones.push({ id, name: `Zone ${state.scene.zones.length + 1}`, kind: 'area', rect: { x, y, w, h }, color: '#7fd9cf', discovered: true });
  state.selectedZoneId = id;
  emit();
}

export function zoneAt(p: Point): string | null {
  const z = [...state.scene.zones].reverse().find((z) => p.x >= z.rect.x && p.y >= z.rect.y && p.x <= z.rect.x + z.rect.w && p.y <= z.rect.y + z.rect.h);
  return z?.id ?? null;
}

function zoneArea(id: string): Polygon | null {
  const z = state.scene.zones.find((q) => q.id === id);
  return z ? rectPolygon(z.rect.x, z.rect.y, z.rect.x + z.rect.w, z.rect.y + z.rect.h) : null;
}

function locked(): Polygon[] {
  return lockedAreas(state.scene.zones);
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
  if (!z || (z.kind === 'secret' && !z.discovered)) return;
  applyFogArea(zoneArea(id), 'reveal');
}

/** Discovering a secret zone unlocks it, opens secret doors touching it and reveals it. */
export function discoverZone(id: string): void {
  const z = state.scene.zones.find((q) => q.id === id);
  if (!z) return;
  checkpoint();
  z.discovered = true;
  for (const w of state.scene.walls) {
    if (w.kind !== 'secret-door') continue;
    const touches = [w.x1, w.x2].some((x) => x >= z.rect.x - 1 && x <= z.rect.x + z.rect.w + 1) && [w.y1, w.y2].some((y) => y >= z.rect.y - 1 && y <= z.rect.y + z.rect.h + 1);
    if (touches) w.open = true;
  }
  recomputeVision();
  const area = zoneArea(id);
  if (area) state.scene.fog = revealIn(state.scene.fog, area, [], true);
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

export function setGridType(type: GridType): void {
  checkpoint();
  state.scene.map.grid = { ...state.scene.map.grid, type };
  emit();
}

export function addCalibrationPoint(p: Point): void {
  state.calibPoints.push(p);
  if (state.calibPoints.length === 3) {
    const [a, b, c] = state.calibPoints;
    try {
      const r = calibrateFromThreePoints(a, b, c);
      checkpoint();
      state.scene.map.grid = applyCalibration(state.scene.map.grid, r);
      state.lastCalibration = { w: r.cellWidth, h: r.cellHeight, r: r.rotationDeg };
      log('log.calibrated');
    } catch {
      /* identical points: ignore */
    }
    state.calibPoints = [];
    state.tool = 'select';
  }
  emit();
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

export function setAmbient(a: Scene['ambient']): void {
  checkpoint();
  state.scene.ambient = a;
  recomputeVision();
  emit();
}

/* ---------- Tokens from creatures ---------- */

const SIZE_CELLS: Record<string, number> = { tiny: 1, small: 1, medium: 1, large: 2, huge: 3, gargantuan: 4 };

function initialsOf(name: string): string {
  const parts = name.split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? '?') + (parts[1]?.[0] ?? parts[0]?.[1] ?? '')).toUpperCase();
}

/** Puts a creature from the library on the map; initiative is rolled (d20 + Dex). */
export function addCreatureToken(index: number, at?: Point): void {
  const c = state.creatures[index];
  if (!c) return;
  checkpoint();
  const creatureId = slugify(c.name);
  const same = state.scene.tokens.filter((t) => t.creatureId === creatureId).length;
  const base = initialsOf(c.name);
  const label = c.role === 'pc' || same === 0 ? base : `${base.slice(0, 1)}${same + 1}`;
  const m = state.scene.map;
  const p = snapPoint(at ?? { x: state.scene.table.centerX || m.widthPx / 2, y: state.scene.table.centerY || m.heightPx / 2 });
  const dex = Math.floor((c.abilities.dex - 10) / 2);
  const id = freshId(creatureId);
  state.scene.tokens.push({
    id,
    name: same > 0 && c.role !== 'pc' ? `${c.name} ${same + 1}` : c.name,
    label: label.slice(0, 4),
    kind: c.role === 'pc' ? 'pc' : c.role === 'npc' ? 'npc' : 'monster',
    x: p.x,
    y: p.y,
    size: SIZE_CELLS[c.size] ?? 1,
    ringColor: c.token.ringColor,
    visionFt: c.senses.darkvision,
    lightFt: c.token.lightFt || undefined,
    hp: c.hp,
    maxHp: c.hp,
    ac: c.ac,
    initiative: 1 + Math.floor(Math.random() * 20) + dex,
    conditions: [],
    creatureId,
  });
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
  state.frame = buildPlayerFrame(state.scene, {
    seq: state.frameSeq,
    now,
    showGrid: state.showGrid,
    memoryOpacity: state.memoryOpacity,
    movementLocked: state.moveLock,
    zoom: tableZoom(),
    look: lookToWire(state.fogLook),
    visible: state.visible,
    quick: state.fogQuick,
    activeTokenId: state.ws === 'play' ? initiativeOrder()[state.turn]?.id ?? null : null,
    seedKey: state.mapResource,
    lights: state.lights,
  });
  return state.frame;
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
