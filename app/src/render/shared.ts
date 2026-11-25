/** Drawing helpers shared by the DM and table renderers. No DM state in here. */
import type { GridConfig } from '../core/grid';
import type { TemplateShape } from '../core/scene';

export function drawGrid(g: CanvasRenderingContext2D, grid: GridConfig, w: number, h: number, color: string, lineWidth: number): void {
  g.save();
  g.strokeStyle = color;
  g.lineWidth = lineWidth;
  g.beginPath();
  g.translate(grid.originX, grid.originY);
  g.rotate((grid.rotationDeg * Math.PI) / 180);
  const ext = Math.hypot(w, h);
  const n0x = Math.floor(-ext / grid.cellWidth);
  const n1x = Math.ceil(ext / grid.cellWidth);
  const n0y = Math.floor(-ext / grid.cellHeight);
  const n1y = Math.ceil(ext / grid.cellHeight);
  for (let i = n0x; i <= n1x; i++) {
    g.moveTo(i * grid.cellWidth, n0y * grid.cellHeight);
    g.lineTo(i * grid.cellWidth, n1y * grid.cellHeight);
  }
  for (let j = n0y; j <= n1y; j++) {
    g.moveTo(n0x * grid.cellWidth, j * grid.cellHeight);
    g.lineTo(n1x * grid.cellWidth, j * grid.cellHeight);
  }
  g.stroke();
  g.restore();
}

export interface TokenDisc {
  x: number;
  y: number;
  size: number;
  ringColor: string;
  label: string;
  cell: number;
  down: boolean;
}

export function drawTokenDisc(g: CanvasRenderingContext2D, t: TokenDisc): void {
  const r = (t.cell * t.size) / 2 - 4;
  g.save();
  g.translate(t.x, t.y);
  g.fillStyle = 'rgba(0,0,0,.45)';
  g.beginPath();
  g.arc(3, 4, r, 0, Math.PI * 2);
  g.fill();
  const gr = g.createRadialGradient(-r * 0.3, -r * 0.3, 2, 0, 0, r);
  gr.addColorStop(0, '#4a4640');
  gr.addColorStop(1, '#1d1b18');
  g.fillStyle = gr;
  g.beginPath();
  g.arc(0, 0, r, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = t.ringColor;
  g.lineWidth = Math.max(3, r * 0.16);
  g.stroke();
  g.fillStyle = '#f1ece0';
  g.font = `700 ${Math.round(r * 0.75)}px 'Barlow Semi Condensed', 'Arial Narrow', sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(t.label, 0, 1);
  if (t.down) {
    g.strokeStyle = '#e2554c';
    g.lineWidth = 4;
    g.beginPath();
    g.moveTo(-r * 0.6, -r * 0.6);
    g.lineTo(r * 0.6, r * 0.6);
    g.moveTo(r * 0.6, -r * 0.6);
    g.lineTo(-r * 0.6, r * 0.6);
    g.stroke();
  }
  g.restore();
}

export interface TemplateLike {
  shape: TemplateShape;
  x: number;
  y: number;
  angle: number;
  sizeFt: number;
  color: string;
}

/** Template outline in map pixels. Cones follow the 2024 rule: width at the end equals length. */
export function templatePath(t: TemplateLike, grid: GridConfig): { kind: 'circle'; x: number; y: number; r: number } | { kind: 'poly'; pts: [number, number][] } {
  const L = (t.sizeFt / grid.feetPerCell) * grid.cellWidth;
  if (t.shape === 'sphere') return { kind: 'circle', x: t.x, y: t.y, r: L };
  const a = t.angle;
  if (t.shape === 'cube') {
    const c = Math.cos(a);
    const s = Math.sin(a);
    const pts: [number, number][] = [[0, -L / 2], [L, -L / 2], [L, L / 2], [0, L / 2]].map(([x, y]) => [t.x + x * c - y * s, t.y + x * s + y * c]);
    return { kind: 'poly', pts };
  }
  if (t.shape === 'cone') {
    const h = Math.atan(0.5);
    const r = L / Math.cos(h);
    return { kind: 'poly', pts: [[t.x, t.y], [t.x + Math.cos(a - h) * r, t.y + Math.sin(a - h) * r], [t.x + Math.cos(a + h) * r, t.y + Math.sin(a + h) * r]] };
  }
  const half = grid.cellWidth / 2;
  const nx = -Math.sin(a) * half;
  const ny = Math.cos(a) * half;
  const ex = t.x + Math.cos(a) * L;
  const ey = t.y + Math.sin(a) * L;
  return { kind: 'poly', pts: [[t.x + nx, t.y + ny], [ex + nx, ey + ny], [ex - nx, ey - ny], [t.x - nx, t.y - ny]] };
}

export function drawTemplate(g: CanvasRenderingContext2D, t: TemplateLike, grid: GridConfig, label: boolean): void {
  const p = templatePath(t, grid);
  g.save();
  g.fillStyle = hexToRgba(t.color, 0.22);
  g.strokeStyle = hexToRgba(t.color, 0.95);
  g.lineWidth = 3;
  g.beginPath();
  if (p.kind === 'circle') g.arc(p.x, p.y, p.r, 0, Math.PI * 2);
  else {
    p.pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
    g.closePath();
  }
  g.fill();
  g.stroke();
  if (label) {
    g.font = "600 16px 'JetBrains Mono', monospace";
    g.fillStyle = '#fff';
    g.fillText(`${t.sizeFt} ft`, t.x + 10, t.y - 10);
  }
  g.restore();
}

export function hexToRgba(hex: string, alpha: number): string {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!m) return `rgba(255,255,255,${alpha})`;
  return `rgba(${parseInt(m[1], 16)},${parseInt(m[2], 16)},${parseInt(m[3], 16)},${alpha})`;
}
