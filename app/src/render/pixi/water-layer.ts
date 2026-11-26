/**
 * Moving water (E-35, DC-107f): drawn over the painted water when the map's water is animated.
 * Rivers flow along their drawing direction (a strip mesh whose u runs along the river), with
 * foam streaks and foam at the banks; lakes and the sea ripple and glint (a quad masked to the
 * water); their shores have waves running in – gentle at lakes, surf at the sea (a strip whose v
 * runs from the shore inwards); waterfalls fall. Map coordinates, under tokens and fog: the fog
 * covers it like the map. One time uniform per mesh, set each frame.
 */
import { Container, Graphics, Mesh, MeshGeometry, Shader, UniformGroup } from "pixi.js";
import { offsetPolyline, type Cliff } from "../../core/build/cliffs";
import { ringArea, smoothLine, waterfalls, waterOutline, type Water } from "../../core/build/water";
import type { Point } from "../../core/geometry";

export interface WaterScene {
  readonly waters: readonly Omit<Water, "layer">[];
  readonly cliffs: readonly Omit<Cliff, "layer">[];
  /** Map px per grid cell: waves and foam scale with the grid. */
  readonly cell: number;
}

export interface WaterHandle {
  readonly container: Container;
  setTime(seconds: number): void;
  destroy(): void;
}

const VERTEX = `in vec2 aPosition;
in vec2 aUV;
out vec2 vPos;
out vec2 vUV;
uniform mat3 uProjectionMatrix;
uniform mat3 uWorldTransformMatrix;
uniform mat3 uTransformMatrix;
void main() {
  mat3 mvp = uProjectionMatrix * uWorldTransformMatrix * uTransformMatrix;
  gl_Position = vec4((mvp * vec3(aPosition, 1.0)).xy, 0.0, 1.0);
  vPos = aPosition;
  vUV = aUV;
}`;

const NOISE = `
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}`;

const HEAD = `in vec2 vPos;
in vec2 vUV;
out vec4 finalColor;
uniform float uTime;
uniform float uCell;
uniform float uWidth;
${NOISE}
`;

/** A river: ripples and foam streaks flowing along u, foam at both banks. */
const RIVER = `${HEAD}
void main() {
  float along = (vUV.x - uTime * uCell * 0.9) / (uCell * 0.45);
  float across = vUV.y * uWidth / (uCell * 0.45);
  float ripple = noise(vec2(along, across * 1.6)) * 0.6 + noise(vec2(along * 2.3, across * 3.1) + 7.0) * 0.4;
  float streak = smoothstep(0.68, 0.92, ripple);
  float edge = min(vUV.y, 1.0 - vUV.y);
  // Foam only in places along the banks, where the water breaks.
  float breaks = smoothstep(0.45, 0.8, noise(vec2(along * 0.6, vUV.y * 3.0)));
  float foam = smoothstep(0.08, 0.0, edge) * breaks;
  float a = clamp(streak * 0.22 + foam * 0.55, 0.0, 0.7);
  finalColor = vec4(vec3(0.93, 0.97, 1.0) * a, a);
}`;

/** A lake's or the sea's surface: two wave layers moving against each other; glints on the crests. */
const WAVES = `${HEAD}
void main() {
  vec2 p = vPos / (uCell * 1.1);
  float h = noise(p + vec2(uTime * 0.11, uTime * 0.07)) * 0.55 + noise(p * 2.1 - vec2(uTime * 0.09, -uTime * 0.13)) * 0.45;
  float glint = smoothstep(0.72, 0.9, h);
  float trough = smoothstep(0.35, 0.1, h);
  float a = glint * 0.28 + trough * 0.12;
  vec3 c = mix(vec3(0.0, 0.08, 0.16), vec3(0.92, 0.97, 1.0), glint / max(0.001, glint + trough));
  finalColor = vec4(c * a, a);
}`;

/** A shore: waves running in from v = 1 (out on the water) to v = 0 (the shore); uWidth sets surf (1) or lapping (0). */
const SURF = `${HEAD}
void main() {
  // Each wave comes in at its own time along the shore, and only in places (it breaks).
  float along = vUV.x / (uCell * 1.6);
  float phase = vUV.y * 2.0 + uTime * (0.3 + 0.2 * uWidth) + noise(vec2(along, 0.5)) * 1.6;
  float band = smoothstep(0.86, 0.97, fract(phase)) * (1.0 - vUV.y);
  float breaks = smoothstep(0.4, 0.75, noise(vec2(along * 1.3, floor(phase) * 3.7)));
  float lace = noise(vec2(vUV.x / (uCell * 0.22), vUV.y * 6.0 - uTime));
  float shore = smoothstep(0.18, 0.0, vUV.y) * smoothstep(0.35, 0.75, noise(vec2(vUV.x / (uCell * 0.35), uTime * 0.6)));
  float a = clamp((band * breaks * (0.35 + 0.65 * lace) + shore * 0.55) * (0.3 + 0.7 * uWidth), 0.0, 0.8);
  finalColor = vec4(vec3(0.95, 0.98, 1.0) * a, a);
}`;

/** A waterfall: bright streaks falling along u, spray at its foot. */
const FALL = `${HEAD}
void main() {
  float s = noise(vec2(vUV.y * 14.0, vUV.x * 3.0 - uTime * 4.0));
  float streak = smoothstep(0.45, 0.85, s);
  float foot = smoothstep(0.7, 1.0, vUV.x) * (0.6 + 0.4 * noise(vec2(vUV.y * 9.0, uTime * 2.0)));
  float a = clamp(streak * 0.55 + foot * 0.5, 0.0, 0.9);
  finalColor = vec4(vec3(0.96, 0.99, 1.0) * a, a);
}`;

interface Part {
  mesh: Mesh<MeshGeometry, Shader>;
  uniforms: UniformGroup;
  mask?: Graphics;
}

function part(positions: number[], uvs: number[], indices: number[], fragment: string, cell: number, width: number): Part {
  const uniforms = new UniformGroup({
    uTime: { value: 0, type: "f32" },
    uCell: { value: cell, type: "f32" },
    uWidth: { value: width, type: "f32" },
  });
  const geometry = new MeshGeometry({ positions: new Float32Array(positions), uvs: new Float32Array(uvs), indices: new Uint32Array(indices) });
  const shader = Shader.from({ gl: { vertex: VERTEX, fragment, preferredFragmentPrecision: "highp" }, resources: { waterUniforms: uniforms } });
  const mesh = new Mesh({ geometry, shader });
  mesh.on("destroyed", () => {
    shader.destroy();
    geometry.destroy();
  });
  return { mesh, uniforms };
}

/** A strip between two lines of the same length: u the distance along `a`, v 0 at `a` and 1 at `b`. */
function strip(a: readonly Point[], b: readonly Point[], closed: boolean, fragment: string, cell: number, width: number): Part {
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  let s = 0;
  const n = a.length;
  for (let i = 0; i <= (closed ? n : n - 1); i++) {
    const k = i % n;
    if (i > 0) s += Math.hypot(a[k].x - a[(i - 1) % n].x, a[k].y - a[(i - 1) % n].y);
    positions.push(a[k].x, a[k].y, b[k].x, b[k].y);
    uvs.push(s, 0, s, 1);
    if (i > 0) {
      const q = (i - 1) * 2;
      indices.push(q, q + 1, q + 2, q + 1, q + 3, q + 2);
    }
  }
  return part(positions, uvs, indices, fragment, cell, width);
}

export function buildWaterLayer(scene: WaterScene): WaterHandle {
  const container = new Container();
  const parts: Part[] = [];
  const { cell } = scene;
  for (const w of scene.waters) {
    if (w.kind === "river") {
      const line = smoothLine(w.points, false, 3);
      const left = offsetPolyline(line, false, w.width / 2);
      const right = offsetPolyline(line, false, -w.width / 2);
      parts.push(strip(left, right, false, RIVER, cell, w.width));
      continue;
    }
    const ring = waterOutline(w);
    if (ring.length < 3) continue;
    // The surface: a quad over the water, masked to its shape.
    const xs = ring.map((p) => p.x);
    const ys = ring.map((p) => p.y);
    const [x0, y0, x1, y1] = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
    const surface = part([x0, y0, x1, y0, x1, y1, x0, y1], [0, 0, 1, 0, 1, 1, 0, 1], [0, 1, 2, 0, 2, 3], WAVES, cell, 0);
    const mask = new Graphics().poly(ring.flatMap((p) => [p.x, p.y])).fill({ color: 0xffffff });
    surface.mesh.mask = mask;
    surface.mask = mask;
    container.addChild(mask);
    parts.push(surface);
    // The shore: a strip from the shore inwards; surf at the sea, lapping at lakes.
    const inward = ringArea(ring) > 0 ? -1 : 1;
    const reach = w.kind === "sea" ? cell * 1.3 : cell * 0.45;
    parts.push(strip(ring, offsetPolyline(ring, true, inward * reach), true, SURF, cell, w.kind === "sea" ? 1 : 0));
  }
  for (const f of waterfalls(scene.waters as Water[], scene.cliffs as Cliff[])) {
    const len = cell * 0.9;
    const ux = Math.cos(f.angle);
    const uy = Math.sin(f.angle);
    const nx = -uy * (f.width / 2);
    const ny = ux * (f.width / 2);
    const at = (t: number, side: number) => [f.x + ux * len * t + nx * side, f.y + uy * len * t + ny * side];
    parts.push(part([...at(0, -1), ...at(0, 1), ...at(1, 1), ...at(1, -1)], [0, 0, 0, 1, 1, 1, 1, 0], [0, 1, 2, 0, 2, 3], FALL, cell, f.width));
  }
  for (const p of parts) container.addChild(p.mesh);
  return {
    container,
    setTime(seconds) {
      for (const p of parts) p.uniforms.uniforms.uTime = seconds;
    },
    destroy() {
      container.destroy({ children: true });
    },
  };
}
