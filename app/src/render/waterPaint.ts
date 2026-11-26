/**
 * Paints drawn water (E-35) into a drawn map as it looks at rest: a wet shore (the sea with a
 * band of sand), the water surface getting darker towards the deep middle, a light foam line at
 * the edge; waterfalls where rivers fall over cliffs. The moving water (`waterLayer`) lies over
 * this when the map's water is animated. Map coordinates; the caller has translated the context.
 */
import type { Cliff } from '../core/build/cliffs';
import { offsetPolyline } from '../core/build/cliffs';
import { ringArea, riverSpine, waterfalls, waterOutline, type Water } from '../core/build/water';
import { hashNoise, lineStrips } from '../core/build/variance';
import type { Point } from '../core/geometry';
import type { BuildTextures } from './build/textures';

type WiredWater = Omit<Water, 'layer'>;

function path(points: readonly Point[]): Path2D {
  const p = new Path2D();
  points.forEach((q, i) => (i ? p.lineTo(q.x, q.y) : p.moveTo(q.x, q.y)));
  p.closePath();
  return p;
}

function pattern(g: CanvasRenderingContext2D, src: HTMLCanvasElement, cell: number, cells: number, seed: number): CanvasPattern | string {
  const p = g.createPattern(src, 'repeat');
  if (!p) return '#2b5d78';
  p.setTransform(new DOMMatrix().translate((seed & 255) * 2.3, ((seed >> 8) & 255) * 1.7).scale((cell * cells) / src.width));
  return p;
}

export function paintWater(g: CanvasRenderingContext2D, waters: readonly WiredWater[], cell: number, tex: BuildTextures): void {
  for (const w of waters) {
    const ring = waterOutline(w);
    if (ring.length < 3) continue;
    const shape = path(ring);
    const inward = ringArea(ring) > 0 ? -1 : 1;
    // The surface picture: one of the water's variants, by its seed (DC-119c).
    const slot = w.kind === 'river' ? 'water-river' : 'water-deep';
    const sources = tex.variants[slot] ?? [tex.surface[slot]];
    const source = sources[Math.floor(hashNoise(w.seed, 2, 19) * sources.length)];
    g.save();
    g.lineJoin = 'round';
    // The shore: the sea lies on sand; every shore is wet and dark at the water.
    if (w.kind === 'sea') {
      g.strokeStyle = 'rgba(214,196,150,.7)';
      g.lineWidth = cell * 1.1;
      g.stroke(shape);
    }
    g.strokeStyle = 'rgba(48,38,26,.38)';
    g.lineWidth = cell * 0.32;
    g.stroke(shape);
    // The surface.
    g.fillStyle = pattern(g, source, cell, w.kind === 'river' ? 2 : 3, w.seed);
    g.fill(shape);
    if (w.kind === 'sea') {
      g.fillStyle = 'rgba(8,36,64,.22)';
      g.fill(shape);
    }
    g.clip(shape);
    // A river's texture runs with the flow (DC-119c): slices along the spine, turned to it.
    if (w.kind === 'river') {
      const perPx = source.width / (cell * 2);
      const step = cell * 0.5;
      const sw = step * 1.7 * perPx;
      const across = w.width * 1.2;
      const sh = Math.min(source.height, across * perPx);
      g.globalAlpha = 0.9;
      for (const p of lineStrips(riverSpine(w), false, step)) {
        let sx = ((p.u + w.seed * 53) * perPx) % source.width;
        if (sx < 0) sx += source.width;
        g.save();
        g.translate(p.x, p.y);
        g.rotate(p.angle);
        if (sx + sw <= source.width) g.drawImage(source, sx, 0, sw, sh, (-step * 1.7) / 2, -across / 2, step * 1.7, across);
        else {
          const first = (source.width - sx) / perPx;
          g.drawImage(source, sx, 0, source.width - sx, sh, (-step * 1.7) / 2, -across / 2, first, across);
          g.drawImage(source, 0, 0, sw - (source.width - sx), sh, (-step * 1.7) / 2 + first, -across / 2, step * 1.7 - first, across);
        }
        g.restore();
      }
      g.globalAlpha = 1;
    }
    // Shallows near the shore (DC-119c): the ground shimmers through the water.
    {
      const reach = w.kind === 'sea' ? cell * 1.1 : w.kind === 'lake' ? cell * 0.7 : Math.min(w.width * 0.3, cell * 0.6);
      const groundSrc = tex.surface[w.kind === 'sea' ? 'ground-sand' : 'floor-gravel'];
      const bandShape = (r: number) => {
        const b = path(ring);
        for (const q of [path(offsetPolyline(ring, true, inward * r))]) b.addPath(q);
        return b;
      };
      g.fillStyle = pattern(g, groundSrc, cell, 3, w.seed + 9);
      g.globalAlpha = w.kind === 'sea' ? 0.5 : 0.4;
      g.fill(bandShape(reach), 'evenodd');
      g.globalAlpha = 0.16;
      g.fill(bandShape(reach * 1.8), 'evenodd');
      g.globalAlpha = 1;
    }
    // Deeper towards the middle.
    if (w.kind === 'river') {
      const line = riverSpine(w);
      g.beginPath();
      line.forEach((q, i) => (i ? g.lineTo(q.x, q.y) : g.moveTo(q.x, q.y)));
      g.strokeStyle = 'rgba(0,26,52,.2)';
      g.lineCap = 'round';
      g.lineWidth = w.width * 0.45;
      g.stroke();
    } else {
      for (const k of [0.9, 2, 3.4]) {
        g.fillStyle = 'rgba(0,22,48,.16)';
        g.fill(path(offsetPolyline(ring, true, inward * k * cell)));
      }
    }
    g.restore();
    // Foam along the edge.
    g.save();
    g.lineJoin = 'round';
    g.strokeStyle = 'rgba(238,246,252,.6)';
    g.lineWidth = Math.max(1.5, cell * 0.035);
    g.stroke(shape);
    g.restore();
  }
}

/** Waterfalls where rivers fall over steep cliffs: falling water and spray below. */
export function paintWaterfalls(g: CanvasRenderingContext2D, waters: readonly WiredWater[], cliffs: readonly Omit<Cliff, 'layer'>[], cell: number): void {
  for (const f of waterfalls(waters as Water[], cliffs as Cliff[])) {
    const length = cell * 0.9;
    g.save();
    g.translate(f.x, f.y);
    g.rotate(f.angle);
    // Along +x the water falls; across it is as wide as the river.
    const grad = g.createLinearGradient(0, 0, length, 0);
    grad.addColorStop(0, 'rgba(225,240,250,.92)');
    grad.addColorStop(1, 'rgba(160,200,225,.55)');
    g.fillStyle = grad;
    g.fillRect(0, -f.width / 2, length, f.width);
    g.strokeStyle = 'rgba(255,255,255,.55)';
    g.lineWidth = 1.2;
    for (let k = 1; k < 8; k++) {
      const y = -f.width / 2 + (f.width * k) / 8;
      g.beginPath();
      g.moveTo(0, y);
      g.lineTo(length, y + Math.sin(k * 7.3) * 2);
      g.stroke();
    }
    // Spray where it lands.
    for (let k = 0; k < 9; k++) {
      g.fillStyle = 'rgba(245,250,255,.28)';
      g.beginPath();
      g.arc(length + Math.sin(k * 3.1) * cell * 0.15, -f.width / 2 + (f.width * (k + 0.5)) / 9, cell * (0.12 + (k % 3) * 0.05), 0, Math.PI * 2);
      g.fill();
    }
    g.restore();
  }
}
