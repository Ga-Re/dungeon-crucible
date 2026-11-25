/**
 * Drawn walls (E-33, DC-107a): masonry is a polyline with a style, a thickness and a seed; doors
 * sit on it at a distance along it. They are the source – the sight walls, the graph of ends,
 * corners, tees and crossings, and the outline that is drawn are all derived from them. Pure.
 */
import { difference, union, type Geom } from 'polyclip-ts';
import type { Point } from '../geometry';
import type { Polygon } from '../poly/types';
import { fromClip } from '../poly/polygon-clip';
import type { Wall } from '../scene';

export const MASONRY_STYLES = ['dungeon-stone', 'cave-rock', 'brick', 'wood'] as const;
export type MasonryStyle = (typeof MASONRY_STYLES)[number];

export interface Masonry {
  id: string;
  points: Point[];
  /** The last point joins the first (a ring). */
  closed: boolean;
  style: MasonryStyle;
  /** Map px. */
  thickness: number;
  /** Fixes its look: stone offsets, jitter, textures (nothing flickers when it is edited). */
  seed: number;
  layer?: string;
}

export interface BuildDoor {
  id: string;
  /** The masonry it sits on. */
  wall: string;
  /** Its centre, as the distance (map px) along the masonry from its first point. */
  at: number;
  /** Map px. */
  width: number;
  /** Looks like the wall on the TV until it is found. */
  secret: boolean;
  /** An unfound secret door shows a faint crack on the TV (the DM's choice per door). */
  crack: boolean;
}

/** Where a door is: on one segment of its masonry, from…to as distances along the masonry. */
export interface DoorSpan {
  segment: number;
  from: number;
  to: number;
}

/** The scene's door state (`doors[id]`) says open; `doors[foundKey(id)]` says a secret door was found. */
export function foundKey(doorId: string): string {
  return `${doorId}:found`;
}

/** Points closer than this (map px) are one. */
const SAME = 0.5;
/** Wall pieces shorter than this (map px) are left out. */
const MIN_PIECE = 0.5;

function segmentsOf(points: readonly Point[], closed: boolean): [Point, Point][] {
  const out: [Point, Point][] = [];
  for (let i = 1; i < points.length; i++) out.push([points[i - 1], points[i]]);
  if (closed && points.length > 2) out.push([points[points.length - 1], points[0]]);
  return out;
}

const len = (a: Point, b: Point) => Math.hypot(b.x - a.x, b.y - a.y);

export function polylineLength(points: readonly Point[], closed: boolean): number {
  return segmentsOf(points, closed).reduce((s, [a, b]) => s + len(a, b), 0);
}

/** The point at distance `s` along the polyline (clamped to it) and the segment it lies on. */
export function pointAt(points: readonly Point[], closed: boolean, s: number): Point & { segment: number } {
  const segs = segmentsOf(points, closed);
  let acc = 0;
  for (let i = 0; i < segs.length; i++) {
    const [a, b] = segs[i];
    const l = len(a, b);
    if (l > 0 && s <= acc + l) {
      const t = Math.max(0, (s - acc) / l);
      return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, segment: i };
    }
    acc += l;
  }
  const last = segs.length ? segs[segs.length - 1][1] : (points[0] ?? { x: 0, y: 0 });
  return { x: last.x, y: last.y, segment: Math.max(0, segs.length - 1) };
}

/** Where on its masonry the door lies: around its centre, on the segment of its centre, never round a corner. */
export function doorSpan(wall: Masonry, door: BuildDoor): DoorSpan {
  const segs = segmentsOf(wall.points, wall.closed);
  const total = polylineLength(wall.points, wall.closed);
  const centre = Math.max(0, Math.min(total, door.at));
  const { segment } = pointAt(wall.points, wall.closed, centre);
  let start = 0;
  for (let i = 0; i < segment; i++) start += len(...segs[i]);
  const l = segs[segment] ? len(...segs[segment]) : 0;
  if (door.width >= l) return { segment, from: start, to: start + l };
  const from = Math.max(start, Math.min(start + l - door.width, centre - door.width / 2));
  return { segment, from, to: from + door.width };
}

/**
 * The walls sight, light and movement use: every segment of every masonry, with a gap where a
 * door sits, and the doors themselves – open as the scene says, closed by default.
 */
export function deriveWalls(masonry: readonly Masonry[], doors: readonly BuildDoor[], open: Readonly<Record<string, boolean>>): Wall[] {
  const byId = new Map(masonry.map((w) => [w.id, w]));
  const spans = new Map<string, DoorSpan[]>();
  const doorWalls: Wall[] = [];
  for (const d of doors) {
    const w = byId.get(d.wall);
    if (!w || w.points.length < 2) continue;
    const span = doorSpan(w, d);
    (spans.get(w.id) ?? spans.set(w.id, []).get(w.id)!).push(span);
    const a = pointAt(w.points, w.closed, span.from);
    const b = pointAt(w.points, w.closed, span.to);
    doorWalls.push({ id: d.id, kind: d.secret ? 'secret-door' : 'door', x1: a.x, y1: a.y, x2: b.x, y2: b.y, open: open[d.id] ?? false, ...(w.layer ? { layer: w.layer } : {}) });
  }
  const out: Wall[] = [];
  for (const w of masonry) {
    const layer = w.layer ? { layer: w.layer } : {};
    let start = 0;
    segmentsOf(w.points, w.closed).forEach(([a, b], i) => {
      const l = len(a, b);
      const gaps = (spans.get(w.id) ?? []).filter((s) => s.segment === i).sort((p, q) => p.from - q.from);
      const at = (s: number) => ({ x: a.x + ((b.x - a.x) * (s - start)) / l, y: a.y + ((b.y - a.y) * (s - start)) / l });
      if (!gaps.length) out.push({ id: `${w.id}#${i}`, kind: 'wall', x1: a.x, y1: a.y, x2: b.x, y2: b.y, ...layer });
      else {
        let from = start;
        const pieces: [number, number][] = [];
        for (const g of gaps) {
          pieces.push([from, g.from]);
          from = Math.max(from, g.to);
        }
        pieces.push([from, start + l]);
        pieces.forEach(([s, e], k) => {
          if (e - s < MIN_PIECE) return;
          const p = at(s);
          const q = at(e);
          out.push({ id: `${w.id}#${i}~${k}`, kind: 'wall', x1: p.x, y1: p.y, x2: q.x, y2: q.y, ...layer });
        });
      }
      start += l;
    });
  }
  return [...out, ...doorWalls];
}

/* ---------- The graph: ends, corners, tees and crossings ---------- */

export type NodeKind = 'end' | 'straight' | 'corner' | 'tee' | 'cross';

export interface GraphNode extends Point {
  /** How many wall arms leave it. */
  valence: number;
  kind: NodeKind;
  /** Directions (radians) of its arms. */
  arms: number[];
}

export interface MasonryGraph {
  nodes: GraphNode[];
}

function distToSegment(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const l2 = dx * dx + dy * dy;
  const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

function crossing(a: Point, b: Point, c: Point, d: Point): Point | null {
  const rx = b.x - a.x;
  const ry = b.y - a.y;
  const sx = d.x - c.x;
  const sy = d.y - c.y;
  const den = rx * sy - ry * sx;
  if (Math.abs(den) < 1e-9) return null;
  const t = ((c.x - a.x) * sy - (c.y - a.y) * sx) / den;
  const u = ((c.x - a.x) * ry - (c.y - a.y) * rx) / den;
  if (t <= 0 || t >= 1 || u <= 0 || u >= 1) return null;
  return { x: a.x + t * rx, y: a.y + t * ry };
}

function kindOf(arms: number[]): NodeKind {
  if (arms.length <= 1) return 'end';
  if (arms.length === 2) {
    const diff = Math.abs(Math.atan2(Math.sin(arms[0] - arms[1]), Math.cos(arms[0] - arms[1])));
    return Math.abs(diff - Math.PI) < 0.02 ? 'straight' : 'corner';
  }
  return arms.length === 3 ? 'tee' : 'cross';
}

/** Nodes at every end, bend and crossing of the masonry, with the arms that leave each. */
export function buildGraph(masonry: readonly Masonry[]): MasonryGraph {
  const segs = masonry.flatMap((w) => segmentsOf(w.points, w.closed)).filter(([a, b]) => len(a, b) > 0);
  const candidates: Point[] = segs.flatMap(([a, b]) => [a, b]);
  for (let i = 0; i < segs.length; i++)
    for (let j = i + 1; j < segs.length; j++) {
      const x = crossing(segs[i][0], segs[i][1], segs[j][0], segs[j][1]);
      if (x) candidates.push(x);
    }
  const points: Point[] = [];
  for (const c of candidates) if (!points.some((p) => len(p, c) <= SAME)) points.push(c);
  const nodes = points.map((p): GraphNode => {
    const arms: number[] = [];
    for (const [a, b] of segs) {
      if (distToSegment(p, a, b) > SAME) continue;
      const atA = len(p, a) <= SAME;
      const atB = len(p, b) <= SAME;
      if (!atB) arms.push(Math.atan2(b.y - p.y, b.x - p.x));
      if (!atA) arms.push(Math.atan2(a.y - p.y, a.x - p.x));
    }
    return { x: p.x, y: p.y, valence: arms.length, kind: kindOf(arms), arms };
  });
  return { nodes };
}

/* ---------- The outline ---------- */

type Ring = [number, number][];

/** A segment as a band of the wall's thickness, reaching half the thickness past its ends (square joins). */
function band(a: Point, b: Point, half: number, reach: number): Ring {
  const l = len(a, b);
  const ux = (b.x - a.x) / l;
  const uy = (b.y - a.y) / l;
  const nx = -uy * half;
  const ny = ux * half;
  const sx = a.x - ux * reach;
  const sy = a.y - uy * reach;
  const ex = b.x + ux * reach;
  const ey = b.y + uy * reach;
  return [[sx + nx, sy + ny], [ex + nx, ey + ny], [ex - nx, ey - ny], [sx - nx, sy - ny]];
}

function disc(p: Point, r: number): Ring {
  const out: Ring = [];
  for (let i = 0; i < 16; i++) out.push([p.x + r * Math.cos((i * Math.PI) / 8), p.y + r * Math.sin((i * Math.PI) / 8)]);
  return out;
}

/** Rounded joins for natural rock, square joins for built walls. */
function piecesOf(w: Masonry): Ring[] {
  const half = w.thickness / 2;
  const round = w.style === 'cave-rock';
  const segs = segmentsOf(w.points, w.closed).filter(([a, b]) => len(a, b) > 0);
  const out = segs.map(([a, b]) => band(a, b, half, round ? 0 : half));
  if (round) for (const p of w.points) out.push(disc(p, half));
  return out;
}

/**
 * The masonry as clean shapes: all walls united (corners, tees and crossings merge instead of
 * overlapping), cut open where doors sit. Map px; the renderer adds texture and jitter.
 */
export function masonryOutline(masonry: readonly Masonry[], doors: readonly BuildDoor[]): Polygon[] {
  const byId = new Map(masonry.map((w) => [w.id, w]));
  const rings = masonry.flatMap(piecesOf);
  if (!rings.length) return [];
  const cuts: Ring[] = [];
  for (const d of doors) {
    const w = byId.get(d.wall);
    if (!w || w.points.length < 2) continue;
    const span = doorSpan(w, d);
    const a = pointAt(w.points, w.closed, span.from);
    const b = pointAt(w.points, w.closed, span.to);
    if (len(a, b) > 0) cuts.push(band(a, b, w.thickness, 0));
  }
  // Snapping to a fine grid makes shared points exact, which the clipper needs (see strokeArea).
  for (const grid of [1 / 1024, 1 / 64, 1]) {
    const snap = (r: Ring): Ring => r.map(([x, y]) => [Math.round(x / grid) * grid, Math.round(y / grid) * grid]);
    try {
      const geoms: Geom[] = rings.map((r) => [snap(r)]);
      const [first, ...rest] = geoms;
      const united = union(first, ...rest);
      const cut = cuts.length ? difference(united, ...cuts.map((c): Geom => [snap(c)])) : united;
      return fromClip(cut as [number, number][][][]);
    } catch {
      // Try the next, coarser grid.
    }
  }
  return [];
}

/* ---------- The map's area ---------- */

export interface Bounds {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Cells of an empty drawn map. */
const EMPTY_CELLS = 20;

/** The area of a drawn map: all masonry plus `margin` cells, on whole cells – also left of and above 0. */
export function drawnBounds(masonry: readonly Masonry[], cell: number, margin: number): Bounds {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const w of masonry)
    for (const p of w.points) {
      const h = w.thickness / 2;
      minX = Math.min(minX, p.x - h);
      minY = Math.min(minY, p.y - h);
      maxX = Math.max(maxX, p.x + h);
      maxY = Math.max(maxY, p.y + h);
    }
  if (minX === Infinity) return { x: 0, y: 0, w: EMPTY_CELLS * cell, h: EMPTY_CELLS * cell };
  const x = (Math.floor(minX / cell) - margin) * cell;
  const y = (Math.floor(minY / cell) - margin) * cell;
  return { x, y, w: (Math.ceil(maxX / cell) + margin) * cell - x, h: (Math.ceil(maxY / cell) + margin) * cell - y };
}
