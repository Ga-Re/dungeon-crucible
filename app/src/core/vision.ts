/** Player vision: visibility polygons per player character, fog exploration, token visibility. */
import { visibilityPolygon, type Point, type VisibilityPoint } from './geometry';
import { seenNow, sightPolygon } from './fogModel';
import type { LevelFog, Polygon } from './poly/types';
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

/** Computes what every player character sees (2D raycasting against walls and closed doors). */
export function updateVision(scene: Scene): ViewerVision[] {
  const blockers = sightBlockers(scene.walls);
  const out: ViewerVision[] = [];
  for (const t of scene.tokens) {
    if (t.kind !== 'pc' || t.visionFt <= 0 || t.hp <= 0) continue;
    const radius = feetToPx(scene, t.visionFt);
    const origin = { x: t.x, y: t.y };
    const outline = visibilityPolygon(origin, radius, blockers);
    out.push({ tokenId: t.id, origin, radius, outline, sight: sightPolygon(origin, radius, outline) });
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
