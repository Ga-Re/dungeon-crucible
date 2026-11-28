/**
 * Cliff materials (E-90, Teil B §11.4, §24.3): a cliff shows a material by the biome and the ground
 * class on its upper side and its drop – the first matching rule – in one of three band heights,
 * made of modules along its length. Along a line the material changes softly where the ground
 * above does, so materials come weighted. A material override comes with DC-133. Pure.
 */
import type { Point } from '../../geometry';
import { toCellSpace, type GridConfig } from '../../grid';
import type { TerrainBiome } from '../terrainKeys';
import { BLOCK_POINTS, blockKeyOf, SUBDIVISIONS, type RasterBlock } from './block';
import { GROUND_CLASSES, type GroundClass } from './groundTool';

export const CLIFF_MATERIALS = ['earth', 'granite', 'limestone', 'sandstone', 'desertSandstone', 'clay', 'peat', 'caveRock', 'ice', 'ashlar', 'rubble', 'brick', 'wood'] as const;
export type CliffMaterial = (typeof CLIFF_MATERIALS)[number];

/** Built walls: straight, no overhang, no ledges. */
export const BUILT: ReadonlySet<CliffMaterial> = new Set(['ashlar', 'rubble', 'brick', 'wood']);

/** The wall a biome builds where paving lies on top (DM 2026-11-28: wood only in the swamp). */
const PAVED: Record<TerrainBiome, CliffMaterial> = { temperate: 'ashlar', dungeon: 'ashlar', desert: 'brick', winter: 'rubble', swamp: 'wood' };

/** The material of a cliff of `dropFt` in `biome` with `above` on its upper side (null: Auto). */
export function cliffMaterial(biome: TerrainBiome, above: GroundClass | null, dropFt: number): CliffMaterial {
  if (above === 'paving') return PAVED[biome];
  switch (biome) {
    case 'temperate':
      if (above === 'rock') return 'limestone';
      if (above === 'earth' || above === 'leaves') return 'earth';
      return 'sandstone';
    case 'dungeon':
      return above === 'earth' ? 'earth' : 'caveRock';
    case 'swamp':
      if (dropFt <= 10) return 'peat';
      return above === 'rock' ? 'granite' : 'earth';
    case 'desert':
      if (above === 'earth') return 'clay';
      return above === 'rock' ? 'granite' : 'desertSandstone';
    case 'winter':
      if (above === 'snow' && dropFt >= 20) return 'ice';
      return above === 'earth' ? 'earth' : 'granite';
  }
}

/** Band heights (Teil B §24.3): pictures 256, 512 and 768 px high. */
export const BAND_HEIGHTS = ['low', 'high', 'veryHigh'] as const;
export type BandHeight = (typeof BAND_HEIGHTS)[number];

/** The band height for a drop: low up to 15 ft, high up to 35 ft, very high above. */
export function bandHeight(dropFt: number): BandHeight {
  return dropFt <= 15 ? 'low' : dropFt <= 35 ? 'high' : 'veryHigh';
}

/** The heights a material has pictures for: peat only on low banks, ice from 20 ft, wooden walls not very high. */
const ALL = BAND_HEIGHTS;
export const MATERIAL_HEIGHTS: Record<CliffMaterial, readonly BandHeight[]> = {
  earth: ALL,
  granite: ALL,
  limestone: ALL,
  sandstone: ALL,
  desertSandstone: ALL,
  clay: ALL,
  peat: ['low'],
  caveRock: ALL,
  ice: ['high', 'veryHigh'],
  ashlar: ALL,
  rubble: ALL,
  brick: ALL,
  wood: ['low', 'high'],
};

/** The picture height `material` shows for `dropFt`: its band height, else the nearest it has. */
export function bandVariant(material: CliffMaterial, dropFt: number): BandHeight {
  const want = BAND_HEIGHTS.indexOf(bandHeight(dropFt));
  const has = MATERIAL_HEIGHTS[material];
  return has.reduce((best, h) => (Math.abs(BAND_HEIGHTS.indexOf(h) - want) < Math.abs(BAND_HEIGHTS.indexOf(best) - want) ? h : best));
}

export const MODULES = ['a', 'b', 'c', 'crack', 'ledge'] as const;
export type BandModule = (typeof MODULES)[number];

/** Hard stone cracks more often. */
const CRACKY: ReadonlySet<CliffMaterial> = new Set(['granite', 'limestone', 'sandstone', 'desertSandstone', 'caveRock', 'ice']);

/**
 * How often each module shows along a band (Teil B §11.5): the smooth pieces A/B/C most, a crack
 * now and then (more in hard stone), a ledge only on high natural faces.
 */
export function moduleChances(material: CliffMaterial, height: BandHeight): Record<BandModule, number> {
  const crack = CRACKY.has(material) ? 0.14 : 0.08;
  const ledge = !BUILT.has(material) && height !== 'low' ? 0.1 : 0;
  const smooth = 1 - crack - ledge;
  return { a: smooth * 0.4, b: smooth * 0.3, c: smooth * 0.3, crack, ledge };
}

/** The ground classes (null: Auto) at the support point nearest map point `p`, weights 0…1; no block there: Auto. */
export function classWeightsAtPx(blocks: ReadonlyMap<string, RasterBlock>, grid: GridConfig, p: Point): Map<GroundClass | null, number> {
  const c = toCellSpace(grid, p);
  const px = Math.round(c.x * SUBDIVISIONS);
  const py = Math.round(c.y * SUBDIVISIONS);
  const b = blocks.get(blockKeyOf(px, py));
  const out = new Map<GroundClass | null, number>();
  if (b) {
    const i = (py - Math.floor(py / BLOCK_POINTS) * BLOCK_POINTS) * BLOCK_POINTS + (px - Math.floor(px / BLOCK_POINTS) * BLOCK_POINTS);
    for (const [cc, cw] of [['ground1Class', 'ground1Weight'], ['ground2Class', 'ground2Weight']] as const) {
      const id = b.planes[cc][i]!;
      const w = b.planes[cw][i]! / 255;
      const cls = GROUND_CLASSES[id - 1];
      if (cls && w > 0) out.set(cls, (out.get(cls) ?? 0) + w);
    }
  }
  let painted = 0;
  for (const w of out.values()) painted += w;
  if (painted < 1) out.set(null, 1 - painted);
  return out;
}

/**
 * The materials of a cliff of `dropFt` with the biome weights `biomes` (by palette place; a place
 * without a biome counts as the first) and the ground classes `classes` on its upper side.
 */
export function materialWeights(biomes: readonly number[], palette: readonly (TerrainBiome | null)[], classes: ReadonlyMap<GroundClass | null, number>, dropFt: number): Map<CliffMaterial, number> {
  const out = new Map<CliffMaterial, number>();
  const first = palette.find((b) => b) ?? 'temperate';
  biomes.forEach((wb, k) => {
    if (wb <= 0) return;
    const biome = palette[k] ?? first;
    for (const [cls, wc] of classes) {
      const m = cliffMaterial(biome, cls, dropFt);
      out.set(m, (out.get(m) ?? 0) + wb * wc);
    }
  });
  return out;
}
