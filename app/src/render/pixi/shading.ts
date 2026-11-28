/**
 * Light and shadow of the terrain (E-89, Teil B §20.2–20.3): per block a shader reads the block's
 * heights with their halo (`core/build/terrain/heightField.ts`) and works out how much darker or
 * lighter the ground below is – slopes by their turn to the sun (hillshade; a cliff's sheer drop is
 * left to its band), cast shadows by marching towards the sun over the heights (soft with distance),
 * hollows by their curvature (AO). That is baked once into a texture per block, drawn over the
 * ground: a frame only draws the textures. The sun stands at 50° (a mood comes with DC-134) on the
 * side the map's light comes from. A block is baked again only when it or a neighbour changed its
 * heights. Shared by the DM window and the TV.
 */
import { BufferImageSource, Container, Geometry, Mesh, MeshGeometry, RenderTexture, Shader, Texture, UniformGroup, type Renderer } from 'pixi.js';
import { BLOCK_CELLS, BLOCK_POINTS, SUBDIVISIONS, type RasterBlock } from '../../core/build/terrain/block';
import { SLOPE_RAMP } from '../../core/build/terrain/cliffs';
import { neighbourKeys } from '../../core/build/terrain/groundSample';
import { blockHeights, HEIGHT_HALO, HEIGHT_SIDE } from '../../core/build/terrain/heightField';
import { fromCellSpace, type GridConfig } from '../../core/grid';

export interface ShadeInput {
  readonly blocks: ReadonlyMap<string, RasterBlock>;
  readonly grid: GridConfig;
  readonly stepFt: number;
  /** Where the light falls towards (degrees, map coordinates); the sun stands on the other side. */
  readonly lightAngle: number;
}

/** The sun's height over the horizon (Teil B §20.1: 50°) until moods come (DC-134). */
const SUN_ELEVATION = (50 * Math.PI) / 180;
/** Side of a block's baked light and shadow (px): two per support point – they are soft. */
const BAKE_SIDE = 2 * BLOCK_POINTS;

const VERTEX = `in vec2 aPosition;
in vec2 aLocal;
out vec2 vLocal;
uniform mat3 uProjectionMatrix;
uniform mat3 uWorldTransformMatrix;
uniform mat3 uTransformMatrix;
void main() {
  mat3 mvp = uProjectionMatrix * uWorldTransformMatrix * uTransformMatrix;
  gl_Position = vec4((mvp * vec3(aPosition, 1.0)).xy, 0.0, 1.0);
  vLocal = aLocal;
}`;

const FRAGMENT = `in vec2 vLocal;
uniform sampler2D uHeights;
uniform vec2 uSun;
uniform float uFtPerPoint;
uniform float uStepFt;
out vec4 finalColor;
const float SIDE = ${HEIGHT_SIDE}.0;
const float HALO = ${HEIGHT_HALO}.0;
const float ELEV = ${SUN_ELEVATION.toFixed(5)};
const float RAMP = ${(SLOPE_RAMP / 255).toFixed(5)};
// A texel read exactly (nearest): x the height (ft, two bytes), y the slope mask, z the step.
vec3 texel(vec2 t) {
  vec4 v = texture(uHeights, (t + 0.5) / SIDE);
  return vec3((floor(v.r * 255.0 + 0.5) * 256.0 + floor(v.g * 255.0 + 0.5) - 32768.0) / 16.0, v.b, floor(v.a * 255.0 + 0.5) - 128.0);
}
float heightAt(vec2 p) {
  vec2 t = p + HALO;
  vec2 i = floor(t);
  vec2 f = t - i;
  return mix(mix(texel(i).x, texel(i + vec2(1.0, 0.0)).x, f.x), mix(texel(i + vec2(0.0, 1.0)).x, texel(i + vec2(1.0, 1.0)).x, f.x), f.y);
}
// The rise from a to b without a cliff's sheer drop – its band shows it; where a slope mask turns
// the step into a ramp, the ramp's rise is kept.
float rise(vec3 a, vec3 b) {
  float d = b.x - a.x;
  if (a.y < RAMP && b.y < RAMP) d -= (b.z - a.z) * uStepFt;
  return d;
}
// Per texel: the fall along x and y (ft per ft), and how far the ground around lies higher (ft).
vec3 texelShape(vec2 t) {
  vec3 c = texel(t);
  vec2 fall = vec2(rise(texel(t - vec2(1.0, 0.0)), c) + rise(c, texel(t + vec2(1.0, 0.0))), rise(texel(t - vec2(0.0, 1.0)), c) + rise(c, texel(t + vec2(0.0, 1.0)))) / (2.0 * uFtPerPoint);
  float hollow = (rise(c, texel(t + vec2(4.0, 0.0))) + rise(c, texel(t - vec2(4.0, 0.0))) + rise(c, texel(t + vec2(0.0, 4.0))) + rise(c, texel(t - vec2(0.0, 4.0)))) / 4.0;
  return vec3(fall, hollow);
}
// Blended between the four texels around: no blocks, no false slope at a step's edge.
vec3 shapeAt(vec2 p) {
  vec2 t = p + HALO;
  vec2 i = floor(t);
  vec2 f = t - i;
  return mix(mix(texelShape(i), texelShape(i + vec2(1.0, 0.0)), f.x), mix(texelShape(i + vec2(0.0, 1.0)), texelShape(i + vec2(1.0, 1.0)), f.x), f.y);
}
void main() {
  vec2 p = vLocal;
  float h = heightAt(p);
  vec3 shape = shapeAt(p);
  // Hillshade: the slope's turn to the sun against flat ground's.
  vec3 n = normalize(vec3(-shape.x, -shape.y, 1.0));
  vec3 sun = vec3(uSun * cos(ELEV), sin(ELEV));
  float turn = dot(n, sun) - sin(ELEV);
  // Cast shadow: towards the sun, anything above the sun's ray hides it; softer the farther it is,
  // also at its sides (three rays side by side, wider apart with distance) – the raster's straight
  // steps would otherwise show against the cliff's wandering edge.
  float shadow = 0.0;
  float climb = tan(ELEV) * uFtPerPoint;
  vec2 across = vec2(-uSun.y, uSun.x);
  for (int i = 1; i <= 48; i++) {
    float d = float(i) * 0.65;
    vec2 q = p + uSun * d;
    vec2 side = across * (0.75 + d * 0.12);
    float ray = h + d * climb;
    float hidden = 0.0;
    for (int k = -1; k <= 1; k++) hidden += clamp((heightAt(q + side * float(k)) - ray) / (1.0 + d * 0.25), 0.0, 1.0);
    shadow = max(shadow, hidden / 3.0);
  }
  // AO: hollows (the ground around lies higher) are darker.
  float hollow = clamp(shape.z / 6.0, 0.0, 1.0);
  float dark = clamp(shadow * 0.42 + max(0.0, -turn) * 0.9 + hollow * 0.25, 0.0, 0.6);
  float light = clamp(turn * 0.5, 0.0, 0.25);
  finalColor = vec4(vec3(light), dark + light);
}`;

/** Heights as a texture: 16 bits of 1/16 ft (offset by 32768) in R and G, the slope mask in B, the step + 128 in A. */
function heightTexture(heights: Float32Array, slope: Uint8Array, steps: Int8Array): Texture {
  const data = new Uint8Array(HEIGHT_SIDE * HEIGHT_SIDE * 4);
  for (let i = 0; i < heights.length; i++) {
    const v = Math.max(0, Math.min(65535, Math.round(heights[i]! * 16) + 32768));
    data[i * 4] = v >> 8;
    data[i * 4 + 1] = v & 255;
    data[i * 4 + 2] = slope[i]!;
    data[i * 4 + 3] = steps[i]! + 128;
  }
  const source = new BufferImageSource({ resource: data, width: HEIGHT_SIDE, height: HEIGHT_SIDE, format: 'rgba8unorm', alphaMode: 'no-premultiply-alpha' });
  source.style.addressMode = 'clamp-to-edge';
  // Exact heights: no blending of the bytes.
  source.style.scaleMode = 'nearest';
  return new Texture({ source });
}

interface Built {
  /** The height planes it was built from (step, relief, slope of each neighbour): ground painting leaves them. */
  readonly refs: readonly unknown[];
  readonly mesh: Mesh<MeshGeometry, Shader> | null;
  readonly baked: RenderTexture | null;
}

/** True if nothing in the block or around it rises or falls: it has nothing to shade. */
function level(refs: readonly (RasterBlock | undefined)[]): boolean {
  return refs.every((b) => !b || (b.planes.step.every((v) => v === 0 || v === -128) && b.planes.relief.every((v) => v === 0)));
}

/** Bakes block (bx, by)'s light and shadow into a texture of BAKE_SIDE². */
function bake(renderer: Renderer, bx: number, by: number, input: ShadeInput): RenderTexture {
  const { heights, slope, steps } = blockHeights(bx, by, input.blocks, input.stepFt);
  const texture = heightTexture(heights, slope, steps);
  const geometry = new Geometry({
    attributes: {
      aPosition: new Float32Array([0, 0, BAKE_SIDE, 0, BAKE_SIDE, BAKE_SIDE, 0, BAKE_SIDE]),
      aLocal: new Float32Array([0, 0, BLOCK_POINTS, 0, BLOCK_POINTS, BLOCK_POINTS, 0, BLOCK_POINTS]),
    },
    indexBuffer: new Uint32Array([0, 1, 2, 0, 2, 3]),
  });
  // The sun in the grid's own axes (support points), opposite to where the light falls.
  const a = ((input.lightAngle - input.grid.rotationDeg) * Math.PI) / 180;
  const uniforms = new UniformGroup({
    uSun: { value: new Float32Array([-Math.cos(a), -Math.sin(a)]), type: 'vec2<f32>' },
    uFtPerPoint: { value: input.grid.feetPerCell / SUBDIVISIONS, type: 'f32' },
    uStepFt: { value: input.stepFt, type: 'f32' },
  });
  const shader = Shader.from({ gl: { vertex: VERTEX, fragment: FRAGMENT }, resources: { uHeights: texture.source, shade: uniforms } });
  const mesh = new Mesh({ geometry, shader });
  const baked = RenderTexture.create({ width: BAKE_SIDE, height: BAKE_SIDE });
  renderer.render({ container: mesh, target: baked, clear: true, clearColor: [0, 0, 0, 0] });
  mesh.destroy();
  geometry.destroy(true);
  shader.destroy();
  texture.destroy(true);
  return baked;
}

export function createShadeLayer(renderer: Renderer): { readonly view: Container; set(input: ShadeInput | null): void; destroy(): void } {
  const view = new Container();
  const built = new Map<string, Built>();
  let lookKey = '';

  const drop = (b: Built) => {
    if (b.mesh) {
      view.removeChild(b.mesh);
      b.mesh.geometry.destroy(true);
      b.mesh.destroy();
    }
    b.baked?.destroy(true);
  };
  const clearAll = () => {
    for (const b of built.values()) drop(b);
    built.clear();
  };

  const build = (key: string, blocks: readonly (RasterBlock | undefined)[], refs: readonly unknown[], input: ShadeInput): Built => {
    if (level(blocks)) return { refs, mesh: null, baked: null };
    const [bx, by] = key.split('_').map(Number) as [number, number];
    const baked = bake(renderer, bx, by, input);
    const corners = [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
    ].map(([u, v]) => fromCellSpace(input.grid, { x: (bx + u!) * BLOCK_CELLS, y: (by + v!) * BLOCK_CELLS }));
    const geometry = new MeshGeometry({
      positions: new Float32Array(corners.flatMap((p) => [p.x, p.y])),
      uvs: new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]),
      indices: new Uint32Array([0, 1, 2, 0, 2, 3]),
    });
    const mesh = new Mesh({ geometry, texture: baked });
    view.addChild(mesh);
    return { refs, mesh, baked };
  };

  return {
    view,
    set(input) {
      if (!input) {
        clearAll();
        lookKey = '';
        return;
      }
      const key = JSON.stringify([input.grid, input.stepFt, input.lightAngle]);
      if (key !== lookKey) {
        clearAll();
        lookKey = key;
      }
      // Shadows fall across block edges: the blocks around a painted one are shaded too.
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
        const blocks = neighbourKeys(bx, by).map((r) => input.blocks.get(r));
        const refs = blocks.flatMap((b) => (b ? [b.planes.step, b.planes.relief, b.planes.slope] : [null, null, null]));
        const had = built.get(k);
        if (had && had.refs.every((r, i) => r === refs[i])) continue;
        if (had) drop(had);
        built.set(k, build(k, blocks, refs, input));
      }
    },
    destroy() {
      clearAll();
      view.destroy({ children: true });
    },
  };
}
