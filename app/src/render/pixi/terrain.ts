/**
 * The terrain layer (E-46, E-52, E-87, E-88): the ground – biomes and painted classes, see
 * `groundSplat.ts` – and the cliffs in the look of the biome on their upper side, as
 * accepted in the look spike (DC-127) – a band of the biome's rock below each top edge, wider with
 * the drop and wandering by ±35 %, lit by its turn to the light; foot AO and earth running out in
 * patches on the lower ground; the ground hanging over the edge (not in caves) with small bare
 * stone caps here and there; scree in a few heaps at the foot and rare stones on the rim. The same
 * lines as the DM's one-way walls (`core/build/terrain/cliffs.ts`); built anew only when the
 * blocks shown or the look change. Above the map, under the grid. Shared by the DM window and the TV.
 */
import { Container, Geometry, Graphics, Mesh, Shader, type Renderer, type Texture } from 'pixi.js';
import { bandFoot, cliffBand, type BandMesh } from '../../core/build/geom/band';
import { chaikin, type Pt } from '../../core/build/geom/contours';
import { noise2 } from '../../core/build/handDrawn';
import { CLIFF_NOISE_CELLS, CliffCache, cliffLines, type CliffSource } from '../../core/build/terrain/cliffs';
import type { TerrainBiome } from '../../core/build/terrainKeys';
import { hashNoise } from '../../core/build/variance';
import type { GridConfig } from '../../core/grid';
import { terrainTextures, type TerrainTextures } from '../build/terrainTextures';
import { biomeWeightsAtPx } from '../../core/build/terrain/groundSample';
import { createGroundLayer } from './groundSplat';
import { createShadeLayer } from './shading';

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
  /** The ground's area (map px): the drawn map's. */
  readonly area: { readonly x: number; readonly y: number; readonly width: number; readonly height: number };
}

export interface TerrainLayer {
  readonly view: Container;
  /** Shows the terrain (`null`: none); the same blocks and look again change nothing. */
  set(shape: TerrainShape | null): void;
  destroy(): void;
}

type Rgb = readonly [number, number, number];

/** How a biome's cliffs look (E-87): ground over the edge, colours of stone caps and scree. */
interface Look {
  readonly lip: boolean;
  readonly cap: Rgb;
  readonly stone: Rgb;
}

const LOOKS: Record<TerrainBiome, Look> = {
  temperate: { lip: true, cap: [0.86, 0.8, 0.66], stone: [0.59, 0.47, 0.35] },
  dungeon: { lip: false, cap: [0.58, 0.6, 0.63], stone: [0.4, 0.41, 0.44] },
  swamp: { lip: true, cap: [0.42, 0.4, 0.26], stone: [0.33, 0.27, 0.2] },
  desert: { lip: true, cap: [0.95, 0.89, 0.76], stone: [0.8, 0.68, 0.5] },
  winter: { lip: true, cap: [0.93, 0.95, 0.98], stone: [0.45, 0.47, 0.5] },
};

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

/** The face: a third of the painted strip's height (a few thick layers), gently lit, darker to the foot; stone caps at the top where the patches say so. */
const face = (look: Look) => `in vec2 vUV;
in float vShade;
in float vAlpha;
uniform sampler2D uTexture;
uniform sampler2D uPatch;
out vec4 finalColor;
void main() {
  vec3 c = texture(uTexture, vec2(vUV.x * 1.6, 0.1 + vUV.y * 0.33)).rgb;
  float p = texture(uPatch, vec2(vUV.x * 0.35, 0.5)).r;
  float cap = smoothstep(0.66, 0.72, p) * (1.0 - smoothstep(0.1, 0.22, vUV.y));
  c = mix(c, ${glsl(look.cap)} + (c - 0.55) * 0.35, cap);
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
function mesh(m: BandMesh, fragment: string, texture: Texture, patch?: Texture, alpha?: readonly number[]): Mesh<Geometry, Shader> {
  const a = new Float32Array(m.shade.length);
  // Alpha per point of the line: a corner's vertices take their point's.
  for (let i = 0; i < a.length; i++) a[i] = alpha ? alpha[Math.min(alpha.length - 1, m.at[i >> 1]!)]! : 1;
  const geometry = new Geometry({ attributes: { aPosition: m.positions, aUV: m.uvs, aShade: { buffer: m.shade, format: 'float32' }, aAlpha: { buffer: a, format: 'float32' } }, indexBuffer: m.indices });
  const shader = Shader.from({ gl: { vertex: VERTEX, fragment }, resources: { uTexture: texture.source, ...(patch ? { uPatch: patch.source } : {}) } });
  return new Mesh({ geometry, shader, texture });
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

function smoothRange(e0: number, e1: number, v: number): number {
  const x = Math.max(0, Math.min(1, (v - e0) / (e1 - e0)));
  return x * x * (3 - 2 * x);
}

/** True if `a` and `b` show the same: the same blocks (by identity) and the same look. */
function same(a: TerrainShape | null, b: TerrainShape | null): boolean {
  if (!a || !b) return a === b;
  if (a.palette.join() !== b.palette.join() || a.erosion !== b.erosion || a.stepFt !== b.stepFt || a.perspective !== b.perspective || a.lightAngle !== b.lightAngle) return false;
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
  view.addChild(ground.view, cliffs, shade.view, above);
  const erosionCache = new CliffCache();
  const cache = new CliffCache();
  let shown: TerrainShape | null = null;
  let wanted: TerrainShape | null = null;
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

  /** What the cliffs were built from: the blocks' step and biome planes (never changed, only replaced) and the look. */
  let cliffsFrom: { planes: unknown[]; look: string } | null = null;

  const build = (s: TerrainShape, textures: ReadonlyMap<TerrainBiome, TerrainTextures>) => {
    ground.set({ blocks: s.source.blocks, grid: s.grid, palette: s.palette, textures, area: s.area });
    shade.set({ blocks: s.source.blocks, grid: s.grid, stepFt: s.stepFt, lightAngle: s.lightAngle });
    // Painting ground leaves steps and biomes as they were: the cliffs stay; fine height matters only to erosion edges.
    const planes = [...s.source.blocks].flatMap(([k, b]) => [k, b.planes.step, b.planes.slope, s.erosion ? b.planes.relief : null, b.planes.biome1, b.planes.biome2, b.planes.biome3, b.planes.biome4]);
    const look = JSON.stringify([s.palette, s.stepFt, s.perspective, s.lightAngle, s.grid, s.source.missingIsUnknown, s.erosion]);
    if (cliffsFrom && cliffsFrom.look === look && cliffsFrom.planes.length === planes.length && cliffsFrom.planes.every((x, i) => x === planes[i])) {
      redraw();
      return;
    }
    cliffsFrom = { planes, look };
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
    // Where a slope ends a cliff, it runs out to a point over about a cell (E-89); its foot and hems too.
    const taper = cell;
    for (const line of cliffLines(s.source, { grid: s.grid, noiseCells: CLIFF_NOISE_CELLS }, cache)) {
      if (line.points.length < 2) continue;
      const pts = line.closed ? [...line.points, line.points[0]!] : [...line.points];
      // The biome on the upper side at each point (E-88): a little to the left of the line.
      const weights = pts.map((p, i) => {
        const a = pts[Math.max(0, i - 1)]!;
        const b = pts[Math.min(pts.length - 1, i + 1)]!;
        const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
        return biomeWeightsAtPx(s.source.blocks, s.grid, { x: p.x + ((b.y - a.y) / len) * cell * 0.35, y: p.y - ((b.x - a.x) / len) * cell * 0.35 });
      });
      // Its biomes, the strongest first: drawn whole, the others over it where they hold.
      const totals = [0, 1, 2, 3].map((k) => weights.reduce((sum, w) => sum + w[k]!, 0));
      const slots = [0, 1, 2, 3].filter((k) => totals[k]! > 0 && s.palette[k] && textures.has(s.palette[k]!)).sort((a, b) => totals[b]! - totals[a]!);
      if (!slots.length) continue;
      const main = s.palette[slots[0]!]!;
      const mainLook = LOOKS[main];
      const mainTex = textures.get(main)!;
      const width = Math.min(MAX_BAND_CELLS, ((line.drop * s.stepFt) / 10) * s.perspective) * cell;
      const band = cliffBand(line.points, line.closed, width, { textureLength: cell * 4, lightAngle: s.lightAngle, widthFactor, taper });
      const lip = cliffBand(line.points, line.closed, cell * 0.22, { textureLength: cell * 4, lightAngle: s.lightAngle, taper });
      slots.forEach((slot, n) => {
        const biome = s.palette[slot]!;
        const tex = textures.get(biome)!;
        // Where the ground changes biome, about there the cliff does too (the ground's edge is at a half).
        const alpha = n === 0 ? undefined : weights.map((w) => smoothRange(0.3, 0.7, w[slot]!));
        // Face and overhang share their arc length, so caps and overhang never overlap.
        faces.addChild(mesh(band, face(LOOKS[biome]), tex.band, tex.patches, alpha));
        if (LOOKS[biome].lip) overhang.addChild(mesh(lip, OVERHANG, tex.ground.texture, tex.patches, alpha));
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
        const soilBand = cliffBand(foot, line.closed, cell * 0.6, { textureLength: gravel.tileCells * cell, lightAngle: s.lightAngle, widthFactor: soilWidth, taper });
        const footPoints = line.closed ? foot.length + 1 : foot.length;
        const alpha = n === 0 ? undefined : Array.from({ length: footPoints }, (_, j) => smoothRange(0.3, 0.7, weights[Math.round((j * (weights.length - 1)) / Math.max(1, footPoints - 1))]![slot]!));
        soilLayer.addChild(mesh(soilBand, soil(0.6 / gravel.tileCells), gravel.texture, undefined, alpha));
      });
      aoLayer.addChild(mesh(cliffBand(hem, line.closed, cell * 0.4, { textureLength: cell, lightAngle: s.lightAngle, taper }), AO, mainTex.band));
      // Scree in a few heaps at the foot, smaller the further it rolled.
      for (const { p, normal } of alongLine(foot, line.closed, cell * 0.1)) {
        const heap = noise2(p.x / (cell * 1.6), p.y / (cell * 1.6), 81) > 0.45;
        if (hashNoise(p.x, p.y, 41) > (heap ? 0.3 : 0.008)) continue;
        const out = hashNoise(p.x, p.y, 43) ** 1.6 * cell * 0.55;
        const size = cell * (0.09 - (out / (cell * 0.55)) * 0.06) * (0.6 + hashNoise(p.y, p.x, 45) * 0.8);
        stone(rubble, { x: p.x + normal.x * out, y: p.y + normal.y * out }, size, 51, mainLook.stone);
      }
      // A broken rim: rare stones on the edge.
      for (const { p, normal } of alongLine(line.points, line.closed, cell * 0.25)) {
        if (hashNoise(p.x, p.y, 61) > 0.025) continue;
        const off = (hashNoise(p.y, p.x, 63) - 0.6) * cell * 0.1;
        stone(rim, { x: p.x + normal.x * off, y: p.y + normal.y * off }, cell * (0.04 + hashNoise(p.x, p.y, 65) * 0.05), 71, mainLook.stone);
      }
    }
    // Erosion edges (E-89): low bands of the biome's rock where the fine height is steep, no walls, no overhang.
    const erosion = new Container();
    if (s.erosion)
      for (const line of cliffLines(s.source, { grid: s.grid, noiseCells: CLIFF_NOISE_CELLS * 0.6, erosion: true }, erosionCache)) {
        // Only edges of some length: rough ground gives specks, not edges.
        if (line.points.length < 2 || pathLength(line.points) < cell * 1.5) continue;
        const w = biomeWeightsAtPx(s.source.blocks, s.grid, line.points[0]!);
        const biome = s.palette[w.indexOf(Math.max(...w))] ?? s.palette[0];
        const tex = biome ? textures.get(biome) : undefined;
        if (!biome || !tex) continue;
        const width = 0.2 * cell;
        const band = cliffBand(line.points, line.closed, width, { textureLength: cell * 4, lightAngle: s.lightAngle, widthFactor, taper: taper * 0.5 });
        erosion.addChild(mesh(cliffBand(line.points, line.closed, width * 1.4, { textureLength: cell, lightAngle: s.lightAngle, taper: taper * 0.5 }), AO, tex.band));
        erosion.addChild(mesh(band, face(LOOKS[biome]), tex.band, tex.patches));
      }
    cliffs.addChild(soilLayer, aoLayer, erosion, faces);
    above.addChild(overhang, rubble, rim);
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
        clearCliffs();
        redraw();
        return;
      }
      Promise.all(next.palette.flatMap((b) => (b ? [terrainTextures(b).then((t) => [b, t] as const)] : [])))
        .then((loaded) => {
          // A newer shape may have come while the textures loaded.
          if (destroyed || wanted !== next || same(next, shown)) return;
          shown = next;
          build(next, new Map(loaded));
        })
        .catch((e: unknown) => console.error('The terrain could not be drawn.', e));
    },
    destroy() {
      destroyed = true;
      clearCliffs();
      ground.destroy();
      shade.destroy();
      view.destroy({ children: true });
    },
  };
}
