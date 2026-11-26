/**
 * DM-only overlays drawn on a 2D canvas above the PixiJS view (Dungeon-Manager: "DM overlays
 * (DM window only)" sit above the fog). Never used for the table.
 */
import type { Point } from '../core/geometry';
import type { GridBox } from '../core/grid';
import type { Footprint } from '../core/placement';
import { labelPoint } from '../core/areas';
import type { Polygon } from '../core/poly/types';
import type { HiddenElements, Scene, Wall, WallKind } from '../core/scene';
import type { ViewerVision } from '../core/vision';
import type { Leak } from '../core/leaks';
import { drawTemplate, hexToRgba, type TemplateLike } from './shared';

/** The map's turn in the view being drawn: labels are turned back by it (E-42). */
let textTurn = 0;

/** Text at a map point, upright on screen however the map is turned. */
function uprightText(g: CanvasRenderingContext2D, text: string, x: number, y: number): void {
  if (!textTurn) {
    g.fillText(text, x, y);
    return;
  }
  g.save();
  g.translate(x, y);
  g.rotate((-textTurn * Math.PI) / 180);
  g.fillText(text, 0, 0);
  g.restore();
}

export interface OverlayView {
  zoom: number;
  x: number;
  y: number;
  /** The map's turn (E-42); none: upright. */
  rot?: 0 | 90 | 180 | 270;
}

export interface OverlayState {
  editMode: boolean;
  selectedTokenId: string | null;
  selectedZoneId: string | null;
  selectedLightId: string | null;
  /** The selected sound source (E-37): its radius and the handle to change it. */
  selectedSoundId?: string | null;
  /** Where the placing mode would put a sound source (E-37). */
  soundGhost?: Point | null;
  /** Stairs on the storey shown (E-44): their place, way up and the storey they lead to; the selected one. */
  stairs?: { list: readonly { id: string; x: number; y: number; w: number; h: number; dir: 'n' | 'e' | 's' | 'w'; toName: string }[]; selected: string | null };
  /** The leak check (DC-025): what its test figure sees, the figure, and the leaks found. */
  leakCheck?: { figure: Point | null; sight: readonly Polygon[]; leaks: readonly Leak[] } | null;
  measure: { a: Point; b: Point; ft: number } | null;
  /** Walls selected in the Map Forge (DC-014). */
  selectedWallIds: readonly string[];
  /** "Draw walls": the pieces drawn so far and the one following the pointer. */
  wallDraft: { kind: WallKind; walls: readonly Omit<Wall, 'id'>[]; next: { a: Point; b: Point } | null } | null;
  /** Placed assets for the DM (DC-041): their footprints, the selected one, missing files, hidden ones. */
  assets: readonly { fp: Footprint; name: string; selected: boolean; missing: boolean; hidden: boolean }[];
  /** Cover masks of placed assets (Map Forge, DC-108): dashed outlines. */
  covers: readonly Polygon[];
  /** Elements whose fields this scene changed (DC-103): marked for the DM. */
  changed: ReadonlySet<string>;
  /** Where dragged wall ends are right now. */
  wallEnds: Point | null;
  brush: { p: Point; r: number } | null;
  /** "Calibrate grid": the box over N×N cells of the printed grid (E-7). */
  calibBox: { box: GridBox; cells: number } | null;
  /** The area generator's dragged region (DC-119d). */
  genRect: { x: number; y: number; w: number; h: number } | null;
  draftTemplate: TemplateLike | null;
  /** "Create area": the shape so far, the part being drawn and a polygon or lasso path (DC-013). */
  areaDraft: { shape: Polygon[]; part: Polygon | null; path: Point[]; color: string; subtract: boolean; editing: string | null } | null;
  /** Outline of a fog tool's shape while drawing. */
  fogDraft: { polygon: Polygon | null; path: Point[]; mode: 'reveal' | 'hide' } | null;
  /** The "Build" tab (E-33): the wall being drawn (and where its next point would go), the drawn wall or door selected. */
  build?: BuildOverlay | null;
  /** Scree slopes (E-34): difficult terrain, marked for the DM only, with this label. */
  difficult?: { lines: readonly { points: readonly Point[]; closed: boolean; depth: number }[]; label: string } | null;
}

/** Difficult terrain: a dashed orange line along the slope's foot and its label at the middle. */
function drawDifficult(g: CanvasRenderingContext2D, d: NonNullable<OverlayState['difficult']>, px: number): void {
  g.save();
  g.strokeStyle = 'rgba(232,150,60,.9)';
  g.fillStyle = 'rgba(232,150,60,.95)';
  g.lineWidth = 2 * px;
  g.setLineDash([7 * px, 5 * px]);
  g.font = `${11 * px}px system-ui, sans-serif`;
  g.textAlign = 'center';
  for (const l of d.lines) {
    polyline(g, l.points, l.closed);
    g.stroke();
    // The middle of the middle segment.
    const i = Math.floor((l.points.length - 1) / 2);
    const a = l.points[i];
    const b = l.points[Math.min(l.points.length - 1, i + 1)];
    uprightText(g, d.label, (a.x + b.x) / 2, (a.y + b.y) / 2 + l.depth * 0.6);
  }
  g.restore();
}

export interface BuildOverlay {
  draft: readonly Point[];
  /** How many of the draft's first points get handles (clicked ones, not those of a stroke being drawn). */
  handles?: number;
  next: Point | null;
  thickness: number;
  selected: { points: readonly Point[]; closed: boolean; thickness: number; point: number | null; door: { a: Point; b: Point } | null } | null;
}

function polyline(g: CanvasRenderingContext2D, points: readonly Point[], closed: boolean): void {
  g.beginPath();
  points.forEach((q, i) => (i ? g.lineTo(q.x, q.y) : g.moveTo(q.x, q.y)));
  if (closed) g.closePath();
}

/** The wall being drawn as a see-through band of its thickness, the selection as a blue band with its points. */
function drawBuild(g: CanvasRenderingContext2D, b: BuildOverlay, px: number): void {
  g.save();
  g.lineCap = 'round';
  g.lineJoin = 'round';
  if (b.draft.length) {
    const pts = b.next ? [...b.draft, b.next] : b.draft;
    g.strokeStyle = 'rgba(232,176,75,.45)';
    g.lineWidth = b.thickness;
    polyline(g, pts, false);
    g.stroke();
    if (b.next) {
      g.strokeStyle = 'rgba(232,176,75,.9)';
      g.lineWidth = 1.5 * px;
      g.setLineDash([8 * px, 5 * px]);
      polyline(g, [b.draft[b.draft.length - 1], b.next], false);
      g.stroke();
      g.setLineDash([]);
    }
    for (const q of b.draft.slice(0, b.handles ?? b.draft.length)) drawEnd(g, q.x, q.y, px, false);
    if (b.next) drawEnd(g, b.next.x, b.next.y, px, true);
  }
  const s = b.selected;
  if (s) {
    g.strokeStyle = SELECTED;
    g.lineWidth = s.thickness + 8 * px;
    polyline(g, s.points, s.closed);
    g.stroke();
    s.points.forEach((q, i) => drawEnd(g, q.x, q.y, px, i === s.point));
    if (s.door) {
      g.strokeStyle = '#3f9de2';
      g.lineWidth = s.thickness + 10 * px;
      g.lineCap = 'butt';
      polyline(g, [s.door.a, s.door.b], false);
      g.stroke();
    }
  }
  g.restore();
}

const labels = new WeakMap<readonly Polygon[], Point>();

/** The name's place, computed once per shape (shapes are replaced, never changed in place). */
function labelOf(shape: readonly Polygon[]): Point {
  let p = labels.get(shape);
  if (!p) {
    p = labelPoint(shape);
    labels.set(shape, p);
  }
  return p;
}

export function areaPath(shape: readonly Polygon[]): Path2D {
  const path = new Path2D();
  for (const polygon of shape)
    for (const ring of [polygon.outer, ...polygon.holes]) {
      ring.forEach(([x, y], i) => (i === 0 ? path.moveTo(x, y) : path.lineTo(x, y)));
      path.closePath();
    }
  return path;
}

export function drawDmOverlay(g: CanvasRenderingContext2D, scene: Scene, vision: readonly ViewerVision[], view: OverlayView, dpr: number, o: OverlayState, now: number): void {
  const W = scene.map.widthPx;
  const H = scene.map.heightPx;
  const cell = scene.map.grid.cellWidth;
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.clearRect(0, 0, g.canvas.width, g.canvas.height);
  // Turned with the map (E-42), as the renderer's camera; texts stay upright.
  textTurn = view.rot ?? 0;
  const a = ((view.rot ?? 0) * Math.PI) / 180;
  const k = dpr * view.zoom;
  g.setTransform(Math.round(Math.cos(a)) * k, Math.round(Math.sin(a)) * k, -Math.round(Math.sin(a)) * k, Math.round(Math.cos(a)) * k, dpr * view.x, dpr * view.y);
  const px = 1 / view.zoom;

  g.strokeStyle = 'rgba(255,255,255,.15)';
  g.lineWidth = px;
  g.strokeRect(scene.map.origin?.x ?? 0, scene.map.origin?.y ?? 0, W, H);

  for (const z of scene.zones) {
    // The area being edited shows as the command's draft instead.
    if (z.id === o.areaDraft?.editing) continue;
    const sel = z.id === o.selectedZoneId;
    g.save();
    // One even-odd path per area, so holes stay open.
    const path = areaPath(z.shape);
    if (o.editMode) {
      g.fillStyle = hexToRgba(z.color, sel ? 0.2 : 0.08);
      g.fill(path, 'evenodd');
    }
    g.strokeStyle = hexToRgba(z.color, o.editMode ? 0.85 : 0.35);
    g.lineWidth = (sel ? 3 : 1.5) * px;
    g.setLineDash(z.secret ? [10 * px, 7 * px] : []);
    g.stroke(path);
    g.setLineDash([]);
    g.font = `600 ${Math.max(12, 13 * px)}px 'Barlow Semi Condensed', sans-serif`;
    g.fillStyle = hexToRgba(z.color, o.editMode ? 1 : 0.7);
    g.textBaseline = 'top';
    const at = labelOf(z.shape);
    uprightText(g, `${z.secret ? '◆ ' : ''}${z.name.toUpperCase()}`, at.x, at.y);
    g.restore();
  }

  const selWalls = new Set(o.selectedWallIds);
  for (const w of scene.walls) {
    const isDoor = w.kind === 'door' || w.kind === 'secret-door';
    if (!o.editMode && !isDoor) continue;
    // Selection: a blue band under the wall.
    if (selWalls.has(w.id)) strokeSegment(g, w, SELECTED, 11 * px);
    strokeWall(g, w, px);
  }
  // Wall ends (Map Forge): joints and loose ends to grab; selected walls' ends as handles.
  if (o.editMode) {
    for (const w of scene.walls) {
      const sel = selWalls.has(w.id);
      for (const [x, y] of [[w.x1, w.y1], [w.x2, w.y2]] as const) drawEnd(g, x, y, px, sel);
    }
  }
  if (o.wallEnds) drawEnd(g, o.wallEnds.x, o.wallEnds.y, px, true);
  if (o.wallDraft) {
    for (const w of o.wallDraft.walls) {
      strokeWall(g, w, px);
      drawEnd(g, w.x1, w.y1, px, false);
      drawEnd(g, w.x2, w.y2, px, false);
    }
    const next = o.wallDraft.next;
    if (next) {
      g.save();
      g.globalAlpha = 0.7;
      g.setLineDash([8 * px, 5 * px]);
      strokeWall(g, { kind: o.wallDraft.kind, x1: next.a.x, y1: next.a.y, x2: next.b.x, y2: next.b.y }, px);
      g.restore();
      // Both ends: where the piece starts and where it would end (snapped).
      drawEnd(g, next.a.x, next.a.y, px, true);
      drawEnd(g, next.b.x, next.b.y, px, true);
    }
  }

  if (o.build) drawBuild(g, o.build, px);
  if (o.difficult) drawDifficult(g, o.difficult, px);

  for (const a of o.assets) drawPlacement(g, a, px);
  if (o.covers.length) {
    g.save();
    g.strokeStyle = 'rgba(63,157,226,.8)';
    g.fillStyle = 'rgba(63,157,226,.1)';
    g.lineWidth = 1.5 * px;
    g.setLineDash([6 * px, 4 * px]);
    const path = areaPath(o.covers);
    g.fill(path);
    g.stroke(path);
    g.restore();
  }
  // Elements hidden in this scene: faint and dashed, so the DM can find and show them again.
  drawHidden(g, scene.hidden, px);
  // Changed elements: a small marker.
  for (const w of scene.walls) if (o.changed.has(w.id)) drawChangedMark(g, (w.x1 + w.x2) / 2, (w.y1 + w.y2) / 2, px);
  for (const z of scene.zones) if (o.changed.has(z.id)) { const at = labelOf(z.shape); drawChangedMark(g, at.x - 8 * px, at.y + 6 * px, px); }
  for (const l of scene.lights) if (o.changed.has(l.id)) drawChangedMark(g, l.x + cell * 0.25, l.y - cell * 0.25, px);

  // Light sources: an icon, and their bright/dim radii in the forge or when selected.
  for (const l of scene.lights) {
    const sel = l.id === o.selectedLightId;
    if (o.editMode || sel) {
      const ftPx = cell / scene.map.grid.feetPerCell;
      g.save();
      g.strokeStyle = hexToRgba(l.color, l.on ? 0.7 : 0.3);
      g.lineWidth = (sel ? 2 : 1) * px;
      g.setLineDash([6 * px, 5 * px]);
      g.beginPath();
      g.arc(l.x, l.y, l.brightFt * ftPx, 0, Math.PI * 2);
      g.stroke();
      g.beginPath();
      g.arc(l.x, l.y, l.dimFt * ftPx, 0, Math.PI * 2);
      g.stroke();
      g.restore();
    }
    const r = Math.max(8 * px, cell * 0.18);
    g.save();
    g.fillStyle = l.on ? l.color : '#555a60';
    g.strokeStyle = sel ? '#3f9de2' : 'rgba(0,0,0,.7)';
    g.lineWidth = (sel ? 3 : 2) * px;
    g.beginPath();
    g.arc(l.x, l.y, r, 0, Math.PI * 2);
    g.fill();
    g.stroke();
    if (l.on) {
      g.strokeStyle = l.color;
      g.lineWidth = 2 * px;
      for (let i = 0; i < 8; i++) {
        const a = (i * Math.PI) / 4;
        g.beginPath();
        g.moveTo(l.x + Math.cos(a) * r * 1.4, l.y + Math.sin(a) * r * 1.4);
        g.lineTo(l.x + Math.cos(a) * r * 2, l.y + Math.sin(a) * r * 2);
        g.stroke();
      }
    }
    g.restore();
  }

  // Sound sources (E-37): a speaker, and their reach in the forge or when selected – DM window only.
  for (const s of scene.sounds) if (o.changed.has(s.id)) drawChangedMark(g, s.x + cell * 0.25, s.y - cell * 0.25, px);
  const ftPx = cell / scene.map.grid.feetPerCell;
  for (const s of scene.sounds) {
    const sel = s.id === o.selectedSoundId;
    if (o.editMode || sel) drawSoundReach(g, s, s.radiusFt * ftPx, sel, px);
    drawSpeaker(g, s.x, s.y, Math.max(8 * px, cell * 0.18), sel, px);
  }
  if (o.stairs && o.editMode) drawStairMarks(g, o.stairs, px);
  if (o.leakCheck) drawLeakCheck(g, o.leakCheck, Math.max(8 * px, cell * 0.3), px);
  if (o.soundGhost) {
    g.save();
    g.globalAlpha = 0.55;
    drawSpeaker(g, o.soundGhost.x, o.soundGhost.y, Math.max(8 * px, cell * 0.18), false, px);
    g.restore();
  }

  for (const t of scene.templates) drawTemplate(g, t, scene.map.grid, true);
  if (o.draftTemplate) drawTemplate(g, o.draftTemplate, scene.map.grid, true);

  // HP bars under each token (the renderer draws the discs).
  for (const t of scene.tokens) {
    const r = (cell * t.size) / 2 - 4;
    const p = Math.max(0, Math.min(1, t.hp / t.maxHp));
    g.fillStyle = 'rgba(0,0,0,.7)';
    g.fillRect(t.x - r, t.y + r + 2, r * 2, 6);
    g.fillStyle = p > 0.5 ? '#5db776' : p > 0.25 ? '#e3b341' : '#e2554c';
    g.fillRect(t.x - r, t.y + r + 2, r * 2 * p, 6);
  }

  const selVision = vision.find((v) => v.tokenId === o.selectedTokenId);
  if (selVision && !o.editMode) {
    g.save();
    g.strokeStyle = 'rgba(63,157,226,.5)';
    g.setLineDash([5 * px, 5 * px]);
    g.lineWidth = 1.5 * px;
    g.beginPath();
    selVision.outline.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y)));
    g.closePath();
    g.stroke();
    g.restore();
  }

  for (const p of scene.pings) {
    const k = (now - p.at) / 1600;
    if (k > 1) continue;
    for (let i = 0; i < 3; i++) {
      const kk = (k * 1.4 + i * 0.18) % 1;
      g.strokeStyle = `rgba(226,160,60,${1 - kk})`;
      g.lineWidth = 3 * px;
      g.beginPath();
      g.arc(p.x, p.y, 14 + kk * 110, 0, Math.PI * 2);
      g.stroke();
    }
  }

  if (o.areaDraft) {
    const a = o.areaDraft;
    g.save();
    g.lineWidth = 2 * px;
    if (a.shape.length) {
      const path = areaPath(a.shape);
      g.fillStyle = hexToRgba(a.color, 0.22);
      g.fill(path, 'evenodd');
      g.strokeStyle = hexToRgba(a.color, 1);
      g.stroke(path);
    }
    // Corner handles: dragged to move a corner.
    g.fillStyle = hexToRgba(a.color, 1);
    g.strokeStyle = 'rgba(0,0,0,.6)';
    g.lineWidth = px;
    const h = 4 * px;
    for (const polygon of a.shape)
      for (const ring of [polygon.outer, ...polygon.holes])
        for (const [x, y] of ring) {
          g.fillRect(x - h, y - h, 2 * h, 2 * h);
          g.strokeRect(x - h, y - h, 2 * h, 2 * h);
        }
    g.lineWidth = 2 * px;
    // The part being drawn: dashed, red when it cuts out.
    g.setLineDash([8 * px, 5 * px]);
    g.strokeStyle = a.subtract ? 'rgba(226,85,76,.95)' : hexToRgba(a.color, 0.95);
    if (a.part) g.stroke(areaPath([a.part]));
    if (a.path.length > 1) {
      g.beginPath();
      a.path.forEach((q, i) => (i ? g.lineTo(q.x, q.y) : g.moveTo(q.x, q.y)));
      g.stroke();
    }
    g.restore();
  }

  if (o.fogDraft) {
    const col = o.fogDraft.mode === 'reveal' ? '226,160,60' : '120,150,255';
    g.save();
    g.lineWidth = 2 * px;
    g.setLineDash([8 * px, 5 * px]);
    g.strokeStyle = `rgba(${col},.95)`;
    g.fillStyle = `rgba(${col},.12)`;
    if (o.fogDraft.polygon) {
      g.beginPath();
      for (const ring of [o.fogDraft.polygon.outer, ...o.fogDraft.polygon.holes]) {
        ring.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
        g.closePath();
      }
      g.fill('evenodd');
      g.stroke();
    }
    if (o.fogDraft.path.length > 1) {
      g.beginPath();
      o.fogDraft.path.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y)));
      g.stroke();
    }
    g.restore();
  }

  if (o.measure) {
    const { a, b, ft } = o.measure;
    g.save();
    g.strokeStyle = '#e2a03c';
    g.lineWidth = 3 * px;
    g.setLineDash([10 * px, 6 * px]);
    g.beginPath();
    g.moveTo(a.x, a.y);
    g.lineTo(b.x, b.y);
    g.stroke();
    g.setLineDash([]);
    label(g, `${ft} ft`, b.x + 14 * px, b.y - 14 * px, px);
    g.restore();
  }
  if (o.brush) {
    g.strokeStyle = 'rgba(226,160,60,.9)';
    g.lineWidth = 2 * px;
    g.beginPath();
    g.arc(o.brush.p.x, o.brush.p.y, o.brush.r, 0, Math.PI * 2);
    g.stroke();
  }
  if (o.calibBox) drawCalibBox(g, o.calibBox.box, o.calibBox.cells, px);
  if (o.genRect) {
    g.save();
    g.strokeStyle = '#d9a648';
    g.lineWidth = 1.5 * px;
    g.setLineDash([6 * px, 4 * px]);
    g.strokeRect(o.genRect.x, o.genRect.y, o.genRect.w, o.genRect.h);
    g.restore();
  }
}

/** The calibration box with its N×N cells, to lay over the map's printed grid. */
function drawCalibBox(g: CanvasRenderingContext2D, b: GridBox, cells: number, px: number): void {
  g.save();
  g.fillStyle = 'rgba(63,157,226,.12)';
  g.fillRect(b.x, b.y, b.size, b.size);
  g.strokeStyle = '#3f9de2';
  g.lineWidth = 1.5 * px;
  g.beginPath();
  for (let i = 1; i < cells; i++) {
    const d = (b.size * i) / cells;
    g.moveTo(b.x + d, b.y);
    g.lineTo(b.x + d, b.y + b.size);
    g.moveTo(b.x, b.y + d);
    g.lineTo(b.x + b.size, b.y + d);
  }
  g.stroke();
  g.lineWidth = 2.5 * px;
  g.strokeRect(b.x, b.y, b.size, b.size);
  g.restore();
  label(g, `${cells}×${cells}`, b.x, b.y - 8 * px, px);
}

function label(g: CanvasRenderingContext2D, text: string, x: number, y: number, px: number): void {
  g.font = `600 ${13 * px}px 'JetBrains Mono', monospace`;
  const w = g.measureText(text).width;
  // Upright however the map is turned (E-42), its backing with it.
  g.save();
  g.translate(x, y);
  g.rotate((-textTurn * Math.PI) / 180);
  g.fillStyle = 'rgba(20,20,20,.85)';
  g.fillRect(-6 * px, -16 * px, w + 12 * px, 22 * px);
  g.fillStyle = '#ffd79a';
  g.fillText(text, 0, 0);
  g.restore();
}

/** Selection colour of the map (the theme's `--sel`). */
const SELECTED = 'rgba(63,157,226,.55)';

function strokeSegment(g: CanvasRenderingContext2D, w: Pick<Wall, 'x1' | 'y1' | 'x2' | 'y2'>, style: string, width: number): void {
  g.save();
  g.lineCap = 'round';
  g.strokeStyle = style;
  g.lineWidth = width;
  g.beginPath();
  g.moveTo(w.x1, w.y1);
  g.lineTo(w.x2, w.y2);
  g.stroke();
  g.restore();
}

/** A wall in its kind's look: walls orange, windows dashed blue, doors thick (secret ones violet). */
function strokeWall(g: CanvasRenderingContext2D, w: Omit<Wall, 'id'>, px: number): void {
  g.save();
  g.lineCap = 'round';
  if (w.kind === 'wall') {
    g.strokeStyle = 'rgba(226,120,60,.85)';
    g.lineWidth = 3 * px;
  } else if (w.kind === 'window') {
    g.strokeStyle = 'rgba(127,200,230,.9)';
    g.lineWidth = 4 * px;
    g.setLineDash([6 * px, 4 * px]);
  } else if (w.kind === 'cliff') {
    drawCliff(g, w, px);
    g.restore();
    return;
  } else {
    g.strokeStyle = w.kind === 'secret-door' ? '#a77bf3' : '#c99a5b';
    g.lineWidth = (w.open ? 3 : 9) * px;
    g.globalAlpha *= w.open ? 0.5 : 1;
  }
  g.beginPath();
  g.moveTo(w.x1, w.y1);
  g.lineTo(w.x2, w.y2);
  g.stroke();
  g.restore();
}

/**
 * A cliff: an earthy edge with hachures on its lower side (right of the drawing direction on the
 * map) and an arrow in the middle pointing down the cliff.
 */
function drawCliff(g: CanvasRenderingContext2D, w: Omit<Wall, 'id'>, px: number): void {
  const dx = w.x2 - w.x1;
  const dy = w.y2 - w.y1;
  const len = Math.hypot(dx, dy);
  if (len === 0) return;
  // Unit vectors along the edge and towards its lower side.
  const ux = dx / len;
  const uy = dy / len;
  const nx = -uy;
  const ny = ux;
  g.strokeStyle = 'rgba(214,190,140,.95)';
  g.lineWidth = 3 * px;
  g.beginPath();
  g.moveTo(w.x1, w.y1);
  g.lineTo(w.x2, w.y2);
  const step = 12 * px;
  const tick = 7 * px;
  for (let d = step / 2; d < len; d += step) {
    const x = w.x1 + ux * d;
    const y = w.y1 + uy * d;
    g.moveTo(x, y);
    g.lineTo(x + nx * tick - ux * tick * 0.4, y + ny * tick - uy * tick * 0.4);
  }
  g.stroke();
  // The arrow: from the edge down the cliff.
  const mx = (w.x1 + w.x2) / 2 + nx * 10 * px;
  const my = (w.y1 + w.y2) / 2 + ny * 10 * px;
  const a = 7 * px;
  g.fillStyle = 'rgba(214,190,140,.95)';
  g.beginPath();
  g.moveTo(mx + nx * a * 1.6, my + ny * a * 1.6);
  g.lineTo(mx + ux * a, my + uy * a);
  g.lineTo(mx - ux * a, my - uy * a);
  g.closePath();
  g.fill();
}

/** A wall end: a small dot, or a handle square when its wall is selected (or it is being dragged). */
function drawEnd(g: CanvasRenderingContext2D, x: number, y: number, px: number, handle: boolean): void {
  g.save();
  g.lineWidth = 1.5 * px;
  g.strokeStyle = 'rgba(0,0,0,.75)';
  if (handle) {
    const r = 5 * px;
    g.fillStyle = '#3f9de2';
    g.fillRect(x - r, y - r, 2 * r, 2 * r);
    g.strokeRect(x - r, y - r, 2 * r, 2 * r);
  } else {
    g.fillStyle = 'rgba(240,226,200,.9)';
    g.beginPath();
    g.arc(x, y, 2.5 * px, 0, Math.PI * 2);
    g.fill();
    g.stroke();
  }
  g.restore();
}

/** Elements hidden in a scene (DC-103): faint, dashed outlines for the DM only. */
function drawHidden(g: CanvasRenderingContext2D, h: HiddenElements, px: number): void {
  g.save();
  g.globalAlpha = 0.55;
  g.strokeStyle = 'rgba(200,200,210,.9)';
  g.lineWidth = 2 * px;
  g.setLineDash([5 * px, 5 * px]);
  for (const z of h.zones) g.stroke(areaPath(z.shape));
  g.beginPath();
  for (const w of h.walls) {
    g.moveTo(w.x1, w.y1);
    g.lineTo(w.x2, w.y2);
  }
  g.stroke();
  for (const l of [...h.lights, ...h.sounds]) {
    g.beginPath();
    g.arc(l.x, l.y, 9 * px, 0, Math.PI * 2);
    g.stroke();
  }
  g.restore();
}

/** Stairs for the DM (E-44): their outline and where they lead; the selected one highlighted. */
function drawStairMarks(g: CanvasRenderingContext2D, st: NonNullable<OverlayState['stairs']>, px: number): void {
  g.save();
  for (const s of st.list) {
    const sel = s.id === st.selected;
    g.strokeStyle = sel ? '#3f9de2' : 'rgba(255, 215, 154, 0.9)';
    g.lineWidth = (sel ? 3 : 2) * px;
    g.setLineDash(sel ? [] : [6 * px, 4 * px]);
    g.strokeRect(s.x, s.y, s.w, s.h);
    g.fillStyle = '#ffd79a';
    g.font = `600 ${12 * px}px 'JetBrains Mono', monospace`;
    uprightText(g, `${s.toName || '0'} ${({ n: '↑', e: '→', s: '↓', w: '←' } as const)[s.dir]}`, s.x + 4 * px, s.y + 14 * px);
  }
  g.restore();
}

/** The leak check (DC-025): the test figure's sight lit, the figure, the leaks in red. */
function drawLeakCheck(g: CanvasRenderingContext2D, lc: NonNullable<OverlayState['leakCheck']>, r: number, px: number): void {
  g.save();
  if (lc.sight.length) {
    g.fillStyle = 'rgba(140, 210, 255, 0.16)';
    g.strokeStyle = 'rgba(140, 210, 255, 0.85)';
    g.lineWidth = 1.5 * px;
    const path = areaPath(lc.sight);
    g.fill(path, 'evenodd');
    g.stroke(path);
  }
  g.strokeStyle = '#e2554c';
  g.fillStyle = 'rgba(226, 85, 76, 0.25)';
  g.lineWidth = 3 * px;
  for (const l of lc.leaks) {
    if (l.to) {
      g.beginPath();
      g.moveTo(l.at.x, l.at.y);
      g.lineTo(l.to.x, l.to.y);
      g.stroke();
    }
    const c = l.to ? { x: (l.at.x + l.to.x) / 2, y: (l.at.y + l.to.y) / 2 } : l.at;
    g.beginPath();
    g.arc(c.x, c.y, 10 * px, 0, Math.PI * 2);
    g.fill();
    g.stroke();
  }
  if (lc.figure) {
    g.fillStyle = 'rgba(18,24,30,.9)';
    g.strokeStyle = '#8cd2ff';
    g.lineWidth = 3 * px;
    g.beginPath();
    g.arc(lc.figure.x, lc.figure.y, r, 0, Math.PI * 2);
    g.fill();
    g.stroke();
    // An eye: what it sees.
    g.lineWidth = 2 * px;
    g.beginPath();
    g.ellipse(lc.figure.x, lc.figure.y, r * 0.55, r * 0.32, 0, 0, Math.PI * 2);
    g.stroke();
    g.fillStyle = '#8cd2ff';
    g.beginPath();
    g.arc(lc.figure.x, lc.figure.y, r * 0.16, 0, Math.PI * 2);
    g.fill();
  }
  g.restore();
}

const SOUND_COLOR = '#7cc4e4';

/** A sound source's reach (dashed); the selected one with a handle on its edge to change it. */
function drawSoundReach(g: CanvasRenderingContext2D, s: { x: number; y: number; fade: boolean }, r: number, sel: boolean, px: number): void {
  g.save();
  g.strokeStyle = SOUND_COLOR;
  g.globalAlpha = sel ? 0.9 : 0.5;
  g.lineWidth = (sel ? 2 : 1) * px;
  g.setLineDash([3 * px, 6 * px]);
  g.beginPath();
  g.arc(s.x, s.y, r, 0, Math.PI * 2);
  g.stroke();
  // Fading: a second ring halfway, where it is already much quieter.
  if (s.fade) {
    g.globalAlpha *= 0.5;
    g.beginPath();
    g.arc(s.x, s.y, r / 2, 0, Math.PI * 2);
    g.stroke();
  }
  if (sel) {
    const h = SOUND_HANDLE_PX * px;
    g.setLineDash([]);
    g.globalAlpha = 1;
    g.fillStyle = '#fff';
    g.strokeStyle = '#3f9de2';
    g.lineWidth = 2 * px;
    g.fillRect(s.x + r - h / 2, s.y - h / 2, h, h);
    g.strokeRect(s.x + r - h / 2, s.y - h / 2, h, h);
  }
  g.restore();
}

/** Size of the radius handle in screen pixels. */
export const SOUND_HANDLE_PX = 10;

/** A sound source's mark: a dark disc with a speaker and two sound waves. */
function drawSpeaker(g: CanvasRenderingContext2D, x: number, y: number, r: number, sel: boolean, px: number): void {
  g.save();
  g.fillStyle = 'rgba(18,24,30,.85)';
  g.strokeStyle = sel ? '#3f9de2' : SOUND_COLOR;
  g.lineWidth = (sel ? 3 : 2) * px;
  g.beginPath();
  g.arc(x, y, r, 0, Math.PI * 2);
  g.fill();
  g.stroke();
  const u = r / 10;
  g.fillStyle = SOUND_COLOR;
  g.beginPath();
  g.moveTo(x - 6 * u, y - 2.5 * u);
  g.lineTo(x - 3 * u, y - 2.5 * u);
  g.lineTo(x + 1 * u, y - 6 * u);
  g.lineTo(x + 1 * u, y + 6 * u);
  g.lineTo(x - 3 * u, y + 2.5 * u);
  g.lineTo(x - 6 * u, y + 2.5 * u);
  g.closePath();
  g.fill();
  g.strokeStyle = SOUND_COLOR;
  g.lineWidth = 1.5 * px;
  for (const w of [3.5, 6.5]) {
    g.beginPath();
    g.arc(x + 1 * u, y, w * u, -Math.PI / 4, Math.PI / 4);
    g.stroke();
  }
  g.restore();
}

/** A small diamond: this element differs from the map in this scene. */
function drawChangedMark(g: CanvasRenderingContext2D, x: number, y: number, px: number): void {
  const r = 5 * px;
  g.save();
  g.fillStyle = '#e2a03c';
  g.strokeStyle = 'rgba(0,0,0,.75)';
  g.lineWidth = 1.5 * px;
  g.beginPath();
  g.moveTo(x, y - r);
  g.lineTo(x + r, y);
  g.lineTo(x, y + r);
  g.lineTo(x - r, y);
  g.closePath();
  g.fill();
  g.stroke();
  g.restore();
}

/**
 * A placed asset's footprint for the DM: the selected one outlined with its turn marked, one
 * whose file is missing as a labelled placeholder, one hidden in this scene faint and dashed.
 */
/** How far (screen px) the turning handle of a selected asset sits above its top edge. */
export const ROTATE_HANDLE_PX = 22;

/** Where the turning handle of a selected asset is (map px), at `zoom`. */
export function rotateHandleAt(fp: Footprint, zoom: number): Point {
  const r = (fp.rotation * Math.PI) / 180;
  const d = fp.h / 2 + ROTATE_HANDLE_PX / zoom;
  return { x: fp.cx + d * Math.sin(r), y: fp.cy - d * Math.cos(r) };
}

function drawPlacement(g: CanvasRenderingContext2D, a: { fp: Footprint; name: string; selected: boolean; missing: boolean; hidden: boolean }, px: number): void {
  if (!a.selected && !a.missing && !a.hidden) return;
  const { cx, cy, w, h, rotation } = a.fp;
  g.save();
  g.translate(cx, cy);
  g.rotate((rotation * Math.PI) / 180);
  g.lineWidth = 2 * px;
  if (a.hidden) {
    g.globalAlpha = 0.55;
    g.strokeStyle = 'rgba(200,200,210,.9)';
    g.setLineDash([5 * px, 5 * px]);
  } else if (a.missing) {
    g.fillStyle = 'rgba(226,85,76,.12)';
    g.fillRect(-w / 2, -h / 2, w, h);
    g.strokeStyle = 'rgba(226,85,76,.85)';
    g.setLineDash([6 * px, 4 * px]);
  } else {
    g.strokeStyle = '#3f9de2';
  }
  g.strokeRect(-w / 2, -h / 2, w, h);
  if (a.selected) {
    // Which way is "up" for the asset, ending in the handle that turns it (E-31, DC-113).
    g.setLineDash([]);
    g.beginPath();
    g.moveTo(0, -h / 2);
    g.lineTo(0, -h / 2 - ROTATE_HANDLE_PX * px);
    g.stroke();
    g.beginPath();
    g.arc(0, -h / 2 - ROTATE_HANDLE_PX * px, 6 * px, 0, Math.PI * 2);
    g.fillStyle = '#3f9de2';
    g.fill();
    g.strokeStyle = 'rgba(255,255,255,.9)';
    g.lineWidth = 1.5 * px;
    g.stroke();
  }
  if (a.missing) {
    g.setLineDash([]);
    g.fillStyle = 'rgba(226,85,76,.95)';
    g.font = `600 ${12 * px}px 'Barlow Semi Condensed', sans-serif`;
    g.textAlign = 'center';
    g.fillText(a.name, 0, 4 * px);
  }
  g.restore();
}
