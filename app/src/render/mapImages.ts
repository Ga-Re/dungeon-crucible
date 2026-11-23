/**
 * Map image sources shared by the DM renderer and the table renderer.
 * `builtin:crypt` is drawn procedurally so the sample works without files.
 * Images larger than the GPU texture limit are drawn in 4096 px tiles.
 */
import { CELL, COLS, ROWS, cryptFloor } from '../sample/cryptLayout';

export type MapSource = HTMLImageElement | HTMLVideoElement | HTMLCanvasElement;

const cache = new Map<string, MapSource>();
const TILE = 4096;

export function getMapSource(url: string | null, isVideo: boolean): MapSource | null {
  if (!url) return null;
  const hit = cache.get(url);
  if (hit) return hit;
  let src: MapSource;
  if (url === 'builtin:crypt') {
    src = drawCrypt();
  } else if (isVideo) {
    const v = document.createElement('video');
    v.src = url;
    v.muted = true;
    v.loop = true;
    v.playsInline = true;
    void v.play().catch(() => undefined);
    src = v;
  } else {
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    src = img;
  }
  cache.set(url, src);
  return src;
}

export function sourceSize(s: MapSource): { w: number; h: number } {
  if (s instanceof HTMLVideoElement) return { w: s.videoWidth, h: s.videoHeight };
  if (s instanceof HTMLImageElement) return { w: s.naturalWidth, h: s.naturalHeight };
  return { w: s.width, h: s.height };
}

/** Draws the map source into map space (0,0)-(w,h), split into GPU-friendly tiles. */
export function drawMapSource(g: CanvasRenderingContext2D, s: MapSource, w: number, h: number): boolean {
  const { w: iw, h: ih } = sourceSize(s);
  if (!iw || !ih) return false;
  const tx = Math.ceil(iw / TILE);
  const ty = Math.ceil(ih / TILE);
  for (let j = 0; j < ty; j++) {
    for (let i = 0; i < tx; i++) {
      const sw = Math.min(TILE, iw - i * TILE);
      const sh = Math.min(TILE, ih - j * TILE);
      g.drawImage(s, i * TILE, j * TILE, sw, sh, (i * TILE * w) / iw, (j * TILE * h) / ih, (sw * w) / iw, (sh * h) / ih);
    }
  }
  return true;
}

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
