/**
 * Renders a PlayerFrame. Used by the table window and by the DM's preview, so
 * the preview always matches the table exactly.
 *
 * Fail-closed order: clear to black → draw map, grid, tokens → draw fog on top
 * (opaque first, then cut out explored/visible areas). Any exception leaves the
 * canvas black (the caller catches and blanks it).
 */
import { unrle } from '../core/fog';
import type { PlayerFrame } from '../core/projection';
import { drawGrid, drawTemplate, drawTokenDisc } from './shared';
import { drawMapSource, getMapSource } from './mapImages';

const FOG_PX = 10;
const FOG_PAD = 2;

let fogA: HTMLCanvasElement | null = null;
let fogB: HTMLCanvasElement | null = null;

/** Builds the soft fog mask in a padded low-resolution buffer. Returns the source rect inside it. */
export function buildFogMask(frame: PlayerFrame): { canvas: HTMLCanvasElement; sx: number; sy: number; sw: number; sh: number } {
  const f = frame.fog;
  const w = (f.cols + 2 * FOG_PAD) * FOG_PX;
  const h = (f.rows + 2 * FOG_PAD) * FOG_PX;
  fogA ??= document.createElement('canvas');
  fogB ??= document.createElement('canvas');
  if (fogA.width !== w || fogA.height !== h) {
    fogA.width = fogB.width = w;
    fogA.height = fogB.height = h;
  }
  const explored = unrle(f.explored, f.cols * f.rows);
  const a = fogA.getContext('2d')!;
  a.setTransform(1, 0, 0, 1, 0, 0);
  a.globalCompositeOperation = 'source-over';
  a.fillStyle = '#000';
  a.fillRect(0, 0, w, h);
  a.globalCompositeOperation = 'destination-out';
  a.fillStyle = `rgba(0,0,0,${1 - f.memoryOpacity})`;
  for (let r = 0; r < f.rows; r++) for (let c = 0; c < f.cols; c++) if (explored[r * f.cols + c]) a.fillRect((c + FOG_PAD) * FOG_PX, (r + FOG_PAD) * FOG_PX, FOG_PX, FOG_PX);
  const k = FOG_PX / f.cellSize;
  a.setTransform(k, 0, 0, k, FOG_PAD * FOG_PX, FOG_PAD * FOG_PX);
  a.fillStyle = '#000';
  for (const v of f.vision) {
    a.save();
    a.beginPath();
    a.arc(v.origin.x, v.origin.y, v.radius, 0, Math.PI * 2);
    a.clip();
    a.beginPath();
    v.polygon.forEach((p, i) => (i ? a.lineTo(p.x, p.y) : a.moveTo(p.x, p.y)));
    a.closePath();
    a.fill();
    a.restore();
  }
  a.setTransform(1, 0, 0, 1, 0, 0);
  a.globalCompositeOperation = 'source-over';

  const b = fogB.getContext('2d')!;
  b.clearRect(0, 0, w, h);
  b.filter = f.softness > 0 ? `blur(${(f.softness * 6).toFixed(1)}px)` : 'none';
  b.drawImage(fogA, 0, 0);
  b.filter = 'none';
  // Softness only works inward: unexplored cells are painted opaque again.
  b.fillStyle = '#000';
  for (let r = 0; r < f.rows; r++) for (let c = 0; c < f.cols; c++) if (!explored[r * f.cols + c]) b.fillRect((c + FOG_PAD) * FOG_PX, (r + FOG_PAD) * FOG_PX, FOG_PX, FOG_PX);
  return { canvas: fogB, sx: FOG_PAD * FOG_PX, sy: FOG_PAD * FOG_PX, sw: f.cols * FOG_PX, sh: f.rows * FOG_PX };
}

/** Draws a frame into a canvas of `width`×`height` device pixels. */
export function renderPlayerFrame(g: CanvasRenderingContext2D, frame: PlayerFrame, width: number, height: number, elapsedMs: number): void {
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.globalAlpha = 1;
  g.fillStyle = '#000';
  g.fillRect(0, 0, width, height);
  if (frame.blackout) return;

  // The frame is laid out for the table's physical resolution; scale to the target canvas.
  const fit = Math.min(width / frame.display.widthPx, height / frame.display.heightPx);
  const scale = fit * frame.zoom;
  g.translate(width / 2, height / 2);
  g.rotate((frame.rotation * Math.PI) / 180);
  g.scale(scale, scale);
  g.translate(-frame.center.x, -frame.center.y);

  const { widthPx: W, heightPx: H } = frame.map;
  g.save();
  g.beginPath();
  g.rect(0, 0, W, H);
  g.clip();
  const src = getMapSource(frame.map.imageUrl, frame.map.isVideo);
  if (!src || !drawMapSource(g, src, W, H)) {
    g.fillStyle = '#101113';
    g.fillRect(0, 0, W, H);
  }
  if (frame.map.showGrid) drawGrid(g, frame.map.grid, W, H, 'rgba(0,0,0,.35)', 1 / scale);
  for (const t of frame.templates) drawTemplate(g, t, frame.map.grid, false);
  for (const t of frame.tokens) {
    drawTokenDisc(g, { x: t.x, y: t.y, size: t.size, ringColor: t.ringColor, label: t.label, cell: frame.map.grid.cellWidth, down: t.down });
    if (t.hpRatio !== null) {
      const r = (frame.map.grid.cellWidth * t.size) / 2 - 4;
      g.fillStyle = 'rgba(0,0,0,.7)';
      g.fillRect(t.x - r, t.y + r + 4, r * 2, 6);
      g.fillStyle = t.hpRatio > 0.5 ? '#5db776' : t.hpRatio > 0.25 ? '#e3b341' : '#e2554c';
      g.fillRect(t.x - r, t.y + r + 4, r * 2 * t.hpRatio, 6);
    }
  }
  // Fog last, above everything that could reveal information.
  const m = buildFogMask(frame);
  g.imageSmoothingEnabled = true;
  g.drawImage(m.canvas, m.sx, m.sy, m.sw, m.sh, 0, 0, W, H);
  g.restore();

  // Pings sit above the fog so players see where the DM points.
  for (const p of frame.pings) {
    const k = (p.age + elapsedMs) / 1600;
    if (k > 1) continue;
    for (let i = 0; i < 3; i++) {
      const kk = (k * 1.4 + i * 0.18) % 1;
      g.strokeStyle = `rgba(226,160,60,${1 - kk})`;
      g.lineWidth = 4 / scale;
      g.beginPath();
      g.arc(p.x, p.y, 14 + kk * 110, 0, Math.PI * 2);
      g.stroke();
    }
  }
}
