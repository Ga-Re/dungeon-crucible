/**
 * The terrain layer (E-46, E-52, E-87): the ground of the map's terrain biome and its cliffs, as
 * accepted in the look spike (DC-127) – a band of the biome's rock below each top edge, wider with
 * the drop and wandering by ±35 %, lit by its turn to the light; foot AO and earth running out in
 * patches on the lower ground; the ground hanging over the edge (not in caves) with small bare
 * stone caps here and there; scree in a few heaps at the foot and rare stones on the rim. The same
 * lines as the DM's one-way walls (`core/build/terrain/cliffs.ts`); built anew only when the
 * blocks shown or the look change. Above the map, under the grid. Shared by the DM window and the TV.
 */
import { Container, Geometry, Graphics, Mesh, Shader, TilingSprite, type Texture } from 'pixi.js';
import { cliffBand, type BandMesh } from '../../core/build/geom/band';
import { chaikin, type Pt } from '../../core/build/geom/contours';
import { noise2 } from '../../core/build/handDrawn';
import { CLIFF_NOISE_CELLS, CliffCache, cliffLines, type CliffSource } from '../../core/build/terrain/cliffs';
import type { TerrainBiome } from '../../core/build/terrainKeys';
import { hashNoise } from '../../core/build/variance';
import type { GridConfig } from '../../core/grid';
import { terrainTextures, type TerrainTextures } from '../build/terrainTextures';

export interface TerrainShape {
  /** The blocks of the stack shown (base and active layers' patches). */
  readonly source: CliffSource;
  readonly grid: GridConfig;
  /** The map's terrain biome (the first of its palette until biome rasters come, DC-128c). */
  readonly biome: TerrainBiome;
  readonly stepFt: number;
  /** Band width in cells per 10 ft drop (Teil B §11.2). */
  readonly perspective: number;
  /** Where the light falls towards (degrees, map coordinates). */
  readonly lightAngle: number;
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

/** How a biome's cliffs look (E-87): ground over the edge, colours of stone caps, scree and earth. */
interface Look {
  readonly lip: boolean;
  readonly cap: Rgb;
  readonly stone: Rgb;
  readonly soil: Rgb;
}

const LOOKS: Record<TerrainBiome, Look> = {
  temperate: { lip: true, cap: [0.86, 0.8, 0.66], stone: [0.59, 0.47, 0.35], soil: [1, 1, 1] },
  dungeon: { lip: false, cap: [0.58, 0.6, 0.63], stone: [0.4, 0.41, 0.44], soil: [0.62, 0.62, 0.68] },
  swamp: { lip: true, cap: [0.42, 0.4, 0.26], stone: [0.33, 0.27, 0.2], soil: [0.62, 0.58, 0.5] },
  desert: { lip: true, cap: [0.95, 0.89, 0.76], stone: [0.8, 0.68, 0.5], soil: [1.25, 1.08, 0.8] },
  winter: { lip: true, cap: [0.93, 0.95, 0.98], stone: [0.45, 0.47, 0.5], soil: [0.85, 0.88, 0.95] },
};

/** The default grid's cell, the size the look was made for. */
const LOOK_CELL = 70;
/** How much a band's width wanders: protrusions and niches (DC-127). */
const WIDTH_WANDER = 0.35;
const MAX_BAND_CELLS = 2.5;

const glsl = (c: Rgb) => `vec3(${c.map((x) => x.toFixed(3)).join(', ')})`;

const VERTEX = `in vec2 aPosition;
in vec2 aUV;
in float aShade;
out vec2 vUV;
out float vShade;
uniform mat3 uProjectionMatrix;
uniform mat3 uWorldTransformMatrix;
uniform mat3 uTransformMatrix;
void main() {
  mat3 mvp = uProjectionMatrix * uWorldTransformMatrix * uTransformMatrix;
  gl_Position = vec4((mvp * vec3(aPosition, 1.0)).xy, 0.0, 1.0);
  vUV = aUV;
  vShade = aShade;
}`;

/** The face: a third of the painted strip's height (a few thick layers), gently lit, darker to the foot; stone caps at the top where the patches say so. */
const face = (look: Look) => `in vec2 vUV;
in float vShade;
uniform sampler2D uTexture;
uniform sampler2D uPatch;
out vec4 finalColor;
void main() {
  vec3 c = texture(uTexture, vec2(vUV.x * 1.6, 0.1 + vUV.y * 0.33)).rgb;
  float p = texture(uPatch, vec2(vUV.x * 0.35, 0.5)).r;
  float cap = smoothstep(0.66, 0.72, p) * (1.0 - smoothstep(0.1, 0.22, vUV.y));
  c = mix(c, ${glsl(look.cap)} + (c - 0.55) * 0.35, cap);
  float foot = mix(1.0, 0.55, vUV.y * vUV.y);
  finalColor = vec4(c * mix(0.85, 1.2, (vShade - 0.55) / 0.45) * foot, 1.0);
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
uniform sampler2D uTexture;
uniform sampler2D uPatch;
out vec4 finalColor;
void main() {
  vec3 c = texture(uTexture, vec2(vUV.x * 1.6, vUV.y * 0.15)).rgb;
  float tuft = texture(uTexture, vec2(vUV.x * 18.0, 0.5)).g;
  float reach = 0.25 + 0.75 * smoothstep(0.42, 0.62, tuft);
  float bare = smoothstep(0.62, 0.68, texture(uPatch, vec2(vUV.x * 0.35, 0.5)).r);
  float a = (1.0 - smoothstep(reach - 0.18, reach, vUV.y)) * (1.0 - bare);
  finalColor = vec4(c * (0.82 + 0.18 * (1.0 - vUV.y)) * a, a);
}`;

/** Earth running out into the lower ground, ragged and fading; tinted per biome. */
const soil = (look: Look) => `in vec2 vUV;
uniform sampler2D uTexture;
out vec4 finalColor;
void main() {
  vec3 c = texture(uTexture, vUV * vec2(1.0, 0.5)).rgb;
  float edge = texture(uTexture, vec2(vUV.x * 2.0, 0.7)).r;
  float a = (1.0 - smoothstep(0.35 + 0.4 * edge, 1.0, vUV.y)) * 0.85;
  finalColor = vec4(c * ${glsl(look.soil)} * a, a);
}`;

function mesh(m: BandMesh, fragment: string, texture: Texture, patch?: Texture): Mesh<Geometry, Shader> {
  const geometry = new Geometry({ attributes: { aPosition: m.positions, aUV: m.uvs, aShade: { buffer: m.shade, format: 'float32' } }, indexBuffer: m.indices });
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

/** True if `a` and `b` show the same: the same blocks (by identity) and the same look. */
function same(a: TerrainShape | null, b: TerrainShape | null): boolean {
  if (!a || !b) return a === b;
  if (a.biome !== b.biome || a.stepFt !== b.stepFt || a.perspective !== b.perspective || a.lightAngle !== b.lightAngle) return false;
  if (a.source.missingIsUnknown !== b.source.missingIsUnknown || a.source.blocks.size !== b.source.blocks.size) return false;
  if (JSON.stringify([a.grid, a.area]) !== JSON.stringify([b.grid, b.area])) return false;
  for (const [k, v] of a.source.blocks) if (b.source.blocks.get(k) !== v) return false;
  return true;
}

export function createTerrainLayer(redraw: () => void): TerrainLayer {
  const view = new Container();
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
  const clear = () => {
    for (const child of view.removeChildren()) {
      free(child);
      child.destroy({ children: true });
    }
  };

  const build = (s: TerrainShape, tex: TerrainTextures) => {
    clear();
    const cell = s.grid.cellWidth;
    const k = cell / LOOK_CELL;
    const look = LOOKS[s.biome];
    const ground = new TilingSprite({ texture: tex.ground, width: s.area.width, height: s.area.height });
    ground.position.set(s.area.x, s.area.y);
    ground.tileScale.set(k);
    ground.tilePosition.set(-s.area.x, -s.area.y);
    const soilLayer = new Container();
    const aoLayer = new Container();
    const faces = new Container();
    const overhang = new Container();
    const rubble = new Graphics();
    const rim = new Graphics();
    const widthFactor = (p: Pt) => 1 + WIDTH_WANDER * noise2(p.x / (cell * 0.9), p.y / (cell * 0.9), 17);
    const soilWidth = (p: Pt) => 0.05 + 1.1 * Math.max(0, noise2(p.x / (cell * 1.4), p.y / (cell * 1.4), 83));
    const faceShader = face(look);
    const soilShader = soil(look);
    for (const line of cliffLines(s.source, { grid: s.grid, noiseCells: CLIFF_NOISE_CELLS }, cache)) {
      if (line.points.length < 2) continue;
      const width = Math.min(MAX_BAND_CELLS, ((line.drop * s.stepFt) / 10) * s.perspective) * cell;
      const band = cliffBand(line.points, line.closed, width, { textureLength: cell * 4, lightAngle: s.lightAngle, widthFactor });
      const feet: Pt[] = [];
      for (let i = 0; i < band.positions.length; i += 4) feet.push({ x: band.positions[i + 2]!, y: band.positions[i + 3]! });
      if (line.closed) feet.pop();
      // Smoothed, so mitred corners of the foot leave no slivers in the hems; the AO smoother still.
      const foot = chaikin(feet, line.closed, 2);
      const hem = chaikin(feet, line.closed, 4);
      soilLayer.addChild(mesh(cliffBand(foot, line.closed, cell * 0.6, { textureLength: cell * 2, lightAngle: s.lightAngle, widthFactor: soilWidth }), soilShader, tex.earth));
      aoLayer.addChild(mesh(cliffBand(hem, line.closed, cell * 0.4, { textureLength: cell, lightAngle: s.lightAngle }), AO, tex.band));
      // Face and overhang share their arc length, so caps and overhang never overlap.
      faces.addChild(mesh(band, faceShader, tex.band, tex.patches));
      if (look.lip) overhang.addChild(mesh(cliffBand(line.points, line.closed, cell * 0.22, { textureLength: cell * 4, lightAngle: s.lightAngle }), OVERHANG, tex.ground, tex.patches));
      // Scree in a few heaps at the foot, smaller the further it rolled.
      for (const { p, normal } of alongLine(foot, line.closed, cell * 0.1)) {
        const heap = noise2(p.x / (cell * 1.6), p.y / (cell * 1.6), 81) > 0.45;
        if (hashNoise(p.x, p.y, 41) > (heap ? 0.3 : 0.008)) continue;
        const out = hashNoise(p.x, p.y, 43) ** 1.6 * cell * 0.55;
        const size = cell * (0.09 - (out / (cell * 0.55)) * 0.06) * (0.6 + hashNoise(p.y, p.x, 45) * 0.8);
        stone(rubble, { x: p.x + normal.x * out, y: p.y + normal.y * out }, size, 51, look.stone);
      }
      // A broken rim: rare stones on the edge.
      for (const { p, normal } of alongLine(line.points, line.closed, cell * 0.25)) {
        if (hashNoise(p.x, p.y, 61) > 0.025) continue;
        const off = (hashNoise(p.y, p.x, 63) - 0.6) * cell * 0.1;
        stone(rim, { x: p.x + normal.x * off, y: p.y + normal.y * off }, cell * (0.04 + hashNoise(p.x, p.y, 65) * 0.05), 71, look.stone);
      }
    }
    view.addChild(ground, soilLayer, aoLayer, faces, overhang, rubble, rim);
    redraw();
  };

  return {
    view,
    set(next) {
      if (same(next, wanted)) return;
      wanted = next;
      if (!next) {
        shown = null;
        clear();
        redraw();
        return;
      }
      terrainTextures(next.biome)
        .then((tex) => {
          // A newer shape may have come while the textures loaded.
          if (destroyed || wanted !== next || same(next, shown)) return;
          shown = next;
          build(next, tex);
        })
        .catch((e: unknown) => console.error('The terrain could not be drawn.', e));
    },
    destroy() {
      destroyed = true;
      clear();
      view.destroy();
    },
  };
}
