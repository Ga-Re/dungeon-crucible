/**
 * Map image sources shared by the DM renderer and the table renderer.
 * `builtin:crypt` is drawn procedurally so the sample works without files.
 * Images larger than the GPU texture limit are drawn in 4096 px tiles.
 */
import { CELL, COLS, ROWS, cryptFloor } from '../sample/cryptLayout';

const images = new Map<string, Promise<HTMLImageElement | HTMLCanvasElement>>();

/**
 * Loads an image map for the PixiJS renderer. `builtin:crypt` is drawn procedurally. Campaign
 * files come through the asset protocol, which answers with CORS headers, so `crossOrigin` keeps
 * the WebGL texture upload clean.
 */
export function loadMapImage(url: string): Promise<HTMLImageElement | HTMLCanvasElement> {
  const hit = images.get(url);
  if (hit) return hit;
  const p: Promise<HTMLImageElement | HTMLCanvasElement> =
    url === 'builtin:crypt'
      ? Promise.resolve(drawCrypt())
      : new Promise((resolve, reject) => {
          const img = new Image();
          if (!url.startsWith('blob:') && !url.startsWith('data:')) img.crossOrigin = 'anonymous';
          img.onload = () => resolve(img);
          img.onerror = () => reject(new Error(`Map image could not be loaded: ${url}`));
          img.src = url;
        });
  images.set(url, p);
  p.catch(() => images.delete(url));
  return p;
}

/** A muted, looping video element for a video map (ADR-0010: a `<video>` under the canvas). */
export function createMapVideo(url: string): Promise<HTMLVideoElement> {
  return new Promise((resolve, reject) => {
    const v = document.createElement('video');
    if (!url.startsWith('blob:')) v.crossOrigin = 'anonymous';
    v.muted = true;
    v.loop = true;
    v.playsInline = true;
    v.onloadedmetadata = () => {
      void v.play().catch(() => undefined);
      resolve(v);
    };
    v.onerror = () => reject(new Error(`Video map could not be loaded: ${url}`));
    v.src = url;
  });
}

const TILE = 4096;

export function tileCount(w: number, h: number): string {
  return `${Math.ceil(w / TILE)}×${Math.ceil(h / TILE)}`;
}

function hash(x: number, y: number): number {
  let h = x * 374761393 + y * 668265263;
  h = (h ^ (h >> 13)) * 1274126177;
  return ((h ^ (h >> 16)) >>> 0) / 4294967295;
}

function drawCrypt(): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = COLS * CELL;
  c.height = ROWS * CELL;
  const g = c.getContext('2d')!;
  const floor = cryptFloor();
  const isFloor = (x: number, y: number) => x >= 0 && y >= 0 && x < COLS && y < ROWS && floor[y * COLS + x] === 1;
  g.fillStyle = '#15171a';
  g.fillRect(0, 0, c.width, c.height);
  for (let i = 0; i < 1400; i++) {
    g.fillStyle = `rgba(255,255,255,${0.012 + hash(i, 5) * 0.02})`;
    g.beginPath();
    g.arc(hash(i, 7) * c.width, hash(i, 13) * c.height, 6 + hash(i, 3) * 28, 0, 7);
    g.fill();
  }
  g.strokeStyle = 'rgba(150,140,120,.22)';
  g.lineWidth = 2;
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      if (isFloor(x, y)) continue;
      let near = false;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (isFloor(x + dx, y + dy)) near = true;
      if (!near) continue;
      for (let k = 0; k < 5; k++) {
        const ox = x * CELL + hash(x * 9 + k, y) * CELL;
        const oy = y * CELL + hash(x, y * 9 + k) * CELL;
        const a = hash(x + k, y + k) * Math.PI;
        g.beginPath();
        g.moveTo(ox - Math.cos(a) * 12, oy - Math.sin(a) * 12);
        g.lineTo(ox + Math.cos(a) * 12, oy + Math.sin(a) * 12);
        g.stroke();
      }
    }
  }
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      if (!isFloor(x, y)) continue;
      const v = (hash(x, y) - 0.5) * 16;
      const base = x >= 27 && y < 10 ? [104, 116, 104] : x >= 28 && y >= 14 ? [112, 104, 126] : x < 9 && y < 7 ? [134, 110, 78] : [126, 120, 106];
      g.fillStyle = `rgb(${(base[0] + v) | 0},${(base[1] + v) | 0},${(base[2] + v) | 0})`;
      g.fillRect(x * CELL, y * CELL, CELL, CELL);
      g.strokeStyle = 'rgba(30,26,22,.35)';
      g.lineWidth = 1.5;
      g.strokeRect(x * CELL + 0.5, y * CELL + 0.5, CELL - 1, CELL - 1);
    }
  }
  g.fillStyle = 'rgba(120,30,30,.55)';
  g.fillRect(17.6 * CELL, 11 * CELL, 1.8 * CELL, 8 * CELL);
  for (const [x, y] of [[15, 13], [21, 13], [15, 17], [21, 17]]) {
    g.fillStyle = '#4a4640';
    g.beginPath();
    g.arc((x + 0.5) * CELL, (y + 0.5) * CELL, CELL * 0.42, 0, 7);
    g.fill();
    g.strokeStyle = '#22201c';
    g.lineWidth = 5;
    g.stroke();
  }
  return c;
}
