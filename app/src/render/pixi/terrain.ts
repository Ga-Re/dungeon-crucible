/**
 * The terrain layer (E-46, E-52, E-87, E-88, E-90): the ground – biomes and painted classes, see
 * `groundSplat.ts` – and the cliffs as accepted in the look spike (DC-127) – a band below each top
 * edge, wider with the drop and wandering by ±35 %, lit by its turn to the light, in the material
 * its upper side calls for (`cliffMaterial.ts`: biome, ground class, drop) made of modules; foot AO
 * and the biome's gravel running out in patches on the lower ground; the ground hanging over the
 * edge (not in caves, not over built walls) with small bare stone caps here and there; scree in a
 * few heaps at the foot and rare stones on the rim. The same
 * lines as the DM's one-way walls (`core/build/terrain/cliffs.ts`); built anew only when the
 * blocks shown or the look change. Above the map, under the grid. Shared by the DM window and the TV.
 */
import { Container, Geometry, Graphics, Mesh, Shader, type Renderer, type Texture } from 'pixi.js';
import { bandFoot, cliffBand, type BandMesh } from '../../core/build/geom/band';
import { chaikin, type Pt } from '../../core/build/geom/contours';
import { noise2 } from '../../core/build/handDrawn';
import { CLIFF_NOISE_CELLS, CliffCache, cliffLines, type CliffLine, type CliffSource } from '../../core/build/terrain/cliffs';
import { BUILT, bandVariant, classWeightsAtPx, cliffNoiseAt, materialWeights, moduleChances, type CliffMaterial } from '../../core/build/terrain/cliffMaterial';
import type { TerrainBiome } from '../../core/build/terrainKeys';
import { hashNoise } from '../../core/build/variance';
import type { GridConfig } from '../../core/grid';
import { terrainTextures, type TerrainTextures } from '../build/terrainTextures';
import { bandAtlas, type BandAtlas } from '../build/cliffTextures';
import { biomeWeightsAtPx } from '../../core/build/terrain/groundSample';
import { createGroundLayer } from './groundSplat';
import { createShadeLayer } from './shading';
import { createTerrainBake } from './terrainBake';

export interface TerrainShape {
  /** The blocks of the stack shown (base and active layers' patches). */
  readonly source: CliffSource;
  readonly grid: GridConfig;
  /** The map's biomes by palette place (E-88): the first is where none is painted; on the TV a place its blocks do not use is null. */
  readonly palette: readonly (TerrainBiome | null)[];
  readonly stepFt: number;
  /** Band width in cells per 10 ft drop (Teil B §11.2). */
  readonly perspective: number;
  /** Where the light falls towards (degrees, map coordinates). */
  readonly lightAngle: number;
  /** Erosion edges where the fine height is steep (E-89); off per map. */
  readonly erosion: boolean;
  /** The ground's area (map px): the map's. */
  readonly area: { readonly x: number; readonly y: number; readonly width: number; readonly height: number };
  /** Over a picture or video map (E-60, E-90): only what is painted shows, without light and shadow (the picture has its own). */
  readonly overPicture: boolean;
}

export interface TerrainLayer {
  readonly view: Container;
  /** Shows the terrain (`null`: none); the same blocks and look again change nothing. */
  set(shape: TerrainShape | null): void;
  /** Settles once the last shape set is built (its textures loaded) or could not be. */
  ready(): Promise<void>;
  /** Before a frame at `scale` (device px per map px): far out, baked blocks show (E-90). True if more baking is due. */
  prepare(scale: number): boolean;
  destroy(): void;
}

type Rgb = readonly [number, number, number];

/** Whether a biome's ground hangs over its cliffs' edge (E-87): not in caves. */
const LIPS: Record<TerrainBiome, boolean> = { temperate: true, dungeon: false, swamp: true, desert: true, winter: true };

/** How a material's cliffs look besides its picture (E-90): bare stone caps on top (natural stone only), the colour of its scree. */
interface MaterialLook {
  readonly cap: Rgb | null;
  readonly stone: Rgb;
}

const MATERIAL_LOOKS: Record<CliffMaterial, MaterialLook> = {
  earth: { cap: null, stone: [0.45, 0.36, 0.27] },
  granite: { cap: [0.7, 0.71, 0.72], stone: [0.45, 0.47, 0.5] },
  limestone: { cap: [0.9, 0.88, 0.82], stone: [0.7, 0.68, 0.62] },
  sandstone: { cap: [0.86, 0.8, 0.66], stone: [0.59, 0.47, 0.35] },
  desertSandstone: { cap: [0.95, 0.89, 0.76], stone: [0.8, 0.68, 0.5] },
  clay: { cap: null, stone: [0.62, 0.45, 0.32] },
  peat: { cap: null, stone: [0.33, 0.27, 0.2] },
  caveRock: { cap: [0.58, 0.6, 0.63], stone: [0.4, 0.41, 0.44] },
  ice: { cap: null, stone: [0.72, 0.8, 0.86] },
  ashlar: { cap: null, stone: [0.55, 0.53, 0.5] },
  rubble: { cap: null, stone: [0.5, 0.49, 0.47] },
  brick: { cap: null, stone: [0.62, 0.42, 0.3] },
  wood: { cap: null, stone: [0.4, 0.3, 0.2] },
};

/** Map px along a band per module picture (all 1024 px wide): 2.5 cells, the scale of the accepted look. */
const MODULE_CELLS = 2.5;
/** The overhang's texture length in cells; its caps and the face's are read at the same place. */
const LIP_CELLS = 4;

/** How much a band's width wanders: protrusions and niches (DC-127). */
const WIDTH_WANDER = 0.35;
const MAX_BAND_CELLS = 2.5;

const glsl = (c: Rgb) => `vec3(${c.map((x) => x.toFixed(3)).join(', ')})`;

const VERTEX = `in vec2 aPosition;
in vec2 aUV;
in float aShade;
in float aAlpha;
out vec2 vUV;
out float vShade;
out float vAlpha;
uniform mat3 uProjectionMatrix;
uniform mat3 uWorldTransformMatrix;
uniform mat3 uTransformMatrix;
void main() {
  mat3 mvp = uProjectionMatrix * uWorldTransformMatrix * uTransformMatrix;
  gl_Position = vec4((mvp * vec3(aPosition, 1.0)).xy, 0.0, 1.0);
  vUV = aUV;
  vShade = aShade;
  vAlpha = aAlpha;
}`;

/**
 * The face (E-90): per module length one module of the material's picture – picked by a hash of
 * its place along the line, by the module chances (A, B, C, crack; ledge the rest); all share
 * their side edges, so any order fits – gently lit, darker to the foot; bare stone caps at the
 * top where the patches say so. GLSL 3 for the gradients (Pixi compiles GLSL 1 otherwise).
 */
const face = (look: MaterialLook) => `#version 300 es
in vec2 vUV;
in float vShade;
in float vAlpha;
uniform sampler2D uTexture;
uniform sampler2D uPatch;
uniform vec4 uChances;
uniform float uSeed;
uniform float uRows;
out vec4 finalColor;
void main() {
  float r = fract(sin(floor(vUV.x) * 12.9898 + uSeed * 78.233) * 43758.5453);
  float row = r < uChances.x ? 0.0 : r < uChances.y ? 1.0 : r < uChances.z ? 2.0 : r < uChances.w ? 3.0 : 4.0;
  // Kept off the row's edges, so the rows above and below never bleed in.
  float v = clamp(vUV.y, 0.004, 0.996);
  // Mipmapped by the band's own gradient: the jump of fract() at a module's end picks no blurrier level.
  // A level finer than exact keeps joints and layers crisp (the pictures are calm enough not to shimmer).
  vec2 scale = vec2(0.6, 0.6 / uRows);
  vec3 c = textureGrad(uTexture, vec2(fract(vUV.x), (row + v) / uRows), dFdx(vUV) * scale, dFdy(vUV) * scale).rgb;
${
  look.cap
    ? `  float p = texture(uPatch, vec2(vUV.x * ${((0.35 * MODULE_CELLS) / LIP_CELLS).toFixed(4)}, 0.5)).r;
  float cap = smoothstep(0.66, 0.72, p) * (1.0 - smoothstep(0.1, 0.22, vUV.y));
  c = mix(c, ${glsl(look.cap)} + (c - 0.55) * 0.35, cap);`
    : ''
}
  float foot = mix(1.0, 0.55, vUV.y * vUV.y);
  finalColor = vec4(c * mix(0.85, 1.2, (vShade - 0.55) / 0.45) * foot * vAlpha, vAlpha);
}`;

/** Foot AO: a soft dark hem on the lower ground. */
const AO = `in vec2 vUV;
out vec4 finalColor;
void main() {
  float a = 0.45 * pow(1.0 - vUV.y, 1.8);
  finalColor = vec4(0.0, 0.0, 0.0, a);
}`;

/** The ground hanging over the edge, its lower rim ragged; none where a stone cap shows. */
const OVERHANG = `in vec2 vUV;
in float vAlpha;
uniform sampler2D uTexture;
uniform sampler2D uPatch;
out vec4 finalColor;
void main() {
  vec3 c = texture(uTexture, vec2(vUV.x * 1.6, vUV.y * 0.15)).rgb;
  float tuft = texture(uTexture, vec2(vUV.x * 18.0, 0.5)).g;
  float reach = 0.25 + 0.75 * smoothstep(0.42, 0.62, tuft);
  float bare = smoothstep(0.62, 0.68, texture(uPatch, vec2(vUV.x * 0.35, 0.5)).r);
  float a = (1.0 - smoothstep(reach - 0.18, reach, vUV.y)) * (1.0 - bare) * vAlpha;
  finalColor = vec4(c * (0.82 + 0.18 * (1.0 - vUV.y)) * a, a);
}`;

/**
 * Auto at a cliff's foot (E-88): the biome's gravel running out into the lower ground in patches,
 * ragged and fading. The band's u runs over a whole texture tile, v over its width's share of one.
 */
const soil = (vScale: number) => `in vec2 vUV;
in float vAlpha;
uniform sampler2D uTexture;
out vec4 finalColor;
void main() {
  vec3 c = texture(uTexture, vUV * vec2(1.0, ${vScale.toFixed(4)})).rgb;
  float edge = texture(uTexture, vec2(vUV.x * 3.0, 0.7)).r;
  float a = (1.0 - smoothstep(0.35 + 0.4 * edge, 1.0, vUV.y)) * 0.9 * vAlpha;
  finalColor = vec4(c * a, a);
}`;

/** A band's mesh; `alpha` per point of its line (both its vertices), none: opaque. */
function mesh(m: BandMesh, fragment: string, texture: Texture, patch?: Texture, alpha?: readonly number[], uniforms?: Record<string, { value: number | number[]; type: string }>): Mesh<Geometry, Shader> {
  const a = new Float32Array(m.shade.length);
  // Alpha per point of the line: a corner's vertices take their point's.
  for (let i = 0; i < a.length; i++) a[i] = alpha ? alpha[Math.min(alpha.length - 1, m.at[i >> 1]!)]! : 1;
  const geometry = new Geometry({ attributes: { aPosition: m.positions, aUV: m.uvs, aShade: { buffer: m.shade, format: 'float32' }, aAlpha: { buffer: a, format: 'float32' } }, indexBuffer: m.indices });
  const shader = Shader.from({ gl: { vertex: VERTEX, fragment }, resources: { uTexture: texture.source, ...(patch ? { uPatch: patch.source } : {}), ...(uniforms ? { faceUniforms: uniforms } : {}) } });
  return new Mesh({ geometry, shader, texture });
}

/** The face of `material` on `band` from its modules `atlas`; `seed` picks the modules of this line. */
function faceMesh(band: BandMesh, material: CliffMaterial, atlas: BandAtlas, height: Parameters<typeof moduleChances>[1], patch: Texture, seed: number, alpha?: readonly number[]): Mesh<Geometry, Shader> {
  const c = moduleChances(material, height);
  const chances = [c.a, c.a + c.b, c.a + c.b + c.c, c.a + c.b + c.c + c.crack];
  return mesh(band, face(MATERIAL_LOOKS[material]), atlas.texture, patch, alpha, { uChances: { value: chances, type: 'vec4<f32>' }, uSeed: { value: seed, type: 'f32' }, uRows: { value: atlas.rows, type: 'f32' } });
}

/** An irregular stone at `p`, `size` px: a soft contact shadow, a body in the biome's stone, a lit top. */
function stone(g: Graphics, p: Pt, size: number, seed: number, base: Rgb): void {
  const corners = 6 + Math.floor(hashNoise(p.x, p.y, seed) * 3);
  const ring = (scale: number, dx: number, dy: number) =>
    Array.from({ length: corners }, (_, i) => {
      const a = (i / corners) * Math.PI * 2 + hashNoise(p.x, i, seed + 1) * 0.6;
      const r = size * scale * (0.7 + hashNoise(p.y, i, seed + 2) * 0.45);
      return [p.x + dx + Math.cos(a) * r, p.y + dy + Math.sin(a) * r * 0.8] as const;
    }).flat();
  const t = hashNoise(p.x, p.y, seed + 3);
  const ch = (v: number, spread: number) => Math.min(255, Math.round(v * 255 + t * spread));
  const color = (ch(base[0], 40) << 16) | (ch(base[1], 34) << 8) | ch(base[2], 26);
  g.poly(ring(1.15, size * 0.25, size * 0.3)).fill({ color: 0x000000, alpha: 0.3 });
  g.poly(ring(1, 0, 0)).fill({ color }).stroke({ color: 0x2a2620, width: 1, alpha: 0.7 });
  g.poly(ring(0.55, -size * 0.18, -size * 0.2)).fill({ color: 0xffffff, alpha: 0.18 });
}

/** Points along a line every `spacing` px with the normal to its lower side (they stay where they are: world hashes decide). */
function alongLine(line: readonly Pt[], closed: boolean, spacing: number): { p: Pt; normal: Pt }[] {
  const out: { p: Pt; normal: Pt }[] = [];
  const n = closed ? line.length : line.length - 1;
  for (let i = 0; i < n; i++) {
    const a = line[i]!;
    const b = line[(i + 1) % line.length]!;
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (len < 1e-6) continue;
    const normal = { x: -(b.y - a.y) / len, y: (b.x - a.x) / len };
    for (let t = 0; t < len; t += spacing) out.push({ p: { x: a.x + ((b.x - a.x) * t) / len, y: a.y + ((b.y - a.y) * t) / len }, normal });
  }
  return out;
}

function pathLength(points: readonly Pt[]): number {
  let sum = 0;
  for (let i = 1; i < points.length; i++) sum += Math.hypot(points[i]!.x - points[i - 1]!.x, points[i]!.y - points[i - 1]!.y);
  return sum;
}

/** A cliff line worked out: per point of it (a closed one's first again at its end) the biomes and materials on its upper side. */
interface PlannedLine {
  readonly line: CliffLine;
  readonly dropFt: number;
  readonly biomes: readonly number[][];
  readonly materials: readonly ReadonlyMap<CliffMaterial, number>[];
  /** Its materials, the strongest first. */
  readonly order: readonly CliffMaterial[];
}

interface CliffPlan {
  readonly key: { planes: unknown[]; look: string };
  readonly lines: readonly PlannedLine[];
  readonly erosion: readonly PlannedLine[];
  /** The band pictures needed, as `material|height`. */
  readonly atlases: readonly string[];
}

/** The materials present along a line, the strongest first. */
function byTotal(materials: readonly ReadonlyMap<CliffMaterial, number>[]): CliffMaterial[] {
  const totals = new Map<CliffMaterial, number>();
  for (const w of materials) for (const [m, x] of w) totals.set(m, (totals.get(m) ?? 0) + x);
  return [...totals].filter(([, x]) => x > 0).sort((a, b) => b[1] - a[1]).map(([m]) => m);
}

/** The palette places present along a line with their textures loaded, the strongest first. */
function biomeSlots(biomes: readonly number[][], palette: readonly (TerrainBiome | null)[], textures: ReadonlyMap<TerrainBiome, TerrainTextures>): number[] {
  const totals = [0, 1, 2, 3].map((k) => biomes.reduce((sum, w) => sum + w[k]!, 0));
  return [0, 1, 2, 3].filter((k) => totals[k]! > 0 && palette[k] && textures.has(palette[k]!)).sort((a, b) => totals[b]! - totals[a]!);
}

function smoothRange(e0: number, e1: number, v: number): number {
  const x = Math.max(0, Math.min(1, (v - e0) / (e1 - e0)));
  return x * x * (3 - 2 * x);
}

/** True if `a` and `b` show the same: the same blocks (by identity) and the same look. */
function same(a: TerrainShape | null, b: TerrainShape | null): boolean {
  if (!a || !b) return a === b;
  if (a.palette.join() !== b.palette.join() || a.overPicture !== b.overPicture || a.erosion !== b.erosion || a.stepFt !== b.stepFt || a.perspective !== b.perspective || a.lightAngle !== b.lightAngle) return false;
  if (a.source.missingIsUnknown !== b.source.missingIsUnknown || a.source.blocks.size !== b.source.blocks.size) return false;
  if (JSON.stringify([a.grid, a.area]) !== JSON.stringify([b.grid, b.area])) return false;
  for (const [k, v] of a.source.blocks) if (b.source.blocks.get(k) !== v) return false;
  return true;
}

export function createTerrainLayer(redraw: () => void, renderer: Renderer): TerrainLayer {
  const view = new Container();
  const ground = createGroundLayer();
  const shade = createShadeLayer(renderer);
  // Cliffs below the light and shadow (their feet, faces, erosion edges), the overhang and stones above it.
  const cliffs = new Container();
  const above = new Container();
  // Live: every mesh drawn each frame; far out its blocks are baked into textures instead (E-90).
  const live = new Container();
  live.isRenderGroup = true;
  live.addChild(ground.view, cliffs, shade.view, above);
  const bake = createTerrainBake(renderer, live);
  view.addChild(live, bake.view);
  const erosionCache = new CliffCache();
  const cache = new CliffCache();
  let shown: TerrainShape | null = null;
  let wanted: TerrainShape | null = null;
  /** How often the cliffs were built: baked blocks from before are due. */
  let cliffBuilds = 0;
  /** The build of the last shape set: its textures load first. */
  let building: Promise<void> = Promise.resolve();
  let destroyed = false;

  // A mesh leaves its geometry and shader behind when destroyed (Pixi 8): freed here, every rebuild.
  const free = (node: Container) => {
    for (const child of node.children) free(child);
    if (node instanceof Mesh) {
      // With its buffers: they would wait for Pixi's collector otherwise, and live painting rebuilds often.
      node.geometry.destroy(true);
      node.shader?.destroy();
    }
  };
  const clearCliffs = () => {
    for (const child of [...cliffs.removeChildren(), ...above.removeChildren()]) {
      free(child);
      child.destroy({ children: true });
    }
  };

  /** What the cliffs were built from: the blocks' step, biome and ground planes (never changed, only replaced) and the look. */
  let cliffsFrom: { planes: unknown[]; look: string } | null = null;

  /** What the cliffs of `s` would be built from. */
  const cliffKey = (s: TerrainShape) => ({
    // Fine height matters only to erosion edges; the ground classes pick the materials (E-90).
    planes: [...s.source.blocks].flatMap(([k, b]) => [k, b.planes.step, b.planes.slope, s.erosion ? b.planes.relief : null, b.planes.biome1, b.planes.biome2, b.planes.biome3, b.planes.biome4, b.planes.ground1Class, b.planes.ground1Weight, b.planes.ground2Class, b.planes.ground2Weight]),
    look: JSON.stringify([s.palette, s.stepFt, s.perspective, s.lightAngle, s.grid, s.source.missingIsUnknown, s.erosion]),
  });
  const sameKey = (a: { planes: unknown[]; look: string } | null, b: { planes: unknown[]; look: string }) => !!a && a.look === b.look && a.planes.length === b.planes.length && a.planes.every((x, i) => x === b.planes[i]);

  /** The cliffs of `s` worked out (lines, biomes and materials along them) and the band pictures they need, unless built from the same already. */
  const plan = (s: TerrainShape): CliffPlan | null => {
    const key = cliffKey(s);
    if (sameKey(cliffsFrom, key)) return null;
    const cell = s.grid.cellWidth;
    const upper = (pts: readonly Pt[], i: number) => {
      // A little to the left of the line: its upper side.
      const a = pts[Math.max(0, i - 1)]!;
      const b = pts[Math.min(pts.length - 1, i + 1)]!;
      const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
      return { x: pts[i]!.x + ((b.y - a.y) / len) * cell * 0.35, y: pts[i]!.y - ((b.x - a.x) / len) * cell * 0.35 };
    };
    const lines: PlannedLine[] = [];
    // The edges wander by the material on top, as the DM's walls of sight do (`store.ts`).
    const noiseAt = (upper: Pt, drop: number) => cliffNoiseAt(s.source.blocks, s.grid, s.palette, upper, drop * s.stepFt);
    for (const line of cliffLines(s.source, { grid: s.grid, noiseCells: CLIFF_NOISE_CELLS, noiseAt }, cache)) {
      if (line.points.length < 2) continue;
      const pts = line.closed ? [...line.points, line.points[0]!] : [...line.points];
      const dropFt = line.drop * s.stepFt;
      const biomes = pts.map((_, i) => biomeWeightsAtPx(s.source.blocks, s.grid, upper(pts, i)));
      const materials = pts.map((_, i) => materialWeights(biomes[i]!, s.palette, classWeightsAtPx(s.source.blocks, s.grid, upper(pts, i)), dropFt));
      lines.push({ line, dropFt, biomes, materials, order: byTotal(materials) });
    }
    const erosion: PlannedLine[] = [];
    if (s.erosion)
      for (const line of cliffLines(s.source, { grid: s.grid, noiseCells: CLIFF_NOISE_CELLS * 0.6, erosion: true }, erosionCache)) {
        // Only edges of some length: rough ground gives specks, not edges.
        if (line.points.length < 2 || pathLength(line.points) < cell * 1.5) continue;
        // One material per edge: the one at its start, as for a low step.
        const at = line.points[0]!;
        const materials = [materialWeights(biomeWeightsAtPx(s.source.blocks, s.grid, at), s.palette, classWeightsAtPx(s.source.blocks, s.grid, at), s.stepFt)];
        erosion.push({ line, dropFt: s.stepFt, biomes: [], materials, order: byTotal(materials).slice(0, 1) });
      }
    const atlases = new Set<string>();
    for (const l of [...lines, ...erosion]) for (const m of l.order) atlases.add(`${m}|${bandVariant(m, l.dropFt)}`);
    return { key, lines, erosion, atlases: [...atlases] };
  };

  const build = (s: TerrainShape, textures: ReadonlyMap<TerrainBiome, TerrainTextures>, cliffPlan: CliffPlan | null, atlases: ReadonlyMap<string, BandAtlas>) => {
    ground.set({ blocks: s.source.blocks, grid: s.grid, palette: s.palette, textures, area: s.area, overPicture: s.overPicture });
    shade.set(s.overPicture ? null : { blocks: s.source.blocks, grid: s.grid, stepFt: s.stepFt, lightAngle: s.lightAngle });
    // The baked blocks (E-90) are baked again where blocks changed, all of them when the cliffs were built again.
    const toBake = () => bake.update({ blocks: s.source.blocks, grid: s.grid, area: s.area, look: JSON.stringify([s.palette, s.stepFt, s.perspective, s.lightAngle, s.erosion, s.overPicture, s.source.missingIsUnknown]), cliffs: cliffBuilds });
    // Painting fine height or ground that leaves every cliff as it was keeps them.
    if (!cliffPlan || sameKey(cliffsFrom, cliffPlan.key)) {
      toBake();
      redraw();
      return;
    }
    cliffsFrom = cliffPlan.key;
    cliffBuilds++;
    clearCliffs();
    const cell = s.grid.cellWidth;
    const soilLayer = new Container();
    const aoLayer = new Container();
    const faces = new Container();
    const overhang = new Container();
    const rubble = new Graphics();
    const rim = new Graphics();
    const widthFactor = (p: Pt) => 1 + WIDTH_WANDER * noise2(p.x / (cell * 0.9), p.y / (cell * 0.9), 17);
    const soilWidth = (p: Pt) => 0.05 + 1.1 * Math.max(0, noise2(p.x / (cell * 1.4), p.y / (cell * 1.4), 83));
    const patches = [...textures.values()][0]!.patches;
    const atlasOf = (m: CliffMaterial, dropFt: number) => atlases.get(`${m}|${bandVariant(m, dropFt)}`)!;
    // Where a slope ends a cliff, it runs out to a point over about a cell (E-89); its foot and hems too –
    // not where only its drop changes or the known ground ends.
    const taper = cell;
    for (const { line, dropFt, biomes, materials, order } of cliffPlan.lines) {
      if (!order.length) continue;
      const main = order[0]!;
      const seed = hashNoise(line.points[0]!.x, line.points[0]!.y, 91) * 100;
      const width = Math.min(MAX_BAND_CELLS, (dropFt / 10) * s.perspective) * cell;
      // A wide band hangs its foot from a calmer line, or the edge's small wiggles fan it out (low bands keep the accepted look).
      const footSmooth = Math.max(0, width - cell * 0.5) * 0.5;
      const band = cliffBand(line.points, line.closed, width, { textureLength: cell * MODULE_CELLS, lightAngle: s.lightAngle, widthFactor, taper, runOut: line.runOut, footSmooth });
      // Its materials, the strongest first: drawn whole, the others over it where they hold – where the ground above changes, about there the cliff does too.
      order.forEach((m, n) => {
        const alpha = n === 0 ? undefined : materials.map((w) => smoothRange(0.3, 0.7, w.get(m) ?? 0));
        faces.addChild(faceMesh(band, m, atlasOf(m, dropFt), bandVariant(m, dropFt), patches, seed, alpha));
      });
      // The ground hanging over the edge: per biome on top, not over built walls.
      const lip = cliffBand(line.points, line.closed, cell * 0.22, { textureLength: cell * LIP_CELLS, lightAngle: s.lightAngle, taper, runOut: line.runOut, arcWidth: (p) => width * widthFactor(p) });
      const built = materials.map((w) => [...w].reduce((sum, [m, x]) => sum + (BUILT.has(m) ? x : 0), 0));
      const slots = biomeSlots(biomes, s.palette, textures);
      slots.forEach((slot, n) => {
        const biome = s.palette[slot]!;
        if (!LIPS[biome]) return;
        const alpha = biomes.map((w, i) => (n === 0 ? 1 : smoothRange(0.3, 0.7, w[slot]!)) * (1 - smoothRange(0.3, 0.7, built[i]!)));
        if (alpha.every((a) => a <= 0)) return;
        overhang.addChild(mesh(lip, OVERHANG, textures.get(biome)!.ground.texture, patches, alpha));
      });
      const feet = bandFoot(band, line.closed);
      // Smoothed, so mitred corners of the foot leave no slivers in the hems; the AO smoother still.
      const foot = chaikin(feet, line.closed, 2);
      const hem = chaikin(feet, line.closed, 4);
      // Auto at the foot: each biome's gravel, blended along the foot like the face (its points map onto the line's in order).
      slots.forEach((slot, n) => {
        const tex = textures.get(s.palette[slot]!)!;
        const gravel = tex.classes.get('gravel') ?? tex.ground;
        // The gravel at its own size: u runs over a tile, v over the hem's share of one.
        const soilBand = cliffBand(foot, line.closed, cell * 0.6, { textureLength: gravel.tileCells * cell, lightAngle: s.lightAngle, widthFactor: soilWidth, taper, runOut: line.runOut });
        const footPoints = line.closed ? foot.length + 1 : foot.length;
        const alpha = n === 0 ? undefined : Array.from({ length: footPoints }, (_, j) => smoothRange(0.3, 0.7, biomes[Math.round((j * (biomes.length - 1)) / Math.max(1, footPoints - 1))]![slot]!));
        soilLayer.addChild(mesh(soilBand, soil(0.6 / gravel.tileCells), gravel.texture, undefined, alpha));
      });
      aoLayer.addChild(mesh(cliffBand(hem, line.closed, cell * 0.4, { textureLength: cell, lightAngle: s.lightAngle, taper, runOut: line.runOut }), AO, patches));
      const stoneColour = MATERIAL_LOOKS[main].stone;
      // Scree in a few heaps at the foot, smaller the further it rolled.
      for (const { p, normal } of alongLine(foot, line.closed, cell * 0.1)) {
        const heap = noise2(p.x / (cell * 1.6), p.y / (cell * 1.6), 81) > 0.45;
        if (hashNoise(p.x, p.y, 41) > (heap ? 0.3 : 0.008)) continue;
        const out = hashNoise(p.x, p.y, 43) ** 1.6 * cell * 0.55;
        const size = cell * (0.09 - (out / (cell * 0.55)) * 0.06) * (0.6 + hashNoise(p.y, p.x, 45) * 0.8);
        stone(rubble, { x: p.x + normal.x * out, y: p.y + normal.y * out }, size, 51, stoneColour);
      }
      // A broken rim: rare stones on the edge – none on built walls.
      if (BUILT.has(main)) continue;
      for (const { p, normal } of alongLine(line.points, line.closed, cell * 0.25)) {
        if (hashNoise(p.x, p.y, 61) > 0.025) continue;
        const off = (hashNoise(p.y, p.x, 63) - 0.6) * cell * 0.1;
        stone(rim, { x: p.x + normal.x * off, y: p.y + normal.y * off }, cell * (0.04 + hashNoise(p.x, p.y, 65) * 0.05), 71, stoneColour);
      }
    }
    // Erosion edges (E-89): low bands of the material's face where the fine height is steep, no walls, no overhang.
    const erosion = new Container();
    for (const { line, dropFt, order } of cliffPlan.erosion) {
      const m = order[0];
      if (!m) continue;
      const width = 0.2 * cell;
      const band = cliffBand(line.points, line.closed, width, { textureLength: cell * MODULE_CELLS, lightAngle: s.lightAngle, widthFactor, taper: taper * 0.5 });
      erosion.addChild(mesh(cliffBand(line.points, line.closed, width * 1.4, { textureLength: cell, lightAngle: s.lightAngle, taper: taper * 0.5 }), AO, patches));
      erosion.addChild(faceMesh(band, m, atlasOf(m, dropFt), bandVariant(m, dropFt), patches, 0));
    }
    cliffs.addChild(soilLayer, aoLayer, erosion, faces);
    above.addChild(overhang, rubble, rim);
    toBake();
    redraw();
  };

  return {
    view,
    set(next) {
      if (same(next, wanted)) return;
      wanted = next;
      if (!next) {
        shown = null;
        cliffsFrom = null;
        ground.set(null);
        shade.set(null);
        bake.update(null);
        clearCliffs();
        redraw();
        building = Promise.resolve();
        return;
      }
      const stale = () => destroyed || wanted !== next || same(next, shown);
      building = (async () => {
        const loaded = await Promise.all(next.palette.flatMap((b) => (b ? [terrainTextures(b).then((t) => [b, t] as const)] : [])));
        // A newer shape may have come while the textures loaded.
        if (stale()) return;
        const cliffPlan = plan(next);
        const atlases = await Promise.all(
          (cliffPlan?.atlases ?? []).map(async (k) => {
            const [m, h] = k.split('|') as [CliffMaterial, Parameters<typeof bandAtlas>[1]];
            return [k, await bandAtlas(m, h)] as const;
          }),
        );
        if (stale()) return;
        shown = next;
        build(next, new Map(loaded), cliffPlan, new Map(atlases));
      })().catch((e: unknown) => console.error('The terrain could not be drawn.', e));
    },
    ready: () => building,
    prepare: (scale) => bake.prepare(scale),
    destroy() {
      destroyed = true;
      clearCliffs();
      ground.destroy();
      shade.destroy();
      bake.destroy();
      view.destroy({ children: true });
    },
  };
}
