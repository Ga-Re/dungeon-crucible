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

type AnyDrawing = Pick<Drawing, 'origin' | 'width' | 'height' | 'masonry' | 'doors'>;

/** Size of the floor samples (map px): at most 250 000 of them over the map, at least half a cell. Shared with `drawnMap`. */
export function floorStep(d: Pick<Drawing, 'width' | 'height'>, cell: number): number {
  return Math.max(cell / 2, Math.sqrt((d.width * d.height) / 250_000));
}

function boundsOf(w: AnyDrawing['masonry'][number], pad: number): Bounds {
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
  if (cell !== prevCell || prev.width !== next.width || prev.height !== next.height || prev.origin.x !== next.origin.x || prev.origin.y !== next.origin.y) return 'all';
  const doorsKey = (d: AnyDrawing, id: string) => JSON.stringify(d.doors.filter((x) => x.wall === id).map((x) => [x.at, x.width]));
  const before = new Map(prev.masonry.map((w) => [w.id, w]));
  const after = new Map(next.masonry.map((w) => [w.id, w]));
  let region: Bounds | null = null;
  // Room around a wall for its shadow, jitter, corner stones and the blend of floors at it.
  const pad = (w: AnyDrawing['masonry'][number]) => w.thickness * 2 + cell;
  for (const id of new Set([...before.keys(), ...after.keys()])) {
    const a = before.get(id);
    const b = after.get(id);
    if (a && b && JSON.stringify(a) === JSON.stringify(b) && doorsKey(prev, id) === doorsKey(next, id)) continue;
    if (a) region = union(region, boundsOf(a, pad(a)));
    if (b) region = union(region, boundsOf(b, pad(b)));
  }
  if (!region) return null;
  // Floors: wherever the nearest wall's style is another now (softened over two samples).
  const step = floorStep(next, cell);
  const area = { x: next.origin.x, y: next.origin.y, w: next.width, h: next.height };
  const f0 = floorField(prev.masonry as Masonry[], area, step);
  const f1 = floorField(next.masonry as Masonry[], area, step);
  f1.styles.forEach((s, i) => {
    if (s === f0.styles[i]) return;
    const c = i % f1.cols;
    const r = Math.floor(i / f1.cols);
    region = union(region, { x: area.x + (c - 2) * step, y: area.y + (r - 2) * step, w: 5 * step, h: 5 * step });
  });
  return region;
}
