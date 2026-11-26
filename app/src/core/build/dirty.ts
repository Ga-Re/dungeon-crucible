/**
 * What has to be painted again after an edit of drawn walls (E-33): the walls that changed
 * (where they were and where they are, with room for shadow, jitter and stones), the walls whose
 * doors changed, and the floors whose nearest wall is another one now. Door states and cracks
 * are drawn apart (decals) and never count. A change of the area or grid repaints everything.
 * Pure: the caller keeps the last drawing.
 */
import { floorField } from './handDrawn';
import type { Bounds, Masonry } from './masonry';
import type { Drawing } from './playerDrawing';

type AnyDrawing = Pick<Drawing, 'origin' | 'width' | 'height' | 'masonry' | 'doors'> & Partial<Pick<Drawing, 'cliffs' | 'biome' | 'waters' | 'lightAngle' | 'autoShore' | 'autoGrowth' | 'floors'>>;

/** Farther than this many cells from every wall (and outside closed rings) lies natural ground (E-34). */
export const FLOOR_REACH_CELLS = 3;

/** Size of the floor samples (map px): at most 250 000 of them over the map, at least half a cell. Shared with `drawnMap`. */
export function floorStep(d: Pick<Drawing, 'width' | 'height'>, cell: number): number {
  return Math.max(cell / 2, Math.sqrt((d.width * d.height) / 250_000));
}

function boundsOf(w: { points: readonly { x: number; y: number }[] }, pad: number): Bounds {
  const xs = w.points.map((p) => p.x);
  const ys = w.points.map((p) => p.y);
  const x = Math.min(...xs) - pad;
  const y = Math.min(...ys) - pad;
  return { x, y, w: Math.max(...xs) + pad - x, h: Math.max(...ys) + pad - y };
}

function union(a: Bounds | null, b: Bounds): Bounds {
  if (!a) return b;
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y };
}

export function changedRegion(prev: AnyDrawing, next: AnyDrawing, cell: number, prevCell = cell): Bounds | 'all' | null {
  if (cell !== prevCell || prev.biome !== next.biome || prev.lightAngle !== next.lightAngle || prev.autoShore !== next.autoShore || prev.autoGrowth !== next.autoGrowth || prev.width !== next.width || prev.height !== next.height || prev.origin.x !== next.origin.x || prev.origin.y !== next.origin.y) return 'all';
  const doorsKey = (d: AnyDrawing, id: string) => JSON.stringify(d.doors.filter((x) => x.wall === id).map((x) => [x.at, x.width]));
  const before = new Map(prev.masonry.map((w) => [w.id, w]));
  const after = new Map(next.masonry.map((w) => [w.id, w]));
  let region: Bounds | null = null;
  // Room around a wall for its shadow, jitter, corner stones and the blend of floors at it.
  // Its height too (E-35): the raised top, towers and the longer shadow of a high wall.
  const pad = (w: AnyDrawing['masonry'][number]) => w.thickness * 2 + cell + (w.height ?? cell) * 2;
  for (const id of new Set([...before.keys(), ...after.keys()])) {
    const a = before.get(id);
    const b = after.get(id);
    if (a && b && JSON.stringify(a) === JSON.stringify(b) && doorsKey(prev, id) === doorsKey(next, id)) continue;
    if (a) region = union(region, boundsOf(a, pad(a)));
    if (b) region = union(region, boundsOf(b, pad(b)));
  }
  // Cliffs (E-34): with room for their face, the far edge of a ravine, terraces and growth.
  const cliffsBefore = new Map((prev.cliffs ?? []).map((c) => [c.id, c]));
  const cliffsAfter = new Map((next.cliffs ?? []).map((c) => [c.id, c]));
  for (const id of new Set([...cliffsBefore.keys(), ...cliffsAfter.keys()])) {
    const a = cliffsBefore.get(id);
    const b = cliffsAfter.get(id);
    if (a && b && JSON.stringify(a) === JSON.stringify(b)) continue;
    for (const c of [a, b]) if (c) region = union(region, boundsOf({ points: c.points }, c.width * Math.max(1, c.steps) + cell * 2));
  }
  // Water (E-35): with room for its shore and the waterfalls it makes at cliffs.
  const watersBefore = new Map((prev.waters ?? []).map((w) => [w.id, w]));
  const watersAfter = new Map((next.waters ?? []).map((w) => [w.id, w]));
  for (const id of new Set([...watersBefore.keys(), ...watersAfter.keys()])) {
    const a = watersBefore.get(id);
    const b = watersAfter.get(id);
    if (a && b && JSON.stringify(a) === JSON.stringify(b)) continue;
    for (const w of [a, b]) if (w) region = union(region, boundsOf({ points: w.points }, w.width + cell * 2));
  }
  // Painted floors (DC-107b): where they were and are, with room for their soft edge.
  const floorsBefore = new Map((prev.floors ?? []).map((f) => [f.id, f]));
  const floorsAfter = new Map((next.floors ?? []).map((f) => [f.id, f]));
  for (const id of new Set([...floorsBefore.keys(), ...floorsAfter.keys()])) {
    const a = floorsBefore.get(id);
    const b = floorsAfter.get(id);
    if (a && b && JSON.stringify(a) === JSON.stringify(b)) continue;
    for (const f of [a, b]) if (f) region = union(region, boundsOf({ points: f.shape.flatMap((p) => p.outer.map(([x, y]) => ({ x, y }))) }, cell));
  }
  if (!region) return null;
  // Floors: wherever the nearest wall's style is another now (softened over two samples).
  const step = floorStep(next, cell);
  const area = { x: next.origin.x, y: next.origin.y, w: next.width, h: next.height };
  const f0 = floorField(prev.masonry as Masonry[], area, step, FLOOR_REACH_CELLS * cell);
  const f1 = floorField(next.masonry as Masonry[], area, step, FLOOR_REACH_CELLS * cell);
  f1.styles.forEach((s, i) => {
    if (s === f0.styles[i]) return;
    const c = i % f1.cols;
    const r = Math.floor(i / f1.cols);
    region = union(region, { x: area.x + (c - 2) * step, y: area.y + (r - 2) * step, w: 5 * step, h: 5 * step });
  });
  return region;
}
