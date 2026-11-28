/**
 * The height of a block for shading and shadows (E-89, Teil B §7.2): per support point
 * H = step · step height + fine height, and where the slope mask is set, H blends towards its mean
 * over about a cell – the step runs out as a ramp. With a halo of 8 cells around the block from its
 * neighbours, so shading has its neighbours and shadows fall in from beyond the block's edge.
 * Unknown or missing ground counts as level 0. Pure.
 */
import { BLOCK_POINTS, type RasterBlock } from './block';
import { RELIEF_PER_FT } from './heightTool';
import { UNKNOWN_STEP } from './tvRaster';

/** Support points of halo around a block's own (8 cells). */
export const HEIGHT_HALO = 32;
/** Side of a block's height data: its points, the first of its right and lower neighbours, and the halo. */
export const HEIGHT_SIDE = BLOCK_POINTS + 1 + 2 * HEIGHT_HALO;
/** How far the slope mask blends a step (support points): about a cell. */
const RAMP = 4;

export interface BlockHeights {
  /** Height in ft per point, HEIGHT_SIDE², from the halo's top left. */
  readonly heights: Float32Array;
  /** Slope mask per point (0…255), the same layout. */
  readonly slope: Uint8Array;
}

/** The heights of block (bx, by) of `blocks` with their halo; `stepFt`: the height of a step. */
export function blockHeights(bx: number, by: number, blocks: ReadonlyMap<string, RasterBlock>, stepFt: number): BlockHeights {
  // Raw heights over the halo and the ramp's reach.
  const reach = HEIGHT_HALO + RAMP;
  const side = HEIGHT_SIDE + 2 * RAMP;
  const raw = new Float32Array(side * side);
  const slope = new Uint8Array(HEIGHT_SIDE * HEIGHT_SIDE);
  const x0 = bx * BLOCK_POINTS - reach;
  const y0 = by * BLOCK_POINTS - reach;
  for (let y = 0; y < side; y++) {
    const gy = y0 + y;
    const ry = Math.floor(gy / BLOCK_POINTS);
    const ly = gy - ry * BLOCK_POINTS;
    for (let x = 0; x < side; x++) {
      const gx = x0 + x;
      const rx = Math.floor(gx / BLOCK_POINTS);
      const b = blocks.get(`${rx}_${ry}`);
      if (!b) continue;
      const i = ly * BLOCK_POINTS + (gx - rx * BLOCK_POINTS);
      const step = b.planes.step[i]!;
      raw[y * side + x] = (step === UNKNOWN_STEP ? 0 : step * stepFt) + b.planes.relief[i]! / RELIEF_PER_FT;
      const sx = x - RAMP;
      const sy = y - RAMP;
      if (sx >= 0 && sy >= 0 && sx < HEIGHT_SIDE && sy < HEIGHT_SIDE) slope[sy * HEIGHT_SIDE + sx] = b.planes.slope[i]!;
    }
  }
  // The mean over the ramp's reach (a separable box), only where a slope asks for it.
  const across = new Float32Array(side * side);
  for (let y = 0; y < side; y++)
    for (let x = RAMP; x < side - RAMP; x++) {
      let sum = 0;
      for (let d = -RAMP; d <= RAMP; d++) sum += raw[y * side + x + d]!;
      across[y * side + x] = sum / (2 * RAMP + 1);
    }
  const heights = new Float32Array(HEIGHT_SIDE * HEIGHT_SIDE);
  for (let y = 0; y < HEIGHT_SIDE; y++)
    for (let x = 0; x < HEIGHT_SIDE; x++) {
      const h = raw[(y + RAMP) * side + x + RAMP]!;
      const s = slope[y * HEIGHT_SIDE + x]! / 255;
      if (!s) {
        heights[y * HEIGHT_SIDE + x] = h;
        continue;
      }
      let sum = 0;
      for (let d = -RAMP; d <= RAMP; d++) sum += across[(y + RAMP + d) * side + x + RAMP]!;
      heights[y * HEIGHT_SIDE + x] = h + (sum / (2 * RAMP + 1) - h) * s;
    }
  return { heights, slope };
}
