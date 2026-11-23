// Soft fog edges (T-136a): a fog alpha mask computed once per fog change, never per frame.
// Pure, so its one promise – it never shows more than the hard mask – is tested directly.

/** A single-channel raster: 255 where the map is revealed, 0 where it is hidden. */
export interface Mask {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8Array;
}

/**
 * Where one pass of a separable filter walks: `count` lines of `length` texels; texel `step` of
 * line `line` is at `line * lineStride + step * stepStride`. Rows and columns are both lines.
 */
interface Lines {
  readonly count: number;
  readonly length: number;
  readonly lineStride: number;
  readonly stepStride: number;
}

const rowsOf = (width: number, height: number): Lines => ({
  count: height,
  length: width,
  lineStride: width,
  stepStride: 1,
});
const columnsOf = (width: number, height: number): Lines => ({
  count: width,
  length: height,
  lineStride: 1,
  stepStride: width,
});

/** One erosion pass: a texel stays revealed only if no hidden texel lies within `radius`. */
function erodeLines(input: Uint8Array, lines: Lines, radius: number) {
  const { count, length, lineStride, stepStride } = lines;
  const output = new Uint8Array(input.length);
  const before = new Float64Array(length);
  for (let line = 0; line < count; line++) {
    const start = line * lineStride;
    // Distance to the nearest hidden texel before, then after each texel.
    let last = -Infinity;
    for (let step = 0, index = start; step < length; step++) {
      if (input[index] === 0) last = step;
      before[step] = step - last;
      index += stepStride;
    }
    last = Infinity;
    for (
      let step = length - 1, index = start + step * stepStride;
      step >= 0;
      step--
    ) {
      if (input[index] === 0) last = step;
      const nearest = Math.min(before[step] ?? 0, last - step);
      output[index] = nearest > radius ? 255 : 0;
      index -= stepStride;
    }
  }
  return output;
}

/** One box blur pass over `2·radius+1` texels, the border continuing outward; rounded down. */
function blurLines(input: Uint8Array, lines: Lines, radius: number) {
  const { count, length, lineStride, stepStride } = lines;
  const output = new Uint8Array(input.length);
  const window = 2 * radius + 1;
  const last = length - 1;
  for (let line = 0; line < count; line++) {
    const start = line * lineStride;
    const value = (step: number) =>
      input[start + Math.min(last, Math.max(0, step)) * stepStride] ?? 0;
    let sum = 0;
    for (let step = -radius; step <= radius; step++) sum += value(step);
    for (let step = 0; step < length; step++) {
      output[start + step * stepStride] = Math.floor(sum / window);
      sum += value(step + radius + 1) - value(step - radius);
    }
  }
  return output;
}

/**
 * The fog's alpha per texel (255 = opaque) with a soft edge about `width` texels wide, measured
 * from the hard edge into the revealed area. The area is shrunk by half the width plus one
 * texel before it is blurred by half the width, so the whole softening lies inside it: every
 * hidden texel and every texel next to one stays fully fogged, also after linear filtering on
 * screen (fail-closed, ARCHITECTURE §8).
 */
export function softFogAlpha(mask: Mask, width: number): Uint8Array {
  // Square erosion by blur + 1, then a square box blur: both separable. The fog thins out from
  // 1 to 2·blur + 1 texels inside the hard edge.
  const blur = Math.floor(width / 2);
  const shrink = blur + 1;
  const rows = rowsOf(mask.width, mask.height);
  const columns = columnsOf(mask.width, mask.height);
  const eroded = erodeLines(
    erodeLines(mask.data, rows, shrink),
    columns,
    shrink,
  );
  const blurred = blurLines(blurLines(eroded, rows, blur), columns, blur);
  const alpha = new Uint8Array(blurred.length);
  for (let index = 0; index < blurred.length; index++) {
    const open = (blurred[index] ?? 0) / 255;
    // Smoothstep: the fog thins out gently at both ends of the edge.
    alpha[index] = 255 - Math.round(255 * open * open * (3 - 2 * open));
  }
  return alpha;
}
