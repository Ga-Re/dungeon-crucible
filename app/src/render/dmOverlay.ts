/**
 * DM-only overlays drawn on a 2D canvas above the PixiJS view (Dungeon-Manager: "DM overlays
 * (DM window only)" sit above the fog). Never used for the table.
 */
import type { Point } from '../core/geometry';
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
  measure: { a: Point; b: Point; ft: number } | null;
  dragRect: { a: Point; b: Point } | null;
  wallPreview: { a: Point; b: Point } | null;
  brush: { p: Point; r: number } | null;
  calibPoints: Point[];
  draftTemplate: TemplateLike | null;
  /** Outline of a fog tool's shape while drawing. */
  fogDraft: { polygon: Polygon | null; path: Point[]; mode: 'reveal' | 'hide' } | null;
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
    const sel = z.id === o.selectedZoneId;
    g.save();
    if (o.editMode) {
      g.fillStyle = hexToRgba(z.color, sel ? 0.2 : 0.08);
      g.fillRect(z.rect.x, z.rect.y, z.rect.w, z.rect.h);
    }
    g.strokeStyle = hexToRgba(z.color, o.editMode ? 0.85 : 0.35);
    g.lineWidth = (sel ? 3 : 1.5) * px;
    g.setLineDash(z.kind === 'secret' ? [10 * px, 7 * px] : []);
    g.strokeRect(z.rect.x + 4, z.rect.y + 4, z.rect.w - 8, z.rect.h - 8);
    g.setLineDash([]);
    g.font = `600 ${Math.max(12, 13 * px)}px 'Barlow Semi Condensed', sans-serif`;
    g.fillStyle = hexToRgba(z.color, o.editMode ? 1 : 0.7);
    g.textBaseline = 'top';
    g.fillText(`${z.kind === 'secret' ? '◆ ' : ''}${z.name.toUpperCase()}`, z.rect.x + 10, z.rect.y + 9);
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
  if (o.dragRect) {
    g.save();
    g.strokeStyle = '#7fd9cf';
    g.lineWidth = 2 * px;
    g.setLineDash([6 * px, 4 * px]);
    g.strokeRect(o.dragRect.a.x, o.dragRect.a.y, o.dragRect.b.x - o.dragRect.a.x, o.dragRect.b.y - o.dragRect.a.y);
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
