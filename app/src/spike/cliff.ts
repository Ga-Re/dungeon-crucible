// Look spike for the cliff band (DC-127, E-46, E-52; Teil B §11): step raster → contours (marching
// squares) → smoothed, world-noised line → band mesh with a strata test texture, shaded by the
// light, with foot AO on the lower ground and a lip on the upper edge. A developer page to judge
// the look next to a reference picture; the parts that hold up go into the pipeline with DC-128.
// Its text is English on purpose, like the benchmark's.
import 'pixi.js/unsafe-eval';
import { Application, Container, Geometry, Mesh, Shader, Texture, TilingSprite } from 'pixi.js';
import { BAND_PER_10_FT, cliffBand, type BandMesh } from '../core/build/geom/band';
import { chaikin, stepContours, type Pt } from '../core/build/geom/contours';
import { noise2 } from '../core/build/handDrawn';
import { periodicNoise } from '../core/build/variance';

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

/** Rock strata: five layers of sandstone with wavy borders, a lighter top, a few fractures – a stand-in until the real band textures (E-70). */
const strata = () =>
  canvasTexture(512, 128, (g) => {
    const W = 512;
    const layers = [
      { at: 0, rgb: [188, 164, 124] },
      { at: 0.2, rgb: [158, 126, 90] },
      { at: 0.42, rgb: [136, 104, 74] },
      { at: 0.62, rgb: [166, 136, 100] },
      { at: 0.8, rgb: [118, 90, 66] },
    ];
    const fractures = [40, 150, 230, 330, 420];
    for (let y = 0; y < 128; y++)
      for (let x = 0; x < W; x++) {
        const v = y / 128 + tileNoise(x, 0, 64, W, 3) * 0.05;
        let layer = layers[0]!;
        for (const l of layers) if (v >= l.at) layer = l;
        const grain = tileNoise(x, y, 8, W, 7) * 14 + tileNoise(x, y, 32, W, 9) * 10;
        // A dark seam at the top of each layer.
        const seam = layers.some((l) => l.at > 0 && Math.abs(v - l.at) < 0.012) ? -45 : 0;
        const crack = fractures.some((f) => Math.abs(x - f - tileNoise(0, y, 16, 128, f) * 6) < 1.2 && y > (f % 40)) ? -50 : 0;
        g.fillStyle = `rgb(${layer.rgb.map((c) => Math.max(0, Math.min(255, c + grain + seam + crack))).join(',')})`;
        g.fillRect(x, y, 1, 1);
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
  float a = 0.6 * pow(1.0 - vUV.y, 1.6);
  finalColor = vec4(0.0, 0.0, 0.0, a);
}`;

/** The lip: a light, crumbling rim on the upper edge. */
const LIP = `in vec2 vUV;
uniform sampler2D uTexture;
out vec4 finalColor;
void main() {
  float grit = texture(uTexture, vec2(vUV.x * 3.0, 0.3)).r;
  float a = (1.0 - vUV.y) * 0.65 * smoothstep(0.25, 0.6, grit);
  finalColor = vec4(vec3(0.86, 0.80, 0.62) * a, a);
}`;

function mesh(m: BandMesh, fragment: string, texture: Texture): Mesh<Geometry, Shader> {
  const geometry = new Geometry({ attributes: { aPosition: m.positions, aUV: m.uvs, aShade: { buffer: m.shade, format: 'float32' } }, indexBuffer: m.indices });
  const shader = Shader.from({ gl: { vertex: VERTEX, fragment }, resources: { uTexture: texture.source } });
  return new Mesh({ geometry, shader, texture });
}

/** The same line the other way round: its right side is the upper side then. */
const reversed = (pts: readonly Pt[]) => [...pts].reverse();

async function main() {
  const app = new Application();
  await app.init({ width: CELL * CELLS, height: CELL * CELLS, background: '#1b1d18', preference: 'webgl', antialias: true, preserveDrawingBuffer: true });
  document.body.appendChild(app.canvas);
  const ground = new TilingSprite({ texture: grass(), width: CELL * CELLS, height: CELL * CELLS });
  const ao = new Container();
  const faces = new Container();
  const lips = new Container();
  const rock = strata();
  const area = { x0: -2, y0: -2, x1: CELLS * SUB + 2, y1: CELLS * SUB + 2 };
  for (let k = -1; k <= 1; k++)
    for (const c of stepContours(step, area, k)) {
      const line = shaped(c.points, c.closed);
      const width = Math.min(2.5, (STEP_FT / 10) * PERSPECTIVE) * CELL;
      const face = cliffBand(line, c.closed, width, { textureLength: CELL * 4, lightAngle: LIGHT_ANGLE });
      // The foot: the band's lower edge, then the AO beyond it.
      const feet: Pt[] = [];
      for (let i = 0; i < face.positions.length; i += 4) feet.push({ x: face.positions[i + 2]!, y: face.positions[i + 3]! });
      if (c.closed) feet.pop();
      // Smoothed, so mitred corners of the foot leave no slivers in the hem.
      const foot = chaikin(feet, c.closed, 2);
      ao.addChild(mesh(cliffBand(foot, c.closed, CELL * 0.55, { textureLength: CELL, lightAngle: LIGHT_ANGLE }), AO, rock));
      faces.addChild(mesh(face, FACE, rock));
      lips.addChild(mesh(cliffBand(reversed(line), c.closed, CELL * 0.14, { textureLength: CELL, lightAngle: LIGHT_ANGLE }), LIP, rock));
    }
  app.stage.addChild(ground, ao, faces, lips);
  document.title = 'Cliff band spike – ready';
}

void main();
