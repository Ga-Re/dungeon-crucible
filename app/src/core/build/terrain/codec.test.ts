import { describe, expect, it } from 'vitest';
import { emptyPatch, newBlock, patchCells, patchPoints, pointAt, withCells, withPoints } from './block';
import { decodeBlock, decodePatch, encodeBlock, encodePatch, fromBase64, toBase64 } from './codec';
import { rasterBlockSchema, rasterPatchSchema } from '../intent';

/** Raster blocks in the map file (E-55): planes → PackBits → Deflate → Base64. */
describe('Base64', () => {
  it('round-trips any bytes, also large ones', () => {
    const bytes = Uint8Array.from({ length: 300_001 }, (_, i) => (i * 131) % 256);
    expect(fromBase64(toBase64(bytes))).toEqual(bytes);
    expect(toBase64(new Uint8Array())).toBe('');
  });
});

describe('a block in the file', () => {
  it('round-trips every channel and fits the file schema', async () => {
    let b = withPoints(newBlock(), 'step', [[0, 0, -3], [127, 127, 15]]);
    b = withPoints(b, 'relief', [[5, 5, -320], [6, 5, 32767]]);
    b = withPoints(b, 'densityRocks', [[9, 9, 0]]);
    b = withCells(b, 'biome4', [[31, 0, 17]]);
    const enc = await encodeBlock(b);
    expect(rasterBlockSchema.safeParse(enc).success).toBe(true);
    const back = await decodeBlock(enc);
    for (const ch of Object.keys(b.planes) as (keyof typeof b.planes)[]) expect(Array.from(back.planes[ch]), ch).toEqual(Array.from(b.planes[ch]));
    expect(pointAt(back, 'relief', 5, 5)).toBe(-320);
  });

  it('an empty block is a few dozen bytes', async () => {
    expect((await encodeBlock(newBlock())).data.length).toBeLessThan(200);
  });

  it('refuses broken or foreign data with a clear error', async () => {
    const enc = await encodeBlock(newBlock());
    await expect(decodeBlock({ v: 1, data: enc.data.slice(0, -8) })).rejects.toThrow(/raster block/i);
    await expect(decodeBlock({ v: 1, data: toBase64(Uint8Array.from([1, 2, 3])) })).rejects.toThrow(/raster block/i);
  });
});

describe('a patch in the file', () => {
  it('round-trips its values and its mask', async () => {
    const p = patchCells(patchPoints(emptyPatch(), 'water', [[3, 4, 200]]), 'biome2', [[1, 1, 99]]);
    const enc = await encodePatch(p);
    expect(rasterPatchSchema.safeParse(enc).success).toBe(true);
    const back = await decodePatch(enc);
    expect(Array.from(back.pointMask)).toEqual(Array.from(p.pointMask));
    expect(Array.from(back.cellMask)).toEqual(Array.from(p.cellMask));
    expect(pointAt(back.values, 'water', 3, 4)).toBe(200);
  });
});
