/** Player vision: visibility polygons per player character, fog exploration, token visibility. */
import { visibilityPolygon, type Point, type VisibilityPoint } from './geometry';
import { seenNow, sightPolygon } from './fogModel';
import type { LevelFog, Polygon } from './poly/types';
import { intersection, union } from 'polyclip-ts';
import { asGeom, fromClip } from './poly/polygon-clip';
import { feetToPx, sightBlockers, type Scene, type Token } from './scene';

export interface ViewerVision {
  tokenId: string;
  origin: Point;
  radius: number;
  /** Raw visibility polygon (for the DM's outline). */
  outline: VisibilityPoint[];
  /** Sight as fog polygons: visibility ∩ sight radius. */
  sight: Polygon[];
}

/**
 * Light: every placed light that is on and every token's carried light, as polygons (line of
 * sight from the light ∩ its dim radius). Monsters' lights count too: players see what they light.
 */
export function litAreas(scene: Scene, blockers = sightBlockers(scene.walls)): Polygon[] {
  const sources: { x: number; y: number; ft: number }[] = [
    ...scene.lights.filter((l) => l.on && l.dimFt > 0).map((l) => ({ x: l.x, y: l.y, ft: l.dimFt })),
    ...scene.tokens.filter((t) => (t.lightFt ?? 0) > 0 && t.hp > 0).map((t) => ({ x: t.x, y: t.y, ft: (t.lightFt ?? 0) * 2 })),
  ];
  return sources.flatMap((s) => {
    const r = feetToPx(scene, s.ft);
    return sightPolygon(s, r, visibilityPolygon(s, r, blockers));
  });
}

/**
 * What every player character sees (2024 rules): everything in line of sight that is lit, plus
 * darkness within darkvision range. On a lit map the line of sight alone counts.
 */
export function updateVision(scene: Scene): ViewerVision[] {
  const blockers = sightBlockers(scene.walls);
  const reach = Math.hypot(scene.map.widthPx, scene.map.heightPx);
  const lit = scene.ambient === 'lit' ? [] : litAreas(scene, blockers);
  const out: ViewerVision[] = [];
  for (const t of scene.tokens) {
    if (t.kind !== 'pc' || t.hp <= 0) continue;
    const origin = { x: t.x, y: t.y };
    const radius = feetToPx(scene, t.visionFt);
    const outline = visibilityPolygon(origin, reach, blockers);
    let sight: Polygon[];
    if (scene.ambient === 'lit') {
      sight = sightPolygon(origin, reach, outline);
    } else {
      const dark = radius > 0 ? sightPolygon(origin, radius, outline) : [];
      const los: Polygon = { outer: outline.map((p) => [p.x, p.y] as [number, number]), holes: [] };
      const seenLit = lit.length ? fromClip(intersection(asGeom([los]), asGeom(lit))) : [];
      sight = dark.length && seenLit.length ? fromClip(union(asGeom(dark), asGeom(seenLit))) : [...dark, ...seenLit];
    }
    out.push({ tokenId: t.id, origin, radius, outline, sight });
  }
  return out;
}

/** All players' sight as one list of polygons. */
export function visiblePolygons(vision: readonly ViewerVision[]): Polygon[] {
  return vision.flatMap((v) => v.sight);
}

/** Tokens players may see: their own characters, plus others they see now that the DM has not hidden. */
export function tokensVisibleToPlayers(tokens: readonly Token[], fog: LevelFog, visible: readonly Polygon[]): Token[] {
  return tokens.filter((t) => {
    if (t.hidden) return false;
    if (t.kind === 'pc') return true;
    return seenNow(fog, visible, t);
  });
}
