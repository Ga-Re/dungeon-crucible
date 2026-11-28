/**
 * Cliff band pictures (E-90, Teil B §24.3): per material and band height the modules – smooth A, B
 * and C, a crack, a ledge – shipped in `./textures` as `band-<material>-<height>-<module>.webp`,
 * already seamless along their width and sharing their left and right edge with A, so any order
 * along a band fits. Stacked into one picture per material and height, a module per row (one
 * missing shows A instead); loaded once, shared by the DM window and the TV.
 */
import { Texture } from 'pixi.js';
import { MODULES, type BandHeight, type CliffMaterial } from '../../core/build/terrain/cliffMaterial';

/** Picture height per band height (px; all are 1024 px wide). */
export const BAND_PX: Record<BandHeight, number> = { low: 256, high: 512, veryHigh: 768 };
const WIDTH = 1024;

const files = import.meta.glob('./textures/band-*.webp', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;

const kebab = (s: string) => s.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);

/** The slot of a module picture. */
export function bandSlot(material: CliffMaterial, height: BandHeight, module: (typeof MODULES)[number]): string {
  return `band-${kebab(material)}-${kebab(height)}-${module}`;
}

export interface BandAtlas {
  /** The modules stacked, in the order of `MODULES`, each with a gutter of its own edge rows above and below. */
  readonly texture: Texture;
  readonly rows: number;
  /** A row's gutter and picture as shares of the row's height. */
  readonly pad: number;
  readonly inner: number;
}

/** Gutter above and below each module (px): seen from far, the mipmaps would blend in the neighbouring module's foot. */
const PAD = 8;

const loading = new Map<string, Promise<BandAtlas>>();

/** The modules of `material` at `height`, loaded once. */
export function bandAtlas(material: CliffMaterial, height: BandHeight): Promise<BandAtlas> {
  const key = `${material}-${height}`;
  let p = loading.get(key);
  if (!p) {
    p = build(material, height);
    loading.set(key, p);
    // A failed load is tried again next time.
    p.catch(() => loading.delete(key));
  }
  return p;
}

async function picture(url: string | undefined): Promise<HTMLImageElement | null> {
  if (!url) return null;
  const img = new Image();
  img.src = url;
  try {
    await img.decode();
    return img;
  } catch {
    return null;
  }
}

async function build(material: CliffMaterial, height: BandHeight): Promise<BandAtlas> {
  const h = BAND_PX[height];
  const pictures = await Promise.all(MODULES.map((m) => picture(files[`./textures/${bandSlot(material, height, m)}.webp`])));
  const row = h + 2 * PAD;
  const c = document.createElement('canvas');
  c.width = WIDTH;
  c.height = row * MODULES.length;
  const g = c.getContext('2d');
  if (!g) throw new Error('No 2D canvas for a cliff band.');
  const [a] = pictures;
  MODULES.forEach((_, n) => {
    const img = pictures[n] ?? a;
    const y = n * row + PAD;
    if (img) {
      g.drawImage(img, 0, y, WIDTH, h);
      // The gutters repeat the picture's first and last row.
      g.drawImage(c, 0, y, WIDTH, 1, 0, y - PAD, WIDTH, PAD);
      g.drawImage(c, 0, y + h - 1, WIDTH, 1, 0, y + h, WIDTH, PAD);
    } else {
      // No picture: a plain stand-in, so the map still draws.
      g.fillStyle = '#7a7468';
      g.fillRect(0, y - PAD, WIDTH, row);
    }
  });
  const texture = Texture.from(c);
  texture.source.style.addressModeU = 'repeat';
  texture.source.style.addressModeV = 'clamp-to-edge';
  // Seen from far, a band is far narrower than its picture: without mipmaps its layers flicker into fine stripes.
  texture.source.style.mipmapFilter = 'linear';
  texture.source.autoGenerateMipmaps = true;
  texture.source.updateMipmaps();
  return { texture, rows: MODULES.length, pad: PAD / row, inner: h / row };
}
