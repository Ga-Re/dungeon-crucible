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
import { updateVision, type ViewerVision } from '../core/vision';
import type { MonitorInfo } from '../platform/bridge';
import { createSampleScene } from '../sample/crypt';
import { SAMPLE_CREATURES } from '../sample/creatures';
import type { Creature } from '../core/sidecar';
import type { MessageKey } from '../i18n/en';

export type WorkspaceId = 'forge' | 'vault' | 'creatures' | 'atlas' | 'play';

export type ToolId =
  | 'select' | 'pan' | 'measure' | 'ping' | 'calibrate'
  | 'zone' | 'wall' | 'door' | 'secret-door' | 'window'
  | 'reveal' | 'hide' | 'reveal-rect' | 'reveal-room'
  | 'cone' | 'sphere' | 'line' | 'cube';

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
  fogSoftness: number;
  memoryOpacity: number;
  brushCells: number;
  moveLock: boolean;
  selectedTokenId: string | null;
  selectedZoneId: string | null;
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
}

function initial(): AppState {
  const scene = createSampleScene();
  scene.map.imageUrl = 'builtin:crypt';
  // Start with the entrance hall explored.
  scene.fog.revealRect(0, 9 * 70, 10 * 70, 16 * 70);
  const s: AppState = {
    ws: 'play',
    tool: 'select',
    snap: true,
    showGrid: true,
    viewAsPlayer: false,
    dmSeeThrough: true,
    fogSoftness: 0.55,
    memoryOpacity: 0.6,
    brushCells: 1.5,
    moveLock: false,
    selectedTokenId: null,
    selectedZoneId: null,
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
  };
  s.vision = updateVision(scene);
  return s;
}

export const state: AppState = initial();
let version = 0;
const listeners = new Set<() => void>();

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

export function setFogOption(key: 'fogSoftness' | 'memoryOpacity' | 'brushCells', v: number): void {
  state[key] = v;
  emit();
}

/* ---------- Scene edits ---------- */

export function recomputeVision(): void {
  state.vision = updateVision(state.scene);
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
  if (t.kind === 'pc') recomputeVision();
  emit();
}

export function toggleDoor(id: string): void {
  const w = state.scene.walls.find((x) => x.id === id);
  if (!w || (w.kind !== 'door' && w.kind !== 'secret-door')) return;
  w.open = !w.open;
  log(w.open ? 'log.doorOpened' : 'log.doorClosed');
  recomputeVision();
  emit();
}

let wallSeq = 0;
export function addWall(kind: WallKind, a: Point, b: Point): void {
  if (Math.hypot(a.x - b.x, a.y - b.y) < 2) return;
  const w: Wall = { id: `u${++wallSeq}`, kind, x1: a.x, y1: a.y, x2: b.x, y2: b.y, open: false };
  state.scene.walls.push(w);
  recomputeVision();
  emit();
}

export function removeLastUserWall(): void {
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
  const id = `z${state.scene.zones.length + 1}`;
  state.scene.zones.push({ id, name: `Zone ${state.scene.zones.length + 1}`, kind: 'area', rect: { x, y, w, h }, color: '#7fd9cf', discovered: true });
  state.selectedZoneId = id;
  emit();
}

export function zoneAt(p: Point): string | null {
  const z = [...state.scene.zones].reverse().find((z) => p.x >= z.rect.x && p.y >= z.rect.y && p.x <= z.rect.x + z.rect.w && p.y <= z.rect.y + z.rect.h);
  return z?.id ?? null;
}

function zoneCells(id: string): [number, number][] {
  const z = state.scene.zones.find((q) => q.id === id);
  if (!z) return [];
  const s = state.scene.fog.cellSize;
  const out: [number, number][] = [];
  for (let r = Math.floor(z.rect.y / s); r < Math.ceil((z.rect.y + z.rect.h) / s); r++) for (let c = Math.floor(z.rect.x / s); c < Math.ceil((z.rect.x + z.rect.w) / s); c++) out.push([c, r]);
  return out;
}

export function revealZone(id: string): void {
  const z = state.scene.zones.find((q) => q.id === id);
  if (!z || (z.kind === 'secret' && !z.discovered)) return;
  for (const [c, r] of zoneCells(id)) state.scene.fog.reveal(c, r, true);
  emit();
}

/** Discovering a secret zone unlocks its fog cells and opens secret doors touching it. */
export function discoverZone(id: string): void {
  const z = state.scene.zones.find((q) => q.id === id);
  if (!z) return;
  z.discovered = true;
  state.scene.fog.setLocked(zoneCells(id), false);
  for (const w of state.scene.walls) {
    if (w.kind !== 'secret-door') continue;
    const touches = [w.x1, w.x2].some((x) => x >= z.rect.x - 1 && x <= z.rect.x + z.rect.w + 1) && [w.y1, w.y2].some((y) => y >= z.rect.y - 1 && y <= z.rect.y + z.rect.h + 1);
    if (touches) w.open = true;
  }
  recomputeVision();
  emit();
}

export function fogBrush(p: Point, mode: 'reveal' | 'hide'): void {
  state.scene.fog.brush(p, state.brushCells * state.scene.map.grid.cellWidth, mode);
  emit();
}

export function fogRect(x0: number, y0: number, x1: number, y1: number): void {
  state.scene.fog.revealRect(x0, y0, x1, y1);
  emit();
}

export function fogAll(reveal: boolean): void {
  if (reveal) state.scene.fog.revealAll();
  else state.scene.fog.hideAll();
  recomputeVision();
  emit();
}

export function setBiome(b: FogBiome): void {
  state.scene.map.biome = b;
  emit();
}

export function setGridType(type: GridType): void {
  state.scene.map.grid = { ...state.scene.map.grid, type };
  emit();
}

export function addCalibrationPoint(p: Point): void {
  state.calibPoints.push(p);
  if (state.calibPoints.length === 3) {
    const [a, b, c] = state.calibPoints;
    try {
      const r = calibrateFromThreePoints(a, b, c);
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

let tplSeq = 0;
const TPL_COLORS: Record<TemplateShape, string> = { cone: '#e2554c', sphere: '#e2a03c', line: '#3f9de2', cube: '#a77bf3' };
export function addTemplate(shape: TemplateShape, origin: Point, to: Point): AreaTemplate | null {
  const g = state.scene.map.grid;
  const lenPx = Math.hypot(to.x - origin.x, to.y - origin.y);
  const sizeFt = Math.max(g.feetPerCell, Math.round(lenPx / g.cellWidth) * g.feetPerCell);
  if (lenPx < g.cellWidth * 0.4) return null;
  const t: AreaTemplate = { id: `t${++tplSeq}`, shape, x: origin.x, y: origin.y, angle: Math.atan2(to.y - origin.y, to.x - origin.x), sizeFt, color: TPL_COLORS[shape] };
  state.scene.templates.push(t);
  emit();
  return t;
}

export function clearTemplates(): void {
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
  t.hp = Math.max(0, Math.min(t.maxHp, t.hp + delta));
  if (t.kind === 'pc') recomputeVision();
  emit();
}

export function toggleCondition(id: string, c: Condition): void {
  const t = state.scene.tokens.find((x) => x.id === id);
  if (!t) return;
  t.conditions = t.conditions.includes(c) ? t.conditions.filter((x) => x !== c) : [...t.conditions, c];
  if (c === 'exhaustion') t.exhaustion = t.conditions.includes('exhaustion') ? Math.max(1, t.exhaustion ?? 1) : 0;
  emit();
}

export function selectToken(id: string | null): void {
  state.selectedTokenId = id;
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
  state.scene.table.rotation = r;
  emit();
}

export function rotateTable(): void {
  state.scene.table.rotation = (((state.scene.table.rotation + 90) % 360) as TableRotation);
  emit();
}

export function toggleBlackout(): void {
  state.scene.table.blackout = !state.scene.table.blackout;
  emit();
}

export function updateTable(patch: Partial<Scene['table']>): void {
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
  state.frame = buildPlayerFrame(state.scene, state.vision, {
    seq: state.frameSeq,
    now,
    showGrid: state.showGrid,
    memoryOpacity: state.memoryOpacity,
    softness: state.fogSoftness,
    movementLocked: state.moveLock,
    zoom: tableZoom(),
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
