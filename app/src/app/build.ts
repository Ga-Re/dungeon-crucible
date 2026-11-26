/**
 * The Map Forge's "Build" tab (E-33, E-34): drawing walls and cliffs (click by click; double-click
 * or Enter ends one, a click on its start closes the ring), placing doors on walls, and editing
 * both – points dragged, inserted and removed, lines split and joined, their settings changed.
 * Each change is one undoable step; a drawn map's area grows with what is drawn.
 */
import { CLIFF_FORMS, type Cliff, type CliffForm, type CliffKind } from '../core/build/cliffs';
import { doorPlacement, hitDoor, hitMasonry, hitVertex, insertPoint, joinEnds, masonryPoints, movePoint, removePoint, removeWall, slideDoor, snapBuildPoint, splitAt, type BuildSnap, type Edit, type Line, type WallEnd } from '../core/build/editing';
import { drawnBounds, type BuildDoor, type Masonry, type MasonryStyle } from '../core/build/masonry';
import { closesRing, strokeToLine } from '../core/build/strokes';
import type { Water, WaterKind } from '../core/build/water';
import { paintFloor, type FloorPaint, type FloorPatch } from '../core/build/floors';
import { generate, generatedElements, type GenStyle } from '../core/build/generate';
import { strokeArea } from '../core/poly/shapes';
import { isInside } from '../core/poly/fog';
import type { Point } from '../core/geometry';
import { buildHooks, checkpoint, editableInForge, emit, freshId, log, markDirty, recomputeVision, state } from './store';
import type { OwnDrawing } from '../core/build/sceneDrawing';

export interface BuildCommand {
  kind: 'wall' | 'door' | 'cliff' | 'water' | 'floor' | 'generate';
  style: MasonryStyle;
  /** Wall thickness in feet. */
  thicknessFt: number;
  snap: BuildSnap;
  /** Doors placed are secret. */
  secret: boolean;
  /** Openings placed are windows (E-35). */
  window: boolean;
  /** Walls drawn are fortified: towers and battlements (E-35). */
  fortified: boolean;
  /** Cliffs (E-34): what they are and how they are shaped. */
  cliffKind: CliffKind;
  form: CliffForm;
  steep: boolean;
  /** A ravine's width, the distance between terraces, in feet. */
  widthFt: number;
  steps: number;
  inside: Cliff['inside'];
  growth: boolean;
  /** Water (E-35): river, lake or sea; a river's width in feet. */
  waterKind: WaterKind;
  riverWidthFt: number;
  /** The floor brush (DC-107b): which floor, how wide (cells across). */
  floorStyle: FloorPaint;
  brushCells: number;
  /** The area generator (DC-119d): what fills the dragged region and how. */
  genStyle: GenStyle;
  genDensity: number;
  genSeed: number;
  /** The dragged region (map px); none yet: drag one first. */
  region: { x: number; y: number; w: number; h: number } | null;
  /** The line being drawn: its points so far. */
  points: Point[];
}

export interface BuildSelection {
  /** A drawn wall, a cliff or water. */
  kind: 'wall' | 'cliff' | 'water';
  /** Its id. */
  wall: string;
  /** A point of it, if one was picked. */
  point: number | null;
  /** A door on it (walls), if one was picked. */
  door: string | null;
  /** In a scene: a drawn element of the map – it can only be hidden there (DC-107c). */
  onMap?: boolean;
}

type Options = Omit<BuildCommand, 'kind' | 'points' | 'region' | 'genSeed'>;

/** Cells of margin around what is drawn on a drawn map. */
const MARGIN_CELLS = 2;

/** Options kept between commands, per window. */
let last: Options = { style: 'dungeon-stone', thicknessFt: 1, snap: 'grid', secret: false, window: false, fortified: false, cliffKind: 'rock', form: 'edge', steep: true, widthFt: 10, steps: 3, inside: 'low', growth: true, waterKind: 'river', riverWidthFt: 10, floorStyle: 'carpet', brushCells: 2, genStyle: 'dungeon', genDensity: 0.6 };

const pxPerFt = () => state.scene.map.grid.cellWidth / state.scene.map.grid.feetPerCell;
const newSeed = () => Math.floor(Math.random() * 1_000_000);

/** The drawn walls and cliffs that can be edited (layers neither hidden in the editor nor locked). */
export function editableMasonry(): Masonry[] {
  return state.layer === 'map' ? target().masonry.filter(editableInForge) : target().masonry;
}

export function editableCliffs(): Cliff[] {
  return state.layer === 'map' ? target().cliffs.filter(editableInForge) : target().cliffs;
}

export function editableWaters(): Water[] {
  return state.layer === 'map' ? target().waters.filter(editableInForge) : target().waters;
}

/** Starts drawing walls or cliffs, or placing doors (one command at a time). */
export function startBuildCommand(kind: BuildCommand['kind']): void {
  // A stale snapshot from an interrupted preview must never restore over another map.
  if (kind === 'generate') genBefore = null;
  state.buildCommand = { kind, ...last, genSeed: newSeed(), region: null, points: [] };
  state.wallCommand = null;
  state.areaCommand = null;
  state.placing = null;
  state.tool = kind === 'wall' ? 'build-wall' : kind === 'cliff' ? 'build-cliff' : kind === 'water' ? 'build-water' : kind === 'floor' ? 'build-floor' : kind === 'generate' ? 'build-generate' : 'build-door';
  emit();
}

export function updateBuildCommand(patch: Partial<Options>): void {
  const c = state.buildCommand;
  if (!c) return;
  state.buildCommand = { ...c, ...patch };
  const { kind: _k, points: _p, region: _r, genSeed: _s, ...options } = state.buildCommand;
  last = options;
  emit();
}

/* ---------------------------------------------------------------- the area generator (DC-119d) */

/** The map before the generator's preview; the preview replaces it live, OK bakes one undo step. */
let genBefore: { masonry: Masonry[]; doors: BuildDoor[]; floors: FloorPatch[] } | null = null;

/** The region dragged for the generator, snapped to whole cells; generating starts at 4×4 cells. */
export function setGenerateRegion(a: Point, b: Point): void {
  const c = state.buildCommand;
  if (!c || c.kind !== 'generate') return;
  const cell = state.scene.map.grid.cellWidth;
  const x0 = Math.floor(Math.min(a.x, b.x) / cell) * cell;
  const y0 = Math.floor(Math.min(a.y, b.y) / cell) * cell;
  const x1 = Math.ceil(Math.max(a.x, b.x) / cell) * cell;
  const y1 = Math.ceil(Math.max(a.y, b.y) / cell) * cell;
  if ((x1 - x0) / cell < 4 || (y1 - y0) / cell < 4) return;
  state.buildCommand = { ...c, region: { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } };
  regenerate();
}

/** A generator setting changed: the preview follows at once. */
export function updateGenerate(patch: Partial<Pick<BuildCommand, 'genStyle' | 'genDensity' | 'genSeed'>>): void {
  const c = state.buildCommand;
  if (!c || c.kind !== 'generate') return;
  state.buildCommand = { ...c, ...patch };
  const { kind: _k, points: _p, region: _r, genSeed: _s, ...options } = state.buildCommand;
  last = options;
  regenerate();
}

/** Builds the preview into the map (replacing the last one); nothing is on the undo stack yet. */
function regenerate(): void {
  const c = state.buildCommand;
  if (!c || c.kind !== 'generate' || !c.region) {
    emit();
    return;
  }
  const m = target();
  genBefore ??= { masonry: m.masonry, doors: m.masonryDoors, floors: m.floors };
  const cell = state.scene.map.grid.cellWidth;
  const cols = Math.round(c.region.w / cell);
  const rows = Math.round(c.region.h / cell);
  const gen = generate({ cols, rows, density: c.genDensity, seed: c.genSeed, style: c.genStyle });
  const layer = onCurrentLayer();
  // In a region the rock only hugs what was carved (DC-119f); it never buries the rest of the map.
  const els = generatedElements(gen, { x: c.region.x, y: c.region.y }, cell, c.genStyle, c.genSeed, freshId, cell * 2.5);
  const withLayer = <T,>(xs: T[]): T[] => (layer.layer || layer.storey ? xs.map((x) => ({ ...x, ...layer })) : xs);
  apply({ masonry: [...genBefore.masonry, ...withLayer(els.walls)], doors: [...genBefore.doors, ...els.doors] }, undefined, true, undefined, [...genBefore.floors, ...withLayer(els.floors)]);
  emit();
}

/** The preview goes back to what the map was (tool switch, discard, undo, leaving the context). */
function dropGeneratePreview(): void {
  if (!genBefore) return;
  apply({ masonry: genBefore.masonry, doors: genBefore.doors }, undefined, true, undefined, genBefore.floors);
  genBefore = null;
  // The command, where it stays open, starts over: a region must be dragged anew.
  const c = state.buildCommand;
  if (c?.kind === 'generate' && c.region) state.buildCommand = { ...c, region: null };
}
buildHooks.cancelPreview = dropGeneratePreview;
buildHooks.hasPreview = () => genBefore !== null;
/**
 * A save takes the preview out and puts it back afterwards (DC-119d): what lands on disk is
 * always the map without the uncommitted preview.
 */
buildHooks.parkPreview = () => {
  if (!genBefore) return null;
  const m = target();
  const preview = { masonry: m.masonry, doors: m.masonryDoors, floors: m.floors };
  const before = genBefore;
  apply({ masonry: before.masonry, doors: before.doors }, undefined, true, undefined, before.floors);
  genBefore = null;
  return () => {
    // Put back only while the command still waits with its region (not discarded meanwhile).
    const c = state.buildCommand;
    if (c?.kind !== 'generate' || !c.region) return;
    genBefore = before;
    apply({ masonry: preview.masonry, doors: preview.doors }, undefined, true, undefined, preview.floors);
    emit();
  };
};

/** "Übernehmen": the preview becomes one undoable step; "Verwerfen": the map stays as it was. */
function endGenerate(keep: boolean): void {
  const c = state.buildCommand;
  if (!c || c.kind !== 'generate' || !genBefore) return;
  const m = target();
  const preview = { masonry: m.masonry, doors: m.masonryDoors, floors: m.floors };
  // Back first, so the undo step holds exactly the generated elements.
  apply({ masonry: genBefore.masonry, doors: genBefore.doors }, undefined, true, undefined, genBefore.floors);
  if (keep) {
    checkpoint();
    apply({ masonry: preview.masonry, doors: preview.doors }, undefined, true, undefined, preview.floors);
    log('log.generated');
  }
  genBefore = null;
}

/** Where a point drawn or dragged at `p` goes (`free`: Alt – exactly there). */
export function buildTarget(p: Point, free: boolean, tolPx: number, skipWall?: string): Point {
  const c = state.buildCommand;
  const mode = free || !state.snap ? 'free' : (c?.snap ?? last.snap);
  const from = c?.points.at(-1) ?? null;
  // In a scene the map's lines catch too (a scene wall joins a map wall cleanly).
  const mapLines = state.layer === 'map' ? [] : [...state.scene.map.masonry, ...state.scene.map.cliffs, ...state.scene.map.waters];
  const magnets = [...masonryPoints([...editableMasonry(), ...editableCliffs(), ...editableWaters(), ...mapLines], skipWall), ...(c?.points.slice(0, -1) ?? [])];
  return snapBuildPoint(p, { mode, grid: state.scene.map.grid, from, magnets, tol: tolPx });
}

/** A click while drawing: the next point; on the first point again (with three or more) the ring closes. */
export function addBuildPoint(p: Point, tolPx: number): void {
  const c = state.buildCommand;
  if (!c || c.kind === 'door') return;
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

/**
 * A stroke dragged while drawing (E-35): freehand it is smoothed into a few points, its ends
 * snapping onto points of other lines; with Shift it is a straight piece from where it began to
 * where it ended (snapped like clicks). On its own it becomes a wall or cliff at once – a ring
 * when it ends where it began; after clicked points it carries the line on.
 */
export function addBuildStroke(stroke: readonly Point[], straight: boolean, tolPx: number): void {
  const c = state.buildCommand;
  if (!c || c.kind === 'door' || stroke.length < 2) return;
  const cell = state.scene.map.grid.cellWidth;
  const magnets = masonryPoints([...editableMasonry(), ...editableCliffs(), ...editableWaters()]);
  const onMagnet = (p: Point) => snapBuildPoint(p, { mode: 'free', grid: state.scene.map.grid, magnets, tol: tolPx });
  let line: Point[];
  let ring = false;
  if (straight) line = [buildTarget(stroke[0], false, tolPx), buildTarget(stroke[stroke.length - 1], false, tolPx)];
  else {
    ring = closesRing(stroke, tolPx * 2);
    line = strokeToLine(stroke, cell);
    if (line.length >= 2) {
      line[0] = onMagnet(line[0]);
      line[line.length - 1] = ring ? line[0] : onMagnet(line[line.length - 1]);
      // A ring's last point is its first again: kept once.
      if (ring) line = line.slice(0, -1);
    }
  }
  if (line.length < 2 || (line.length === 2 && Math.hypot(line[1].x - line[0].x, line[1].y - line[0].y) < 1)) return;
  const prev = c.points.at(-1);
  if (prev) {
    // After clicked points: the line goes on (from the last point, if the stroke began there).
    const rest = Math.hypot(line[0].x - prev.x, line[0].y - prev.y) <= tolPx ? line.slice(1) : line;
    state.buildCommand = { ...c, points: [...c.points, ...rest] };
    emit();
    return;
  }
  state.buildCommand = { ...c, points: line };
  finishBuildWall(ring && line.length >= 3);
}

/**
 * The floor brush (DC-107b): a stroke painted with the chosen floor, as wide as the brush (Shift:
 * straight from where it began to where it ended), or erased with Alt. One step per stroke.
 */
export function paintFloorStroke(stroke: readonly Point[], straight: boolean, erase: boolean): boolean {
  const c = state.buildCommand;
  if (!c || c.kind !== 'floor' || !stroke.length) return false;
  const path = straight && stroke.length > 1 ? [stroke[0], stroke[stroke.length - 1]] : stroke;
  const area = strokeArea(path.map((p) => [p.x, p.y] as [number, number]), (c.brushCells * state.scene.map.grid.cellWidth) / 2);
  if (!area) return false;
  checkpoint();
  const m = target();
  const floors = paintFloor(m.floors, area, c.floorStyle, erase, () => freshId('floor'), newSeed()).map((f) => (f.layer || f.storey || (!onCurrentLayer().layer && !onCurrentLayer().storey) ? f : { ...f, ...onCurrentLayer() }));
  apply({ masonry: m.masonry, doors: m.masonryDoors }, m.cliffs, true, m.waters, floors);
  emit();
  return true;
}

/** Backspace while drawing: the last point goes. */
export function undoBuildPoint(): void {
  const c = state.buildCommand;
  if (!c?.points.length) return;
  state.buildCommand = { ...c, points: c.points.slice(0, -1) };
  emit();
}

/**
 * Ends the line being drawn (double-click, Enter, its start clicked again) – added as one step;
 * drawing goes on. A cliff drawn as a ring (or closed by its start) is a pit or plateau.
 */
export function finishBuildWall(closed = false): void {
  const c = state.buildCommand;
  if (!c || c.points.length < 2) {
    if (c) state.buildCommand = { ...c, points: [] };
    emit();
    return;
  }
  checkpoint();
  const points = c.points.map((q) => ({ x: q.x, y: q.y }));
  const m = target();
  if (c.kind === 'water') {
    // A river is a line; a lake or the sea a ring, however it was drawn.
    const ring = c.waterKind !== 'river';
    if (ring && points.length < 3) {
      state.buildCommand = { ...c, points: [] };
      emit();
      return;
    }
    const water: Water = { id: freshId('water'), kind: c.waterKind, points, closed: ring, width: Math.max(1, c.riverWidthFt * pxPerFt()), seed: newSeed(), ...onCurrentLayer() };
    apply({ masonry: m.masonry, doors: m.masonryDoors }, m.cliffs, true, [...m.waters, water]);
    state.buildSelection = { kind: 'water', wall: water.id, point: null, door: null };
    log('log.waterAdded');
  } else if (c.kind === 'cliff') {
    const ring = (closed || c.form === 'ring') && points.length >= 3;
    const cliff: Cliff = {
      id: freshId('cliff'),
      points,
      closed: ring,
      kind: c.cliffKind,
      form: ring ? 'ring' : c.form === 'ring' ? 'edge' : c.form,
      steep: c.cliffKind !== 'scree' && c.steep,
      width: Math.max(1, c.widthFt * pxPerFt()),
      steps: c.steps,
      inside: c.inside,
      growth: c.growth,
      seed: newSeed(),
      ...onCurrentLayer(),
    };
    apply({ masonry: m.masonry, doors: m.masonryDoors }, m.cliffs.concat(cliff));
    state.buildSelection = { kind: 'cliff', wall: cliff.id, point: null, door: null };
    log('log.cliffAdded');
  } else {
    const wall: Masonry = { id: freshId('masonry'), points, closed: closed && points.length >= 3, style: c.style, thickness: Math.max(1, c.thicknessFt * pxPerFt()), seed: newSeed(), ...(c.fortified ? { fortified: true } : {}), ...onCurrentLayer() };
    apply({ masonry: [...m.masonry, wall], doors: m.masonryDoors });
    state.buildSelection = { kind: 'wall', wall: wall.id, point: null, door: null };
    log('log.masonryAdded');
  }
  state.buildCommand = { ...c, points: [] };
  emit();
}

/** OK or Escape on an empty drawing: the command ends (a line being drawn is added first). */
export function endBuildCommand(keepDrawn: boolean): void {
  const c = state.buildCommand;
  if (!c) return;
  if (c.kind === 'generate') endGenerate(keepDrawn);
  if (keepDrawn && c.kind !== 'generate' && c.points.length >= 2) finishBuildWall(false);
  state.buildCommand = null;
  state.tool = 'build-edit';
  // Editing starts without a selection: the first click selects, it never adds a point.
  state.buildSelection = null;
  emit();
}

/** "Place door": a door one cell wide on the wall clicked, centred on a cell (unless Alt). */
export function placeBuildDoor(p: Point, free: boolean, tolPx: number): boolean {
  const c = state.buildCommand;
  if (!c || c.kind !== 'door') return false;
  const at = doorPlacement(editableMasonry(), p, free || !state.snap ? null : state.scene.map.grid, tolPx);
  if (!at) return false;
  checkpoint();
  const door: BuildDoor = { id: freshId(c.window ? 'window' : 'door'), wall: at.wall, at: at.at, width: state.scene.map.grid.cellWidth, secret: !c.window && c.secret, crack: false, ...(c.window ? { window: true } : {}) };
  apply({ masonry: target().masonry, doors: [...target().masonryDoors, door] });
  state.buildSelection = { kind: 'wall', wall: at.wall, point: null, door: door.id };
  log('log.doorAdded');
  emit();
  return true;
}

/* ---------- Selecting and editing ---------- */

/**
 * What a click at `p` picks in the "Edit" tool: a point, a door, a wall, a cliff, water – in that
 * order. In a scene its own drawing first, then what the map shows there (to hide it, DC-107c).
 */
export function buildHit(p: Point, tolPx: number): BuildSelection | null {
  const own = hitIn(editableMasonry(), target().masonryDoors, editableCliffs(), editableWaters(), p, tolPx);
  if (own || state.layer === 'map') return own;
  const off = new Set(state.scene.drawnHidden);
  const m = state.scene.map;
  const mapHit = hitIn(m.masonry.filter((w) => !off.has(w.id)), m.masonryDoors.filter((d) => !off.has(d.id)), m.cliffs.filter((c) => !off.has(c.id)), m.waters.filter((w) => !off.has(w.id)), p, tolPx);
  // Only the whole element: points and lines of the map are not edited in a scene.
  return mapHit ? { ...mapHit, point: null, onMap: true } : null;
}

function hitIn(walls: Masonry[], doorList: readonly BuildDoor[], cliffList: Cliff[], waterList: Water[], p: Point, tolPx: number): BuildSelection | null {
  // A cliff is hit on its face too, not only on its upper edge: what is seen is what is clicked.
  const cliffs = cliffList.map((c) => ({ ...c, thickness: state.scene.map.grid.cellWidth * 1.2 }));
  const v = hitVertex(walls, p, tolPx);
  if (v) return { kind: 'wall', wall: v.wall, point: v.index, door: null };
  const cv = hitVertex(cliffs, p, tolPx);
  if (cv) return { kind: 'cliff', wall: cv.wall, point: cv.index, door: null };
  const door = hitDoor(walls, doorList, p, tolPx);
  if (door) return { kind: 'wall', wall: doorList.find((d) => d.id === door)!.wall, point: null, door };
  const line = hitMasonry(walls, p, tolPx);
  if (line) return { kind: 'wall', wall: line.wall, point: null, door: null };
  const cl = hitMasonry(cliffs, p, tolPx);
  if (cl) return { kind: 'cliff', wall: cl.wall, point: null, door: null };
  // Water: a river on its width, a lake or the sea anywhere on it.
  const waters = waterList.map((w) => ({ ...w, thickness: w.kind === 'river' ? w.width : 0 }));
  const wv = hitVertex(waters, p, tolPx);
  if (wv) return { kind: 'water', wall: wv.wall, point: wv.index, door: null };
  const wl = hitMasonry(waters, p, tolPx);
  if (wl) return { kind: 'water', wall: wl.wall, point: null, door: null };
  const pool = [...waters].reverse().find((w) => w.closed && isInside([{ outer: w.points.map((q) => [q.x, q.y] as [number, number]), holes: [] }], [p.x, p.y]));
  return pool ? { kind: 'water', wall: pool.id, point: null, door: null } : null;
}

export function selectBuild(sel: BuildSelection | null): void {
  state.buildSelection = sel;
  if (sel) {
    state.selectedWallIds = [];
    state.selectedAssetId = null;
  }
  emit();
}

/** The lines of a kind and the edit applied to them (doors only go with walls). */
function lines(kind: BuildSelection['kind']): Line[] {
  return kind === 'wall' ? target().masonry : kind === 'cliff' ? target().cliffs : target().waters;
}

function applyTo(kind: BuildSelection['kind'], edit: Edit<Line>, final = true): void {
  // The lists not edited stay as they are – the map's in the Map Forge, the scene's own in a scene.
  const m = target();
  if (kind === 'wall') apply({ masonry: edit.masonry as Masonry[], doors: edit.doors }, m.cliffs, final);
  else if (kind === 'cliff') apply({ masonry: m.masonry, doors: m.masonryDoors }, edit.masonry as Cliff[], final);
  else apply({ masonry: m.masonry, doors: m.masonryDoors }, m.cliffs, final, edit.masonry as Water[]);
}

const doorsOf = (kind: BuildSelection['kind']) => (kind === 'wall' ? target().masonryDoors : []);

/** A click on the line of the selected wall or cliff: a new point there (one step), returned for dragging. */
export function insertBuildPoint(sel: Pick<BuildSelection, 'kind' | 'wall'>, p: Point): number {
  checkpoint();
  const out = insertPoint(lines(sel.kind), sel.wall, p);
  applyTo(sel.kind, { masonry: out.masonry, doors: doorsOf(sel.kind) });
  state.buildSelection = { kind: sel.kind, wall: sel.wall, point: out.index, door: null };
  emit();
  return out.index;
}

/**
 * Moves a point live while dragging; `done` joins it to another end of the same kind it was
 * dropped on (or to its own other end: the ring closes). The caller sets the checkpoint.
 */
export function moveBuildPoint(sel: Pick<BuildSelection, 'kind' | 'wall'>, index: number, to: Point, done: boolean, tolPx: number): void {
  let edit = movePoint(lines(sel.kind), doorsOf(sel.kind), sel.wall, index, to);
  if (done) {
    const w = edit.masonry.find((x) => x.id === sel.wall);
    const end: WallEnd['end'] | null = w && !w.closed ? (index === 0 ? 'first' : index === w.points.length - 1 ? 'last' : null) : null;
    if (w && end) {
      const target = endNear(edit.masonry, to, tolPx, { wall: sel.wall, end });
      if (target) {
        edit = joinEnds(edit.masonry, edit.doors, { wall: sel.wall, end }, target);
        // A cliff closed into a ring becomes a pit or plateau.
        if (sel.kind === 'cliff') edit = { ...edit, masonry: edit.masonry.map((x) => (x.id === sel.wall && x.closed ? { ...(x as Cliff), form: 'ring' } : x)) };
      }
    }
  }
  applyTo(sel.kind, edit, done);
  if (done && !lines(sel.kind).some((x) => x.id === sel.wall)) state.buildSelection = null;
  emit();
}

/** Another open line's end (or this line's other end) at `p`. */
function endNear(all: readonly Line[], p: Point, tol: number, self: WallEnd): WallEnd | null {
  for (const w of all) {
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
  const doors = target().masonryDoors.map((d) => (d.id === id ? slideDoor(target().masonry, d, to, free || !state.snap ? null : state.scene.map.grid) : d));
  apply({ masonry: target().masonry, doors }, target().cliffs, done);
  emit();
}

/** Delete: the selected point, door, wall or cliff (one step). */
export function deleteBuildSelection(): boolean {
  const sel = state.buildSelection;
  if (!sel) return false;
  checkpoint();
  if (sel.onMap) {
    // In a scene, a drawn element of the map is hidden there, not deleted (DC-107c).
    state.scene.drawnHidden = [...state.scene.drawnHidden, sel.door ?? sel.wall];
    state.buildSelection = null;
    markDirty();
    recomputeVision();
    emit();
    return true;
  }
  const all = lines(sel.kind);
  const doors = doorsOf(sel.kind);
  if (sel.door) apply({ masonry: target().masonry, doors: doors.filter((d) => d.id !== sel.door) });
  else if (sel.point !== null) applyTo(sel.kind, removePoint(all, doors, sel.wall, sel.point));
  else applyTo(sel.kind, removeWall(all, doors, sel.wall));
  state.buildSelection = sel.point !== null && lines(sel.kind).some((w) => w.id === sel.wall) ? { ...sel, point: null } : null;
  emit();
  return true;
}

/** "Split here": the selected wall or cliff at its selected point (one step). */
export function splitBuildWall(): void {
  const sel = state.buildSelection;
  if (!sel || sel.point === null) return;
  // A lake or the sea stays a ring: it cannot be split open (and leaves no empty undo step).
  if (sel.kind === 'water' && lines('water').find((w) => w.id === sel.wall)?.closed) return;
  checkpoint();
  let edit = splitAt(lines(sel.kind), doorsOf(sel.kind), sel.wall, sel.point, freshId(sel.kind === 'wall' ? 'masonry' : sel.kind));
  // A ring opened is an edge again.
  if (sel.kind === 'cliff') edit = { ...edit, masonry: edit.masonry.map((x) => (!x.closed && (x as Cliff).form === 'ring' ? { ...(x as Cliff), form: 'edge' } : x)) };
  applyTo(sel.kind, edit);
  state.buildSelection = { ...sel, point: null };
  emit();
}

export function updateMasonry(id: string, patch: Partial<Pick<Masonry, 'style' | 'thickness' | 'seed' | 'height' | 'fortified' | 'decay' | 'solid'>>): void {
  checkpoint();
  apply({ masonry: target().masonry.map((w) => (w.id === id ? { ...w, ...patch } : w)), doors: target().masonryDoors });
  emit();
}

/** A new look for the selected wall's jitter and stones. */
export function rerollMasonry(id: string): void {
  updateMasonry(id, { seed: newSeed() });
}

export function updateBuildDoor(id: string, patch: Partial<Pick<BuildDoor, 'width' | 'secret' | 'crack' | 'window'>>): void {
  checkpoint();
  // A window is never secret; a door that stops being secret loses its crack.
  const doors = target().masonryDoors.map((d) => (d.id === id ? { ...d, ...patch, ...(patch.secret === false || patch.window ? { crack: false } : {}), ...(patch.window ? { secret: false } : {}) } : d));
  apply({ masonry: target().masonry, doors });
  emit();
}

/** Changes a cliff (one step); scree never blocks sight, a ring's form follows its being closed. */
export function updateCliff(id: string, patch: Partial<Pick<Cliff, 'kind' | 'form' | 'steep' | 'width' | 'steps' | 'inside' | 'growth' | 'seed' | 'decay'>>): void {
  checkpoint();
  const m = target();
  const cliffs = m.cliffs.map((c) => {
    if (c.id !== id) return c;
    const next = { ...c, ...patch };
    if (next.kind === 'scree') next.steep = false;
    // Only a closed line is a ring; a ring asked of an open line closes it (three points or more).
    if (patch.form === 'ring') next.closed = next.points.length >= 3;
    else if (patch.form) next.closed = false;
    if (!next.closed && next.form === 'ring') next.form = 'edge';
    return next;
  });
  apply({ masonry: m.masonry, doors: m.masonryDoors }, cliffs);
  emit();
}

/** "Flip direction": the cliff's upper and lower sides swap (one step). */
export function flipCliff(id: string): void {
  const c = target().cliffs.find((x) => x.id === id);
  if (!c) return;
  checkpoint();
  // A ring keeps its inside low or high: that is turned instead.
  const cliffs = target().cliffs.map((x) => (x.id !== id ? x : x.form === 'ring' ? { ...x, inside: x.inside === 'low' ? ('high' as const) : ('low' as const) } : { ...x, points: [...x.points].reverse() }));
  apply({ masonry: target().masonry, doors: target().masonryDoors }, cliffs);
  emit();
}

export function rerollCliff(id: string): void {
  updateCliff(id, { seed: newSeed() });
}

export const CLIFF_FORM_LIST = CLIFF_FORMS;

/** Changes water (one step); a river is a line, a lake or the sea a ring (three points or more). */
export function updateWater(id: string, patch: Partial<Pick<Water, 'kind' | 'width'>>): void {
  const m = target();
  const w = m.waters.find((x) => x.id === id);
  if (!w || (patch.kind && patch.kind !== 'river' && w.points.length < 3)) return;
  checkpoint();
  apply({ masonry: m.masonry, doors: m.masonryDoors }, m.cliffs, true, m.waters.map((x) => (x.id !== id ? x : { ...x, ...patch, closed: (patch.kind ?? x.kind) !== 'river' })));
  emit();
}

/** "Flip flow": a river flows the other way (one step). */
export function flipWater(id: string): void {
  const m = target();
  if (!m.waters.some((x) => x.id === id)) return;
  checkpoint();
  apply({ masonry: m.masonry, doors: m.masonryDoors }, m.cliffs, true, m.waters.map((x) => (x.id === id ? { ...x, points: [...x.points].reverse() } : x)));
  emit();
}

/** The map's look (E-35): where the light falls towards, and its automatic details (one step). */
export function setMapLook(patch: Partial<{ lightAngle: number; autoShore: boolean; autoGrowth: boolean }>): void {
  if (state.layer !== 'map') return;
  checkpoint();
  Object.assign(state.scene.map, patch);
  markDirty();
  emit();
}

/** "Show again": the map's drawn elements this scene hides come back (one step, DC-107c). */
export function showHiddenDrawn(): void {
  if (state.layer === 'map' || !state.scene.drawnHidden.length) return;
  checkpoint();
  state.scene.drawnHidden = [];
  markDirty();
  recomputeVision();
  emit();
}

/** Whether the map's water moves (E-35, per map; one step). */
export function setWaterAnimated(on: boolean): void {
  if (state.layer !== 'map' || state.scene.map.waterAnimated === on) return;
  checkpoint();
  state.scene.map.waterAnimated = on;
  markDirty();
  emit();
}

/* ---------- Applying an edit ---------- */

/**
 * Takes an edit into the map: a drawn map's area follows what is drawn (it grows and shrinks,
 * left and up too); sight is recomputed (fully when `final`).
 */
function apply(edit: Edit, cliffs: Cliff[] = target().cliffs, final = true, waters: Water[] = target().waters, floors: FloorPatch[] = target().floors): void {
  const t = target();
  t.floors = floors;
  t.masonry = edit.masonry;
  t.masonryDoors = edit.doors;
  t.cliffs = cliffs;
  t.waters = waters;
  // A drawn map's area follows the map's drawing; a scene's own drawing leaves it as it is.
  const m = state.scene.map;
  if (m.drawn && t === m) {
    const floorEdges = m.floors.map((f) => ({ points: f.shape.flatMap((p) => p.outer.map(([x, y]) => ({ x, y }))), width: 1 }));
    const b = drawnBounds(m.masonry, m.grid.cellWidth, MARGIN_CELLS, [...m.cliffs, ...m.waters, ...floorEdges]);
    m.origin = { x: b.x, y: b.y };
    m.widthPx = b.w;
    m.heightPx = b.h;
  }
  markDirty();
  recomputeVision(final);
}

/**
 * What is drawn into: the map in the Map Forge, the scene's own drawing in a scene (its play state
 * or, while it is edited, its start state – DC-107c).
 */
function target(): OwnDrawing {
  return state.layer === 'map' ? state.scene.map : state.scene.own;
}

function onCurrentLayer(): { layer?: string; storey?: string } {
  // New drawing goes on the storey the DM works on (E-40), in the Map Forge and in scenes.
  const storey = state.scene.map.storey ? { storey: state.scene.map.storey } : {};
  if (state.layer !== 'map') return storey;
  const layer = state.currentLayer;
  return { ...(layer && state.scene.map.layers.some((l) => l.id === layer) ? { layer } : {}), ...storey };
}
