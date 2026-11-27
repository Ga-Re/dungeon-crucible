// Look spike for the cliff band (DC-127, E-46, E-52; Teil B §11): step raster → contours (marching
// squares) → smoothed, world-noised line → band mesh of rock blocks, shaded by the light and wider
// or narrower along the edge; grass hanging over the top, a broken rim of stones, earth and scree
// running out below with foot AO. A developer page to judge
// the look next to a reference picture; the parts that hold up go into the pipeline with DC-128.
// Its text is English on purpose, like the benchmark's.
import 'pixi.js/unsafe-eval';
import { Application, Container, Geometry, Graphics, Mesh, Shader, Texture, TilingSprite } from 'pixi.js';
import { BAND_PER_10_FT, cliffBand, type BandMesh } from '../core/build/geom/band';
import { chaikin, stepContours, type Pt } from '../core/build/geom/contours';
import { noise2 } from '../core/build/handDrawn';
import { hashNoise, periodicNoise } from '../core/build/variance';

const CELL = 70;
const CELLS = 14;
const SUB = 4;
const STEP_FT = 10;
const LIGHT_ANGLE = 45;
/** Perspective factor (Teil B §11.2: 0.45 cell per 10 ft, adjustable 0.2–1.0): `?p=0.9` to compare. */
const PERSPECTIVE = Math.min(1, Math.max(0.2, Number(new URLSearchParams(location.search).get('p') ?? BAND_PER_10_FT)));
/** Rock: a jagged edge (Teil B §11.1: 0.15 cell). */
const NOISE_CELLS = 0.15;

/** The test terrain in support points: a plateau with a wavy edge, a second step on it, a pit in the lower ground. */
function step(x: number, y: number): number {
  const cx = x / SUB;
  const cy = y / SUB;
  let s = 0;
  if (cy < 6.5 + Math.sin(cx * 0.6) * 1.2 + (cx > 9 ? (cx - 9) * 0.8 : 0)) s = 1;
  if (s === 1 && Math.hypot(cx - 4, cy - 2.5) < 2.2) s = 2;
  if (Math.hypot(cx - 9.5, cy - 11) < 1.6) s = -1;
  return s;
}

/** A contour in map px, smoothed and offset by noise sampled at the world position (an edit never moves the far end). */
function shaped(points: readonly Pt[], closed: boolean): Pt[] {
  const px = chaikin(points.map((p) => ({ x: p.x * (CELL / SUB), y: p.y * (CELL / SUB) })), closed, 2);
  return px.map((p, i) => {
    const a = px[(i - 1 + px.length) % px.length]!;
    const b = px[(i + 1) % px.length]!;
    const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    const n = noise2(p.x / (CELL * 0.6), p.y / (CELL * 0.6), 11) * NOISE_CELLS * CELL;
    return { x: p.x + (-(b.y - a.y) / len) * n, y: p.y + ((b.x - a.x) / len) * n };
  });
}

function canvasTexture(w: number, h: number, paint: (g: CanvasRenderingContext2D) => void): Texture {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  paint(c.getContext('2d')!);
  const t = Texture.from(c);
  t.source.style.addressMode = 'repeat';
  return t;
}

/** Seamless noise over a `w`-wide tile: `scale` px per lattice step (`w` a multiple of it). */
const tileNoise = (x: number, y: number, scale: number, w: number, seed: number) => periodicNoise(x / scale, y / scale, w / scale, seed);

/**
 * Rock strata in blocks: five layers of sandstone with wavy borders and a lighter top, cut by
 * joints into blocks of uneven width – each block a little different, lit on its left edge and
 * shaded on its right, the joints staggered from layer to layer like the reference. A stand-in
 * until the real band textures (E-70).
 */
const strata = () =>
  canvasTexture(512, 128, (g) => {
    const W = 512;
    const layers = [
      { at: 0, rgb: [190, 166, 126] },
      { at: 0.2, rgb: [160, 128, 92] },
      { at: 0.42, rgb: [138, 106, 76] },
      { at: 0.62, rgb: [168, 138, 102] },
      { at: 0.8, rgb: [120, 92, 68] },
    ];
    // Joints per layer: uneven blocks of 36–90 px, a new pattern in every layer (staggered).
    const joints = layers.map((_, li) => {
      const xs: number[] = [];
      for (let x = hashNoise(li, 0, 21) * 40; x < W; x += 36 + hashNoise(li, x, 23) * 54) xs.push(Math.round(x));
      return xs;
    });
    for (let y = 0; y < 128; y++)
      for (let x = 0; x < W; x++) {
        const v = y / 128 + tileNoise(x, 0, 64, W, 3) * 0.05;
        let li = 0;
        layers.forEach((l, i) => {
          if (v >= l.at) li = i;
        });
        const layer = layers[li]!;
        const xs = joints[li]!;
        // The block this pixel lies in and how far from its left and right joint.
        let left = xs[xs.length - 1]! - W;
        let right = xs[0]!;
        for (const j of xs) {
          if (j <= x) left = j;
          else {
            right = j;
            break;
          }
        }
        if (right <= x) right = xs[0]! + W;
        const block = hashNoise(li, left, 29) * 24 - 12;
        const fromLeft = x - left;
        const toRight = right - x;
        const bevel = fromLeft < 3 ? 26 : toRight < 2 ? -60 : toRight < 4 ? -22 : 0;
        const grain = tileNoise(x, y, 8, W, 7) * 12 + tileNoise(x, y, 32, W, 9) * 10;
        const seam = layers.some((l) => l.at > 0 && Math.abs(v - l.at) < 0.014) ? -55 : 0;
        g.fillStyle = `rgb(${layer.rgb.map((c) => Math.max(0, Math.min(255, c + grain + seam + block + bevel))).join(',')})`;
        g.fillRect(x, y, 1, 1);
      }
  });

/** Earth for the hem below the foot: brown, crumbly. */
const earth = () =>
  canvasTexture(256, 256, (g) => {
    for (let y = 0; y < 256; y += 2)
      for (let x = 0; x < 256; x += 2) {
        const n = tileNoise(x, y, 16, 256, 31) * 20 + tileNoise(x, y, 4, 256, 33) * 12;
        g.fillStyle = `rgb(${112 + n},${88 + n},${62 + n * 0.8})`;
        g.fillRect(x, y, 2, 2);
      }
  });

const grass = () =>
  canvasTexture(256, 256, (g) => {
    for (let y = 0; y < 256; y += 2)
      for (let x = 0; x < 256; x += 2) {
        const n = tileNoise(x, y, 64, 256, 1) * 18 + tileNoise(x, y, 8, 256, 2) * 9;
        g.fillStyle = `rgb(${92 + n},${130 + n},${60 + n / 2})`;
        g.fillRect(x, y, 2, 2);
      }
  });

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

/** The face: strata, lit by its turn to the light, darker towards the foot. */
const FACE = `in vec2 vUV;
in float vShade;
uniform sampler2D uTexture;
out vec4 finalColor;
void main() {
  vec3 c = texture(uTexture, vec2(vUV.x, vUV.y * 0.9)).rgb;
  float foot = mix(1.0, 0.55, vUV.y * vUV.y);
  finalColor = vec4(c * vShade * foot, 1.0);
}`;

/** Foot AO: a soft dark hem on the lower ground. */
const AO = `in vec2 vUV;
out vec4 finalColor;
void main() {
  float a = 0.45 * pow(1.0 - vUV.y, 1.8);
  finalColor = vec4(0.0, 0.0, 0.0, a);
}`;

/** Grass hanging over the edge: the upper ground's texture, its lower rim ragged. */
const OVERHANG = `in vec2 vUV;
uniform sampler2D uTexture;
out vec4 finalColor;
void main() {
  vec3 c = texture(uTexture, vec2(vUV.x * 0.6, vUV.y * 0.15)).rgb;
  float tuft = texture(uTexture, vec2(vUV.x * 7.0, 0.5)).g;
  float reach = 0.25 + 0.75 * smoothstep(0.42, 0.62, tuft);
  float a = 1.0 - smoothstep(reach - 0.18, reach, vUV.y);
  finalColor = vec4(c * (0.82 + 0.18 * (1.0 - vUV.y)) * a, a);
}`;

/** Earth and rubble running out into the lower ground, ragged and fading. */
const SOIL = `in vec2 vUV;
uniform sampler2D uTexture;
out vec4 finalColor;
void main() {
  vec3 c = texture(uTexture, vUV * vec2(1.0, 0.5)).rgb;
  float edge = texture(uTexture, vec2(vUV.x * 2.0, 0.7)).r;
  float a = (1.0 - smoothstep(0.35 + 0.4 * edge, 1.0, vUV.y)) * 0.85;
  finalColor = vec4(c * a, a);
}`;

function mesh(m: BandMesh, fragment: string, texture: Texture): Mesh<Geometry, Shader> {
  const geometry = new Geometry({ attributes: { aPosition: m.positions, aUV: m.uvs, aShade: { buffer: m.shade, format: 'float32' } }, indexBuffer: m.indices });
  const shader = Shader.from({ gl: { vertex: VERTEX, fragment }, resources: { uTexture: texture.source } });
  return new Mesh({ geometry, shader, texture });
}

/** An irregular stone at `p`, `size` px: a dark rim, a lit top face, a soft contact shadow. */
function stone(g: Graphics, p: Pt, size: number, seed: number): void {
  const corners = 6 + Math.floor(hashNoise(p.x, p.y, seed) * 3);
  const ring = (scale: number, dx: number, dy: number) =>
    Array.from({ length: corners }, (_, i) => {
      const a = (i / corners) * Math.PI * 2 + hashNoise(p.x, i, seed + 1) * 0.6;
      const r = size * scale * (0.7 + hashNoise(p.y, i, seed + 2) * 0.45);
      return [p.x + dx + Math.cos(a) * r, p.y + dy + Math.sin(a) * r * 0.8] as const;
    }).flat();
  // Sandstone like the face, a little varied.
  const t = hashNoise(p.x, p.y, seed + 3);
  const color = ((150 + t * 40) << 16) | ((120 + t * 34) << 8) | (88 + t * 26);
  g.poly(ring(1.15, size * 0.25, size * 0.3)).fill({ color: 0x000000, alpha: 0.3 });
  g.poly(ring(1, 0, 0)).fill({ color }).stroke({ color: 0x3a2a1a, width: 1, alpha: 0.7 });
  g.poly(ring(0.55, -size * 0.18, -size * 0.2)).fill({ color: 0xffffff, alpha: 0.18 });
}

/** Points along a line every `spacing` px (by world position hashes, so they stay where they are). */
function alongLine(line: readonly Pt[], closed: boolean, spacing: number): { p: Pt; normal: Pt }[] {
  const out: { p: Pt; normal: Pt }[] = [];
  const n = closed ? line.length : line.length - 1;
  for (let i = 0; i < n; i++) {
    const a = line[i]!;
    const b = line[(i + 1) % line.length]!;
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (len < 1e-6) continue;
    const normal = { x: -(b.y - a.y) / len, y: (b.x - a.x) / len };
    for (let t = 0; t < len; t += spacing) {
      const p = { x: a.x + ((b.x - a.x) * t) / len, y: a.y + ((b.y - a.y) * t) / len };
      out.push({ p, normal });
    }
  }
  return out;
}


async function main() {
  const app = new Application();
  await app.init({ width: CELL * CELLS, height: CELL * CELLS, background: '#1b1d18', preference: 'webgl', antialias: true, preserveDrawingBuffer: true });
  document.body.appendChild(app.canvas);
  const ground = new TilingSprite({ texture: grass(), width: CELL * CELLS, height: CELL * CELLS });
  const soil = new Container();
  const ao = new Container();
  const faces = new Container();
  const overhang = new Container();
  const rubble = new Graphics();
  const rim = new Graphics();
  const rock = strata();
  const turf = grass();
  const dirt = earth();
  const area = { x0: -2, y0: -2, x1: CELLS * SUB + 2, y1: CELLS * SUB + 2 };
  // Protrusions and niches: the band's width wanders by ±35 %, read at the world position.
  const widthFactor = (p: Pt) => 1 + 0.35 * noise2(p.x / (CELL * 0.9), p.y / (CELL * 0.9), 17);
  for (let k = -1; k <= 1; k++)
    for (const c of stepContours(step, area, k)) {
      const line = shaped(c.points, c.closed);
      const width = Math.min(2.5, (STEP_FT / 10) * PERSPECTIVE) * CELL;
      const face = cliffBand(line, c.closed, width, { textureLength: CELL * 4, lightAngle: LIGHT_ANGLE, widthFactor });
      const feet: Pt[] = [];
      for (let i = 0; i < face.positions.length; i += 4) feet.push({ x: face.positions[i + 2]!, y: face.positions[i + 3]! });
      if (c.closed) feet.pop();
      // Smoothed, so mitred corners of the foot leave no slivers in the hems.
      const foot = chaikin(feet, c.closed, 2);
      // The AO's own, smoother line: its band folds over itself less in inner bends (DC-128: AO from a distance field).
      const hem = chaikin(feet, c.closed, 4);
      // Earth runs out only in patches; elsewhere the grass reaches the foot.
      const soilWidth = (p: Pt) => 0.05 + 1.1 * Math.max(0, noise2(p.x / (CELL * 1.4), p.y / (CELL * 1.4), 83));
      soil.addChild(mesh(cliffBand(foot, c.closed, CELL * 0.6, { textureLength: CELL * 2, lightAngle: LIGHT_ANGLE, widthFactor: soilWidth }), SOIL, dirt));
      ao.addChild(mesh(cliffBand(hem, c.closed, CELL * 0.4, { textureLength: CELL, lightAngle: LIGHT_ANGLE }), AO, rock));
      faces.addChild(mesh(face, FACE, rock));
      overhang.addChild(mesh(cliffBand(line, c.closed, CELL * 0.22, { textureLength: CELL * 1.5, lightAngle: LIGHT_ANGLE }), OVERHANG, turf));
      // Scree at the foot, gathered in a few heaps (as in the reference), smaller the further it rolled.
      for (const { p, normal } of alongLine(foot, c.closed, CELL * 0.1)) {
        const heap = noise2(p.x / (CELL * 1.6), p.y / (CELL * 1.6), 81) > 0.45;
        if (hashNoise(p.x, p.y, 41) > (heap ? 0.3 : 0.008)) continue;
        const out = hashNoise(p.x, p.y, 43) ** 1.6 * CELL * 0.55;
        const size = CELL * (0.09 - (out / (CELL * 0.55)) * 0.06) * (0.6 + hashNoise(p.y, p.x, 45) * 0.8);
        stone(rubble, { x: p.x + normal.x * out, y: p.y + normal.y * out }, size, 51);
      }
      // A broken rim: stones sitting on the edge, a few sticking out.
      for (const { p, normal } of alongLine(line, c.closed, CELL * 0.25)) {
        if (hashNoise(p.x, p.y, 61) > 0.025) continue;
        const off = (hashNoise(p.y, p.x, 63) - 0.6) * CELL * 0.1;
        stone(rim, { x: p.x + normal.x * off, y: p.y + normal.y * off }, CELL * (0.04 + hashNoise(p.x, p.y, 65) * 0.05), 71);
      }
    }
  app.stage.addChild(ground, soil, ao, faces, overhang, rubble, rim);
  document.title = 'Cliff band spike – ready';
}

void main();
