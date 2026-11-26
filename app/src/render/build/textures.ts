/**
 * Textures of drawn walls (E-33): a surface per wall style, a floor per wall style, and parts
 * (corner stone, pillar, door leaf). Pictures in `./textures/<slot>.webp|png` are shipped with
 * the app and made seamless when loaded; a slot without a picture gets a generated pattern, so
 * the map always draws. Shared by the DM window and the TV.
 */
import { noise2 } from '../../core/build/handDrawn';
import type { MasonryStyle } from '../../core/build/masonry';

export type SurfaceSlot = `wall-${MasonryStyle}` | `floor-${MasonryStyle}` | 'cliff-rock' | 'cliff-earth' | 'cliff-scree';
export type PartSlot = 'part-cornerstone' | 'part-pillar' | 'part-door' | 'growth-grass' | 'growth-bush' | 'growth-moss';

export interface BuildTextures {
  /** Seamless, to be repeated (`createPattern`). */
  surface: Record<SurfaceSlot, HTMLCanvasElement>;
  /** Single pictures with transparency, drawn at joints and doors. */
  part: Record<PartSlot, HTMLCanvasElement>;
}

/** Side of a surface tile (texture px); a map cell is 70 px at the default grid. */
export const TILE = 512;
const PART = 256;

const STYLES: MasonryStyle[] = ['dungeon-stone', 'cave-rock', 'brick', 'wood'];
const PARTS: PartSlot[] = ['part-cornerstone', 'part-pillar', 'part-door', 'growth-grass', 'growth-bush', 'growth-moss'];
/** Cliff faces (E-34). */
const CLIFF_SURFACES: SurfaceSlot[] = ['cliff-rock', 'cliff-earth', 'cliff-scree'];

const files = import.meta.glob('./textures/*.{webp,png}', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;

function fileFor(slot: string): string | undefined {
  return files[`./textures/${slot}.webp`] ?? files[`./textures/${slot}.png`];
}

function canvas(size: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  if (!g) throw new Error('No 2D canvas for a texture.');
  return [c, g];
}

function load(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    // A missing or broken picture: the generated pattern stands in.
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

/**
 * A picture made seamless: it is blended with itself shifted by half a tile, the shifted copy
 * showing at the edges – there it continues the picture's own middle, so the edges match.
 */
export function seamless(img: CanvasImageSource, size = TILE): HTMLCanvasElement {
  const [out, g] = canvas(size);
  g.drawImage(img, 0, 0, size, size);
  const [shifted, s] = canvas(size);
  const h = size / 2;
  for (const [dx, dy] of [[0, 0], [-1, 0], [0, -1], [-1, -1]]) s.drawImage(img, h + dx * size, h + dy * size, size, size);
  // Opaque towards the edges, clear in the middle.
  const [mask, m] = canvas(size);
  const grad = m.createRadialGradient(h, h, size * 0.22, h, h, size * 0.5);
  grad.addColorStop(0, 'rgba(0,0,0,0)');
  grad.addColorStop(1, 'rgba(0,0,0,1)');
  m.fillStyle = grad;
  m.fillRect(0, 0, size, size);
  s.globalCompositeOperation = 'destination-in';
  s.drawImage(mask, 0, 0);
  g.drawImage(shifted, 0, 0);
  return out;
}

/* ---------- Generated stand-ins (seamless by construction: noise and layouts repeat with the tile) ---------- */

const BASE: Record<SurfaceSlot, [number, number, number]> = {
  'wall-dungeon-stone': [92, 88, 82],
  'wall-cave-rock': [74, 68, 60],
  'wall-brick': [116, 70, 52],
  'wall-wood': [104, 76, 44],
  'floor-dungeon-stone': [122, 116, 102],
  'floor-cave-rock': [96, 88, 76],
  'floor-brick': [124, 108, 92],
  'floor-wood': [132, 98, 62],
  'cliff-rock': [96, 96, 98],
  'cliff-earth': [110, 82, 58],
  'cliff-scree': [118, 114, 108],
};

/** Noise that repeats every `period` cells. */
function tiledNoise(x: number, y: number, period: number, seed: number): number {
  const wrap = (v: number) => ((v % period) + period) % period;
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;
  const v = (i: number, j: number) => noise2(wrap(x0 + i), wrap(y0 + j), seed);
  const sm = (t: number) => t * t * (3 - 2 * t);
  const top = v(0, 0) + (v(1, 0) - v(0, 0)) * sm(fx);
  const bottom = v(0, 1) + (v(1, 1) - v(0, 1)) * sm(fx);
  return top + (bottom - top) * sm(fy);
}

function generatedSurface(slot: SurfaceSlot): HTMLCanvasElement {
  const size = 256;
  const [c, g] = canvas(size);
  const [r, gr, b] = BASE[slot];
  const img = g.createImageData(size, size);
  const seed = slot.length * 31;
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const n = tiledNoise(x / 16, y / 16, size / 16, seed) * 0.6 + tiledNoise(x / 4, y / 4, size / 4, seed + 1) * 0.4;
      const k = 1 + n * 0.14;
      const i = (y * size + x) * 4;
      img.data[i] = r * k;
      img.data[i + 1] = gr * k;
      img.data[i + 2] = b * k;
      img.data[i + 3] = 255;
    }
  g.putImageData(img, 0, 0);
  g.strokeStyle = 'rgba(20,16,12,.45)';
  g.lineWidth = 2;
  const style = slot.replace(/^(wall|floor)-/, '');
  if (style === 'dungeon-stone' || style === 'brick') {
    // Courses of stones, every other one offset by half.
    const rows = style === 'brick' ? 8 : 4;
    const per = style === 'brick' ? 4 : 2;
    const hgt = size / rows;
    const wid = size / per;
    for (let row = 0; row < rows; row++) {
      g.beginPath();
      g.moveTo(0, row * hgt);
      g.lineTo(size, row * hgt);
      for (let k = 0; k <= per; k++) {
        const x = k * wid + (row % 2 ? wid / 2 : 0);
        g.moveTo(x % (size + 1), row * hgt);
        g.lineTo(x % (size + 1), (row + 1) * hgt);
      }
      g.stroke();
    }
  } else if (style === 'wood') {
    for (let k = 0; k < 6; k++) {
      const y = (k * size) / 6;
      g.beginPath();
      g.moveTo(0, y);
      g.lineTo(size, y);
      g.moveTo(((k * 97) % size) + 0.5, y);
      g.lineTo(((k * 97) % size) + 0.5, y + size / 6);
      g.stroke();
    }
  }
  return c;
}

function generatedPart(slot: PartSlot): HTMLCanvasElement {
  const [c, g] = canvas(PART);
  const h = PART / 2;
  g.strokeStyle = 'rgba(15,12,10,.8)';
  g.lineWidth = 8;
  if (slot === 'part-door') {
    // A door leaf seen from above, filling the picture: it is stretched over the door's span.
    g.fillStyle = '#7a5530';
    g.fillRect(4, 4, PART - 8, PART - 8);
    g.strokeRect(4, 4, PART - 8, PART - 8);
    g.beginPath();
    for (let k = 1; k < 4; k++) {
      g.moveTo(4, 4 + ((PART - 8) * k) / 4);
      g.lineTo(PART - 4, 4 + ((PART - 8) * k) / 4);
    }
    g.stroke();
  } else if (slot.startsWith('growth-')) {
    // A rough green blob: leaves around the middle.
    for (let k = 0; k < 14; k++) {
      const a = (k / 14) * Math.PI * 2;
      g.fillStyle = slot === 'growth-moss' ? 'rgba(86,118,62,.85)' : 'rgba(74,112,52,.9)';
      g.beginPath();
      g.ellipse(h + Math.cos(a) * h * 0.45, h + Math.sin(a) * h * 0.45, h * 0.32, h * 0.16, a, 0, Math.PI * 2);
      g.fill();
    }
  } else if (slot === 'part-pillar') {
    g.fillStyle = '#6a655d';
    g.beginPath();
    g.arc(h, h, h - 12, 0, Math.PI * 2);
    g.fill();
    g.stroke();
  } else {
    g.fillStyle = '#6e6960';
    g.fillRect(16, 16, PART - 32, PART - 32);
    g.strokeRect(16, 16, PART - 32, PART - 32);
  }
  return c;
}

let loading: Promise<BuildTextures> | null = null;

/** The textures, loaded once; a slot without a picture gets its generated pattern. */
export function buildTextures(): Promise<BuildTextures> {
  loading ??= (async () => {
    const surfaceSlots = [...STYLES.flatMap((s) => [`wall-${s}`, `floor-${s}`] as SurfaceSlot[]), ...CLIFF_SURFACES];
    const surface = {} as Record<SurfaceSlot, HTMLCanvasElement>;
    const part = {} as Record<PartSlot, HTMLCanvasElement>;
    await Promise.all([
      ...surfaceSlots.map(async (slot) => {
        const url = fileFor(slot);
        const img = url ? await load(url) : null;
        surface[slot] = img ? seamless(img) : generatedSurface(slot);
      }),
      ...PARTS.map(async (slot) => {
        const url = fileFor(slot);
        const img = url ? await load(url) : null;
        if (img) {
          const [c, g] = canvas(PART);
          g.drawImage(img, 0, 0, PART, PART);
          part[slot] = c;
        } else part[slot] = generatedPart(slot);
      }),
    ]);
    return { surface, part };
  })();
  return loading;
}
