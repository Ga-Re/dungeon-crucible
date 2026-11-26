/**
 * Automatic details of drawn maps (E-35), each switchable per map: stones and reeds along shores,
 * plants at the foot of walls where natural ground meets them, worn ground in front of doors.
 * Placed by place and seed only, so nothing flickers. Map coordinates; the caller has translated
 * the context.
 */
import { offsetPolyline } from '../core/build/cliffs';
import { riverRibbon, waterOutline, type Water } from '../core/build/water';
import type { Masonry } from '../core/build/masonry';
import type { Point } from '../core/geometry';
import type { BuildTextures, PartSlot } from './build/textures';
import { growthPicture } from './cliffsPaint';

function hash(a: number, b: number): number {
  let h = Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

/** Calls `at` at every `spacing` along a line (closed or open), with the line's direction there. */
function along(points: readonly Point[], closed: boolean, spacing: number, at: (p: Point, angle: number, n: number) => void): void {
  const pts = closed ? [...points, points[0]] : points;
  let n = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    const angle = Math.atan2(b.y - a.y, b.x - a.x);
    for (let s = 0; s < len; s += spacing) at({ x: a.x + ((b.x - a.x) * s) / len, y: a.y + ((b.y - a.y) * s) / len }, angle, n++);
  }
}

function sprite(g: CanvasRenderingContext2D, img: HTMLCanvasElement, p: Point, size: number, turn: number): void {
  g.save();
  g.translate(p.x, p.y);
  g.rotate(turn);
  g.drawImage(img, -size / 2, -size / 2, size, size);
  g.restore();
}

/** Stones along every shore; reeds along rivers and lakes (the sea has gravel and stones). */
export function paintShore(g: CanvasRenderingContext2D, waters: readonly Omit<Water, 'layer'>[], cell: number, tex: BuildTextures, biome: string): void {
  for (const w of waters) {
    const ring = waterOutline(w);
    if (ring.length < 3) continue;
    // Just on the water's edge: the river's banks, the ring of a lake or the sea.
    const banks = w.kind === 'river' ? riverRibbon(w) : null;
    const lines: { points: Point[]; closed: boolean }[] = banks
      ? [{ points: banks.left, closed: false }, { points: banks.right, closed: false }]
      : [{ points: ring, closed: true }];
    for (const l of lines)
      along(l.points, l.closed, cell * 0.42, (p, angle, n) => {
        const r = hash(Math.round(p.x), Math.round(p.y) + w.seed);
        if (r > 0.5) return;
        const reeds = w.kind !== 'sea' && biome !== 'schnee' && biome !== 'wueste' && hash(n, w.seed) < 0.45;
        const slot: PartSlot = reeds ? 'shore-reeds' : 'shore-stones';
        const size = cell * (reeds ? 0.5 + r * 0.5 : 0.3 + r * 0.35);
        sprite(g, growthPicture(tex, slot, biome), p, size, angle + r * 9);
      });
  }
}

/**
 * Plants at the foot of walls where they stand on natural ground (`onGround`): grass and moss
 * creeping up to them, sparse and after the biome; never inside rooms (their floor is no ground).
 */
export function paintWallFeet(g: CanvasRenderingContext2D, walls: readonly Omit<Masonry, 'layer'>[], cell: number, tex: BuildTextures, biome: string, onGround: (p: Point) => boolean): void {
  if (biome === 'asche') return;
  for (const w of walls)
    for (const side of [1, -1])
      along(offsetPolyline(w.points, w.closed, side * w.thickness * 0.9), w.closed, cell * 0.38, (p, angle, n) => {
        const r = hash(Math.round(p.x) + 7, Math.round(p.y) + w.seed);
        if (r > 0.4 || !onGround(p)) return;
        const slot: PartSlot = hash(n, w.seed) < 0.6 ? 'growth-grass' : 'growth-moss';
        sprite(g, growthPicture(tex, slot, biome), p, cell * (0.22 + r * 0.4), angle + r * 11);
      });
}

/** Worn ground on both sides of each door: a soft darker patch where feet have passed. */
export function paintWornDoors(g: CanvasRenderingContext2D, doors: readonly { a: Point; b: Point }[], cell: number): void {
  for (const d of doors) {
    const mx = (d.a.x + d.b.x) / 2;
    const my = (d.a.y + d.b.y) / 2;
    const len = Math.hypot(d.b.x - d.a.x, d.b.y - d.a.y) || 1;
    const nx = -(d.b.y - d.a.y) / len;
    const ny = (d.b.x - d.a.x) / len;
    for (const side of [1, -1]) {
      const cx = mx + nx * side * cell * 0.45;
      const cy = my + ny * side * cell * 0.45;
      const grad = g.createRadialGradient(cx, cy, 0, cx, cy, cell * 0.6);
      grad.addColorStop(0, 'rgba(40,30,20,.16)');
      grad.addColorStop(1, 'rgba(40,30,20,0)');
      g.fillStyle = grad;
      g.fillRect(cx - cell * 0.6, cy - cell * 0.6, cell * 1.2, cell * 1.2);
    }
  }
}
