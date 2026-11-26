/**
 * Variance of drawn surfaces (DC-119a): what breaks the visible repetition of one texture tiled
 * over a map. `variantBlobs` lays patches of texture variants (and rotations) over a sheet of
 * cells, `periodicNoise` shades large areas seamlessly, and `wearPaths` finds the worn ways
 * between doors. Everything is deterministic in its seed and place. Pure.
 */
import type { Bounds, Masonry } from './masonry';
import type { Point } from '../geometry';

function hash(x: number, y: number, seed: number): number {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(seed | 0, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

const smooth = (t: number) => t * t * (3 - 2 * t);
const mod = (v: number, n: number) => ((v % n) + n) % n;

/** A deterministic 0…1 per place and seed (for scattering patches and the like). */
export function hashNoise(x: number, y: number, seed: number): number {
  return hash(x, y, seed);
}

/** Smooth value noise in -1…1 that repeats exactly every `period` units – patterns built with it tile seamlessly. */
export function periodicNoise(x: number, y: number, period: number, seed: number): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = smooth(x - x0);
  const fy = smooth(y - y0);
  const v = (i: number, j: number) => hash(mod(x0 + i, period), mod(y0 + j, period), seed) * 2 - 1;
  const top = v(0, 0) + (v(1, 0) - v(0, 0)) * fx;
  const bottom = v(0, 1) + (v(1, 1) - v(0, 1)) * fx;
  return top + (bottom - top) * fy;
}

export interface BlobCell {
  variant: number;
  /** Quarter turns (0–3). */
  rotation: number;
}

export interface VariantBlobs {
  /** Sheet side in cells; the layout repeats with it. */
  cells: number;
  at(x: number, y: number): BlobCell;
}


/**
 * Patches of variants over a sheet of `cells`×`cells` cells: each cell gets a variant and a
 * rotation, constant within a patch (so a variant's pattern runs on in one piece) and wrapping
 * with the sheet. `rotations` is how many quarter turns the material allows (1, 2 or 4 – wood
 * keeps its planks' direction, stone turns freely); `blobStep` is roughly how wide a patch is.
 */
export function variantBlobs(opts: { cells: number; variants: number; rotations: number; seed: number; blobStep?: number }): VariantBlobs {
  const { cells, variants, rotations, seed, blobStep = 4 } = opts;
  const options = Math.max(1, variants * rotations);
  const period = Math.max(1, Math.round(cells / blobStep));
  const at = (x: number, y: number): BlobCell => {
    const u = (mod(x, cells) + 0.5) / blobStep;
    const v = (mod(y, cells) + 0.5) / blobStep;
    let best = 0;
    let score = -Infinity;
    for (let o = 0; o < options; o++) {
      const s = periodicNoise(u, v, period, seed + o * 101);
      if (s > score) {
        score = s;
        best = o;
      }
    }
    return { variant: best % variants, rotation: Math.floor(best / variants) * (4 / Math.max(1, rotations)) };
  };
  return { cells, at };
}

/* ---------------------------------------------------------------- worn paths */

export interface BlockedGrid {
  cols: number;
  rows: number;
  step: number;
  /** 1 where a wall blocks the cell. */
  blocked: Uint8Array;
}

/** The cells walls cover (with a margin of about half a cell), on a grid of `step` map px. */
export function blockedCells(masonry: readonly Masonry[], area: Bounds, step: number, openings: readonly Point[] = []): BlockedGrid {
  const cols = Math.max(1, Math.ceil(area.w / step));
  const rows = Math.max(1, Math.ceil(area.h / step));
  const blocked = new Uint8Array(cols * rows);
  const mark = (x: number, y: number, r: number, value: 0 | 1) => {
    const reach = Math.ceil(r / step);
    const c0 = Math.floor((x - area.x) / step);
    const r0 = Math.floor((y - area.y) / step);
    for (let rr = r0 - reach; rr <= r0 + reach; rr++)
      for (let cc = c0 - reach; cc <= c0 + reach; cc++) {
        if (cc < 0 || rr < 0 || cc >= cols || rr >= rows) continue;
        const dx = area.x + (cc + 0.5) * step - x;
        const dy = area.y + (rr + 0.5) * step - y;
        if (dx * dx + dy * dy <= r * r) blocked[rr * cols + cc] = value;
      }
  };
  for (const w of masonry) {
    const pts = w.closed ? [...w.points, w.points[0]] : w.points;
    const r = w.thickness / 2 + step * 0.4;
    for (let k = 1; k < pts.length; k++) {
      const a = pts[k - 1];
      const b = pts[k];
      const parts = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / (step / 2)));
      for (let q = 0; q <= parts; q++) mark(a.x + ((b.x - a.x) * q) / parts, a.y + ((b.y - a.y) * q) / parts, r, 1);
    }
  }
  // Doorways stay passable: a small clearing around each door.
  for (const p of openings) mark(p.x, p.y, step * 1.5, 0);
  return { cols, rows, step, blocked };
}

/** At most this many cells a search may look at (keeps huge maps cheap). */
const MAX_VISITED = 40000;

/**
 * The worn ways between doors (DC-119a): each door connects once to its nearest reachable
 * neighbour, around walls and through doorways. Paths are cell centres in map px; the drawing
 * smooths them. Deterministic; doors that cannot reach another get no path.
 */
export function wearPaths(masonry: readonly Masonry[], doors: readonly Point[], area: Bounds, step: number): Point[][] {
  if (doors.length < 2) return [];
  const grid = blockedCells(masonry, area, step, doors);
  const { cols, rows, blocked } = grid;
  const cellOf = (p: Point): number | null => {
    const c = Math.floor((p.x - area.x) / step);
    const r = Math.floor((p.y - area.y) / step);
    // The door itself, or the nearest free cell right beside it.
    for (const [dc, dr] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]]) {
      const cc = c + dc;
      const rr = r + dr;
      if (cc >= 0 && rr >= 0 && cc < cols && rr < rows && !blocked[rr * cols + cc]) return rr * cols + cc;
    }
    return null;
  };
  const centre = (i: number): Point => ({ x: area.x + ((i % cols) + 0.5) * step, y: area.y + (Math.floor(i / cols) + 0.5) * step });

  const search = (from: number, to: number): Point[] | null => {
    const goal = centre(to);
    // A*: a small binary heap over f = cost so far + remaining straight-line distance.
    const heap: number[] = [from];
    const score = new Map<number, number>([[from, 0]]);
    const less = (a: number, b: number) => (score.get(a) ?? Infinity) < (score.get(b) ?? Infinity);
    const push = (n: number) => {
      heap.push(n);
      for (let i = heap.length - 1; i > 0; ) {
        const up = (i - 1) >> 1;
        if (!less(heap[i], heap[up])) break;
        [heap[i], heap[up]] = [heap[up], heap[i]];
        i = up;
      }
    };
    const pop = (): number => {
      const top = heap[0];
      const last = heap.pop()!;
      if (heap.length) {
        heap[0] = last;
        for (let i = 0; ; ) {
          const l = i * 2 + 1;
          const r = l + 1;
          let m = i;
          if (l < heap.length && less(heap[l], heap[m])) m = l;
          if (r < heap.length && less(heap[r], heap[m])) m = r;
          if (m === i) break;
          [heap[i], heap[m]] = [heap[m], heap[i]];
          i = m;
        }
      }
      return top;
    };
    const cost = new Map<number, number>([[from, 0]]);
    const came = new Map<number, number>();
    let visited = 0;
    while (heap.length && visited++ < MAX_VISITED) {
      const cur = pop();
      if (cur === to) {
        const path = [centre(cur)];
        for (let at = cur; came.has(at); ) {
          at = came.get(at)!;
          path.unshift(centre(at));
        }
        return path;
      }
      const c = cur % cols;
      const r = Math.floor(cur / cols);
      for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const cc = c + dc;
        const rr = r + dr;
        if (cc < 0 || rr < 0 || cc >= cols || rr >= rows) continue;
        const n = rr * cols + cc;
        if (blocked[n]) continue;
        const g = cost.get(cur)! + 1;
        if (g >= (cost.get(n) ?? Infinity)) continue;
        cost.set(n, g);
        came.set(n, cur);
        const p = centre(n);
        score.set(n, g + (Math.abs(p.x - goal.x) + Math.abs(p.y - goal.y)) / step);
        push(n);
      }
    }
    return null;
  };

  const starts = doors.map(cellOf);
  const pairs = new Set<string>();
  for (let i = 0; i < doors.length; i++) {
    if (starts[i] === null) continue;
    let nearest = -1;
    let d = Infinity;
    for (let j = 0; j < doors.length; j++) {
      if (j === i || starts[j] === null) continue;
      const dist = Math.hypot(doors[j].x - doors[i].x, doors[j].y - doors[i].y);
      if (dist < d) {
        d = dist;
        nearest = j;
      }
    }
    if (nearest >= 0) pairs.add(`${Math.min(i, nearest)}:${Math.max(i, nearest)}`);
  }
  const paths: Point[][] = [];
  for (const key of [...pairs].sort()) {
    const [i, j] = key.split(':').map(Number);
    const path = search(starts[i]!, starts[j]!);
    if (path) paths.push(path);
  }
  return paths;
}
