/** Player vision: visibility polygons per player character, fog exploration, token visibility. */
import { pointInPolygon, visibilityPolygon, type Point, type Segment, type VisibilityPoint } from './geometry';
import { circleArea } from './poly/shapes';
import { seenNow, sightPolygon } from './fogModel';
import type { LevelFog, Polygon } from './poly/types';
import { intersection, union } from 'polyclip-ts';
import { asGeom, fromClip } from './poly/polygon-clip';
import { feetToPx, sightBlockers, type LightSource, type Scene, type Token, type Wall } from './scene';

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

/** A mask prepared once per list: its corners as points and its bounding box. */
interface Mask {
  poly: Polygon;
  /** The mask grown by half a pixel: added to what is seen, it overlaps the area that ends on its
   * edge instead of touching it – edges that coincide trip the clipping library. */
  shown: Polygon;
  pts: Point[];
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

const prepared = new WeakMap<readonly Polygon[], Mask[]>();

function masksOf(covers: readonly Polygon[]): Mask[] {
  let m = prepared.get(covers);
  if (!m) {
    m = covers.map((poly) => {
      const pts = poly.outer.map(([x, y]) => ({ x, y }));
      const xs = pts.map((p) => p.x);
      const ys = pts.map((p) => p.y);
      const cx = xs.reduce((a, b) => a + b, 0) / xs.length;
      const cy = ys.reduce((a, b) => a + b, 0) / ys.length;
      const shown: Polygon = {
        outer: pts.map((p) => {
          const d = Math.hypot(p.x - cx, p.y - cy) || 1;
          return [p.x + ((p.x - cx) / d) * 0.5, p.y + ((p.y - cy) / d) * 0.5] as [number, number];
        }),
        holes: [],
      };
      return { poly, shown, pts, minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys) };
    });
    prepared.set(covers, m);
  }
  return m;
}

function segmentsOf(masks: readonly Mask[]): Segment[] {
  return masks.flatMap((m) => m.pts.map((a, i) => {
    const b = m.pts[(i + 1) % m.pts.length];
    return { x1: a.x, y1: a.y, x2: b.x, y2: b.y };
  }));
}

/**
 * The area seen (or lit) from `from` within `radius`. Line of sight stops at walls and at the
 * masks in reach – not at one `from` stands in. With `showMasks`, a mask that walls alone would
 * let be seen (one of its corners in view) counts as seen too: the object stays visible. The
 * result may overlap; whoever needs one area unions it.
 */
function reachWithCovers(scene: Scene, from: Point, radius: number, covers: readonly Polygon[], showMasks: boolean): { outline: VisibilityPoint[]; area: Polygon[] } {
  const walls = sightBlockers(scene.walls, from);
  if (!covers.length) {
    const outline = visibilityPolygon(from, radius, walls);
    return { outline, area: sightPolygon(from, radius, outline) };
  }
  // Only masks walls alone let be seen (a corner in view, in reach) can block anything seen.
  const open = visibilityPolygon(from, radius, walls);
  const inView = masksOf(covers).filter(
    (m) =>
      m.maxX >= from.x - radius && m.minX <= from.x + radius && m.maxY >= from.y - radius && m.minY <= from.y + radius &&
      !pointInPolygon(from, m.pts) &&
      m.pts.some((p) => Math.hypot(p.x - from.x, p.y - from.y) <= radius && pointInPolygon(p, open)),
  );
  if (!inView.length) return { outline: open, area: sightPolygon(from, radius, open) };
  const outline = tidy(visibilityPolygon(from, radius, [...walls, ...segmentsOf(inView)]));
  const area = sightPolygon(from, radius, outline);
  return { outline, area: showMasks ? [...area, ...inView.map((m) => m.shown)] : area };
}

/** Points to 1/100 px and without near duplicates: masks make many rays, and many almost equal points. */
function tidy(points: readonly VisibilityPoint[]): VisibilityPoint[] {
  const out: VisibilityPoint[] = [];
  for (const p of points) {
    const q = { ...p, x: Math.round(p.x * 100) / 100, y: Math.round(p.y * 100) / 100 };
    const last = out[out.length - 1];
    if (!last || Math.abs(last.x - q.x) > 0.02 || Math.abs(last.y - q.y) > 0.02) out.push(q);
  }
  return out;
}

/**
 * Masks, then on a failure of the clipping library the masks only blocking, then nothing: a
 * failure never shows more than the masks allow (it fails closed).
 */
function withCoverFallback<T>(covers: readonly Polygon[], work: (showMasks: boolean) => T, closed: T): T {
  if (!covers.length) return work(false);
  try {
    return work(true);
  } catch {
    try {
      return work(false);
    } catch {
      return closed;
    }
  }
}

/** Light areas by light (place, reach), for unchanged walls, doors and masks: a moving token does not relight the map. */
const lightCache = new WeakMap<readonly Wall[], WeakMap<object, Map<string, Polygon[]>>>();
const NO_COVERS: readonly Polygon[] = [];

function wallsKey(walls: readonly Wall[]): string {
  let sum = 0;
  let doors = '';
  for (const w of walls) {
    sum += w.x1 * 3 + w.y1 * 5 + w.x2 * 7 + w.y2 * 11;
    if (w.kind === 'door' || w.kind === 'secret-door') doors += w.open ? '1' : '0';
    else doors += w.kind[0];
  }
  return `${walls.length}|${sum}|${doors}`;
}

/** Every light that is on, placed, carried by a token or brought by an asset, with the area it lights. */
export function litSources(scene: Scene, extras: VisionExtras = {}): LitSource[] {
  const covers = extras.covers ?? NO_COVERS;
  const sources = [
    ...[...scene.lights, ...(extras.lights ?? [])].filter((l) => l.on && l.dimFt > 0).map((l) => ({ x: l.x, y: l.y, bright: l.brightFt, dim: l.dimFt, color: l.color })),
    ...scene.tokens
      .filter((t) => (t.lightFt ?? 0) > 0 && t.hp > 0)
      .map((t) => ({ x: t.x, y: t.y, bright: t.lightFt ?? 0, dim: (t.lightFt ?? 0) * 2, color: '#ffb14a' })),
  ];
  let byCovers = lightCache.get(scene.walls);
  if (!byCovers) lightCache.set(scene.walls, (byCovers = new WeakMap()));
  let cache = byCovers.get(covers);
  if (!cache) byCovers.set(covers, (cache = new Map()));
  const wk = wallsKey(scene.walls);
  return sources.map((s) => {
    const dimPx = feetToPx(scene, s.dim);
    const key = `${wk}|${s.x},${s.y},${dimPx}`;
    let area = cache.get(key);
    if (!area) {
      area = withCoverFallback(covers, (show) => reachWithCovers(scene, s, dimPx, covers, show).area, []);
      if (cache.size > 500) cache.clear();
      cache.set(key, area);
    }
    return { x: s.x, y: s.y, brightPx: feetToPx(scene, s.bright), dimPx, color: s.color, area };
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
    const { outline, sight } = withCoverFallback(
      covers,
      (show) => {
        const seen = reachWithCovers(scene, origin, reach, covers, show);
        if (scene.ambient === 'lit') return { outline: seen.outline, sight: seen.area };
        // Darkvision: what is seen within its range (without masks: one clip as always).
        const dark = radius <= 0 ? [] : covers.length ? fromClip(intersection(asGeom(seen.area), asGeom([circleArea([origin.x, origin.y], radius, 64)]))) : sightPolygon(origin, radius, seen.outline);
        const seenLit = lit.length ? fromClip(intersection(asGeom(seen.area), asGeom(lit))) : [];
        return { outline: seen.outline, sight: dark.length && seenLit.length ? fromClip(union(asGeom(dark), asGeom(seenLit))) : [...dark, ...seenLit] };
      },
      { outline: [], sight: [] },
    );
    out.push({ tokenId: t.id, origin, radius, outline, sight });
  }
  return out;
}

/** All players' sight as one list of polygons. */
export function visiblePolygons(vision: readonly ViewerVision[]): Polygon[] {
  return vision.flatMap((v) => v.sight);
}

/** Tokens players may see: their own characters, plus others they see now that the DM has not hidden. */
export function tokensVisibleToPlayers(tokens: readonly Token[], fog: LevelFog, visible: readonly Polygon[], covers: readonly Polygon[] = []): Token[] {
  // Masks a player character stands in: inside them, the players see (DM decision 2026-11-25).
  const masks = covers.length ? masksOf(covers) : [];
  const entered = masks.filter((m) => tokens.some((t) => t.kind === 'pc' && t.hp > 0 && pointInPolygon(t, m.pts)));
  return tokens.filter((t) => {
    if (t.hidden) return false;
    if (t.kind === 'pc') return true;
    // A figure inside a mask (a tent, a wagon) stays hidden until a character is in there too.
    const inside = masks.filter((m) => pointInPolygon(t, m.pts));
    if (inside.length && !inside.some((m) => entered.includes(m))) return false;
    return seenNow(fog, visible, t);
  });
}
