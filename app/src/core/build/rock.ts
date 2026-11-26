/**
 * Solid rock beside drawn walls (DC-119f): a closed wall can carry rock on one side – outside (a
 * cave or dungeon carved into the stone) or inside (a block, a pillar). The rock is drawn raised,
 * so passages look sunk into it. Only looks: walls still decide sight and movement. Pure.
 */
import { difference, intersection, union, type Geom } from 'polyclip-ts';
import { fromClip } from '../poly/polygon-clip';
import type { Polygon, Ring } from '../poly/types';
import type { Bounds, Masonry } from './masonry';
import { contours } from './generate';
import { smoothLine } from './water';

const ringOf = (w: Masonry): Ring => w.points.map((p) => [p.x, p.y] as [number, number]);

const signedArea = (r: Ring) => r.reduce((s, [x, y], i) => {
  const [nx, ny] = r[(i + 1) % r.length];
  return s + x * ny - nx * y;
}, 0) / 2;

/**
 * The ring thinned to points at least `step` apart: the reach band only needs to look right, and
 * the stroke's cost grows with its points (a generated cave ring has hundreds).
 */
function thin(r: Ring, step: number): Ring {
  const out: Ring = [r[0]];
  for (const p of r) {
    const last = out[out.length - 1];
    if (Math.hypot(p[0] - last[0], p[1] - last[1]) >= step) out.push(p);
  }
  return out.length >= 3 ? out : r;
}

/**
 * The area within `reach` of a closed ring (its inside included), DC-119f: the ring is laid on a
 * grid a third of the reach wide, widened by the reach and traced back into rings, then
 * smoothed. Far cheaper than uniting a brush stroke of hundreds of parts, and the rock's outer
 * edge only needs to look natural. Returns outer rings and hole rings (by orientation).
 */
function reachArea(r: Ring, reach: number): { outer: Ring[]; holes: Ring[] } {
  const step = reach / 3;
  const xs = r.map(([x]) => x);
  const ys = r.map(([, y]) => y);
  const x0 = Math.min(...xs) - reach - step * 2;
  const y0 = Math.min(...ys) - reach - step * 2;
  const cols = Math.ceil((Math.max(...xs) + reach + step * 2 - x0) / step);
  const rows = Math.ceil((Math.max(...ys) + reach + step * 2 - y0) / step);
  const open = new Uint8Array(cols * rows);
  const pts = r.map(([x, y]) => ({ x, y }));
  const inside = (px: number, py: number) => {
    let c = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const a = pts[i];
      const b = pts[j];
      if (a.y > py !== b.y > py && px < ((b.x - a.x) * (py - a.y)) / (b.y - a.y) + a.x) c = !c;
    }
    return c;
  };
  // Inside the ring, and the cells the ring runs through …
  const edge = new Uint8Array(cols * rows);
  for (let gy = 0; gy < rows; gy++)
    for (let gx = 0; gx < cols; gx++) if (inside(x0 + (gx + 0.5) * step, y0 + (gy + 0.5) * step)) open[gy * cols + gx] = 1;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    const parts = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / (step / 2)));
    for (let q = 0; q <= parts; q++) {
      const gx = Math.floor((a.x + ((b.x - a.x) * q) / parts - x0) / step);
      const gy = Math.floor((a.y + ((b.y - a.y) * q) / parts - y0) / step);
      edge[gy * cols + gx] = 1;
    }
  }
  // … widened by the reach: a round stamp (radius 3 cells = the reach) around each of those.
  const stamp: [number, number][] = [];
  for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) if (dx * dx + dy * dy <= 10) stamp.push([dx, dy]);
  for (let gy = 0; gy < rows; gy++)
    for (let gx = 0; gx < cols; gx++) {
      if (!edge[gy * cols + gx]) continue;
      for (const [dx, dy] of stamp) {
        const nx = gx + dx;
        const ny = gy + dy;
        if (nx >= 0 && ny >= 0 && nx < cols && ny < rows) open[ny * cols + nx] = 1;
      }
    }
  const outer: Ring[] = [];
  const holes: Ring[] = [];
  for (const ring of contours(open, cols, rows)) {
    // Through the middles of the grid edges, not their corners: no staircase survives the smoothing.
    const mids = ring.map(([x, y], i) => {
      const [nx, ny] = ring[(i + 1) % ring.length];
      return { x: x0 + ((x + nx) / 2) * step, y: y0 + ((y + ny) / 2) * step };
    });
    const smooth = smoothLine(mids, true, 3).map((p) => [p.x, p.y] as [number, number]);
    // Contours keep the open side on the left: outer rings and holes run opposite ways.
    (signedArea(smooth) < 0 ? outer : holes).push(smooth);
  }
  return { outer, holes };
}

/** The last result: rock is recomputed only when the rock-bearing rings or the area change. */
let last: { key: string; value: Polygon[] } | null = null;

/**
 * The rock of a drawing, clipped to the map's area: everything outside the "outside" rings (or
 * within their reach), never inside one of them, plus the inside of the "inside" rings.
 */
export function rockArea(masonry: readonly Masonry[], area: Bounds): Polygon[] {
  // Rings without area (all points on a line) carry no rock.
  const solid = masonry.filter((w) => w.closed && w.solid && w.points.length >= 3 && Math.abs(signedArea(ringOf(w))) > 1);
  if (!solid.length) return [];
  const key = JSON.stringify([area, solid.map((w) => [w.solid, w.solidReach ?? 0, w.points])]);
  if (last?.key === key) return last.value;
  const value = computeRock(solid, area);
  last = { key, value };
  return value;
}

/**
 * Order matters: the outside rock first, every outside ring carved out of it, then the blocks.
 * So a cave drawn inside a rock block is filled by the block – the generator never makes one.
 */
function computeRock(solid: readonly Masonry[], area: Bounds): Polygon[] {
  const box: Ring = [[area.x, area.y], [area.x + area.w, area.y], [area.x + area.w, area.y + area.h], [area.x, area.y + area.h]];
  // Snapping to a fine grid makes shared points exact, which the clipper needs (as masonryOutline does).
  for (const grid of [1 / 1024, 1 / 64, 1]) {
    const snap = (rings: Ring[]): Geom => rings.map((ring) => ring.map(([x, y]) => [Math.round(x / grid) * grid, Math.round(y / grid) * grid])) as Geom;
    try {
      const fills: Geom[] = [];
      const carves: Geom[] = [];
      const blocks: Geom[] = [];
      for (const w of solid) {
        const r = ringOf(w);
        if (w.solid === 'inside') {
          blocks.push(snap([r]));
          continue;
        }
        carves.push(snap([r]));
        if (w.solidReach && w.solidReach > 0) {
          // The ring and everything within its reach, holes left out.
          const { outer, holes } = reachArea(thin(r, w.solidReach / 3), w.solidReach);
          if (!outer.length) fills.push(snap([r]));
          else {
            let reached = union(snap([outer[0]]), ...outer.slice(1).map((o) => snap([o]))) as Geom;
            if (holes.length) reached = difference(reached, ...holes.map((h) => snap([h]))) as Geom;
            fills.push(union(reached, snap([r])) as Geom);
          }
        } else fills.push(snap([box]));
      }
      let rock: Geom | null = fills.length ? (union(fills[0], ...fills.slice(1)) as Geom) : null;
      if (rock && carves.length) rock = difference(rock, ...carves) as Geom;
      if (blocks.length) rock = rock ? (union(rock, ...blocks) as Geom) : (union(blocks[0], ...blocks.slice(1)) as Geom);
      if (!rock) return [];
      return fromClip(intersection(rock, snap([box])) as [number, number][][][]);
    } catch {
      // Try the next, coarser grid.
    }
  }
  return [];
}
