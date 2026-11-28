/**
 * Textures of the terrain (E-87, E-88): per terrain biome its ground and each ground class it has, with their variants
 * (seamless both ways), shipped in `./textures`; plus a generated helper – patches read along
 * an edge, where bare stone caps show. Loaded once per biome; shared by the DM window and the TV.
 */
import { Texture } from 'pixi.js';
import type { TerrainBiome } from '../../core/build/terrainKeys';
import { BIOME_CLASSES, type GroundClass } from '../../core/build/terrain/groundTool';
import { periodicNoise } from '../../core/build/variance';

/** A ground and its variant, if it has one (laid in large patches against repetition). */
export interface Surface {
  readonly texture: Texture;
  readonly variant: Texture | null;
  /** How many cells one tile spans on the map. */
  readonly tileCells: number;
}

/**
 * How many 5 ft cells one tile of a ground spans, so its stones, blades, pebbles and leaves show at
 * their real size (DM 2026-11-28: paving was far too large): by class, and where a biome's picture
 * has stones of another size, for that biome.
 */
const TILE_CELLS: Record<GroundClass | 'ground', number> = { ground: 7.3, grass: 4, tallgrass: 4, earth: 4, rock: 5, gravel: 2, moss: 3, leaves: 2.5, paving: 2, snow: 7 };
const TILE_CELLS_IN: Partial<Record<`${TerrainBiome}-${GroundClass}`, number>> = {
  'temperate-paving': 2,
  'swamp-paving': 2,
  'swamp-tallgrass': 2.5,
  'desert-paving': 3,
  'winter-paving': 3,
  'dungeon-paving': 3.5,
  'swamp-gravel': 3,
  'desert-gravel': 6,
  'winter-gravel': 4,
};

function tileCells(biome: TerrainBiome, cls: GroundClass | null): number {
  return cls ? (TILE_CELLS_IN[`${biome}-${cls}`] ?? TILE_CELLS[cls]) : TILE_CELLS.ground;
}

export interface TerrainTextures {
  /** Auto: the biome's own ground. */
  readonly ground: Surface;
  /** The classes the biome has. */
  readonly classes: ReadonlyMap<GroundClass, Surface>;
  readonly patches: Texture;
}

const files = import.meta.glob('./textures/terrain-*.webp', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;

/** The picture of a ground class as `biome` shows it (Auto: its own ground), for palettes in panels. */
export function groundPictureUrl(biome: TerrainBiome, cls: GroundClass | null): string | undefined {
  return files[cls ? `./textures/terrain-${biome}-${cls}.webp` : `./textures/terrain-ground-${biome}.webp`];
}

/** A ground slot and its variant (`<slot>.1`), made seamless. */
async function surface(slot: string, cells: number): Promise<Surface> {
  const variantUrl = files[`./textures/${slot}.1.webp`];
  const [texture, variant] = await Promise.all([seamless(files[`./textures/${slot}.webp`], 512), variantUrl ? seamless(variantUrl, 512) : null]);
  return { texture, variant, tileCells: cells };
}

const loading = new Map<TerrainBiome, Promise<TerrainTextures>>();

/** The textures of `biome`, loaded once. */
export function terrainTextures(biome: TerrainBiome): Promise<TerrainTextures> {
  let p = loading.get(biome);
  if (!p) {
    p = (async () => {
      const [ground, ...classes] = await Promise.all([
        surface(`terrain-ground-${biome}`, tileCells(biome, null)),
        ...BIOME_CLASSES[biome].map((c) => surface(`terrain-${biome}-${c}`, tileCells(biome, c))),
      ]);
      return { ground, classes: new Map(BIOME_CLASSES[biome].map((c, i) => [c, classes[i]!])), patches: patches() };
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
 * A picture made seamless both ways: the last part of each axis is blended over the
 * first, then cut off. A missing picture gives a plain grey stand-in, so the map still draws.
 */
async function seamless(url: string | undefined, maxWidth: number): Promise<Texture> {
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
  src = blend(blend(src, false), true);
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
