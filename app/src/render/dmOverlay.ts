/**
 * DM-only overlays drawn on a 2D canvas above the PixiJS view (Dungeon-Manager: "DM overlays
 * (DM window only)" sit above the fog). Never used for the table.
 */
import type { Point } from '../core/geometry';
import { labelPoint } from '../core/areas';
import type { Polygon } from '../core/poly/types';
import type { Scene } from '../core/scene';
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
  wallPreview: { a: Point; b: Point } | null;
  brush: { p: Point; r: number } | null;
  calibPoints: Point[];
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

  for (const w of scene.walls) {
    const isDoor = w.kind === 'door' || w.kind === 'secret-door';
    if (!o.editMode && !isDoor) continue;
    g.save();
    g.lineCap = 'round';
    if (w.kind === 'wall') {
      g.strokeStyle = 'rgba(226,120,60,.85)';
      g.lineWidth = 3 * px;
    } else if (w.kind === 'window') {
      g.strokeStyle = 'rgba(127,200,230,.9)';
      g.lineWidth = 4 * px;
      g.setLineDash([6 * px, 4 * px]);
    } else {
      g.strokeStyle = w.kind === 'secret-door' ? '#a77bf3' : '#c99a5b';
      g.lineWidth = (w.open ? 3 : 9) * px;
      g.globalAlpha = w.open ? 0.5 : 1;
    }
    g.beginPath();
    g.moveTo(w.x1, w.y1);
    g.lineTo(w.x2, w.y2);
    g.stroke();
    g.restore();
  }

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
  if (o.wallPreview) {
    g.save();
    g.strokeStyle = '#ff9b55';
    g.lineWidth = 4 * px;
    g.setLineDash([8 * px, 5 * px]);
    g.beginPath();
    g.moveTo(o.wallPreview.a.x, o.wallPreview.a.y);
    g.lineTo(o.wallPreview.b.x, o.wallPreview.b.y);
    g.stroke();
    g.restore();
  }
  if (o.brush) {
    g.strokeStyle = 'rgba(226,160,60,.9)';
    g.lineWidth = 2 * px;
    g.beginPath();
    g.arc(o.brush.p.x, o.brush.p.y, o.brush.r, 0, Math.PI * 2);
    g.stroke();
  }
  o.calibPoints.forEach((p, i) => {
    g.strokeStyle = '#3f9de2';
    g.lineWidth = 2 * px;
    g.beginPath();
    g.arc(p.x, p.y, 10 * px, 0, Math.PI * 2);
    g.stroke();
    label(g, String(i + 1), p.x + 12 * px, p.y - 12 * px, px);
  });
}

function label(g: CanvasRenderingContext2D, text: string, x: number, y: number, px: number): void {
  g.font = `600 ${13 * px}px 'JetBrains Mono', monospace`;
  const w = g.measureText(text).width;
  g.fillStyle = 'rgba(20,20,20,.85)';
  g.fillRect(x - 6 * px, y - 16 * px, w + 12 * px, 22 * px);
  g.fillStyle = '#ffd79a';
  g.fillText(text, x, y);
}
