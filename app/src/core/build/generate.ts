/**
 * The area generator (DC-119d, E-36): fills a region of cells with a small dungeon (rooms joined
 * by corridors – a room graph, decision of 2026-11-26) or a cave (cellular automata), and turns
 * the result into the map's own elements – drawn walls, doors on them and a floor. Everything is
 * deterministic in its seed; randomness is injected, never taken from the clock. Pure.
 */
import type { Point } from '../geometry';
import type { FloorPatch } from './floors';
import type { BuildDoor, Masonry } from './masonry';
import { smoothLine, type Water } from './water';
import { noise2 } from './handDrawn';

export type GenStyle = 'dungeon' | 'cave';

export interface GenOptions {
  cols: number;
  rows: number;
  /** 0–1: how much of the region opens up (rooms or cavern). */
  density: number;
  seed: number;
  style: GenStyle;
}

export interface Generated {
  cols: number;
  rows: number;
  /** 1 = open floor. */
  open: Uint8Array;
  /** Room rectangles (cells; empty for caves). */
  rooms: { x: number; y: number; w: number; h: number }[];
  /** Cells where a corridor steps into a room: a door belongs there. */
  doors: { x: number; y: number }[];
}

/** Small deterministic generator (mulberry32). */
export function rng(seed: number): () => number {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function generate(opts: GenOptions): Generated {
  return opts.style === 'cave' ? cave(opts) : dungeon(opts);
}

function dungeon({ cols, rows, density, seed }: GenOptions): Generated {
  const rand = rng(seed * 2 + 1);
  const open = new Uint8Array(cols * rows);
  const rooms: Generated['rooms'] = [];
  const attempts = Math.round(8 + density * (cols * rows) / 18);
  for (let i = 0; i < attempts; i++) {
    const w = 2 + Math.floor(rand() * 6);
    const h = 2 + Math.floor(rand() * 5);
    const x = 1 + Math.floor(rand() * Math.max(1, cols - w - 2));
    const y = 1 + Math.floor(rand() * Math.max(1, rows - h - 2));
    if (x + w >= cols - 1 || y + h >= rows - 1) continue;
    // A cell of wall stays between rooms.
    if (rooms.some((r) => x < r.x + r.w + 1 && x + w + 1 > r.x && y < r.y + r.h + 1 && y + h + 1 > r.y)) continue;
    rooms.push({ x, y, w, h });
    for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) open[yy * cols + xx] = 1;
  }
  // Corridors: each further room joins its nearest already-joined room (a spanning tree).
  const centre = (r: Generated['rooms'][number]) => ({ x: Math.floor(r.x + r.w / 2), y: Math.floor(r.y + r.h / 2) });
  const doors: Generated['doors'] = [];
  const joined = rooms.slice(0, 1);
  const rest = rooms.slice(1);
  const inRoom = (x: number, y: number) => rooms.some((r) => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h);
  while (rest.length) {
    let bi = 0;
    let bj = 0;
    let best = Infinity;
    rest.forEach((r, i) =>
      joined.forEach((q, j) => {
        const d = Math.abs(centre(r).x - centre(q).x) + Math.abs(centre(r).y - centre(q).y);
        if (d < best) {
          best = d;
          bi = i;
          bj = j;
        }
      }),
    );
    const from = centre(rest[bi]);
    const to = centre(joined[bj]);
    joined.push(...rest.splice(bi, 1));
    // An L-shaped corridor, the bend's side by the seed.
    const path: Point[] = [];
    const xFirst = rand() < 0.5;
    const step = (x: number, y: number) => path.push({ x, y });
    if (xFirst) {
      for (let x = from.x; x !== to.x; x += Math.sign(to.x - from.x)) step(x, from.y);
      for (let y = from.y; y !== to.y; y += Math.sign(to.y - from.y)) step(to.x, y);
    } else {
      for (let y = from.y; y !== to.y; y += Math.sign(to.y - from.y)) step(from.x, y);
      for (let x = from.x; x !== to.x; x += Math.sign(to.x - from.x)) step(x, to.y);
    }
    step(to.x, to.y);
    let wasOpen = true;
    for (const p of path) {
      const i = p.y * cols + p.x;
      const nowRoom = inRoom(p.x, p.y);
      // Stepping from dug corridor into a room (or out of one): a door belongs on that edge.
      if (!wasOpen && nowRoom) doors.push({ x: p.x, y: p.y });
      wasOpen = nowRoom || open[i] === 1;
      open[i] = 1;
    }
  }
  return { cols, rows, open, rooms, doors: dedupeDoors(doors) };
}

/** Two doors on neighbouring cells would overlap: only the first of such a pair stays. */
function dedupeDoors(doors: Generated['doors']): Generated['doors'] {
  const out: Generated['doors'] = [];
  for (const d of doors) if (!out.some((o) => Math.abs(o.x - d.x) + Math.abs(o.y - d.y) <= 1)) out.push(d);
  return out;
}

function cave({ cols, rows, density, seed }: GenOptions): Generated {
  const rand = rng(seed * 2 + 1);
  let open = new Uint8Array(cols * rows);
  for (let y = 1; y < rows - 1; y++) for (let x = 1; x < cols - 1; x++) open[y * cols + x] = rand() < 0.36 + density * 0.22 ? 1 : 0;
  // Smoothing: a cell opens where most neighbours are open.
  for (let step = 0; step < 4; step++) {
    const next = new Uint8Array(cols * rows);
    for (let y = 1; y < rows - 1; y++)
      for (let x = 1; x < cols - 1; x++) {
        let n = 0;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) n += open[(y + dy) * cols + (x + dx)];
        next[y * cols + x] = n >= 5 ? 1 : 0;
      }
    open = next;
  }
  // Only the largest cavern stays: no sealed pockets.
  const label = new Int32Array(cols * rows).fill(-1);
  const sizes: number[] = [];
  for (let i = 0; i < open.length; i++) {
    if (!open[i] || label[i] >= 0) continue;
    const id = sizes.length;
    const queue = [i];
    label[i] = id;
    let size = 0;
    while (queue.length) {
      const q = queue.pop()!;
      size++;
      const x = q % cols;
      const y = Math.floor(q / cols);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx;
        const ny = y + dy;
        const n = ny * cols + nx;
        if (nx >= 0 && ny >= 0 && nx < cols && ny < rows && open[n] && label[n] < 0) {
          label[n] = id;
          queue.push(n);
        }
      }
    }
    sizes.push(size);
  }
  const keep = sizes.indexOf(Math.max(0, ...sizes));
  for (let i = 0; i < open.length; i++) if (open[i] && label[i] !== keep) open[i] = 0;
  return { cols, rows, open, rooms: [], doors: [] };
}

/* ---------------------------------------------------------------- contours */

/**
 * The boundary of the open region as closed rings of grid corners (cell units), the open side
 * on each ring's left; collinear runs are merged. Outer rings and hole rings both come back.
 */
export function contours(open: Uint8Array, cols: number, rows: number): [number, number][][] {
  const at = (x: number, y: number) => (x >= 0 && y >= 0 && x < cols && y < rows ? open[y * cols + x] : 0);
  // Directed edges between corners, keyed by their start corner.
  const edges = new Map<number, [number, number][]>();
  const key = (x: number, y: number) => y * (cols + 1) + x;
  const add = (x0: number, y0: number, x1: number, y1: number) => {
    const list = edges.get(key(x0, y0)) ?? [];
    list.push([x1, y1]);
    edges.set(key(x0, y0), list);
  };
  for (let y = 0; y < rows; y++)
    for (let x = 0; x < cols; x++) {
      if (!at(x, y)) continue;
      if (!at(x, y - 1)) add(x + 1, y, x, y);
      if (!at(x, y + 1)) add(x, y + 1, x + 1, y + 1);
      if (!at(x - 1, y)) add(x, y, x, y + 1);
      if (!at(x + 1, y)) add(x + 1, y + 1, x + 1, y);
    }
  const take = (from: [number, number], to: [number, number]) => {
    const k = key(from[0], from[1]);
    const list = edges.get(k) ?? [];
    const i = list.findIndex(([x, y]) => x === to[0] && y === to[1]);
    if (i >= 0) list.splice(i, 1);
    if (!list.length) edges.delete(k);
  };
  const rings: [number, number][][] = [];
  while (edges.size) {
    const [startKey, outs] = edges.entries().next().value as [number, [number, number][]];
    const start: [number, number] = [startKey % (cols + 1), Math.floor(startKey / (cols + 1))];
    const ring: [number, number][] = [start];
    let cur = outs[0];
    let prev = start;
    take(start, cur);
    while (cur[0] !== start[0] || cur[1] !== start[1]) {
      ring.push(cur);
      const nexts = edges.get(key(cur[0], cur[1]));
      if (!nexts?.length) break;
      // At a diagonal touch two ways go on: keep turning the same way round (leftmost first).
      const dir: [number, number] = [cur[0] - prev[0], cur[1] - prev[1]];
      const next = pickNext(nexts, cur, dir);
      take(cur, next);
      prev = cur;
      cur = next;
    }
    rings.push(simplify(ring));
  }
  return rings;
}

function pickNext(nexts: [number, number][], cur: [number, number], dir: [number, number]): [number, number] {
  if (nexts.length === 1) return nexts[0];
  // Prefer the sharpest left turn: open stays on the left.
  const score = (n: [number, number]) => {
    const nd: [number, number] = [n[0] - cur[0], n[1] - cur[1]];
    return dir[0] * nd[1] - dir[1] * nd[0];
  };
  return [...nexts].sort((a, b) => score(a) - score(b))[0];
}

/** Collinear runs merged; the ring keeps its corners only. */
function simplify(ring: [number, number][]): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 0; i < ring.length; i++) {
    const a = ring[(i - 1 + ring.length) % ring.length];
    const b = ring[i];
    const c = ring[(i + 1) % ring.length];
    if ((b[0] - a[0]) * (c[1] - b[1]) !== (b[1] - a[1]) * (c[0] - b[0])) out.push(b);
  }
  return out;
}

/* ---------------------------------------------------------------- elements */

export interface GeneratedElements {
  walls: Masonry[];
  doors: BuildDoor[];
  floors: FloorPatch[];
}

/**
 * The generated grid as the map's own elements, in map px: one closed drawn wall per boundary
 * ring (caves rounded organically), a door where each corridor meets a room, and one floor
 * patch of the whole open shape. Ids come from the caller; seeds derive from `seed`.
 */
export function generatedElements(gen: Generated, origin: Point, cell: number, style: GenStyle, seed: number, freshId: (prefix: string) => string): GeneratedElements {
  const rings = contours(gen.open, gen.cols, gen.rows).map((ring) => ring.map(([x, y]) => ({ x: origin.x + x * cell, y: origin.y + y * cell })));
  const shaped = style === 'cave' ? rings.map((r) => smoothLine(r, true, 2)) : rings;
  const walls: Masonry[] = shaped.map((points, i) => ({
    id: freshId('masonry'),
    points,
    closed: true,
    style: style === 'cave' ? 'cave-rock' : 'dungeon-stone',
    thickness: Math.max(6, cell * (style === 'cave' ? 0.26 : 0.18)),
    seed: seed * 31 + i,
  }));
  // A door sits where its cell edge crosses the nearest wall ring.
  const doors: BuildDoor[] = [];
  for (const d of gen.doors) {
    const p = { x: origin.x + (d.x + 0.5) * cell, y: origin.y + (d.y + 0.5) * cell };
    let best: { wall: string; at: number; dist: number } | null = null;
    for (const w of walls) {
      const hit = nearestOnRing(w.points, p);
      if (!best || hit.dist < best.dist) best = { wall: w.id, at: hit.at, dist: hit.dist };
    }
    if (best && best.dist <= cell * 1.2) doors.push({ id: freshId('door'), wall: best.wall, at: best.at, width: cell * 0.9, secret: false, crack: false });
  }
  const floors: FloorPatch[] = [{
    id: freshId('floor'),
    style: style === 'cave' ? 'cave-rock' : 'dungeon-stone',
    shape: shaped.map((points) => ({ outer: points.map((p) => [p.x, p.y] as [number, number]), holes: [] })),
    seed,
  }];
  return { walls, doors, floors };
}

/** The closest point on a closed ring: its running distance `at` and how far away it lies. */
function nearestOnRing(points: readonly Point[], p: Point): { at: number; dist: number } {
  let at = 0;
  let dist = Infinity;
  let walked = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / (len * len)));
    const d = Math.hypot(p.x - (a.x + (b.x - a.x) * t), p.y - (a.y + (b.y - a.y) * t));
    if (d < dist) {
      dist = d;
      at = walked + len * t;
    }
    walked += len;
  }
  return { at, dist };
}

/* ---------------------------------------------------------------- whole maps (DC-119e) */

export interface MapGenOptions extends GenOptions {
  /** Ponds in a cave's low spots (caves only). */
  water: boolean;
  /** Torch spots in rooms (dungeon) or along cave walls. */
  lights: boolean;
  /** Scattered patches of moss or rubble on the floor. */
  details: boolean;
}

export interface GeneratedMap extends Generated {
  /** 1 = a pond lies on this open cell. */
  water: Uint8Array;
  lightSpots: { x: number; y: number }[];
  detailSpots: { x: number; y: number; r: number }[];
}

/** How many open steps a cell is from the nearest wall (4-neighbours). */
function depthFromWalls(open: Uint8Array, cols: number, rows: number): Int16Array {
  const depth = new Int16Array(open.length).fill(-1);
  const queue: number[] = [];
  for (let i = 0; i < open.length; i++)
    if (!open[i]) {
      depth[i] = 0;
      queue.push(i);
    }
  for (let q = 0; q < queue.length; q++) {
    const i = queue[q];
    const x = i % cols;
    const y = Math.floor(i / cols);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx;
      const ny = y + dy;
      const n = ny * cols + nx;
      if (nx >= 0 && ny >= 0 && nx < cols && ny < rows && depth[n] < 0) {
        depth[n] = depth[i] + 1;
        queue.push(n);
      }
    }
  }
  return depth;
}

/** A whole map's generation: the dungeon or cave, plus ponds, torch spots and detail patches. */
export function generateMap(opts: MapGenOptions): GeneratedMap {
  const gen = generate(opts);
  const { cols, rows, open } = gen;
  const rand = rng(opts.seed * 5 + 3);
  const water = new Uint8Array(open.length);
  if (opts.water && opts.style === 'cave') {
    // Ponds gather in the deep middle of hollows: wet where a soft noise dips, never at a wall.
    const depth = depthFromWalls(open, cols, rows);
    const wet: number[] = [];
    for (let y = 0; y < rows; y++)
      for (let x = 0; x < cols; x++) {
        const i = y * cols + x;
        if (open[i] && depth[i] >= 2 && noise2(x / 7, y / 7, opts.seed * 5 + 4) > 0.15) {
          water[i] = 1;
          wet.push(i);
        }
      }
    // Lone wet cells dry up (a pond is at least a few cells).
    for (const i of wet) {
      const x = i % cols;
      const y = Math.floor(i / cols);
      let n = 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) n += water[(y + dy) * cols + (x + dx)] ?? 0;
      if (n === 0) water[i] = 0;
    }
  }
  const lightSpots: GeneratedMap['lightSpots'] = [];
  if (opts.lights) {
    const wallSide = (x: number, y: number) => [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => !open[(y + dy) * cols + (x + dx)]);
    if (opts.style === 'dungeon') {
      for (const r of gen.rooms) {
        const edge: { x: number; y: number }[] = [];
        for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) if (open[y * cols + x] && wallSide(x, y)) edge.push({ x, y });
        const count = Math.min(edge.length, r.w * r.h > 20 ? 2 : 1);
        for (let k = 0; k < count; k++) lightSpots.push(edge[Math.floor(rand() * edge.length)]);
      }
    } else {
      // Sparse torches along the cavern wall.
      for (let y = 1; y < rows - 1; y++)
        for (let x = 1; x < cols - 1; x++)
          if (open[y * cols + x] && wallSide(x, y) && rand() < 0.02) lightSpots.push({ x, y });
    }
  }
  const detailSpots: GeneratedMap['detailSpots'] = [];
  if (opts.details) {
    const openCells: number[] = [];
    for (let i = 0; i < open.length; i++) if (open[i] && !water[i]) openCells.push(i);
    const count = Math.round(openCells.length / 55);
    for (let k = 0; k < count; k++) {
      const i = openCells[Math.floor(rand() * openCells.length)];
      detailSpots.push({ x: i % cols, y: Math.floor(i / cols), r: 0.8 + rand() * 1 });
    }
  }
  return { ...gen, water, lightSpots, detailSpots };
}

export interface MapGenElements extends GeneratedElements {
  waters: Water[];
  /** Torch places in map px. */
  lights: Point[];
}

/** The whole map's generation as elements: walls, doors and floors, plus lakes and torch places. */
export function mapGenElements(gen: GeneratedMap, cell: number, style: GenStyle, seed: number, freshId: (prefix: string) => string): MapGenElements {
  const base = generatedElements(gen, { x: 0, y: 0 }, cell, style, seed, freshId);
  const waters: Water[] = contours(gen.water, gen.cols, gen.rows).map((ring, i) => ({
    id: freshId('water'),
    kind: 'lake' as const,
    points: ring.map(([x, y]) => ({ x: x * cell, y: y * cell })),
    closed: true,
    width: cell,
    seed: seed * 17 + i,
  })).filter((w) => w.points.length >= 4);
  const detail = (style === 'cave' ? 'moss' : 'gravel') as FloorPatch['style'];
  for (const d of gen.detailSpots) {
    const cx = (d.x + 0.5) * cell;
    const cy = (d.y + 0.5) * cell;
    const r = d.r * cell;
    const ring: [number, number][] = [];
    for (let k = 0; k < 10; k++) ring.push([cx + Math.cos((k / 10) * Math.PI * 2) * r, cy + Math.sin((k / 10) * Math.PI * 2) * r]);
    base.floors.push({ id: freshId('floor'), style: detail, shape: [{ outer: ring, holes: [] }], seed: seed * 23 + base.floors.length });
  }
  return { ...base, waters, lights: gen.lightSpots.map((l) => ({ x: (l.x + 0.5) * cell, y: (l.y + 0.5) * cell })) };
}
