// Spreading fog changes (T-167): when each texel of a fog change turns over, computed once per
// change (never per frame); the renderer mixes the two masks on the GPU in this order.

/** Fog alpha from which a texel counts as fogged (255 = opaque). */
const FOGGED = 128;
/**
 * Width of the moving front as a share of the whole spread: a texel turns over from when the
 * front reaches it until `FRONT` later, so the edge of the spread is soft.
 */
export const FRONT = 0.2;

/**
 * How a spread's time splits (T-246), as shares of its whole duration: a texel of order `o`
 * (0…1) turns over from `o · spread` until `front` later. Both add up to 1.
 */
export interface SpreadShares {
  readonly spread: number;
  readonly front: number;
}

/** A spread over a fixed duration (T-167): the front is a fifth of the spread. */
export const DURATION_SHARES: SpreadShares = {
  spread: 1 / (1 + FRONT),
  front: FRONT / (1 + FRONT),
};

/**
 * The duration of a spread at a speed (T-246) and how it splits: `longestPx` map pixels at
 * `cellsPerSecond` grid cells of `cellSizePx` per second, then `transitionMs` for each spot to
 * turn over. An infinite speed turns everything over together; 0 ms in all is no spread.
 */
export function spreadAtSpeed(
  longestPx: number,
  cellSizePx: number,
  cellsPerSecond: number,
  transitionMs: number,
): { readonly duration: number; readonly shares: SpreadShares } {
  const spreadMs =
    Number.isFinite(cellsPerSecond) && cellsPerSecond > 0 && cellSizePx > 0
      ? (Math.max(0, longestPx) / cellSizePx / cellsPerSecond) * 1000
      : 0;
  // At least a millisecond for each spot, so the front never divides by nothing.
  const front = Math.max(1, transitionMs);
  const duration = spreadMs + front;
  if (spreadMs <= 0 && transitionMs <= 0)
    return { duration: 0, shares: DURATION_SHARES };
  return {
    duration,
    shares: { spread: spreadMs / duration, front: front / duration },
  };
}

/** Options of a spread's order (T-246). */
export interface SpreadOptions {
  /**
   * A cost per texel (1…), so the front advances unevenly – ragged, not a clean circle. None
   * spreads evenly.
   */
  readonly weights?: Uint8Array;
  /**
   * Every change at the same speed, timed against the longest one (T-246); otherwise each
   * change spreads over the whole duration on its own (T-167).
   */
  readonly atSpeed?: boolean;
  /**
   * Where a hide that touches no fog starts when it leaves the whole mask fogged (T-249): the
   * changed texel at this share (0…1) of all changed texels in reading order; the hide then
   * spreads from there. Otherwise, or with none: from the hide's middle.
   */
  readonly originShare?: number;
}
// Chamfer steps (3 straight, 4 diagonal ≈ 3·√2): fronts close to round, in integers.
const STRAIGHT = 3;
const DIAGONAL = 4;
const NEIGHBOURS = [
  [-1, 0, STRAIGHT],
  [1, 0, STRAIGHT],
  [0, -1, STRAIGHT],
  [0, 1, STRAIGHT],
  [-1, -1, DIAGONAL],
  [1, -1, DIAGONAL],
  [-1, 1, DIAGONAL],
  [1, 1, DIAGONAL],
] as const;

const UNCHANGED = 0;
const REVEAL = 1;
const HIDE = 2;

/**
 * When each texel of the change from `from` to `to` (fog alpha per texel, 255 = opaque) turns
 * over: 0 first … 255 last; 0 for texels that do not change. A change is spread on its own
 * (connected texels changing the same way), over its whole length:
 *
 * - a reveal from the revealed area it touches, else from its middle outward;
 * - a hide from the fog it touches, else from its middle outward (T-249).
 *
 * Distances run inside the change, so a spread follows the shape around corners.
 */
export function spreadOrder(
  width: number,
  height: number,
  from: Uint8Array,
  to: Uint8Array,
  options: SpreadOptions = {},
): Uint8Array {
  return spreadTiming(width, height, from, to, options).order;
}

/**
 * {@link spreadOrder} and the length of the longest change in texels (its weighted distance in
 * plain steps), which sets a spread's duration at a speed.
 */
export function spreadTiming(
  width: number,
  height: number,
  from: Uint8Array,
  to: Uint8Array,
  options: SpreadOptions = {},
): { readonly order: Uint8Array; readonly longest: number } {
  const { weights, atSpeed = false, originShare } = options;
  const count = width * height;
  const kind = new Uint8Array(count);
  for (let index = 0; index < count; index++) {
    const a = from[index] ?? 255;
    const b = to[index] ?? 255;
    kind[index] = b < a ? REVEAL : b > a ? HIDE : UNCHANGED;
  }
  const component = labelComponents(width, height, kind);
  const sourced = new Set<number>();
  const seeds: number[] = [];
  const edges: number[] = [];
  const around = new Int32Array(8);
  const steps = new Int32Array(8);
  for (let index = 0; index < count; index++) {
    const own = kind[index];
    if (own === UNCHANGED) continue;
    let touchesSource = false;
    let onEdge = false;
    const found = neighbours(width, height, index, around, steps);
    // The mask's border is an edge too (a change over the whole map has no other), but never
    // something to spread from.
    if (found < NEIGHBOURS.length) onEdge = true;
    for (let k = 0; k < found; k++) {
      const neighbour = around[k] ?? 0;
      if (kind[neighbour] === own) continue;
      onEdge = true;
      if (kind[neighbour] !== UNCHANGED) continue;
      // An unchanged neighbour that already is what the change becomes: revealed for a
      // reveal, fogged for a hide.
      const fogged = (from[neighbour] ?? 255) >= FOGGED;
      if (fogged === (own === HIDE)) touchesSource = true;
    }
    if (touchesSource) {
      seeds.push(index);
      sourced.add(component[index] ?? 0);
    }
    if (onEdge) edges.push(index);
  }
  // Changes that touch nothing to spread from start at their edge instead, reversed below so
  // they run middle first.
  // A chosen start (T-249): the hide containing it spreads from there instead of its middle.
  const fromOrigin = new Set<number>();
  // Only when the whole mask ends fogged: "Alles verdecken" with no fog left to come from.
  if (originShare !== undefined && to.every((alpha) => alpha >= FOGGED)) {
    const origin = changedAt(kind, originShare);
    const label = origin === -1 ? 0 : (component[origin] ?? 0);
    if (label !== 0 && kind[origin] === HIDE && !sourced.has(label)) {
      seeds.push(origin);
      fromOrigin.add(label);
    }
  }
  for (const index of edges) {
    const label = component[index] ?? 0;
    if (!sourced.has(label) && !fromOrigin.has(label)) seeds.push(index);
  }
  const { distance, plain } = distances(
    width,
    height,
    component,
    seeds,
    weights,
  );
  const longest = new Map<number, number>();
  // The texel reached last (by cost) and how long its path is in plain steps: the front travels
  // that far in the spread's time, so the set speed holds along it.
  let overall = 0;
  let overallPlain = 0;
  for (let index = 0; index < count; index++) {
    if (kind[index] === UNCHANGED) continue;
    const label = component[index] ?? 0;
    const own = distance[index] ?? 0;
    longest.set(label, Math.max(longest.get(label) ?? 0, own));
    if (own > overall) {
      overall = own;
      overallPlain = plain[index] ?? 0;
    }
  }
  // At a speed every change is timed against the longest one, so a small one finishes first.
  const order = new Uint8Array(count);
  for (let index = 0; index < count; index++) {
    if (kind[index] === UNCHANGED) continue;
    const label = component[index] ?? 0;
    const max = longest.get(label) ?? 0;
    // A change with no length (one texel, a one-texel line) turns over at once.
    if (max === 0) continue;
    const own = distance[index] ?? 0;
    // A change that touches nothing to spread from starts in its middle (T-249: hides too).
    const middleFirst = !sourced.has(label) && !fromOrigin.has(label);
    const along = middleFirst ? max - own : own;
    order[index] = Math.round((255 * along) / (atSpeed ? overall : max));
  }
  // Unchanged texels next to a change take its order: the GPU filters the order linearly, and
  // a 0 there would pull the change's edge ahead of its front.
  const padded = order.slice();
  for (let index = 0; index < count; index++) {
    if (kind[index] !== UNCHANGED) continue;
    const found = neighbours(width, height, index, around, steps);
    let nearest = -1;
    for (let k = 0; k < found; k++) {
      const neighbour = around[k] ?? 0;
      if (kind[neighbour] === UNCHANGED) continue;
      const value = order[neighbour] ?? 0;
      if (nearest === -1 || value < nearest) nearest = value;
    }
    if (nearest !== -1) padded[index] = nearest;
  }
  return {
    order: padded,
    longest: overallPlain / STRAIGHT,
  };
}

/** The changed texel at `share` (0…1) of all changed texels in reading order; -1 if none. */
function changedAt(kind: Uint8Array, share: number): number {
  let count = 0;
  for (const each of kind) if (each !== UNCHANGED) count++;
  if (count === 0) return -1;
  const wanted = Math.min(count - 1, Math.max(0, Math.floor(share * count)));
  let seen = 0;
  for (let index = 0; index < kind.length; index++) {
    if (kind[index] === UNCHANGED) continue;
    if (seen === wanted) return index;
    seen++;
  }
  return -1;
}

/** Costs of the ragged front: 1 (fast) … {@link RAGGED_MAX} (slow). */
const RAGGED_MAX = 12;

/**
 * Costs per texel for a ragged front (T-246): value noise in grid cells, the same for the same
 * map (`seed`), so a change spreads the same way every time. Slow patches make the front advance
 * in tongues instead of a clean circle.
 */
export function raggedWeights(
  width: number,
  height: number,
  cellsPerTexel: number,
  seed: number,
): Uint8Array {
  const weights = new Uint8Array(width * height);
  // About one swirl every two cells.
  const scale = Math.max(1e-6, cellsPerTexel) / 2;
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const n = fbm(x * scale, y * scale, seed);
      weights[y * width + x] = 1 + Math.round((RAGGED_MAX - 1) * n * n);
    }
  return weights;
}

function hash(x: number, y: number, seed: number): number {
  let h =
    (Math.imul(x, 374761393) +
      Math.imul(y, 668265263) +
      Math.imul(seed, 1442695041)) |
    0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

function valueNoise(x: number, y: number, seed: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const a = hash(xi, yi, seed);
  const b = hash(xi + 1, yi, seed);
  const c = hash(xi, yi + 1, seed);
  const d = hash(xi + 1, yi + 1, seed);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

/** Three octaves of value noise, 0…1. */
function fbm(x: number, y: number, seed: number): number {
  let sum = 0;
  let amplitude = 0.5;
  let frequency = 1;
  for (let octave = 0; octave < 3; octave++) {
    sum += amplitude * valueNoise(x * frequency, y * frequency, seed + octave);
    frequency *= 2.03;
    amplitude *= 0.5;
  }
  return sum / 0.875;
}

/** A raster of one value per texel, row by row. */
export interface Grid {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8Array;
}

/**
 * Longest side of the order grid: the order only sets the timing (the mix keeps fog safe), so a
 * coarse one suffices and stays cheap (about 5 ms at 256², measured in Node).
 */
export const ORDER_SIDE = 256;

/**
 * The spread order of the change from `from` to `to` (same size), on a grid at most
 * `ORDER_SIDE` texels long: each of its texels averages the block of mask texels it covers.
 */
export function coarseSpreadOrder(
  from: Grid,
  to: Grid,
  /**
   * At a speed (T-246): the grid cells per mask texel and the map's seed make the front
   * ragged, and every change spreads at the same speed. None spreads as T-167 did.
   */
  ragged?: { readonly cellsPerTexel: number; readonly seed: number },
  /** Where a hide that touches no fog starts (T-249), see {@link SpreadOptions}. */
  originShare?: number,
): Grid & {
  /** The longest change in mask texels (with `ragged`; its weighted length). */
  readonly longest: number;
} {
  const factor = Math.max(
    1,
    Math.ceil(Math.max(to.width, to.height) / ORDER_SIDE),
  );
  const coarseFrom = shrink(from, factor);
  const coarseTo = shrink(to, factor);
  const timing = spreadTiming(
    coarseTo.width,
    coarseTo.height,
    coarseFrom.data,
    coarseTo.data,
    {
      ...(ragged && {
        atSpeed: true,
        weights: raggedWeights(
          coarseTo.width,
          coarseTo.height,
          ragged.cellsPerTexel * factor,
          ragged.seed,
        ),
      }),
      ...(originShare !== undefined && { originShare }),
    },
  );
  return {
    width: coarseTo.width,
    height: coarseTo.height,
    data: timing.order,
    longest: timing.longest * factor,
  };
}

/** `grid` scaled down by `factor`, each texel the rounded mean of its block. */
function shrink(grid: Grid, factor: number): Grid {
  if (factor === 1) return grid;
  const width = Math.ceil(grid.width / factor);
  const height = Math.ceil(grid.height / factor);
  const data = new Uint8Array(width * height);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      let sum = 0;
      let count = 0;
      for (
        let fy = y * factor;
        fy < Math.min(grid.height, (y + 1) * factor);
        fy++
      )
        for (
          let fx = x * factor;
          fx < Math.min(grid.width, (x + 1) * factor);
          fx++
        ) {
          sum += grid.data[fy * grid.width + fx] ?? 255;
          count++;
        }
      data[y * width + x] = Math.round(sum / count);
    }
  return { width, height, data };
}

/** `order` stretched to `width`×`height` (nearest texel), for mixing at the masks' size. */
export function sampleOrder(
  order: Grid,
  width: number,
  height: number,
): Uint8Array {
  const data = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    const oy = Math.min(
      order.height - 1,
      Math.floor((y * order.height) / height),
    );
    for (let x = 0; x < width; x++) {
      const ox = Math.min(
        order.width - 1,
        Math.floor((x * order.width) / width),
      );
      data[y * width + x] = order.data[oy * order.width + ox] ?? 0;
    }
  }
  return data;
}

/**
 * The fog on screen at `t` (0…1) of a spread: per texel a linear mix from `from` to `to` while
 * the front passes it. The renderer's shader does the same on the GPU. Linear, so a texel
 * opaque before and after stays opaque throughout.
 */
export function spreadMix(
  from: Uint8Array,
  to: Uint8Array,
  order: Uint8Array,
  t: number,
  shares: SpreadShares = DURATION_SHARES,
): Uint8Array {
  const mixed = new Uint8Array(to.length);
  for (let index = 0; index < to.length; index++) {
    const a = from[index] ?? 255;
    const b = to[index] ?? 255;
    const local = Math.min(
      1,
      Math.max(
        0,
        (t - ((order[index] ?? 0) / 255) * shares.spread) / shares.front,
      ),
    );
    mixed[index] = Math.round(a + (b - a) * local);
  }
  return mixed;
}

/**
 * Neighbour offsets and chamfer steps for texel `index`; texels on the border skip the
 * neighbours outside the mask (returned count).
 */
function neighbours(
  width: number,
  height: number,
  index: number,
  into: Int32Array,
  steps: Int32Array,
): number {
  const x = index % width;
  const y = (index - x) / width;
  let count = 0;
  for (const [dx, dy, step] of NEIGHBOURS) {
    const nx = x + dx;
    const ny = y + dy;
    if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
    into[count] = ny * width + nx;
    steps[count] = step;
    count++;
  }
  return count;
}

/** Connected texels changing the same way share a label (1, 2, …); unchanged ones have 0. */
function labelComponents(
  width: number,
  height: number,
  kind: Uint8Array,
): Int32Array {
  const label = new Int32Array(width * height);
  const around = new Int32Array(8);
  const steps = new Int32Array(8);
  const stack = new Int32Array(width * height);
  let next = 0;
  for (let start = 0; start < kind.length; start++) {
    if (kind[start] === UNCHANGED || label[start] !== 0) continue;
    label[start] = ++next;
    let top = 0;
    stack[top++] = start;
    while (top > 0) {
      const index = stack[--top] ?? 0;
      const count = neighbours(width, height, index, around, steps);
      for (let k = 0; k < count; k++) {
        const neighbour = around[k] ?? 0;
        if (label[neighbour] !== 0 || kind[neighbour] !== kind[index]) continue;
        label[neighbour] = next;
        stack[top++] = neighbour;
      }
    }
  }
  return label;
}

/**
 * Chamfer distance from the nearest seed, walking only within each seed's own change (a
 * Dijkstra over integer steps with a bucket queue: linear in the changed texels). With
 * `weights`, steps cost more on slow texels; `plain` is the length of each texel's path in
 * unweighted chamfer steps.
 */
function distances(
  width: number,
  height: number,
  component: Int32Array,
  seeds: readonly number[],
  weights?: Uint8Array,
): { readonly distance: Int32Array; readonly plain: Int32Array } {
  const distance = new Int32Array(width * height).fill(-1);
  const plain = new Int32Array(width * height);
  const around = new Int32Array(8);
  const steps = new Int32Array(8);
  const buckets: number[][] = [[...seeds]];
  for (const seed of seeds) distance[seed] = 0;
  for (let current = 0; current < buckets.length; current++) {
    const bucket = buckets[current] ?? [];
    for (const index of bucket) {
      if (distance[index] !== current) continue;
      const own = component[index];
      const count = neighbours(width, height, index, around, steps);
      for (let k = 0; k < count; k++) {
        const neighbour = around[k] ?? 0;
        // Unchanged texels have label 0, never a change's own label.
        if (component[neighbour] !== own) continue;
        // Weighted: the step costs the mean of both texels' costs (rounded, at least 1).
        const cost = weights
          ? Math.max(
              1,
              Math.round(
                ((steps[k] ?? 0) *
                  ((weights[index] ?? 1) + (weights[neighbour] ?? 1))) /
                  2,
              ),
            )
          : (steps[k] ?? 0);
        const reached = current + cost;
        const known = distance[neighbour] ?? -1;
        if (known !== -1 && known <= reached) continue;
        distance[neighbour] = reached;
        plain[neighbour] = (plain[index] ?? 0) + (steps[k] ?? 0);
        (buckets[reached] ??= []).push(neighbour);
      }
    }
  }
  return { distance, plain };
}
