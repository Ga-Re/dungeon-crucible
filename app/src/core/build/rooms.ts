/**
 * Parametric rooms (DC-026, E-45): rectangles, round rooms, corridors and polygons that stay rooms.
 * Their walls, doors and floors are derived, never stored: the outline of all rooms together gets
 * a wall (overlapping rooms melt into one); where two rooms only touch, a wall with a door stands
 * between them; and hand-drawn walls are cut where they run inside a room – their doors go with the
 * piece they are on. Pure.
 */
import { union, type Geom } from 'polyclip-ts';
import type { Point } from '../geometry';
import { isInside } from '../poly/fog';
import { asGeom, fromClip } from '../poly/polygon-clip';
import type { Polygon, Ring } from '../poly/types';
import type { FloorPatch } from './floors';
import type { BuildDoor, Masonry, MasonryStyle } from './masonry';

export const ROOM_KINDS = ['rect', 'circle', 'corridor', 'polygon'] as const;
export type RoomKind = (typeof ROOM_KINDS)[number];

export interface Room {
  id: string;
  kind: RoomKind;
  /** rect: two corners; circle: centre and a point on the rim; corridor: its path; polygon: its corners. */
  points: Point[];
  /** A corridor's width (map px). */
  width?: number;
  style: MasonryStyle;
  thickness: number;
  /** Its floor's material; none: the ground stays as it is. */
  floor?: FloorPatch['style'];
  seed: number;
  layer?: string;
  storey?: string;
}

/** The area a room covers, as one ring (map px). */
export function roomPolygon(r: Room): Ring {
  const [a, b] = r.points;
  if (r.kind === 'rect' && a && b) {
    const x0 = Math.min(a.x, b.x), x1 = Math.max(a.x, b.x), y0 = Math.min(a.y, b.y), y1 = Math.max(a.y, b.y);
    return [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
  }
  if (r.kind === 'circle' && a && b) {
    const rad = Math.hypot(b.x - a.x, b.y - a.y);
    return Array.from({ length: 32 }, (_, i) => [a.x + Math.cos((i / 32) * Math.PI * 2) * rad, a.y + Math.sin((i / 32) * Math.PI * 2) * rad] as [number, number]);
  }
  if (r.kind === 'corridor' && r.points.length >= 2) return corridorRing(r.points, (r.width ?? 70) / 2);
  return r.points.map((p) => [p.x, p.y] as [number, number]);
}

/**
 * Where a room is grabbed to change its shape: a rectangle's four corners, a round room's centre
 * and rim, a corridor's or polygon's points.
 */
export function roomHandles(r: Room): Point[] {
  const [a, b] = r.points;
  if (r.kind === 'rect') return [a, { x: b.x, y: a.y }, b, { x: a.x, y: b.y }];
  return r.points.map((p) => ({ ...p }));
}

/** The room with handle `i` moved to `to`; a round room's centre takes its rim along. */
export function movedRoomHandle(r: Room, i: number, to: Point): Room {
  const [a, b] = r.points;
  if (r.kind === 'rect') {
    const xa = i === 0 || i === 3, ya = i === 0 || i === 1;
    return { ...r, points: [{ x: xa ? to.x : a.x, y: ya ? to.y : a.y }, { x: xa ? b.x : to.x, y: ya ? b.y : to.y }] };
  }
  if (r.kind === 'circle' && i === 0) return movedRoom(r, to.x - a.x, to.y - a.y);
  return { ...r, points: r.points.map((p, k) => (k === i ? { x: to.x, y: to.y } : p)) };
}

/** The room moved by (dx, dy). */
export function movedRoom(r: Room, dx: number, dy: number): Room {
  return { ...r, points: r.points.map((p) => ({ x: p.x + dx, y: p.y + dy })) };
}

/**
 * A new point on a corridor's path or a polygon's outline where `p` lies within `tol` of it, with
 * its index; null for other rooms or when `p` is not on it.
 */
export function insertRoomPoint(r: Room, p: Point, tol: number): { room: Room; index: number } | null {
  if (r.kind !== 'corridor' && r.kind !== 'polygon') return null;
  const n = r.points.length;
  const segs = r.kind === 'polygon' ? n : n - 1;
  let best = -1;
  let bestD = tol;
  for (let i = 0; i < segs; i++) {
    const a = r.points[i], b = r.points[(i + 1) % n];
    const d = distToSeg(p, [a.x, a.y], [b.x, b.y]);
    if (d <= bestD) {
      bestD = d;
      best = i;
    }
  }
  if (best < 0) return null;
  const points = [...r.points.slice(0, best + 1), { x: p.x, y: p.y }, ...r.points.slice(best + 1)];
  return { room: { ...r, points }, index: best + 1 };
}

/** The room without point `i`, or null when it would lose its shape (rectangles and round rooms keep theirs). */
export function withoutRoomPoint(r: Room, i: number): Room | null {
  const min = r.kind === 'polygon' ? 3 : r.kind === 'corridor' ? 2 : Infinity;
  if (r.points.length - 1 < min) return null;
  return { ...r, points: r.points.filter((_, k) => k !== i) };
}

/**
 * A corridor's area: a band along its path. At the bends the pieces reach past each other so the
 * corner is filled; at its two ends it stops exactly, so it can meet a room's wall.
 */
function corridorRing(path: readonly Point[], hw: number): Ring {
  const parts: Ring[] = [];
  for (let i = 0; i + 1 < path.length; i++) {
    const p = path[i], q = path[i + 1];
    const len = Math.hypot(q.x - p.x, q.y - p.y) || 1;
    const dx = (q.x - p.x) / len, dy = (q.y - p.y) / len;
    const s = i > 0 ? hw : 0;
    const e = i + 2 < path.length ? hw : 0;
    const a = { x: p.x - dx * s, y: p.y - dy * s };
    const b = { x: q.x + dx * e, y: q.y + dy * e };
    parts.push([[a.x - dy * hw, a.y + dx * hw], [b.x - dy * hw, b.y + dx * hw], [b.x + dy * hw, b.y - dx * hw], [a.x + dy * hw, a.y - dx * hw]]);
  }
  if (parts.length === 1) return parts[0];
  try {
    const u = fromClip(union(asGeom([{ outer: parts[0], holes: [] }]) as Geom, ...parts.slice(1).map((r) => asGeom([{ outer: r, holes: [] }]) as Geom)) as [number, number][][][]);
    return u[0]?.outer ?? parts[0];
  } catch {
    return parts[0];
  }
}

const EPS = 0.5;

/** Where two edges lie on one line and overlap: the overlap, or null. */
function sharedPart(a1: [number, number], a2: [number, number], b1: [number, number], b2: [number, number]): [Point, Point] | null {
  const dx = a2[0] - a1[0], dy = a2[1] - a1[1];
  const len = Math.hypot(dx, dy);
  if (len < EPS) return null;
  const off = (p: [number, number]) => Math.abs(dx * (p[1] - a1[1]) - dy * (p[0] - a1[0])) / len;
  if (off(b1) > EPS || off(b2) > EPS) return null;
  const t = (p: [number, number]) => ((p[0] - a1[0]) * dx + (p[1] - a1[1]) * dy) / (len * len);
  const lo = Math.max(0, Math.min(t(b1), t(b2)));
  const hi = Math.min(1, Math.max(t(b1), t(b2)));
  if ((hi - lo) * len < EPS * 2) return null;
  return [{ x: a1[0] + dx * lo, y: a1[1] + dy * lo }, { x: a1[0] + dx * hi, y: a1[1] + dy * hi }];
}

const edges = (r: Ring) => r.map((p, i) => [p, r[(i + 1) % r.length]] as const);

/** The walls, doors and floors of `rooms`, with `hand`-drawn walls cut where they run inside them. */
export function deriveRooms(rooms: readonly Room[], hand: { masonry: readonly Masonry[]; masonryDoors: readonly BuildDoor[] }, cell: number): { masonry: Masonry[]; masonryDoors: BuildDoor[]; floors: FloorPatch[] } {
  if (!rooms.length) return { masonry: [...hand.masonry], masonryDoors: [...hand.masonryDoors], floors: [] };
  const rings = rooms.map(roomPolygon);
  const areas: Polygon[] = rings.map((outer) => ({ outer, holes: [] }));
  let all: Polygon[];
  try {
    all = fromClip(union(asGeom([areas[0]]) as Geom, ...areas.slice(1).map((p) => asGeom([p]) as Geom)) as [number, number][][][]);
  } catch {
    all = areas;
  }
  const masonry: Masonry[] = [];
  const masonryDoors: BuildDoor[] = [];
  // The outline of the rooms together: one closed wall per ring, styled as the room it starts in.
  all.forEach((poly, k) => {
    for (const [j, ring] of [poly.outer, ...poly.holes].entries()) {
      const owner = rooms[Math.max(0, rings.findIndex((r) => isInside([{ outer: r, holes: [] }], [ring[0][0] + 0.01, ring[0][1] + 0.01]) || r.some(([x, y]) => Math.hypot(x - ring[0][0], y - ring[0][1]) < EPS)))];
      masonry.push({ id: `room~${owner.id}~${k}~${j}`, points: ring.map(([x, y]) => ({ x, y })), closed: true, style: owner.style, thickness: owner.thickness, seed: owner.seed, ...(owner.layer ? { layer: owner.layer } : {}), ...(owner.storey ? { storey: owner.storey } : {}) });
    }
  });
  // Rooms that only touch: a wall along what they share, with a door in its middle.
  for (let i = 0; i < rooms.length; i++)
    for (let j = i + 1; j < rooms.length; j++) {
      let k = 0;
      for (const [a1, a2] of edges(rings[i]))
        for (const [b1, b2] of edges(rings[j])) {
          const s = sharedPart(a1, a2, b1, b2);
          if (!s) continue;
          // Touching, not overlapping: room i on one side of it, room j on the other.
          const mx = (s[0].x + s[1].x) / 2, my = (s[0].y + s[1].y) / 2;
          const len = Math.hypot(s[1].x - s[0].x, s[1].y - s[0].y);
          const nx = -(s[1].y - s[0].y) / len, ny = (s[1].x - s[0].x) / len;
          const side = (sx: number) => [mx + nx * sx * 2, my + ny * sx * 2] as [number, number];
          const inI = (p: [number, number]) => isInside([areas[i]], p);
          const inJ = (p: [number, number]) => isInside([areas[j]], p);
          const touching = (inI(side(1)) && !inJ(side(1)) && inJ(side(-1)) && !inI(side(-1))) || (inJ(side(1)) && !inI(side(1)) && inI(side(-1)) && !inJ(side(-1)));
          if (!touching) continue;
          const r = rooms[i];
          const wall = `room~${r.id}~${rooms[j].id}~${k}`;
          masonry.push({ id: wall, points: [s[0], s[1]], closed: false, style: r.style, thickness: r.thickness, seed: r.seed, ...(r.layer ? { layer: r.layer } : {}), ...(r.storey ? { storey: r.storey } : {}) });
          masonryDoors.push({ id: `${wall}~door`, wall, at: len / 2, width: Math.min(cell, len * 0.8), secret: false, crack: false });
          k++;
        }
    }
  const floors: FloorPatch[] = rooms.flatMap((r, i) => (r.floor ? [{ id: `room~${r.id}~floor`, style: r.floor, shape: [areas[i]], seed: r.seed, ...(r.layer ? { layer: r.layer } : {}), ...(r.storey ? { storey: r.storey } : {}) }] : []));
  const cut = cutHandWalls(hand, all);
  return { masonry: [...cut.masonry, ...masonry], masonryDoors: [...cut.masonryDoors, ...masonryDoors], floors };
}

/**
 * As `deriveRooms`, layer by layer (E-28): rooms melt and get doors only with rooms of their own
 * layer and cut only hand walls of it – a layer switched off takes its rooms away whole and gives
 * back what they cut.
 */
export function deriveRoomsByLayer(rooms: readonly Room[], hand: { masonry: readonly Masonry[]; masonryDoors: readonly BuildDoor[] }, cell: number): { masonry: Masonry[]; masonryDoors: BuildDoor[]; floors: FloorPatch[] } {
  const layers = [...new Set(rooms.map((r) => r.layer ?? ''))];
  const onLayer = (l: string) => hand.masonry.filter((m) => (m.layer ?? '') === l);
  const touched = new Set(layers);
  const rest = hand.masonry.filter((m) => !touched.has(m.layer ?? ''));
  const restIds = new Set(rest.map((m) => m.id));
  const out = { masonry: [...rest], masonryDoors: hand.masonryDoors.filter((d) => restIds.has(d.wall)), floors: [] as FloorPatch[] };
  for (const l of layers) {
    const walls = onLayer(l);
    const ids = new Set(walls.map((m) => m.id));
    const d = deriveRooms(rooms.filter((r) => (r.layer ?? '') === l), { masonry: walls, masonryDoors: hand.masonryDoors.filter((x) => ids.has(x.wall)) }, cell);
    out.masonry.push(...d.masonry);
    out.masonryDoors.push(...d.masonryDoors);
    out.floors.push(...d.floors);
  }
  return out;
}

/** Hand-drawn walls without the parts that run inside `area`; their doors moved onto the pieces left. */
function cutHandWalls(hand: { masonry: readonly Masonry[]; masonryDoors: readonly BuildDoor[] }, area: readonly Polygon[]): { masonry: Masonry[]; masonryDoors: BuildDoor[] } {
  const boundary = area.flatMap((p) => [p.outer, ...p.holes].flatMap((r) => edges(r)));
  const inside = (p: Point) => isInside(area as Polygon[], [p.x, p.y]) && !boundary.some(([a, b]) => distToSeg(p, a, b) < EPS);
  const masonry: Masonry[] = [];
  const doors: BuildDoor[] = [];
  for (const m of hand.masonry) {
    const pts = m.closed ? [...m.points, m.points[0]] : m.points;
    // Each segment cut where it crosses the rooms' outline; the parts inside go.
    const pieces: { points: Point[]; from: number; to: number }[] = [];
    let cur: { points: Point[]; from: number; to: number } | null = null;
    let dist = 0;
    let removed = false;
    for (let i = 0; i + 1 < pts.length; i++) {
      const p = pts[i], q = pts[i + 1];
      const len = Math.hypot(q.x - p.x, q.y - p.y);
      const ts = [0, 1, ...boundary.map(([a, b]) => crossAt(p, q, a, b)).filter((t): t is number => t !== null && t > 0 && t < 1)].sort((x, y) => x - y);
      for (let k = 0; k + 1 < ts.length; k++) {
        const t0 = ts[k], t1 = ts[k + 1];
        if (t1 - t0 < 1e-9) continue;
        const a = { x: p.x + (q.x - p.x) * t0, y: p.y + (q.y - p.y) * t0 };
        const b = { x: p.x + (q.x - p.x) * t1, y: p.y + (q.y - p.y) * t1 };
        const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        if (inside(mid)) {
          removed = true;
          if (cur) pieces.push(cur);
          cur = null;
          continue;
        }
        if (!cur) cur = { points: [a], from: dist + len * t0, to: dist + len * t0 };
        cur.points.push(b);
        cur.to = dist + len * t1;
      }
      dist += len;
    }
    if (cur) pieces.push(cur);
    const own = hand.masonryDoors.filter((d) => d.wall === m.id);
    if (!removed) {
      masonry.push(m);
      doors.push(...own);
      continue;
    }
    pieces.forEach((pc, k) => {
      const id = k === 0 ? m.id : `${m.id}~${k + 1}`;
      masonry.push({ ...m, id, points: pc.points, closed: false });
      for (const d of own) if (d.at >= pc.from && d.at <= pc.to) doors.push({ ...d, wall: id, at: d.at - pc.from });
    });
  }
  return { masonry, masonryDoors: doors };
}

function distToSeg(p: Point, a: [number, number], b: [number, number]): number {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const l = dx * dx + dy * dy;
  const t = l ? Math.max(0, Math.min(1, ((p.x - a[0]) * dx + (p.y - a[1]) * dy) / l)) : 0;
  return Math.hypot(p.x - (a[0] + dx * t), p.y - (a[1] + dy * t));
}

/** Where along p→q (0…1) it crosses a→b, or null. */
function crossAt(p: Point, q: Point, a: [number, number], b: [number, number]): number | null {
  const rx = q.x - p.x, ry = q.y - p.y, sx = b[0] - a[0], sy = b[1] - a[1];
  const den = rx * sy - ry * sx;
  if (Math.abs(den) < 1e-12) return null;
  const t = ((a[0] - p.x) * sy - (a[1] - p.y) * sx) / den;
  const u = ((a[0] - p.x) * ry - (a[1] - p.y) * rx) / den;
  return u >= 0 && u <= 1 ? t : null;
}
