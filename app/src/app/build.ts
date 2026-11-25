/**
 * The Map Forge's "Build" tab (E-33, DC-107a): drawing walls (click by click; double-click or
 * Enter ends one, a click on its start closes the ring), placing doors on them, and editing –
 * points dragged, inserted and removed, walls split and joined, style, thickness, seed and doors
 * changed. Each change is one undoable step; a drawn map's area grows with what is drawn.
 */
import { doorPlacement, hitDoor, hitMasonry, hitVertex, insertPoint, joinEnds, masonryPoints, movePoint, removePoint, removeWall, slideDoor, snapBuildPoint, splitAt, type BuildSnap, type Edit, type WallEnd } from '../core/build/editing';
import { drawnBounds, type BuildDoor, type Masonry, type MasonryStyle } from '../core/build/masonry';
import type { Point } from '../core/geometry';
import { checkpoint, editableInForge, emit, freshId, log, markDirty, recomputeVision, state } from './store';

export interface BuildCommand {
  kind: 'wall' | 'door';
  style: MasonryStyle;
  /** Wall thickness in feet. */
  thicknessFt: number;
  snap: BuildSnap;
  /** Doors placed are secret. */
  secret: boolean;
  /** The wall being drawn: its points so far. */
  points: Point[];
}

export interface BuildSelection {
  wall: string;
  /** A point of it, if one was picked. */
  point: number | null;
  /** A door on it, if one was picked. */
  door: string | null;
}

/** Cells of margin around what is drawn on a drawn map. */
const MARGIN_CELLS = 2;
/** Default thickness of a new wall, in feet. */
const DEFAULT_THICKNESS_FT = 1;

/** Options kept between commands (style, thickness, snapping), per window. */
let last: Pick<BuildCommand, 'style' | 'thicknessFt' | 'snap' | 'secret'> = { style: 'dungeon-stone', thicknessFt: DEFAULT_THICKNESS_FT, snap: 'grid', secret: false };

const pxPerFt = () => state.scene.map.grid.cellWidth / state.scene.map.grid.feetPerCell;

/** The drawn walls that can be edited (layers neither hidden in the editor nor locked). */
export function editableMasonry(): Masonry[] {
  return state.scene.map.masonry.filter(editableInForge);
}

/** Starts drawing walls or placing doors (one command at a time). */
export function startBuildCommand(kind: BuildCommand['kind']): void {
  if (state.layer !== 'map') return;
  state.buildCommand = { kind, ...last, points: [] };
  state.wallCommand = null;
  state.areaCommand = null;
  state.placing = null;
  state.tool = kind === 'wall' ? 'build-wall' : 'build-door';
  emit();
}

export function updateBuildCommand(patch: Partial<Pick<BuildCommand, 'style' | 'thicknessFt' | 'snap' | 'secret'>>): void {
  const c = state.buildCommand;
  if (!c) return;
  state.buildCommand = { ...c, ...patch };
  last = { style: state.buildCommand.style, thicknessFt: state.buildCommand.thicknessFt, snap: state.buildCommand.snap, secret: state.buildCommand.secret };
  emit();
}

/** Where a point drawn or dragged at `p` goes (`free`: Alt – exactly there). */
export function buildTarget(p: Point, free: boolean, tolPx: number, skipWall?: string): Point {
  const c = state.buildCommand;
  const mode = free || !state.snap ? 'free' : (c?.snap ?? last.snap);
  const from = c?.points.at(-1) ?? null;
  const magnets = [...masonryPoints(editableMasonry(), skipWall), ...(c?.points.slice(0, -1) ?? [])];
  return snapBuildPoint(p, { mode, grid: state.scene.map.grid, from, magnets, tol: tolPx });
}

/** A click while drawing: the next point; on the first point again (with three or more) the ring closes. */
export function addBuildPoint(p: Point, tolPx: number): void {
  const c = state.buildCommand;
  if (!c || c.kind !== 'wall') return;
  const first = c.points[0];
  if (first && c.points.length >= 3 && Math.hypot(first.x - p.x, first.y - p.y) <= tolPx) {
    finishBuildWall(true);
    return;
  }
  const prev = c.points.at(-1);
  if (prev && Math.hypot(prev.x - p.x, prev.y - p.y) < 1) return;
  state.buildCommand = { ...c, points: [...c.points, p] };
  emit();
}

/** Backspace while drawing: the last point goes. */
export function undoBuildPoint(): void {
  const c = state.buildCommand;
  if (!c?.points.length) return;
  state.buildCommand = { ...c, points: c.points.slice(0, -1) };
  emit();
}

/** Ends the wall being drawn (double-click, Enter, its start clicked again) – added as one step; drawing goes on. */
export function finishBuildWall(closed = false): void {
  const c = state.buildCommand;
  if (!c || c.points.length < 2 || state.layer !== 'map') {
    if (c) state.buildCommand = { ...c, points: [] };
    emit();
    return;
  }
  checkpoint();
  const wall: Masonry = {
    id: freshId('masonry'),
    points: c.points.map((q) => ({ x: q.x, y: q.y })),
    closed: closed && c.points.length >= 3,
    style: c.style,
    thickness: Math.max(1, c.thicknessFt * pxPerFt()),
    seed: Math.floor(Math.random() * 1_000_000),
    ...onCurrentLayer(),
  };
  apply({ masonry: [...state.scene.map.masonry, wall], doors: state.scene.map.masonryDoors });
  state.buildCommand = { ...c, points: [] };
  state.buildSelection = { wall: wall.id, point: null, door: null };
  log('log.masonryAdded');
  emit();
}

/** OK or Escape on an empty drawing: the command ends (a wall being drawn is added first). */
export function endBuildCommand(keepDrawn: boolean): void {
  const c = state.buildCommand;
  if (!c) return;
  if (keepDrawn && c.points.length >= 2) finishBuildWall(false);
  state.buildCommand = null;
  state.tool = 'build-edit';
  emit();
}

/** "Place door": a door one cell wide on the wall clicked, centred on a cell (unless Alt). */
export function placeBuildDoor(p: Point, free: boolean, tolPx: number): boolean {
  const c = state.buildCommand;
  if (!c || c.kind !== 'door' || state.layer !== 'map') return false;
  const at = doorPlacement(editableMasonry(), p, free || !state.snap ? null : state.scene.map.grid, tolPx);
  if (!at) return false;
  checkpoint();
  const door: BuildDoor = { id: freshId('door'), wall: at.wall, at: at.at, width: state.scene.map.grid.cellWidth, secret: c.secret, crack: false };
  apply({ masonry: state.scene.map.masonry, doors: [...state.scene.map.masonryDoors, door] });
  state.buildSelection = { wall: at.wall, point: null, door: door.id };
  log('log.doorAdded');
  emit();
  return true;
}

/* ---------- Selecting and editing ---------- */

/** What a click at `p` picks in the "Edit" tool: a point, a door, a wall – in that order. */
export function buildHit(p: Point, tolPx: number): BuildSelection | null {
  const walls = editableMasonry();
  const v = hitVertex(walls, p, tolPx);
  if (v) return { wall: v.wall, point: v.index, door: null };
  const door = hitDoor(walls, state.scene.map.masonryDoors, p, tolPx);
  if (door) return { wall: state.scene.map.masonryDoors.find((d) => d.id === door)!.wall, point: null, door };
  const line = hitMasonry(walls, p, tolPx);
  return line ? { wall: line.wall, point: null, door: null } : null;
}

export function selectBuild(sel: BuildSelection | null): void {
  state.buildSelection = sel;
  if (sel) {
    state.selectedWallIds = [];
    state.selectedAssetId = null;
  }
  emit();
}

/** A click on the line of the selected wall: a new point there (one step), returned for dragging. */
export function insertBuildPoint(wall: string, p: Point): number {
  checkpoint();
  const out = insertPoint(state.scene.map.masonry, wall, p);
  apply({ masonry: out.masonry, doors: state.scene.map.masonryDoors });
  state.buildSelection = { wall, point: out.index, door: null };
  emit();
  return out.index;
}

/**
 * Moves a point live while dragging; `done` joins it to another wall's end it was dropped on (or
 * to its own other end: the ring closes). The caller sets the checkpoint when the drag starts.
 */
export function moveBuildPoint(wall: string, index: number, to: Point, done: boolean, tolPx: number): void {
  let edit = movePoint(state.scene.map.masonry, state.scene.map.masonryDoors, wall, index, to);
  if (done) {
    const w = edit.masonry.find((x) => x.id === wall);
    const end: WallEnd['end'] | null = w && !w.closed ? (index === 0 ? 'first' : index === w.points.length - 1 ? 'last' : null) : null;
    if (w && end) {
      const target = endNear(edit.masonry, to, tolPx, { wall, end });
      if (target) edit = joinEnds(edit.masonry, edit.doors, { wall, end }, target);
    }
  }
  apply(edit, done);
  if (done && !state.scene.map.masonry.some((x) => x.id === wall)) state.buildSelection = null;
  emit();
}

/** Another open wall's end (or this wall's other end) at `p`. */
function endNear(masonry: readonly Masonry[], p: Point, tol: number, self: WallEnd): WallEnd | null {
  for (const w of masonry) {
    if (w.closed || w.points.length < 2) continue;
    for (const end of ['first', 'last'] as const) {
      if (w.id === self.wall && end === self.end) continue;
      if (w.id === self.wall && w.points.length < 3) continue;
      const q = end === 'first' ? w.points[0] : w.points[w.points.length - 1];
      if (Math.hypot(q.x - p.x, q.y - p.y) <= tol) return { wall: w.id, end };
    }
  }
  return null;
}

/** Slides a door along its wall live while dragging (the caller sets the checkpoint). */
export function slideBuildDoor(id: string, to: Point, free: boolean, done: boolean): void {
  const doors = state.scene.map.masonryDoors.map((d) => (d.id === id ? slideDoor(state.scene.map.masonry, d, to, free || !state.snap ? null : state.scene.map.grid) : d));
  apply({ masonry: state.scene.map.masonry, doors }, done);
  emit();
}

/** Delete: the selected point, door or wall (one step). */
export function deleteBuildSelection(): boolean {
  const sel = state.buildSelection;
  if (!sel || state.layer !== 'map') return false;
  checkpoint();
  const { masonry, masonryDoors } = state.scene.map;
  if (sel.door) apply({ masonry, doors: masonryDoors.filter((d) => d.id !== sel.door) });
  else if (sel.point !== null) apply(removePoint(masonry, masonryDoors, sel.wall, sel.point));
  else apply(removeWall(masonry, masonryDoors, sel.wall));
  state.buildSelection = sel.point !== null && state.scene.map.masonry.some((w) => w.id === sel.wall) ? { ...sel, point: null } : null;
  emit();
  return true;
}

/** "Split here": the selected wall at its selected point (one step). */
export function splitBuildWall(): void {
  const sel = state.buildSelection;
  if (!sel || sel.point === null) return;
  checkpoint();
  apply(splitAt(state.scene.map.masonry, state.scene.map.masonryDoors, sel.wall, sel.point, freshId('masonry')));
  state.buildSelection = { ...sel, point: null };
  emit();
}

export function updateMasonry(id: string, patch: Partial<Pick<Masonry, 'style' | 'thickness' | 'seed'>>): void {
  if (state.layer !== 'map') return;
  checkpoint();
  apply({ masonry: state.scene.map.masonry.map((w) => (w.id === id ? { ...w, ...patch } : w)), doors: state.scene.map.masonryDoors });
  emit();
}

/** A new look for the selected wall's jitter and stones. */
export function rerollMasonry(id: string): void {
  updateMasonry(id, { seed: Math.floor(Math.random() * 1_000_000) });
}

export function updateBuildDoor(id: string, patch: Partial<Pick<BuildDoor, 'width' | 'secret' | 'crack'>>): void {
  if (state.layer !== 'map') return;
  checkpoint();
  const doors = state.scene.map.masonryDoors.map((d) => (d.id === id ? { ...d, ...patch, ...(patch.secret === false ? { crack: false } : {}) } : d));
  apply({ masonry: state.scene.map.masonry, doors });
  emit();
}

/* ---------- Applying an edit ---------- */

/**
 * Takes an edit into the map: a drawn map's area follows what is drawn (it grows and shrinks,
 * left and up too); sight is recomputed (fully when `final`).
 */
function apply(edit: Edit, final = true): void {
  const m = state.scene.map;
  m.masonry = edit.masonry;
  m.masonryDoors = edit.doors;
  if (m.drawn) {
    const b = drawnBounds(m.masonry, m.grid.cellWidth, MARGIN_CELLS);
    m.origin = { x: b.x, y: b.y };
    m.widthPx = b.w;
    m.heightPx = b.h;
  }
  markDirty();
  recomputeVision(final);
}

function onCurrentLayer(): { layer?: string } {
  const layer = state.currentLayer;
  return layer && state.scene.map.layers.some((l) => l.id === layer) ? { layer } : {};
}
