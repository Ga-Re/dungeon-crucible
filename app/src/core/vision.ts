/** Player vision: visibility polygons per player character, fog exploration, token visibility. */
import { pointInPolygon, visibilityPolygon, type Point, type Segment, type VisibilityPoint } from './geometry';
import { circleArea } from './poly/shapes';
import { seenNow, sightPolygon } from './fogModel';
import type { LevelFog, Polygon } from './poly/types';
import { intersection, union } from 'polyclip-ts';
import { asGeom, fromClip } from './poly/polygon-clip';
import { feetToPx, sightBlockers, type LightSource, type Scene, type Token } from './scene';

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
export function litAreas(scene: Scene, extras: VisionExtras = {}): Polygon[] {
  return litSources(scene, extras).flatMap((s) => s.area);
}

/** One shining light: where it is, how far bright and dim light reach (px), its colour and area. */
export interface LitSource {
  x: number;
  y: number;
  brightPx: number;
  dimPx: number;
  color: string;
  /** Line of sight from the light ∩ its dim radius: light stops at walls. */
  area: Polygon[];
}

/**
 * What placed assets add (DC-108): their cover masks (blocking sight and light like walls, while
 * the object itself stays visible) and their lights.
 */
export interface VisionExtras {
  covers?: readonly Polygon[];
  lights?: readonly LightSource[];
}

/** The edges of the masks that block for someone at `from`: not those of a mask `from` stands in. */
function coverSegments(covers: readonly Polygon[], from: Point): Segment[] {
  const out: Segment[] = [];
  for (const c of covers) {
    if (pointInPolygon(from, c.outer.map(([x, y]) => ({ x, y })))) continue;
    c.outer.forEach(([x1, y1], i) => {
      const [x2, y2] = c.outer[(i + 1) % c.outer.length];
      out.push({ x1, y1, x2, y2 });
    });
  }
  return out;
}

/**
 * The area seen (or lit) from `from` within `radius`: line of sight stops at walls and masks; a
 * mask itself counts as seen where walls alone would let it be seen (the object stays visible).
 */
function reachWithCovers(scene: Scene, from: Point, radius: number, covers: readonly Polygon[]): { outline: VisibilityPoint[]; area: Polygon[]; coversSeen: Polygon[] } {
  const walls = sightBlockers(scene.walls, from);
  const outline = visibilityPolygon(from, radius, covers.length ? [...walls, ...coverSegments(covers, from)] : walls);
  const area = sightPolygon(from, radius, outline);
  if (!covers.length) return { outline, area, coversSeen: [] };
  const open = sightPolygon(from, radius, visibilityPolygon(from, radius, walls));
  const coversSeen = open.length ? snapped(fromClip(intersection(asGeom([...covers]), asGeom(open)))) : [];
  // The area ends exactly on the masks' near edges: snapped to 1/100 px, so the clipping library
  // does not trip over edges that almost, but not quite, coincide.
  return { outline, area: coversSeen.length ? snapped(fromClip(union(asGeom(snapped(area)), asGeom(coversSeen)))) : area, coversSeen };
}

function snapped(polygons: readonly Polygon[]): Polygon[] {
  const r = ([x, y]: readonly [number, number]): [number, number] => [Math.round(x * 100) / 100, Math.round(y * 100) / 100];
  return polygons.map((p) => ({ outer: p.outer.map(r), holes: p.holes.map((h) => h.map(r)) }));
}

/**
 * Runs `work` with the masks; should the clipping library still fail on some geometry, again
 * without them – a viewer or light then ignores the masks rather than the whole view failing.
 */
function withCoverFallback<T>(covers: readonly Polygon[], work: (covers: readonly Polygon[]) => T): T {
  if (!covers.length) return work(covers);
  try {
    return work(covers);
  } catch {
    return work([]);
  }
}

/** Every light that is on, placed, carried by a token or brought by an asset, with the area it lights. */
export function litSources(scene: Scene, extras: VisionExtras = {}): LitSource[] {
  const covers = extras.covers ?? [];
  const sources = [
    ...[...scene.lights, ...(extras.lights ?? [])].filter((l) => l.on && l.dimFt > 0).map((l) => ({ x: l.x, y: l.y, bright: l.brightFt, dim: l.dimFt, color: l.color })),
    ...scene.tokens
      .filter((t) => (t.lightFt ?? 0) > 0 && t.hp > 0)
      .map((t) => ({ x: t.x, y: t.y, bright: t.lightFt ?? 0, dim: (t.lightFt ?? 0) * 2, color: '#ffb14a' })),
  ];
  return sources.map((s) => {
    const dimPx = feetToPx(scene, s.dim);
    return { x: s.x, y: s.y, brightPx: feetToPx(scene, s.bright), dimPx, color: s.color, area: withCoverFallback(covers, (c) => reachWithCovers(scene, s, dimPx, c).area) };
  });
}

/**
 * What every player character sees (2024 rules): everything in line of sight that is lit, plus
 * darkness within darkvision range. On a lit map the line of sight alone counts.
 */
export function updateVision(scene: Scene, extras: VisionExtras = {}): ViewerVision[] {
  const reach = Math.hypot(scene.map.widthPx, scene.map.heightPx);
  const covers = extras.covers ?? [];
  const lit = scene.ambient === 'lit' ? [] : litAreas(scene, extras);
  const out: ViewerVision[] = [];
  for (const t of scene.tokens) {
    if (t.kind !== 'pc' || t.hp <= 0) continue;
    const origin = { x: t.x, y: t.y };
    const radius = feetToPx(scene, t.visionFt);
    // Each viewer has its own blockers: a cliff blocks only those below it, a mask not the one
    // the viewer stands in.
    const { outline, sight } = withCoverFallback(covers, (c) => {
      const seen = reachWithCovers(scene, origin, reach, c);
      if (scene.ambient === 'lit') return { outline: seen.outline, sight: seen.area };
      // Darkvision: what is seen within its range.
      const dark = radius > 0 ? fromClip(intersection(asGeom(seen.area), asGeom([circleArea([origin.x, origin.y], radius, 64)]))) : [];
      const seenLit = lit.length ? fromClip(intersection(asGeom(seen.area), asGeom(lit))) : [];
      return { outline: seen.outline, sight: dark.length && seenLit.length ? fromClip(union(asGeom(dark), asGeom(seenLit))) : [...dark, ...seenLit] };
    });
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
