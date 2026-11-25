/**
 * Cover masks and lights of placed assets (E-27, DC-108): an asset's mask and light are stored in
 * cells of its footprint; here they are put on the map, turned and scaled with the placement.
 * Pure.
 */
import type { GridConfig } from './grid';
import { circleArea } from './poly/shapes';
import type { Polygon } from './poly/types';
import type { AssetSidecar } from './sidecar';
import type { LightSource, MapAssetPlacement } from './scene';

/** What this needs of each asset, by path. */
export type CoverInfo = Readonly<Record<string, Readonly<Pick<AssetSidecar, 'sizeCells' | 'cover' | 'light'>>>>;

/** A point in cells of the footprint → map pixels (turned clockwise around the footprint's centre). */
function toMap(p: MapAssetPlacement, size: { w: number; h: number }, grid: GridConfig, [cx, cy]: readonly [number, number]): [number, number] {
  const lx = (cx - size.w / 2) * grid.cellWidth * p.scale;
  const ly = (cy - size.h / 2) * grid.cellHeight * p.scale;
  const r = (p.rotation * Math.PI) / 180;
  return [p.x + lx * Math.cos(r) - ly * Math.sin(r), p.y + lx * Math.sin(r) + ly * Math.cos(r)];
}

/** The cover masks of placed assets as polygons on the map. */
export function placementCovers(placements: readonly MapAssetPlacement[], info: CoverInfo, grid: GridConfig): Polygon[] {
  const out: Polygon[] = [];
  for (const p of placements) {
    const a = info[p.assetPath];
    const c = a?.cover;
    if (!c) continue;
    const size = a.sizeCells ?? { w: 1, h: 1 };
    if (c.shape === 'circle') out.push(circleArea(toMap(p, size, grid, [c.x, c.y]), c.r * Math.min(grid.cellWidth, grid.cellHeight) * p.scale, 24));
    else out.push({ outer: c.points.map((q) => toMap(p, size, grid, q)), holes: [] });
  }
  return out;
}

/** The lights placed assets bring, as light sources on the map (always on). */
export function placementLights(placements: readonly MapAssetPlacement[], info: CoverInfo, grid: GridConfig): LightSource[] {
  const out: LightSource[] = [];
  for (const p of placements) {
    const a = info[p.assetPath];
    const l = a?.light;
    if (!l) continue;
    const [x, y] = toMap(p, a.sizeCells ?? { w: 1, h: 1 }, grid, [l.x, l.y]);
    out.push({ id: `${p.id}:light`, x, y, brightFt: l.brightFt, dimFt: l.dimFt, color: l.color, on: true });
  }
  return out;
}
