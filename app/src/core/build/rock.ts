/**
 * Solid rock beside drawn walls (DC-119f): a closed wall can carry rock on one side – outside (a
 * cave or dungeon carved into the stone) or inside (a block, a pillar). The rock is drawn raised,
 * so passages look sunk into it. Only looks: walls still decide sight and movement. Pure.
 */
import { difference, intersection, union, type Geom } from 'polyclip-ts';
import { fromClip } from '../poly/polygon-clip';
import { strokeArea } from '../poly/shapes';
import type { Polygon, Ring } from '../poly/types';
import type { Bounds, Masonry } from './masonry';

export const SOLID_SIDES = ['outside', 'inside'] as const;
export type SolidSide = (typeof SOLID_SIDES)[number];

const ringOf = (w: Masonry): Ring => w.points.map((p) => [p.x, p.y] as [number, number]);

/**
 * The rock of a drawing, clipped to the map's area: everything outside the "outside" rings (or
 * within their reach), never inside one of them, plus the inside of the "inside" rings.
 */
export function rockArea(masonry: readonly Masonry[], area: Bounds): Polygon[] {
  const solid = masonry.filter((w) => w.closed && w.solid && w.points.length >= 3);
  if (!solid.length) return [];
  const box: Ring = [[area.x, area.y], [area.x + area.w, area.y], [area.x + area.w, area.y + area.h], [area.x, area.y + area.h]];
  const fills: Ring[][] = [];
  const carves: Ring[][] = [];
  const blocks: Ring[][] = [];
  for (const w of solid) {
    const r = ringOf(w);
    if (w.solid === 'inside') {
      blocks.push([r]);
      continue;
    }
    carves.push([r]);
    if (w.solidReach && w.solidReach > 0) {
      // The ring itself plus a band of the reach around it.
      const band = strokeArea([...r, r[0]], w.solidReach);
      fills.push([r]);
      if (band) fills.push([band.outer, ...band.holes]);
    } else fills.push([box]);
  }
  // Snapping to a fine grid makes shared points exact, which the clipper needs (as masonryOutline does).
  for (const grid of [1 / 1024, 1 / 64, 1]) {
    const snap = (rings: Ring[]): Geom => rings.map((ring) => ring.map(([x, y]) => [Math.round(x / grid) * grid, Math.round(y / grid) * grid])) as Geom;
    try {
      let rock: Geom | null = fills.length ? (union(snap(fills[0]), ...fills.slice(1).map(snap)) as Geom) : null;
      if (rock && carves.length) rock = difference(rock, ...carves.map(snap)) as Geom;
      if (blocks.length) rock = rock ? (union(rock, ...blocks.map(snap)) as Geom) : (union(snap(blocks[0]), ...blocks.slice(1).map(snap)) as Geom);
      if (!rock) return [];
      return fromClip(intersection(rock, snap([box])) as [number, number][][][]);
    } catch {
      // Try the next, coarser grid.
    }
  }
  return [];
}
