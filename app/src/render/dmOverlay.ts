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
import { drawTemplate, hexToRgba, type TemplateLike } from './shared';

export interface OverlayView {
  zoom: number;
  x: number;
  y: number;
}

export interface OverlayState {
  editMode: boolean;
  selectedTokenId: string | null;
  selectedZoneId: string | null;
  selectedLightId: string | null;
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
  draftTemplate: TemplateLike | null;
  /** "Create area": the shape so far, the part being drawn and a polygon or lasso path (DC-013). */
  areaDraft: { shape: Polygon[]; part: Polygon | null; path: Point[]; color: string; subtract: boolean; editing: string | null } | null;
  /** Outline of a fog tool's shape while drawing. */
  fogDraft: { polygon: Polygon | null; path: Point[]; mode: 'reveal' | 'hide' } | null;
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
  g.setTransform(dpr * view.zoom, 0, 0, dpr * view.zoom, dpr * view.x, dpr * view.y);
  const px = 1 / view.zoom;

  g.strokeStyle = 'rgba(255,255,255,.15)';
  g.lineWidth = px;
  g.strokeRect(0, 0, W, H);

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
    g.fillText(`${z.secret ? '◆ ' : ''}${z.name.toUpperCase()}`, at.x, at.y);
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
  g.fillStyle = 'rgba(20,20,20,.85)';
  g.fillRect(x - 6 * px, y - 16 * px, w + 12 * px, 22 * px);
  g.fillStyle = '#ffd79a';
  g.fillText(text, x, y);
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
  for (const l of h.lights) {
    g.beginPath();
    g.arc(l.x, l.y, 9 * px, 0, Math.PI * 2);
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
    // Which way is "up" for the asset: a tick at its top edge.
    g.setLineDash([]);
    g.beginPath();
    g.moveTo(0, -h / 2);
    g.lineTo(0, -h / 2 - 12 * px);
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
