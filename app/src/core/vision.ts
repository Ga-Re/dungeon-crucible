/** Player vision: visibility polygons per player character, fog exploration, token visibility. */
import { isVisibleFrom, visibilityPolygon, type Point, type VisibilityPoint } from './geometry';
import { feetToPx, sightBlockers, type Scene, type Token } from './scene';

export interface ViewerVision {
  tokenId: string;
  origin: Point;
  radius: number;
  polygon: VisibilityPoint[];
}

/** Computes sight for every player character and marks newly seen fog cells as explored. */
export function updateVision(scene: Scene): ViewerVision[] {
  const blockers = sightBlockers(scene.walls);
  const out: ViewerVision[] = [];
  for (const t of scene.tokens) {
    if (t.kind !== 'pc' || t.visionFt <= 0 || t.hp <= 0) continue;
    const radius = feetToPx(scene, t.visionFt);
    const origin = { x: t.x, y: t.y };
    const polygon = visibilityPolygon(origin, radius, blockers);
    scene.fog.markVisible(origin, radius, polygon);
    out.push({ tokenId: t.id, origin, radius, polygon });
  }
  return out;
}

export function isPointVisibleToPlayers(vision: readonly ViewerVision[], p: Point): boolean {
  return vision.some((v) => isVisibleFrom(v.origin, v.radius, v.polygon, p));
}

/** Tokens players may see: their own characters, plus others in current sight that the DM has not hidden. */
export function tokensVisibleToPlayers(tokens: readonly Token[], vision: readonly ViewerVision[]): Token[] {
  return tokens.filter((t) => {
    if (t.hidden) return false;
    if (t.kind === 'pc') return true;
    return isPointVisibleToPlayers(vision, t);
  });
}
