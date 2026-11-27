/**
 * Variance of drawn surfaces (DC-119a): what breaks the visible repetition of one texture tiled
 * over a map. `variantBlobs` lays patches of texture variants (and rotations) over a sheet of
 * cells, `periodicNoise` shades large areas seamlessly, and `lineStrips` lets a texture follow a
 * line. Everything is deterministic in its seed and place. Pure.
 */
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
 * keeps its planks' direction, stone turns freely); `blobStep` is roughly how wide a patch is,
 * and `baseBias` favours the untouched base (variants then read as occasional patches).
 */
export function variantBlobs(opts: { cells: number; variants: number; rotations: number; seed: number; blobStep?: number; baseBias?: number }): VariantBlobs {
  const { cells, variants, rotations, seed, blobStep = 4, baseBias = 0 } = opts;
  const options = Math.max(1, variants * rotations);
  const period = Math.max(1, Math.round(cells / blobStep));
  const at = (x: number, y: number): BlobCell => {
    const u = (mod(x, cells) + 0.5) / blobStep;
    const v = (mod(y, cells) + 0.5) / blobStep;
    let best = 0;
    let score = -Infinity;
    for (let o = 0; o < options; o++) {
      // A bias keeps the plain base in front: variants appear as occasional patches.
      const s = periodicNoise(u, v, period, seed + o * 101) + (o === 0 ? baseBias : 0);
      if (s > score) {
        score = s;
        best = o;
      }
    }
    return { variant: best % variants, rotation: Math.floor(best / variants) * (4 / Math.max(1, rotations)) };
  };
  return { cells, at };
}

/* ---------------------------------------------------------------- line strips */

export interface Strip {
  x: number;
  y: number;
  /** Direction of the line here (radians). */
  angle: number;
  /** Distance walked from the start (map px). */
  u: number;
}

/**
 * Walks a polyline in steps of `spacing` map px (DC-119b): where each strip of a texture laid
 * along the line sits, with the running distance `u` – so courses of stone bend with the line
 * instead of running straight through. A closed ring walks all the way round.
 */
export function lineStrips(points: readonly Point[], closed: boolean, spacing: number): Strip[] {
  const pts = closed && points.length > 1 ? [...points, points[0]] : [...points];
  if (pts.length < 2) return [];
  const out: Strip[] = [];
  let u = 0;
  let into = 0;
  for (let k = 1; k < pts.length; k++) {
    const a = pts[k - 1];
    const b = pts[k];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (!len) continue;
    const angle = Math.atan2(b.y - a.y, b.x - a.x);
    for (let d = into; d <= len; d += spacing) {
      out.push({ x: a.x + ((b.x - a.x) * d) / len, y: a.y + ((b.y - a.y) * d) / len, angle, u: u + d });
      into = d + spacing - len;
    }
    u += len;
  }
  const last = out[out.length - 1];
  if (!last || u - last.u > spacing / 2) {
    const a = pts[pts.length - 2];
    const b = pts[pts.length - 1];
    out.push({ x: b.x, y: b.y, angle: Math.atan2(b.y - a.y, b.x - a.x), u });
  }
  return out;
}
