/**
 * Interiors as asset variants (E-29, DC-042): a house asset names another asset of its group as
 * its inside and brings that inside's walls, doors and windows (in cells of its footprint). While a
 * placed house shows its interior, it is drawn with the inner picture, its walls count for sight
 * and light and its cover mask does not. Which houses show their interior is scene state; doors
 * inside open as scene state under `<placement>:in<n>`. Pure.
 */
import { toMap } from './cover';
import type { Point } from './geometry';
import type { GridConfig } from './grid';
import { footprintOf, hitsPlacement } from './placement';
import type { Polygon } from './poly/types';
import type { MapAssetPlacement, Wall } from './scene';
import type { AssetSidecar, InteriorTrigger } from './sidecar';

/** What this needs of each asset, by path. */
export type InteriorInfo = Readonly<Record<string, Readonly<Pick<AssetSidecar, 'sizeCells' | 'interior'>>>>;

type Placed = Pick<MapAssetPlacement, 'id' | 'assetPath' | 'x' | 'y' | 'rotation' | 'scale' | 'layer' | 'interiorTrigger'>;

/** A placement's interior with the trigger that applies to it (its own, else the asset's); null without one. */
export function interiorOf(p: Placed, info: InteriorInfo): { asset: string; walls: NonNullable<AssetSidecar['interior']>['walls']; trigger: InteriorTrigger } | null {
  const i = info[p.assetPath]?.interior;
  return i ? { asset: i.asset, walls: i.walls, trigger: p.interiorTrigger ?? i.trigger } : null;
}

/** The file a placement shows: the inner asset while its interior is shown. */
export function shownAssetPath(p: Placed, info: InteriorInfo, on: Readonly<Record<string, boolean>>): string {
  const i = info[p.assetPath]?.interior;
  return i && on[p.id] ? i.asset : p.assetPath;
}

export function interiorWallId(placementId: string, index: number): string {
  return `${placementId}:in${index}`;
}

/** The walls, doors and windows of the interiors shown, on the map. */
export function interiorWalls(placements: readonly Placed[], info: InteriorInfo, grid: GridConfig, on: Readonly<Record<string, boolean>>, doorsOpen: Readonly<Record<string, boolean>>): Wall[] {
  const out: Wall[] = [];
  for (const p of placements) {
    const a = info[p.assetPath];
    if (!a?.interior || !on[p.id]) continue;
    const size = a.sizeCells ?? { w: 1, h: 1 };
    a.interior.walls.forEach((w, i) => {
      const [x1, y1] = toMap(p, size, grid, [w.x1, w.y1]);
      const [x2, y2] = toMap(p, size, grid, [w.x2, w.y2]);
      const id = interiorWallId(p.id, i);
      out.push({ id, kind: w.kind, x1, y1, x2, y2, open: w.kind === 'door' ? (doorsOpen[id] ?? false) : undefined, ...(p.layer ? { layer: p.layer } : {}) });
    });
  }
  return out;
}

/** A placement's turned footprint as a polygon on the map. */
export function footprintPolygon(p: Placed, size: { w: number; h: number } | undefined, grid: GridConfig): Polygon {
  const s = size ?? { w: 1, h: 1 };
  const corner = (x: number, y: number) => toMap(p, s, grid, [x, y]);
  return { outer: [corner(0, 0), corner(s.w, 0), corner(s.w, s.h), corner(0, s.h)], holes: [] };
}

/** How far `q` is from the placement's turned footprint (0 inside). */
function distanceToFootprint(p: Placed, size: { w: number; h: number } | undefined, grid: GridConfig, q: Point): number {
  const fp = footprintOf(p, size, grid);
  const r = (-fp.rotation * Math.PI) / 180;
  const dx = q.x - fp.cx;
  const dy = q.y - fp.cy;
  const x = Math.abs(dx * Math.cos(r) - dy * Math.sin(r)) - fp.w / 2;
  const y = Math.abs(dx * Math.sin(r) + dy * Math.cos(r)) - fp.h / 2;
  return Math.hypot(Math.max(0, x), Math.max(0, y));
}

/**
 * Which houses player characters (at `characters`) have just come into – their footprint, or
 * within the distance of a "near" house – and which ones all have left, against `wasInside` from
 * the last call. Houses triggered by click only take no part.
 */
export function interiorChanges(placements: readonly Placed[], info: InteriorInfo, grid: GridConfig, characters: readonly Point[], wasInside: ReadonlySet<string>): { entered: string[]; left: string[]; inside: Set<string> } {
  const inside = new Set<string>();
  for (const p of placements) {
    const i = interiorOf(p, info);
    if (!i || i.trigger.mode === 'click') continue;
    const size = info[p.assetPath]?.sizeCells;
    const reach = i.trigger.mode === 'near' ? (i.trigger.nearFt / grid.feetPerCell) * Math.min(grid.cellWidth, grid.cellHeight) : 0;
    const hit = i.trigger.mode === 'enter' ? (q: Point) => hitsPlacement(footprintOf(p, size, grid), q) : (q: Point) => distanceToFootprint(p, size, grid, q) <= reach;
    if (characters.some(hit)) inside.add(p.id);
  }
  return {
    entered: [...inside].filter((id) => !wasInside.has(id)),
    left: [...wasInside].filter((id) => !inside.has(id)),
    inside,
  };
}

/** How opaque a roof is drawn while the DM sees through it. */
export const ROOF_SEE_THROUGH = 0.45;

/**
 * The placements as drawn: a house showing its interior with its inner picture. With
 * `seeThrough` (the DM's window only), a house showing its outside gets its inner picture below
 * a see-through roof.
 */
export function drawnPlacements<P extends Placed>(placements: readonly P[], info: InteriorInfo, on: Readonly<Record<string, boolean>>, seeThrough: boolean): (P & { alpha?: number })[] {
  return placements.flatMap((p): (P & { alpha?: number })[] => {
    const i = info[p.assetPath]?.interior;
    if (!i) return [p];
    if (on[p.id]) return [{ ...p, assetPath: i.asset }];
    return seeThrough ? [{ ...p, id: `${p.id}:inner`, assetPath: i.asset }, { ...p, alpha: ROOF_SEE_THROUGH }] : [p];
  });
}
