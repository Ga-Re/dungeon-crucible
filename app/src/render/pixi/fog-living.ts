// Living fog (T-245, ADR-0019): the fog drifts and its edge wobbles. Drawn by a shader over the
// soft fog mask; the player view keeps the exact hard fog underneath (see `drawFog`), and the
// shader keeps every fogged texel opaque, so the animation only ever reaches into revealed area
// – the fog by at most 0.45 cells, a biome's veil and particles by about a cell (T-261).
import {
  AlphaFilter,
  type Container,
  Mesh,
  MeshGeometry,
  Shader,
  UniformGroup,
  type Texture,
} from "pixi.js";
import { DURATION_SHARES, type SpreadShares } from "./fog-spread";

/** How the living fog looks and moves on this device (the settings of T-245). */
export interface LivingFog {
  /** Detail and resolution of the effect (ADR-0019); "off" is no living fog at all. */
  readonly quality: "high" | "medium";
  /** Map pixels per grid cell: the swirls and the edge scale with the grid, not the image. */
  readonly cellSizePx: number;
  /** Edge wobble, 0 … {@link LIVING_EDGE_MAX} (1.2 by default). */
  readonly edge: number;
  /** Speed of the drift, 0 (still) … 3. */
  readonly motion: number;
  /** The biome (T-168): colours, wind, streaks and particles; Bodennebel if none or unknown. */
  readonly biome?: string;
  /** How strong the biome's wind, particles and glow are, 0 … 1 (1 if none). */
  readonly strength?: number;
}

/**
 * One biome's look (T-168, from the Nebelweber prototype): deep, body and highlight colours, the
 * particles' colour, its wind (direction and strength), and its effects at full strength:
 * particles (0 none, 1 snow, 2 embers, 3 motes, 4 sand) and how many, wind streaks, underglow.
 */
interface Biome {
  readonly colours: readonly [string, string, string];
  readonly particle: string;
  readonly wind: readonly [number, number];
  readonly particles: 0 | 1 | 2 | 3 | 4;
  readonly amount: number;
  readonly streaks: number;
  readonly glow: number;
  /** Heat shimmer: the fog's edge flickers fast in thin rows (Hitzeflimmern, ADR-0019). */
  readonly shimmer?: number;
}

export const BIOMES: Readonly<Record<string, Biome>> = {
  nebel: {
    colours: ["#2a3238", "#66737c", "#b9c5cc"],
    particle: "#dfe6ea",
    wind: [0.4, 0.1],
    particles: 0,
    amount: 0,
    streaks: 0.2,
    glow: 0,
  },
  schnee: {
    colours: ["#6f7e8e", "#bcc8d3", "#f4f8fb"],
    particle: "#ffffff",
    wind: [1.3, 0.25],
    particles: 1,
    amount: 1,
    streaks: 0.85,
    glow: 0,
  },
  wueste: {
    colours: ["#6e4f31", "#bf935c", "#efd5a2"],
    particle: "#f3dfb2",
    wind: [1.6, 0.05],
    particles: 4,
    amount: 0.7,
    streaks: 1,
    glow: 0,
    shimmer: 1,
  },
  asche: {
    colours: ["#141010", "#3a2f2a", "#7a695e"],
    particle: "#ff8a3a",
    wind: [0.3, -0.4],
    particles: 2,
    amount: 0.95,
    streaks: 0.35,
    glow: 0.6,
  },
  sumpf: {
    colours: ["#16210f", "#46612e", "#9fbf68"],
    particle: "#d8ff8c",
    wind: [0.25, 0.05],
    particles: 3,
    amount: 0.6,
    streaks: 0.1,
    glow: 0.25,
  },
  kueste: {
    colours: ["#1c2b30", "#577479", "#b6cfcf"],
    particle: "#e6f2f2",
    wind: [0.9, 0.1],
    particles: 0,
    amount: 0,
    streaks: 0.55,
    glow: 0,
  },
  arkan: {
    colours: ["#1a1230", "#4a3577", "#a08ad8"],
    particle: "#f2e6ff",
    wind: [0.3, -0.1],
    particles: 3,
    amount: 0.85,
    streaks: 0.2,
    glow: 0.2,
  },
  dunkel: {
    colours: ["#060708", "#15181c", "#2c3239"],
    particle: "#000000",
    wind: [0.2, 0],
    particles: 0,
    amount: 0,
    streaks: 0,
    glow: 0,
  },
};

/** The biome named `name`, Bodennebel for none or an unknown one. */
export function biomeOf(name: string | undefined): Biome {
  // Own entries only: names in files are open, and "constructor" is not a biome.
  const known =
    name !== undefined && Object.hasOwn(BIOMES, name)
      ? BIOMES[name]
      : undefined;
  return known ?? (BIOMES["nebel"] as Biome);
}

const rgb = (hex: string): [number, number, number] => [
  parseInt(hex.slice(1, 3), 16) / 255,
  parseInt(hex.slice(3, 5), 16) / 255,
  parseInt(hex.slice(5, 7), 16) / 255,
];

export const LIVING_EDGE_MAX = 2.5;

/**
 * How far the living fog may reach into revealed area, in grid cells: at least the soft edge's
 * 0.25 cells, at most 0.45 so a revealed one-cell corridor keeps its middle open.
 */
const REACH_MIN_CELLS = 0.25;
const REACH_MAX_CELLS = 0.45;

/**
 * How far the biome's veil and particles reach past the fog's edge, in grid cells (T-261, DM
 * decision 2026-11-22: "bis ~1 Feld"). The shader samples the fog on rings at 0.45 and 0.85 of
 * it; the soft mask's band (0.16–0.29 cells into revealed area) comes on top, so the effect
 * fades out between about 1 and 1.15 cells. The fog itself still reaches no further than
 * {@link REACH_MAX_CELLS}.
 */
export const LIVING_HALO_CELLS = 1;
const HALO_INNER = LIVING_HALO_CELLS * 0.45;
const HALO_OUTER = LIVING_HALO_CELLS * 0.85;
/** The veil's opacity at its densest, at full strength. */
const VEIL = 0.35;

/** Octaves of noise and the share of the screen's resolution the effect renders at. */
export const LIVING_QUALITY = {
  high: { octaves: 5, resolution: 0.75 },
  medium: { octaves: 3, resolution: 0.5 },
} as const;

/**
 * The band of the soft mask the living edge plays in and how far the shader shifts its samples,
 * both in map pixels. Together they stay within the reach for `edge`, so the fog never creeps
 * further than {@link REACH_MAX_CELLS} into revealed area.
 */
export function livingReach(living: LivingFog): {
  readonly band: number;
  readonly warp: number;
} {
  const edge = Math.min(LIVING_EDGE_MAX, Math.max(0, living.edge));
  const reach =
    living.cellSizePx *
    (REACH_MIN_CELLS +
      ((REACH_MAX_CELLS - REACH_MIN_CELLS) * edge) / LIVING_EDGE_MAX);
  // A shifted sample moves by the warp times a noise vector of components within ±0.5, so at
  // most √½ of the warp (diagonally): the shift stays within 0.35 of the reach.
  return {
    band: reach * 0.65,
    warp: edge > 0 ? (reach * 0.35) / Math.SQRT1_2 : 0,
  };
}

const VERTEX = `in vec2 aPosition;
out vec2 vPos;
uniform mat3 uProjectionMatrix;
uniform mat3 uWorldTransformMatrix;
uniform mat3 uTransformMatrix;
void main() {
  mat3 mvp = uProjectionMatrix * uWorldTransformMatrix * uTransformMatrix;
  gl_Position = vec4((mvp * vec3(aPosition, 1.0)).xy, 0.0, 1.0);
  vPos = aPosition;
}`;

const fragment = (octaves: number) => `in vec2 vPos;
uniform sampler2D uFrom;
uniform sampler2D uTo;
uniform sampler2D uOrder;
uniform float uMix;
uniform float uSpread;
uniform float uFront;
uniform float uTime;
uniform float uEdge;
uniform float uWarp;
uniform float uCell;
uniform float uOpacity;
uniform vec2 uMaskSize;
uniform vec3 uDeep;
uniform vec3 uBody;
uniform vec3 uLight;
uniform vec3 uParticle;
uniform vec2 uWind;
// Particles kind, their amount, wind streaks and underglow (T-168), strength applied.
uniform vec4 uFx;
// Heat shimmer of the edge (T-168), strength applied.
uniform float uShimmer;
// The wavering veil past the edge (T-261), strength applied.
uniform float uVeil;
out vec4 finalColor;

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
             mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p) {
  float s = 0.0;
  float a = 0.5;
  mat2 m = mat2(1.6, 1.2, -1.2, 1.6);
  for (int i = 0; i < ${String(octaves)}; i++) {
    s += a * noise(p);
    p = m * p;
    a *= 0.5;
  }
  return s / (1.0 - pow(0.5, ${octaves.toFixed(1)}));
}
// One layer of particles: a point per grid square of \`size\` cells, moving at \`vel\` cells per
// second, swaying, optionally flickering (\`tw\`); \`dens\` of the squares carry one.
float layer(vec2 pos, float size, vec2 vel, float t, float radius, float dens, float sway, float tw) {
  // The travelled distance wrapped on the pattern's period (997 squares), so particles stay
  // precise in long sessions.
  vec2 q = pos / uCell / size - mod(vel * t / size, 997.0);
  vec2 id = mod(floor(q), 997.0);
  float h = hash(id);
  if (h > dens) return 0.0;
  vec2 o = (vec2(hash(id + 3.1), hash(id + 7.7)) - 0.5) * 0.6;
  o.x += sway * sin(t * 1.7 + h * 40.0);
  float d = length(fract(q) - 0.5 - o);
  float v = smoothstep(radius, radius * 0.3, d);
  float flick = mix(1.0, pow(0.5 + 0.5 * sin(t * (2.0 + h * 5.0) + h * 60.0), 4.0) * 1.6, tw);
  return v * flick;
}
float particles(vec2 pos, float t) {
  if (uFx.x < 0.5) return 0.0;
  if (uFx.x < 1.5)   // snow
    return layer(pos, 0.3, vec2(uWind.x, 1.2), t, 0.1, 0.5, 0.25, 0.0) * 0.7
         + layer(pos, 0.5, vec2(uWind.x * 1.5, 1.8), t, 0.12, 0.45, 0.2, 0.0) * 0.85
         + layer(pos, 0.8, vec2(uWind.x * 2.3, 2.8), t, 0.14, 0.35, 0.15, 0.0);
  if (uFx.x < 2.5)   // embers
    return layer(pos, 0.45, vec2(0.35 + uWind.x * 0.35, -1.0), t, 0.08, 0.25, 0.3, 1.0)
         + layer(pos, 0.75, vec2(0.6 + uWind.x * 0.5, -1.6), t, 0.09, 0.2, 0.25, 1.0);
  if (uFx.x < 3.5)   // motes, will-o'-wisps
    return layer(pos, 0.6, vec2(0.13, -0.1), t, 0.09, 0.3, 0.35, 1.0)
         + layer(pos, 1.07, vec2(-0.17, 0.07), t, 0.1, 0.22, 0.3, 1.0);
  return (layer(pos, 0.15, vec2(uWind.x * 3.7, 0.3), t, 0.14, 0.35, 0.0, 0.0)   // sand
        + layer(pos, 0.25, vec2(uWind.x * 5.0, 0.43), t, 0.12, 0.3, 0.0, 0.0)) * 0.55;
}
// Fog alpha at a map point, mid-spread as the fade shader mixes it; fog beyond the map.
float fogAt(vec2 pos) {
  vec2 uv = pos / uMaskSize;
  if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) return 1.0;
  float local = clamp((uMix - texture(uOrder, uv).a * uSpread) / uFront, 0.0, 1.0);
  return mix(texture(uFrom, uv).a, texture(uTo, uv).a, local);
}
// How far a spread has turned this point over, 0 (the fog before) … 1 (the fog after).
float localMix(vec2 pos) {
  vec2 uv = clamp(pos / uMaskSize, 0.0, 1.0);
  return clamp((uMix - texture(uOrder, uv).a * uSpread) / uFront, 0.0, 1.0);
}
// One mask's fog at a point; fog beyond the map.
float maskAt(sampler2D mask, vec2 pos) {
  vec2 uv = pos / uMaskSize;
  if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) return 1.0;
  return texture(mask, uv).a;
}
// How near the fog is, 1 at the fog and falling to 0 about LIVING_HALO_CELLS away (T-261):
// samples on two rings of six directions, turned by moving noise so the fringe wavers instead
// of drawing a ring. During a spread it follows the front: the masks before and after are mixed
// as far as the spread has turned this point over; the other mask is read only while the front
// passes here.
float nearFog(vec2 pos, float turn, float local) {
  float inner = 0.0;
  float outer = 0.0;
  vec2 dir = vec2(cos(turn), sin(turn));
  // 60° on: the next of the six directions.
  mat2 turn60 = mat2(0.5, 0.8660254, -0.8660254, 0.5);
  for (int k = 0; k < 6; k++) {
    vec2 a = pos + dir * uCell * ${HALO_INNER.toFixed(4)};
    vec2 b = pos + dir * uCell * ${HALO_OUTER.toFixed(4)};
    float ia = local > 0.0 ? maskAt(uTo, a) : 0.0;
    float ib = local > 0.0 ? maskAt(uTo, b) : 0.0;
    if (local < 1.0) {
      ia = mix(maskAt(uFrom, a), ia, local);
      ib = mix(maskAt(uFrom, b), ib, local);
    }
    inner = max(inner, ia);
    outer = max(outer, ib);
    dir = turn60 * dir;
  }
  return max(inner * 0.7, outer * 0.3);
}
void main() {
  vec2 p = vPos / (uCell * 4.0);
  float t = uTime;
  vec2 drift = uWind * t * 0.05;
  vec2 q = vec2(fbm(p + vec2(0.0, t * 0.035) - drift),
                fbm(p + vec2(5.2, 1.3) + vec2(t * 0.03, 0.0) - drift));
  vec2 r = vec2(fbm(p + 2.6 * q + vec2(1.7, 9.2) + t * 0.045),
                fbm(p + 2.6 * q + vec2(8.3, 2.8) - t * 0.04));
  float f = fbm(p * 1.3 + 2.2 * r - drift * 1.4);
  // Faster, finer turbulence that only shows where the fog has an edge.
  vec2 e = vec2(fbm(p * 2.4 + 1.2 * r + vec2(t * 0.21, 0.0)),
                fbm(p * 2.4 + 1.2 * r + vec2(4.1, 7.3 - t * 0.19))) - 0.5;
  // Heat shimmer: a fast flicker in thin rows takes over the turbulence – within the same
  // ±0.5, so the edge never reaches further than the wobble's cap.
  vec2 heat = vec2(0.5 * sin(vPos.y / uCell * 9.0 + t * 7.0 + noise(p * 6.0 + t) * 6.2832),
                   noise(p * 8.0 + vec2(0.0, t * 3.0)) - 0.5);
  e = mix(e, heat, clamp(uShimmer, 0.0, 1.0));
  float m = fogAt(vPos + e * uWarp);
  float edge = clamp(m * (1.0 - m) * 4.0, 0.0, 1.0);
  float d = m + (f - 0.5) * 0.9 * edge + (e.x + e.y) * 0.5 * uEdge * edge;
  float a = smoothstep(0.2, 0.8, d);
  // Only towards the revealed side: where the fog is, it stays opaque whatever the noise does.
  a = max(a, smoothstep(0.96, 1.0, fogAt(vPos)));
  vec3 colour = mix(uDeep, uBody, smoothstep(0.22, 0.88, f));
  float wisp = smoothstep(0.48, 0.95, fbm(p * 0.7 + r * 1.5 + vec2(t * 0.06, -t * 0.02)));
  colour = mix(colour, uLight, wisp * 0.5);
  // Wind streaks along the wind (T-168).
  vec2 wd = normalize(uWind + vec2(1e-4, 0.0));
  vec2 sp = vec2(dot(vPos, wd), dot(vPos, vec2(-wd.y, wd.x))) / uCell;
  if (uFx.z > 0.0) {
    float st = fbm(vec2(sp.x / 5.0 - t * 0.9 * length(uWind), sp.y / 0.55) + r * 0.6);
    colour = mix(colour, uLight, smoothstep(0.55, 0.9, st) * uFx.z * 0.4);
  }
  // Underglow: embers or light from below in the dark parts.
  colour = mix(colour, uParticle * 0.8, uFx.w * smoothstep(0.45, 0.85, 1.0 - f) * 0.55);
  colour = mix(colour, uLight, edge * 0.3);
  // A veil that wavers out of the fog into the revealed area and fades within about a cell
  // (T-261), as strong as the biome: it only adds, so what the fog covers stays covered. Where
  // the fog is opaque anyway, it costs nothing.
  float near = m;
  if (a < 1.0) {
    near = max(m, nearFog(vPos, f * 6.2832 + t * 0.2, localMix(vPos)));
    float sway = fbm(p * 1.7 + r * 0.8 + vec2(t * 0.09, -t * 0.07));
    float veil = smoothstep(0.05, 0.8, near) * smoothstep(0.45, 0.85, sway) * uVeil;
    a = a + veil * (1.0 - a);
  }
  float alpha = a * uOpacity;
  vec3 premultiplied = colour * alpha;
  // Particles over the fog and up to about a cell past its edge, fading (DM, 2026-11-22; T-261):
  // they never make fog transparent, they only add.
  float pa = clamp(particles(vPos, t) * clamp(a + m * 1.5 + near, 0.0, 1.0) * uFx.y, 0.0, 1.0)
             * min(1.0, uOpacity + 0.3);
  finalColor = vec4(uParticle * pa + premultiplied * (1.0 - pa), pa + alpha * (1.0 - pa));
}`;

/** A living fog layer's controls: the spread's mix (fades) and the animation time. */
export interface LivingHandle {
  readonly mesh: Container;
  readonly setMix: (t: number) => void;
  /** How a spread's time splits (T-246); a fixed duration's split by default. */
  readonly setShares: (shares: SpreadShares) => void;
  readonly setTime: (seconds: number) => void;
}

/**
 * The living fog over the map and a margin around it (`margin` map pixels; fog beyond the map
 * stays fog): the masks `from` and `to` (fog alpha textures of `maskSize` map pixels) mixed in
 * `order` as a fade does, then shaded. It renders at a share of `rootResolution` (quality).
 * Owns and frees the textures and the filter it is given or makes.
 */
export function drawLivingFog({
  from,
  to,
  order,
  maskSize,
  map,
  margin,
  living,
  opacity,
  rootResolution,
}: {
  readonly from: Texture;
  readonly to: Texture;
  readonly order: Texture;
  readonly maskSize: { readonly width: number; readonly height: number };
  readonly map: { readonly width: number; readonly height: number };
  readonly margin: number;
  readonly living: LivingFog;
  readonly opacity: number;
  readonly rootResolution: number;
}): LivingHandle {
  const { warp } = livingReach(living);
  const quality = LIVING_QUALITY[living.quality];
  const biome = biomeOf(living.biome);
  const strength = Math.min(1, Math.max(0, living.strength ?? 1));
  const uniforms = new UniformGroup({
    uMix: { value: 1, type: "f32" },
    uSpread: { value: DURATION_SHARES.spread, type: "f32" },
    uFront: { value: DURATION_SHARES.front, type: "f32" },
    uTime: { value: 0, type: "f32" },
    uEdge: {
      value: Math.min(LIVING_EDGE_MAX, Math.max(0, living.edge)),
      type: "f32",
    },
    uWarp: { value: warp, type: "f32" },
    uCell: { value: Math.max(1, living.cellSizePx), type: "f32" },
    uOpacity: { value: opacity, type: "f32" },
    uMaskSize: {
      value: new Float32Array([maskSize.width, maskSize.height]),
      type: "vec2<f32>",
    },
    uDeep: {
      value: new Float32Array(rgb(biome.colours[0])),
      type: "vec3<f32>",
    },
    uBody: {
      value: new Float32Array(rgb(biome.colours[1])),
      type: "vec3<f32>",
    },
    uLight: {
      value: new Float32Array(rgb(biome.colours[2])),
      type: "vec3<f32>",
    },
    uParticle: {
      value: new Float32Array(rgb(biome.particle)),
      type: "vec3<f32>",
    },
    uWind: { value: new Float32Array(biome.wind), type: "vec2<f32>" },
    uShimmer: { value: (biome.shimmer ?? 0) * strength, type: "f32" },
    uVeil: { value: VEIL * strength, type: "f32" },
    uFx: {
      value: new Float32Array([
        biome.particles,
        biome.amount * strength,
        biome.streaks * strength,
        biome.glow * strength,
      ]),
      type: "vec4<f32>",
    },
  });
  const left = -margin;
  const top = -margin;
  const right = map.width + margin;
  const bottom = map.height + margin;
  const geometry = new MeshGeometry({
    positions: new Float32Array([
      left,
      top,
      right,
      top,
      right,
      bottom,
      left,
      bottom,
    ]),
    uvs: new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]),
    indices: new Uint32Array([0, 1, 2, 0, 2, 3]),
  });
  const shader = Shader.from({
    gl: {
      vertex: VERTEX,
      fragment: fragment(quality.octaves),
      // Map pixels and noise need more than mediump's 16 bits on GPUs that honour it.
      preferredFragmentPrecision: "highp",
    },
    resources: {
      uFrom: from.source,
      uTo: to.source,
      uOrder: order.source,
      livingUniforms: uniforms,
    },
  });
  // Its own texture (the target): destroying the mesh with its texture never reaches a shared
  // default texture.
  const mesh = new Mesh({ geometry, texture: to, shader });
  // Rendered at a lower resolution and stretched: soft fog needs few pixels (ADR-0019).
  const filter = new AlphaFilter({
    alpha: 1,
    resolution: rootResolution * quality.resolution,
  });
  mesh.filters = [filter];
  // PixiJS emits "destroyed" before the mesh frees its own texture: the shader goes first, so
  // no texture is destroyed while still bound to it (DC-004).
  mesh.on("destroyed", () => {
    shader.destroy();
    filter.destroy();
    if (from !== to) from.destroy(true);
    order.destroy(true);
    geometry.destroy();
  });
  return {
    mesh,
    setMix: (t) => {
      uniforms.uniforms.uMix = t;
    },
    setShares: (shares) => {
      uniforms.uniforms.uSpread = shares.spread;
      uniforms.uniforms.uFront = shares.front;
    },
    setTime: (seconds) => {
      uniforms.uniforms.uTime = seconds;
    },
  };
}
