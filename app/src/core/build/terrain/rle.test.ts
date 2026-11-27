import { describe, expect, it } from 'vitest';
import { packBits, unpackBits } from './rle';

/** Run-length coding of raster bytes (E-55): PackBits. */
describe('packBits', () => {
  const round = (bytes: number[]) => Array.from(unpackBits(packBits(Uint8Array.from(bytes)), bytes.length));

  it('round-trips runs, literals and their mix', () => {
    for (const bytes of [[], [7], [1, 2, 3], new Array(500).fill(9), [1, 1, 2, 3, 3, 3, 3, 4, 5, 5], Array.from({ length: 1000 }, (_, i) => (i * 37) % 256)]) {
      expect(round(bytes)).toEqual(bytes);
    }
  });

  it('makes a uniform plane small', () => {
    expect(packBits(new Uint8Array(16384)).length).toBeLessThanOrEqual(2 * Math.ceil(16384 / 128));
  });

  it('refuses data that does not unpack to the expected length', () => {
    const packed = packBits(Uint8Array.from([1, 2, 3, 4]));
    expect(() => unpackBits(packed, 5)).toThrow();
    expect(() => unpackBits(packed, 3)).toThrow();
    expect(() => unpackBits(Uint8Array.from([5, 1]), 6)).toThrow();
  });
});
