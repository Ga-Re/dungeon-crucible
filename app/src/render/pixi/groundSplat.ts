/**
 * The ground of the terrain (E-88): the first biome's own ground over the whole map, then per
 * block its other biomes and its painted ground classes in the biome they lie in. Every layer is
 * one quad with the same shader: the texture, its variant laid in large patches against repetition,
 * and a mask read from the block's weights whose edge is broken up by noise – ragged transitions,
 * small islands and tongues, between classes as between biomes. The weights come per block as
 * small data textures (its points and its neighbours' first ones, so blocks meet without a seam);
 * a block's layers are built again only when it or a neighbour it reads changed. Shared by the DM
 * window and the TV.
 */
import { BufferImageSource, Container, Geometry, Mesh, Shader, Texture, UniformGroup } from 'pixi.js';
import { BLOCK_CELLS, BLOCK_POINTS, type RasterBlock } from '../../core/build/terrain/block';
import { BIOME_CLASSES, GROUND_CLASSES } from '../../core/build/terrain/groundTool';
import { blockGround, CELL_SIDE, neighbourKeys, POINT_SIDE } from '../../core/build/terrain/groundSample';
import type { TerrainBiome } from '../../core/build/terrainKeys';
import { fromCellSpace, type GridConfig } from '../../core/grid';
import type { Surface, TerrainTextures } from '../build/terrainTextures';

export interface GroundInput {
  readonly blocks: ReadonlyMap<string, RasterBlock>;
  readonly grid: GridConfig;
  readonly palette: readonly (TerrainBiome | null)[];
  readonly textures: ReadonlyMap<TerrainBiome, TerrainTextures>;
  /** The map's area (map px): the first biome's ground covers it. */
  readonly area: { readonly x: number; readonly y: number; readonly width: number; readonly height: number };
}

/** The default grid's cell, the size the textures were made for: a 512 px tile spans about seven cells. */
const LOOK_CELL = 70;
const TILE = 512;

const VERTEX = `in vec2 aPosition;
in vec2 aLocal;
out vec2 vWorld;
out vec2 vLocal;
uniform mat3 uProjectionMatrix;
uniform mat3 uWorldTransformMatrix;
uniform mat3 uTransformMatrix;
void main() {
  mat3 mvp = uProjectionMatrix * uWorldTransformMatrix * uTransformMatrix;
  gl_Position = vec4((mvp * vec3(aPosition, 1.0)).xy, 0.0, 1.0);
  vWorld = aPosition;
  vLocal = aLocal;
}`;

/**
 * A ground layer, drawn over what lies below it. `uClassMask`: it covers its share of the classes
 * up to and with it (R / G of the point data, Auto first); `uBiomeMask`: the share of palette place
 * `uSlot` of the places up to and with it (`uCum`, cells). The edge of a mask is where the share,
 * shifted by noise, passes a half – the same noise for every class and for every biome, so the
 * shares fit together without holes: a half shows as islands over half the ground.
 */
const FRAGMENT = `in vec2 vWorld;
in vec2 vLocal;
uniform sampler2D uTex;
uniform sampler2D uVar;
uniform sampler2D uWeights;
uniform sampler2D uBiomes;
uniform float uTile;
uniform float uCell;
uniform float uSeed;
uniform float uHasVar;
uniform float uClassMask;
uniform float uBiomeMask;
uniform vec4 uSlot;
uniform vec4 uCum;
out vec4 finalColor;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p) { return 0.55 * vnoise(p) + 0.3 * vnoise(p * 2.3 + 5.1) + 0.15 * vnoise(p * 5.3 + 9.7); }
float ragged(float w, vec2 at, float seed) {
  // Coarse noise moves the edge into islands and tongues, fine noise frays it.
  float n = (fbm(at + seed) - 0.5) * 1.2 + (vnoise(at * 5.0 + seed * 1.7) - 0.5) * 0.25;
  return smoothstep(0.43, 0.57, w + n * smoothstep(0.0, 0.25, w) * (1.0 - smoothstep(0.75, 1.0, w)) * 2.0);
}
void main() {
  vec2 uv = vWorld / uTile;
  vec3 c = texture(uTex, uv).rgb;
  if (uHasVar > 0.5) {
    float v = smoothstep(0.4, 0.6, fbm(vWorld / (uCell * 6.0) + uSeed * 0.37 + 17.0));
    c = mix(c, texture(uVar, uv + vec2(0.37, 0.61)).rgb, v);
  }
  float a = 1.0;
  if (uClassMask > 0.5) {
    vec4 w = texture(uWeights, (vLocal + 0.5) / ${POINT_SIDE}.0);
    a *= ragged(w.r / max(w.g, 0.001), vWorld / (uCell * 0.9), 23.0);
  }
  if (uBiomeMask > 0.5) {
    // Cell centres, a ring of the neighbours' cells around the block's own.
    vec4 b = texture(uBiomes, (vLocal / 4.0 + 1.0) / ${CELL_SIDE}.0);
    a *= ragged(dot(b, uSlot) / max(dot(b, uCum), 0.001), vWorld / (uCell * 1.4), 41.0);
  }
  finalColor = vec4(c * a, a);
}`;

type Layer = Mesh<Geometry, Shader>;

/** A quad over block (bx, by) – or the given corners in map px – with its local point coordinates. */
function quad(corners: readonly { x: number; y: number }[]): Geometry {
  const local = [0, 0, BLOCK_POINTS, 0, BLOCK_POINTS, BLOCK_POINTS, 0, BLOCK_POINTS];
  return new Geometry({
    attributes: { aPosition: new Float32Array(corners.flatMap((p) => [p.x, p.y])), aLocal: new Float32Array(local) },
    indexBuffer: new Uint32Array([0, 1, 2, 0, 2, 3]),
  });
}

function layer(geometry: Geometry, surface: Surface, cell: number, opts: { weights?: Texture; biomes?: Texture; slot?: number; seed: number }): Layer {
  const uniforms = new UniformGroup({
    uTile: { value: (TILE * cell) / LOOK_CELL, type: 'f32' },
    uCell: { value: cell, type: 'f32' },
    uSeed: { value: opts.seed, type: 'f32' },
    uHasVar: { value: surface.variant ? 1 : 0, type: 'f32' },
    uClassMask: { value: opts.weights ? 1 : 0, type: 'f32' },
    uBiomeMask: { value: opts.biomes ? 1 : 0, type: 'f32' },
    uSlot: { value: new Float32Array([0, 1, 2, 3].map((i) => (i === (opts.slot ?? 0) ? 1 : 0))), type: 'vec4<f32>' },
    uCum: { value: new Float32Array([0, 1, 2, 3].map((i) => (i <= (opts.slot ?? 0) ? 1 : 0))), type: 'vec4<f32>' },
  });
  // Samplers need a texture each, used or not.
  const blank = surface.texture.source;
  const shader = Shader.from({
    gl: { vertex: VERTEX, fragment: FRAGMENT },
    resources: { uTex: surface.texture.source, uVar: surface.variant?.source ?? blank, uWeights: opts.weights?.source ?? blank, uBiomes: opts.biomes?.source ?? blank, ground: uniforms },
  });
  return new Mesh({ geometry, shader, texture: surface.texture });
}

/** Weights as a texture: linear, clamped at the edge, uploaded as they are (not multiplied by their alpha – it holds a weight too). */
function dataTexture(data: Uint8Array, side: number): Texture {
  const source = new BufferImageSource({ resource: data, width: side, height: side, format: 'rgba8unorm', alphaMode: 'no-premultiply-alpha' });
  source.style.addressMode = 'clamp-to-edge';
  source.style.scaleMode = 'linear';
  return new Texture({ source });
}

interface Built {
  readonly refs: readonly (RasterBlock | undefined)[];
  readonly view: Container;
  readonly data: Texture[];
}

/** Frees a layer's GPU resources (Pixi 8 leaves geometry, buffers and shader behind). */
function free(node: Container): void {
  for (const child of node.children) free(child);
  if (node instanceof Mesh) {
    node.geometry.destroy(true);
    node.shader?.destroy();
  }
}

export function createGroundLayer(): { readonly view: Container; set(input: GroundInput | null): void; destroy(): void } {
  const view = new Container();
  const base = new Container();
  const blocks = new Container();
  view.addChild(base, blocks);
  const built = new Map<string, Built>();
  let lookKey = '';

  const drop = (b: Built) => {
    blocks.removeChild(b.view);
    free(b.view);
    b.view.destroy({ children: true });
    for (const t of b.data) t.destroy(true);
  };
  const clearAll = () => {
    for (const b of built.values()) drop(b);
    built.clear();
    for (const child of base.removeChildren()) {
      free(child);
      child.destroy({ children: true });
    }
  };

  const buildBlock = (key: string, refs: readonly (RasterBlock | undefined)[], input: GroundInput): Built => {
    const [bx, by] = key.split('_').map(Number) as [number, number];
    const cell = input.grid.cellWidth;
    const corners = [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
    ].map(([u, v]) => fromCellSpace(input.grid, { x: (bx + u!) * BLOCK_CELLS, y: (by + v!) * BLOCK_CELLS }));
    const g = blockGround(bx, by, input.blocks);
    const out = new Container();
    const data: Texture[] = [];
    const biomes = g.slots.size ? dataTexture(g.biomes, CELL_SIDE) : undefined;
    if (biomes) data.push(biomes);
    // The other biomes' own ground over the first's.
    for (const slot of [...g.slots].sort()) {
      const biome = input.palette[slot];
      const tex = biome ? input.textures.get(biome) : undefined;
      if (tex) out.addChild(layer(quad(corners), tex.ground, cell, { biomes, slot, seed: 3 + slot }));
    }
    // Painted classes by number, each over what lies below; in the first biome whole, in the others
    // over it by their share – a class the biome lacks shows its Auto there.
    for (const [id, weights] of [...g.classes].sort((a, b) => a[0] - b[0])) {
      const cls = GROUND_CLASSES[id - 1];
      if (!cls) continue;
      const w = dataTexture(weights, POINT_SIDE);
      data.push(w);
      for (const slot of [0, ...[...g.slots].sort()]) {
        const biome = input.palette[slot];
        const surface = biome && BIOME_CLASSES[biome].includes(cls) ? input.textures.get(biome)?.classes.get(cls) : undefined;
        if (surface) out.addChild(layer(quad(corners), surface, cell, { weights: w, biomes: slot ? biomes : undefined, slot, seed: 11 + id * 7 }));
      }
    }
    blocks.addChild(out);
    return { refs, view: out, data };
  };

  return {
    view,
    set(input) {
      if (!input) {
        clearAll();
        lookKey = '';
        return;
      }
      const key = JSON.stringify([input.grid, input.palette, input.area]);
      if (key !== lookKey) {
        clearAll();
        lookKey = key;
        const first = input.palette[0] ? input.textures.get(input.palette[0]) : undefined;
        if (first) {
          const a = input.area;
          const corners = [
            { x: a.x, y: a.y },
            { x: a.x + a.width, y: a.y },
            { x: a.x + a.width, y: a.y + a.height },
            { x: a.x, y: a.y + a.height },
          ];
          base.addChild(layer(quad(corners), first.ground, input.grid.cellWidth, { seed: 1 }));
        }
      }
      // A block's data reads its neighbours: the blocks around a painted one are drawn too, so its
      // ground and its biomes run out across its edges as they do inside.
      const keys = new Set<string>();
      for (const k of input.blocks.keys()) {
        const [bx, by] = k.split('_').map(Number) as [number, number];
        for (const n of neighbourKeys(bx, by)) keys.add(n);
      }
      for (const [k, b] of built) {
        if (keys.has(k)) continue;
        drop(b);
        built.delete(k);
      }
      for (const k of keys) {
        const [bx, by] = k.split('_').map(Number) as [number, number];
        const refs = neighbourKeys(bx, by).map((r) => input.blocks.get(r));
        const had = built.get(k);
        if (had && had.refs.every((r, i) => r === refs[i])) continue;
        if (had) drop(had);
        built.set(k, buildBlock(k, refs, input));
      }
    },
    destroy() {
      clearAll();
      view.destroy({ children: true });
    },
  };
}
