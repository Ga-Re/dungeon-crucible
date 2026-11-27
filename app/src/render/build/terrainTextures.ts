/**
 * Textures of the terrain (E-87): per terrain biome a cliff band (a strip seen from the front,
 * seamless along its width) and a ground (seamless both ways), shipped in `./textures`; plus two
 * generated helpers – patches read along an edge (where bare stone caps show) and crumbly earth
 * for the hem below a cliff's foot. Loaded once per biome; shared by the DM window and the TV.
 */
import { Texture } from 'pixi.js';
import type { TerrainBiome } from '../../core/build/terrainKeys';
import { periodicNoise } from '../../core/build/variance';

export interface TerrainTextures {
  readonly band: Texture;
  readonly ground: Texture;
  readonly patches: Texture;
  readonly earth: Texture;
}

const files = import.meta.glob('./textures/{cliff-band,terrain-ground}-*.webp', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;

const loading = new Map<TerrainBiome, Promise<TerrainTextures>>();

/** The textures of `biome`, loaded once. */
export function terrainTextures(biome: TerrainBiome): Promise<TerrainTextures> {
  let p = loading.get(biome);
  if (!p) {
    p = (async () => {
      const [band, ground] = await Promise.all([seamless(files[`./textures/cliff-band-${biome}.webp`], 'x', 1024), seamless(files[`./textures/terrain-ground-${biome}.webp`], 'xy', 512)]);
      return { band, ground, patches: patches(), earth: earth() };
    })();
    loading.set(biome, p);
    // A failed load is tried again next time.
    p.catch(() => loading.delete(biome));
  }
  return p;
}

function repeating(c: HTMLCanvasElement): Texture {
  const t = Texture.from(c);
  t.source.style.addressMode = 'repeat';
  return t;
}

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  if (!g) throw new Error('No 2D canvas for a terrain texture.');
  return [c, g];
}

/**
 * A picture made seamless along `axes`: the last part of each tiled axis is blended over the
 * first, then cut off. A missing picture gives a plain grey stand-in, so the map still draws.
 */
async function seamless(url: string | undefined, axes: 'x' | 'xy', maxWidth: number): Promise<Texture> {
  const img = new Image();
  try {
    if (!url) throw new Error('no picture');
    img.src = url;
    await img.decode();
  } catch {
    const [c, g] = canvas(64, 64);
    g.fillStyle = '#7a7468';
    g.fillRect(0, 0, 64, 64);
    return repeating(c);
  }
  const scale = Math.min(1, maxWidth / img.naturalWidth);
  let [src, sg] = canvas(Math.round(img.naturalWidth * scale), Math.round(img.naturalHeight * scale));
  sg.drawImage(img, 0, 0, src.width, src.height);
  const blend = (c: HTMLCanvasElement, vertical: boolean): HTMLCanvasElement => {
    const len = vertical ? c.height : c.width;
    const o = Math.round(len * 0.15);
    const [out, g] = canvas(vertical ? c.width : c.width - o, vertical ? c.height - o : c.height);
    g.drawImage(c, 0, 0);
    // The cut-off end, fading out over the start.
    const [strip, s] = canvas(vertical ? c.width : o, vertical ? o : c.height);
    s.drawImage(c, vertical ? 0 : -(len - o), vertical ? -(len - o) : 0);
    const fade = vertical ? s.createLinearGradient(0, 0, 0, o) : s.createLinearGradient(0, 0, o, 0);
    fade.addColorStop(0, 'rgba(0,0,0,1)');
    fade.addColorStop(1, 'rgba(0,0,0,0)');
    s.globalCompositeOperation = 'destination-in';
    s.fillStyle = fade;
    s.fillRect(0, 0, strip.width, strip.height);
    g.drawImage(strip, 0, 0);
    return out;
  };
  src = blend(src, false);
  if (axes === 'xy') src = blend(src, true);
  return repeating(src);
}

/** Seamless noise over a `w`-wide tile: `scale` px per lattice step (`w` a multiple of it). */
const tileNoise = (x: number, y: number, scale: number, w: number, seed: number) => periodicNoise(x / scale, y / scale, w / scale, seed);

/** Patches along an edge (read by arc length, red channel): small bare stone caps here and there (DC-127). */
function patches(): Texture {
  const [c, g] = canvas(512, 4);
  for (let x = 0; x < 512; x++) {
    g.fillStyle = `rgb(${128 + tileNoise(x, 0, 16, 512, 201) * 127},0,0)`;
    g.fillRect(x, 0, 1, 4);
  }
  return repeating(c);
}

/** Earth for the hem below the foot: brown, crumbly; tinted per biome. */
function earth(): Texture {
  const [c, g] = canvas(256, 256);
  for (let y = 0; y < 256; y += 2)
    for (let x = 0; x < 256; x += 2) {
      const n = tileNoise(x, y, 16, 256, 31) * 20 + tileNoise(x, y, 4, 256, 33) * 12;
      g.fillStyle = `rgb(${112 + n},${88 + n},${62 + n * 0.8})`;
      g.fillRect(x, y, 2, 2);
    }
  return repeating(c);
}
