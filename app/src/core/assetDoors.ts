/**
 * Doors that assets bring (E-29, DC-042): an asset's door line, drawn in the asset editor, becomes
 * a door where the asset is placed, and a wall it lies on gets a gap there. Both are derived when
 * sight and light are computed – the map's walls stay as drawn, so moving or removing the asset
 * moves or closes the gap. The door's state is scene state under `<placement id>:door`. Pure.
 */
import { toMap } from './cover';
import type { GridConfig } from './grid';
import type { AssetSidecar } from './sidecar';
import type { MapAssetPlacement, Wall } from './scene';

/** What this needs of each asset, by path. */
export type DoorInfo = Readonly<Record<string, Readonly<Pick<AssetSidecar, 'sizeCells' | 'door'>>>>;

/** How far (px) a door line may lie off a wall and still cut it. */
const ON_WALL_PX = 3;
/** Pieces shorter than this (px) are left out. */
const MIN_PIECE_PX = 0.5;

export function assetDoorId(placementId: string): string {
  return `${placementId}:door`;
}

/** The doors of placed assets as door walls on the map, open as the scene says (closed by default). */
export function assetDoorWalls(placements: readonly MapAssetPlacement[], info: DoorInfo, grid: GridConfig, open: Readonly<Record<string, boolean>>): Wall[] {
  const out: Wall[] = [];
  for (const p of placements) {
    const a = info[p.assetPath];
    const d = a?.door;
    if (!d) continue;
    const size = a.sizeCells ?? { w: 1, h: 1 };
    const [x1, y1] = toMap(p, size, grid, [d.x1, d.y1]);
    const [x2, y2] = toMap(p, size, grid, [d.x2, d.y2]);
    const id = assetDoorId(p.id);
    out.push({ id, kind: 'door', x1, y1, x2, y2, open: open[id] ?? false, ...(p.layer ? { layer: p.layer } : {}) });
  }
  return out;
}

/** The part of `w` (as parameters 0…1 along it) that the door covers, if the door lies on it. */
function coveredBy(w: Wall, d: Wall): [number, number] | null {
  const dx = w.x2 - w.x1;
  const dy = w.y2 - w.y1;
  const len = Math.hypot(dx, dy);
  if (len === 0) return null;
  const off = (x: number, y: number) => Math.abs(dx * (y - w.y1) - dy * (x - w.x1)) / len;
  if (off(d.x1, d.y1) > ON_WALL_PX || off(d.x2, d.y2) > ON_WALL_PX) return null;
  const at = (x: number, y: number) => ((x - w.x1) * dx + (y - w.y1) * dy) / (len * len);
  const a = Math.max(0, Math.min(at(d.x1, d.y1), at(d.x2, d.y2)));
  const b = Math.min(1, Math.max(at(d.x1, d.y1), at(d.x2, d.y2)));
  return b > a ? [a, b] : null;
}

/** The walls with a gap wherever a door lies on one (doors, windows and cliffs stay whole). */
export function cutForDoors(walls: readonly Wall[], doors: readonly Wall[]): Wall[] {
  let out = [...walls];
  for (const d of doors) {
    const next: Wall[] = [];
    for (const w of out) {
      const gap = w.kind === 'wall' ? coveredBy(w, d) : null;
      if (!gap) {
        next.push(w);
        continue;
      }
      const len = Math.hypot(w.x2 - w.x1, w.y2 - w.y1);
      const point = (t: number) => ({ x: w.x1 + (w.x2 - w.x1) * t, y: w.y1 + (w.y2 - w.y1) * t });
      const pieces: [number, number][] = [[0, gap[0]], [gap[1], 1]];
      pieces.forEach(([s, e], i) => {
        if ((e - s) * len < MIN_PIECE_PX) return;
        const p = point(s);
        const q = point(e);
        next.push({ ...w, id: `${w.id}~${i + 1}`, x1: p.x, y1: p.y, x2: q.x, y2: q.y });
      });
    }
    out = next;
  }
  return out;
}

let cache: { walls: readonly Wall[]; key: string; out: readonly Wall[] } | null = null;

/**
 * The walls sight and light use: the map's, cut open where asset doors lie, plus those doors.
 * The same list while nothing changed, so what was computed for it is kept.
 */
export function wallsWithAssetDoors(walls: readonly Wall[], placements: readonly MapAssetPlacement[], info: DoorInfo, grid: GridConfig, open: Readonly<Record<string, boolean>>): readonly Wall[] {
  const doors = assetDoorWalls(placements, info, grid, open);
  if (!doors.length) return walls;
  const key = JSON.stringify(doors);
  if (cache && cache.walls === walls && cache.key === key) return cache.out;
  const out = [...cutForDoors(walls, doors), ...doors];
  cache = { walls, key, out };
  return out;
}
