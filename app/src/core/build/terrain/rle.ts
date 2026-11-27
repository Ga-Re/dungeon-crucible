/**
 * Run-length coding of raster bytes (E-55), as PackBits: a control byte n < 128 is followed by
 * n + 1 literal bytes, n ≥ 128 by one byte repeated n − 125 times (3 … 130). Large uniform areas
 * shrink to a few bytes before Deflate. Pure.
 */

const MAX_LITERAL = 128;
const MIN_RUN = 3;
const MAX_RUN = 130;

export function packBits(bytes: Uint8Array): Uint8Array {
  const out: number[] = [];
  let i = 0;
  const literal: number[] = [];
  const flush = () => {
    for (let k = 0; k < literal.length; k += MAX_LITERAL) {
      const part = literal.slice(k, k + MAX_LITERAL);
      out.push(part.length - 1, ...part);
    }
    literal.length = 0;
  };
  while (i < bytes.length) {
    let run = 1;
    while (i + run < bytes.length && bytes[i + run] === bytes[i] && run < MAX_RUN) run++;
    if (run >= MIN_RUN) {
      flush();
      out.push(run + 125, bytes[i]!);
      i += run;
    } else {
      literal.push(bytes[i]!);
      i++;
    }
  }
  flush();
  return Uint8Array.from(out);
}

/** The bytes `packed` stands for; throws unless they are exactly `length` bytes. */
export function unpackBits(packed: Uint8Array, length: number): Uint8Array {
  const out = new Uint8Array(length);
  let o = 0;
  let i = 0;
  while (i < packed.length) {
    const n = packed[i++]!;
    if (n < MAX_LITERAL) {
      const count = n + 1;
      if (i + count > packed.length || o + count > length) throw new Error('run-length data does not fit');
      out.set(packed.subarray(i, i + count), o);
      i += count;
      o += count;
    } else {
      const count = n - 125;
      if (i >= packed.length || o + count > length) throw new Error('run-length data does not fit');
      out.fill(packed[i++]!, o, o + count);
      o += count;
    }
  }
  if (o !== length) throw new Error('run-length data is too short');
  return out;
}
