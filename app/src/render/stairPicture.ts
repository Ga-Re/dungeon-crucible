/**
 * The picture of stairs (DC-026, E-44): steps across the way up, each a little darker towards the
 * top end, with a faint arrow. Drawn locally from a stair's size and direction – the TV gets only
 * those – and handed to the renderer like a placed asset (under the fog). No DM state here.
 */
import type { AssetShape } from './pixi/renderer';

export interface StairLike {
  x: number;
  y: number;
  w: number;
  h: number;
  dir: 'n' | 'e' | 's' | 'w';
}

const cache = new Map<string, string>();

/** A picture of steps going up towards its top edge, `w` × `h` (map px, scaled down to at most 256 px). */
export function stairPicture(w: number, h: number): string {
  const scale = Math.min(1, 256 / Math.max(w, h));
  const cw = Math.max(8, Math.round(w * scale));
  const ch = Math.max(8, Math.round(h * scale));
  const key = `${cw}x${ch}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = cw;
  c.height = ch;
  const g = c.getContext('2d');
  if (!g) return '';
  const steps = Math.max(3, Math.round(ch / Math.max(6, cw / 4)));
  const step = ch / steps;
  for (let i = 0; i < steps; i++) {
    // Lighter at the foot (bottom), darker towards the top.
    const t = i / (steps - 1);
    const shade = Math.round(150 - 90 * (1 - t));
    g.fillStyle = `rgb(${shade + 10}, ${shade + 4}, ${shade - 6})`;
    g.fillRect(0, i * step, cw, step);
    g.fillStyle = 'rgba(0,0,0,0.55)';
    g.fillRect(0, i * step, cw, Math.max(1, step * 0.14));
  }
  g.strokeStyle = 'rgba(0,0,0,0.6)';
  g.lineWidth = Math.max(1, cw * 0.03);
  g.strokeRect(0, 0, cw, ch);
  // A faint arrow up the middle.
  g.strokeStyle = 'rgba(255,255,255,0.35)';
  g.lineWidth = Math.max(1, cw * 0.05);
  g.beginPath();
  g.moveTo(cw / 2, ch * 0.85);
  g.lineTo(cw / 2, ch * 0.15);
  g.moveTo(cw * 0.32, ch * 0.32);
  g.lineTo(cw / 2, ch * 0.15);
  g.lineTo(cw * 0.68, ch * 0.32);
  g.stroke();
  const url = c.toDataURL('image/png');
  cache.set(key, url);
  return url;
}

const TURN: Record<StairLike['dir'], number> = { n: 0, e: 90, s: 180, w: 270 };

/** Stairs as assets for the renderer: centred, the picture turned to the way up. */
export function stairShapes(stairs: readonly StairLike[]): AssetShape[] {
  return stairs.map((s, i) => {
    const sideways = s.dir === 'e' || s.dir === 'w';
    const width = sideways ? s.h : s.w;
    const height = sideways ? s.w : s.h;
    return { id: `stair-${i}`, url: stairPicture(width, height), video: false, x: s.x + s.w / 2, y: s.y + s.h / 2, width, height, rotation: TURN[s.dir] };
  });
}
