/**
 * Paints drawn cliffs and slopes (E-34) into a drawn map: each edge's face as a band on its lower
 * side (rock and earth with a ragged foot), a shadow below it, a dark top edge with a light lip;
 * scree as a band of stones, a chasm falling into black. The look follows the biome (snow cap,
 * dry, ash, swamp), growth lines the upper edge. Everything depends on the place and the cliff's
 * seed only, so nothing flickers. Map coordinates; the caller has translated the context.
 */
import { cliffEdges, offsetPolyline, type Cliff, type CliffKind } from '../core/build/cliffs';
import { noise2 } from '../core/build/handDrawn';
import type { Point } from '../core/geometry';
import type { BuildTextures, PartSlot } from './build/textures';

type WiredCliff = Omit<Cliff, 'layer'> & { biome?: string };

/** Depth of a face, in cells. */
const FACE: Record<CliffKind, number> = { rock: 0.6, earth: 0.55, scree: 1, chasm: 0.9 };
/** How ragged a face's foot is, as a share of its depth. */
const RAGGED: Record<CliffKind, number> = { rock: 0.35, earth: 0.2, scree: 0.3, chasm: 0.15 };

/** A tint over growth and faces per biome; none: as painted. */
const TINT: Record<string, string | undefined> = {
  schnee: 'rgba(232,240,248,.55)',
  wueste: 'rgba(206,172,104,.45)',
  asche: 'rgba(70,66,62,.55)',
  sumpf: 'rgba(52,84,40,.3)',
  kueste: 'rgba(196,182,140,.25)',
};

/** A line with its points moved across it by the noise at their place. */
function ragged(points: readonly Point[], closed: boolean, amount: number, scale: number, seed: number): Point[] {
  const out: Point[] = [];
  const pts = closed ? [...points, points[0]] : points;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    const n = Math.max(1, Math.round(len / Math.max(4, scale / 3)));
    const nx = len ? -(b.y - a.y) / len : 0;
    const ny = len ? (b.x - a.x) / len : 0;
    for (let k = i === 1 ? 0 : 1; k <= n; k++) {
      const t = k / n;
      const x = a.x + (b.x - a.x) * t;
      const y = a.y + (b.y - a.y) * t;
      const d = noise2(x / scale, y / scale, seed) * amount;
      out.push({ x: x + nx * d, y: y + ny * d });
    }
  }
  if (closed) out.pop();
  return out;
}

function trace(g: CanvasRenderingContext2D, points: readonly Point[], closed: boolean): void {
  points.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y)));
  if (closed) g.closePath();
}

/** The band between an edge and its foot: one path (two rings for a closed edge). */
function band(edge: readonly Point[], foot: readonly Point[], closed: boolean): Path2D {
  const p = new Path2D();
  if (closed) {
    edge.forEach((q, i) => (i ? p.lineTo(q.x, q.y) : p.moveTo(q.x, q.y)));
    p.closePath();
    foot.forEach((q, i) => (i ? p.lineTo(q.x, q.y) : p.moveTo(q.x, q.y)));
    p.closePath();
  } else {
    [...edge, ...[...foot].reverse()].forEach((q, i) => (i ? p.lineTo(q.x, q.y) : p.moveTo(q.x, q.y)));
    p.closePath();
  }
  return p;
}

function hash(a: number, b: number): number {
  let h = Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

/** Growth pictures tinted for a biome, made once each. */
const tinted = new Map<string, HTMLCanvasElement>();
function growthPicture(tex: BuildTextures, slot: PartSlot, biome: string): HTMLCanvasElement {
  const tint = TINT[biome];
  if (!tint) return tex.part[slot];
  const key = `${slot}:${biome}`;
  let c = tinted.get(key);
  if (!c) {
    const src = tex.part[slot];
    c = document.createElement('canvas');
    c.width = src.width;
    c.height = src.height;
    const g = c.getContext('2d')!;
    g.drawImage(src, 0, 0);
    g.globalCompositeOperation = 'source-atop';
    g.fillStyle = tint;
    g.fillRect(0, 0, c.width, c.height);
    tinted.set(key, c);
  }
  return c;
}

const GROWTH: PartSlot[] = ['growth-grass', 'growth-bush', 'growth-moss'];

export function paintCliffs(g: CanvasRenderingContext2D, cliffs: readonly WiredCliff[], mapBiome: string, cell: number, tex: BuildTextures): void {
  for (const c of cliffs) {
    const biome = c.biome ?? mapBiome;
    const depth = FACE[c.kind] * cell;
    const edges = cliffEdges({ ...c, layer: undefined } as Cliff);
    edges.forEach((e, k) => {
      const seed = c.seed * 31 + k;
      const foot = ragged(offsetPolyline(e.points, e.closed, -depth), e.closed, depth * RAGGED[c.kind], cell * 0.6, seed);
      const face = band(e.points, foot, e.closed);
      // The shadow the face casts on the lower ground.
      const shadowFoot = offsetPolyline(e.points, e.closed, -depth * 1.7);
      g.save();
      g.fillStyle = c.kind === 'chasm' ? 'rgba(0,0,0,.85)' : 'rgba(0,0,0,.22)';
      g.fill(band(e.points, shadowFoot, e.closed), 'evenodd');
      g.restore();
      // The face.
      g.save();
      if (c.kind === 'chasm') {
        g.fillStyle = 'rgba(8,8,10,.95)';
      } else {
        const src = tex.surface[`cliff-${c.kind}`];
        const pattern = g.createPattern(src, 'repeat');
        pattern?.setTransform(new DOMMatrix().translate((seed & 255) * 2.7, ((seed >> 8) & 255) * 1.9).scale((cell * 1.5) / src.width));
        g.fillStyle = pattern ?? '#5e5a55';
      }
      g.fill(face, 'evenodd');
      // Darker towards the foot: a second band over the lower half.
      if (c.kind !== 'chasm') {
        g.fillStyle = c.kind === 'scree' ? 'rgba(0,0,0,.12)' : 'rgba(0,0,0,.28)';
        g.fill(band(offsetPolyline(e.points, e.closed, -depth * 0.45), foot, e.closed), 'evenodd');
        const tint = TINT[biome];
        if (tint) {
          g.fillStyle = tint.replace(/,[.\d]+\)$/, ',.22)');
          g.fill(face, 'evenodd');
        }
      }
      g.restore();
      // The top edge: dark line with a light lip above it (scree has no edge).
      if (c.kind !== 'scree') {
        g.save();
        g.lineJoin = 'round';
        g.lineCap = 'round';
        g.beginPath();
        trace(g, offsetPolyline(e.points, e.closed, 1.5), e.closed);
        g.strokeStyle = 'rgba(255,245,225,.35)';
        g.lineWidth = 1.5;
        g.stroke();
        g.beginPath();
        trace(g, e.points, e.closed);
        g.strokeStyle = 'rgba(16,12,8,.85)';
        g.lineWidth = Math.max(2, cell * 0.04);
        g.stroke();
        g.restore();
      }
      // Snow lies on the upper edge.
      if (biome === 'schnee' && c.kind !== 'chasm') {
        g.save();
        g.beginPath();
        trace(g, ragged(offsetPolyline(e.points, e.closed, depth * 0.08), e.closed, depth * 0.14, cell * 0.25, seed + 7), e.closed);
        g.strokeStyle = 'rgba(244,248,252,.78)';
        g.lineWidth = depth * 0.16;
        g.lineJoin = 'round';
        g.lineCap = 'round';
        g.stroke();
        g.restore();
      }
      // Growth along the upper edge, after the biome (none on ash).
      if (c.growth && biome !== 'asche' && c.kind !== 'chasm') paintGrowth(g, e.points, e.closed, depth, cell, seed, biome, tex);
    });
  }
}

function paintGrowth(g: CanvasRenderingContext2D, points: readonly Point[], closed: boolean, depth: number, cell: number, seed: number, biome: string, tex: BuildTextures): void {
  const line = offsetPolyline(points, closed, depth * 0.25);
  const pts = closed ? [...line, line[0]] : line;
  const spacing = cell * 0.45;
  let n = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    for (let s = 0; s < len; s += spacing) {
      n++;
      const x = a.x + ((b.x - a.x) * s) / len;
      const y = a.y + ((b.y - a.y) * s) / len;
      const r = hash(Math.round(x), Math.round(y) + seed);
      // Not everywhere: about every second place gets a plant.
      if (r > 0.55) continue;
      const slot = GROWTH[Math.floor(hash(n, seed) * GROWTH.length) % GROWTH.length];
      const size = cell * (0.35 + hash(seed, n) * 0.4);
      const back = hash(n + 7, seed) * depth * 0.4;
      const nx = len ? -(b.y - a.y) / len : 0;
      const ny = len ? (b.x - a.x) / len : 0;
      g.save();
      g.translate(x - nx * back, y - ny * back);
      g.rotate(r * Math.PI * 8);
      g.drawImage(growthPicture(tex, slot, biome), -size / 2, -size / 2, size, size);
      g.restore();
    }
  }
}
