/**
 * Composed surface sheets (DC-119a): instead of repeating one texture every few cells, floors
 * and ground repeat a sheet of 16×16 cells composed from a material's variants – patches of
 * variants and rotations laid by `variantBlobs`, phase-aligned so a patch's pattern runs on in
 * one piece. Dressed materials (flagstones, bricks, planks …) switch at cell borders, where the
 * grout hides the change, and get a faint per-tile shade; natural ones (grass, dirt, sand …) get
 * soft round patches instead, so nothing shows a straight seam. Large light and shade drifts
 * over everything, periodic with the sheet, so the sheet itself still tiles seamlessly.
 */
import { hashNoise, periodicNoise, variantBlobs } from '../../core/build/variance';
import type { BuildTextures, SurfaceSlot } from './textures';

/** Sheet side in cells: the pattern repeats only every 16 cells. */
export const SHEET_CELLS = 16;
/** Map cells one texture tile spans (as the old single-texture pattern did). */
const TEXTURE_CELLS = 3;

interface Kind {
  /** Cell-border switches (grout hides them) instead of soft patches. */
  dressed: boolean;
  /** Quarter turns the material allows: planks keep their direction. */
  rotations: number;
}

const KINDS: Partial<Record<SurfaceSlot, Kind>> = {
  'floor-dungeon-stone': { dressed: true, rotations: 4 },
  'floor-brick': { dressed: true, rotations: 2 },
  'floor-wood': { dressed: true, rotations: 2 },
  'floor-marble': { dressed: true, rotations: 4 },
  'floor-carpet': { dressed: true, rotations: 2 },
};
const kindOf = (slot: SurfaceSlot): Kind => KINDS[slot] ?? { dressed: false, rotations: 4 };

const cache = new Map<string, HTMLCanvasElement>();
/** The kept sheets stay under ~96 MB of pixels (a 16-cell sheet at 200 px/cell is 40 MB alone). */
const KEEP_BYTES = 96 << 20;
let cacheBytes = 0;
const bytesOf = (c: HTMLCanvasElement) => c.width * c.height * 4;

/** Mean brightness of a picture (0–255), sampled small. */
function meanLuma(src: HTMLCanvasElement): number {
  const c = document.createElement('canvas');
  c.width = c.height = 16;
  const g = c.getContext('2d')!;
  g.drawImage(src, 0, 0, 16, 16);
  const d = g.getImageData(0, 0, 16, 16).data;
  let sum = 0;
  for (let i = 0; i < d.length; i += 4) sum += d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114;
  return sum / (d.length / 4);
}

/** The sheet for a material at a cell size, composed once and kept. */
export function surfaceSheet(slot: SurfaceSlot, tex: BuildTextures, cellPx: number, seed: number): HTMLCanvasElement {
  const cell = Math.max(8, Math.min(200, Math.round(cellPx)));
  const key = `${slot}:${cell}:${seed}`;
  const hit = cache.get(key);
  if (hit) {
    cache.delete(key);
    cache.set(key, hit);
    return hit;
  }
  const sheet = compose(slot, tex, cell, seed);
  cache.set(key, sheet);
  cacheBytes += bytesOf(sheet);
  while (cacheBytes > KEEP_BYTES && cache.size > 1) {
    const oldest = cache.keys().next().value!;
    cacheBytes -= bytesOf(cache.get(oldest)!);
    cache.delete(oldest);
  }
  return sheet;
}

function compose(slot: SurfaceSlot, tex: BuildTextures, cell: number, seed: number): HTMLCanvasElement {
  const size = SHEET_CELLS * cell;
  const sheet = document.createElement('canvas');
  sheet.width = sheet.height = size;
  const g = sheet.getContext('2d')!;
  const variants = tex.variants[slot] ?? [tex.surface[slot]];
  const kind = kindOf(slot);
  // Dressed floors switch in larger patches – a room keeps mostly one flooring.
  const blobs = variantBlobs({ cells: SHEET_CELLS, variants: variants.length, rotations: kind.rotations, seed, blobStep: kind.dressed ? 8 : 4, baseBias: kind.dressed ? 0.8 : 0 });
  // Variants are evened towards the base picture's brightness, so patches differ in pattern, not in tone.
  const base = meanLuma(variants[0]);
  const even = (variant: number): string => {
    if (variant === 0) return 'none';
    const k = Math.max(0.75, Math.min(1.35, base / Math.max(1, meanLuma(variants[variant]))));
    return Math.abs(k - 1) < 0.03 ? 'none' : `brightness(${k.toFixed(3)})`;
  };

  // One pattern per variant and rotation, phase-jittered so a turned copy never lines up.
  const patterns = new Map<string, CanvasPattern>();
  const patternOf = (variant: number, rotation: number): CanvasPattern | null => {
    const key = `${variant}:${rotation}`;
    let p = patterns.get(key) ?? null;
    if (!p) {
      const src = variants[variant] ?? variants[0];
      p = g.createPattern(src, 'repeat');
      if (!p) return null;
      const k = (cell * TEXTURE_CELLS) / src.width;
      const jx = hashNoise(variant, rotation, seed + 11) * src.width;
      const jy = hashNoise(variant, rotation, seed + 12) * src.height;
      p.setTransform(new DOMMatrix().rotate(rotation * 90).scale(k).translate(jx, jy));
      patterns.set(key, p);
    }
    return p;
  };

  if (kind.dressed) {
    // Cells grouped by their patch's choice: one fill per choice, edges on the cell borders.
    const rects = new Map<string, Path2D>();
    for (let y = 0; y < SHEET_CELLS; y++)
      for (let x = 0; x < SHEET_CELLS; x++) {
        const c = blobs.at(x, y);
        const key = `${c.variant}:${c.rotation}`;
        let path = rects.get(key);
        if (!path) rects.set(key, (path = new Path2D()));
        path.rect(x * cell, y * cell, cell, cell);
      }
    for (const [key, path] of rects) {
      const [variant, rotation] = key.split(':').map(Number);
      g.fillStyle = patternOf(variant, rotation) ?? '#77705f';
      g.filter = even(variant);
      g.fill(path);
      g.filter = 'none';
    }
    // A faint shade per tile: no two neighbouring tiles read exactly alike.
    for (let y = 0; y < SHEET_CELLS; y++)
      for (let x = 0; x < SHEET_CELLS; x++) {
        const h = hashNoise(x, y, seed + 13);
        g.fillStyle = h > 0.5 ? `rgba(255,255,255,${((h - 0.5) * 0.09).toFixed(3)})` : `rgba(10,8,6,${((0.5 - h) * 0.11).toFixed(3)})`;
        g.fillRect(x * cell, y * cell, cell, cell);
      }
  } else {
    g.fillStyle = patternOf(0, 0) ?? '#77705f';
    g.fillRect(0, 0, size, size);
    // Soft round patches of other variants and turns, phase-aligned and wrapping with the sheet.
    const options = variants.length * Math.max(1, kind.rotations);
    if (options > 1) {
      const count = Math.round((SHEET_CELLS * SHEET_CELLS) / 5);
      for (let i = 0; i < count; i++) {
        const cx = hashNoise(i, 1, seed) * size;
        const cy = hashNoise(i, 2, seed) * size;
        const r = (1.1 + hashNoise(i, 3, seed) * 1.3) * cell;
        const o = Math.floor(hashNoise(i, 4, seed) * options);
        const variant = o % variants.length;
        const rotation = Math.floor(o / variants.length) * (4 / Math.max(1, kind.rotations));
        if (variant === 0 && rotation === 0) continue;
        const d = Math.ceil(r * 2);
        const patch = document.createElement('canvas');
        patch.width = patch.height = d;
        const pg = patch.getContext('2d')!;
        pg.translate(r - cx, r - cy);
        pg.fillStyle = patternOf(variant, rotation) ?? '#77705f';
        pg.filter = even(variant);
        pg.fillRect(cx - r, cy - r, d, d);
        pg.filter = 'none';
        pg.setTransform(1, 0, 0, 1, 0, 0);
        const grad = pg.createRadialGradient(r, r, r * 0.25, r, r, r);
        grad.addColorStop(0, 'rgba(0,0,0,1)');
        grad.addColorStop(1, 'rgba(0,0,0,0)');
        pg.globalCompositeOperation = 'destination-in';
        pg.fillStyle = grad;
        pg.fillRect(0, 0, d, d);
        // Near an edge the patch wraps to the far side, so the sheet stays seamless.
        for (const dx of [-size, 0, size])
          for (const dy of [-size, 0, size]) {
            const x = cx - r + dx;
            const y = cy - r + dy;
            if (x < size && y < size && x + d > 0 && y + d > 0) g.drawImage(patch, x, y);
          }
      }
    }
  }

  // Large light and shade drifting over the sheet (periodic, so it still tiles).
  const res = 8;
  const low = document.createElement('canvas');
  low.width = low.height = SHEET_CELLS * res;
  const lg = low.getContext('2d')!;
  const img = lg.createImageData(low.width, low.height);
  for (let y = 0; y < low.height; y++)
    for (let x = 0; x < low.width; x++) {
      const u = (x + 0.5) / res;
      const v = (y + 0.5) / res;
      const n = periodicNoise(u / 4, v / 4, SHEET_CELLS / 4, seed + 7) * 0.7 + periodicNoise(u / 2, v / 2, SHEET_CELLS / 2, seed + 8) * 0.3;
      const value = 128 * (1 + n * 0.55);
      const i = (y * low.width + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = value;
      img.data[i + 3] = 255;
    }
  lg.putImageData(img, 0, 0);
  g.globalCompositeOperation = 'soft-light';
  g.globalAlpha = 0.6;
  g.imageSmoothingEnabled = true;
  g.imageSmoothingQuality = 'high';
  g.drawImage(low, 0, 0, size, size);
  g.globalAlpha = 0.1;
  g.globalCompositeOperation = 'multiply';
  g.drawImage(low, 0, 0, size, size);
  g.globalAlpha = 1;
  g.globalCompositeOperation = 'source-over';
  return sheet;
}

/** Tests and hot reload: forget the composed sheets. */
export function resetSheetsForTests(): void {
  cache.clear();
  cacheBytes = 0;
}
