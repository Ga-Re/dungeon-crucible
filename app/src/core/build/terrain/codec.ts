/**
 * Raster blocks and patches in the map file (E-55): the planes in file order (an int16 plane as
 * its low bytes, then its high bytes – runs survive), PackBits, Deflate (`CompressionStream`, with
 * its checksum), Base64. `v` names this layout. Reading checks every length: a broken block is
 * refused as a whole, never read half. Pure apart from the platform's (de)compression streams.
 */
import { CELL_CHANNELS, POINT_CHANNELS, newPlane, planeKind, type Channel, type RasterBlock, type RasterPatch } from './block';
import { BLOCK_CELLS, BLOCK_POINTS } from './block';
import { packBits, unpackBits } from './rle';

const CHANNELS: readonly Channel[] = [...POINT_CHANNELS, ...CELL_CHANNELS];
const POINTS = BLOCK_POINTS * BLOCK_POINTS;
const CELLS = BLOCK_CELLS * BLOCK_CELLS;

const sizeOf = (ch: Channel) => newPlane(ch).length * (planeKind(ch) === 'i16' ? 2 : 1);
const BLOCK_BYTES = CHANNELS.reduce((n, ch) => n + sizeOf(ch), 0);
const MASK_BYTES = POINTS + CELLS;

/* ---------------------------------------------------------------- Base64 */

const CHUNK = 0x8000;

export function toBase64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += CHUNK) s += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  return btoa(s);
}

export function fromBase64(text: string): Uint8Array {
  const s = atob(text);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

/* ---------------------------------------------------------------- Deflate */

async function through(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const writer = stream.writable.getWriter();
  // Errors of the write side show on the read side too; do not leave them unhandled here.
  void writer.write(bytes as Uint8Array<ArrayBuffer>).catch(() => undefined);
  void writer.close().catch(() => undefined);
  const parts: Uint8Array[] = [];
  const reader = stream.readable.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    parts.push(value);
  }
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

async function pack(bytes: Uint8Array): Promise<string> {
  return toBase64(await through(packBits(bytes), new CompressionStream('deflate')));
}

async function unpack(text: string, length: number, what: string): Promise<Uint8Array> {
  try {
    return unpackBits(await through(fromBase64(text), new DecompressionStream('deflate')), length);
  } catch (e) {
    throw new Error(`${what} is broken (${e instanceof Error ? e.message : String(e)})`);
  }
}

/* ---------------------------------------------------------------- planes ↔ bytes */

function planesToBytes(b: RasterBlock): Uint8Array {
  const out = new Uint8Array(BLOCK_BYTES);
  let o = 0;
  for (const ch of CHANNELS) {
    const plane = b.planes[ch];
    if (planeKind(ch) === 'i16') {
      const n = plane.length;
      for (let i = 0; i < n; i++) {
        out[o + i] = plane[i]! & 0xff;
        out[o + n + i] = (plane[i]! >> 8) & 0xff;
      }
      o += 2 * n;
    } else {
      out.set(new Uint8Array(plane.buffer, plane.byteOffset, plane.length), o);
      o += plane.length;
    }
  }
  return out;
}

function bytesToPlanes(bytes: Uint8Array): RasterBlock {
  const planes = {} as Record<Channel, Int8Array | Int16Array | Uint8Array>;
  let o = 0;
  for (const ch of CHANNELS) {
    const plane = newPlane(ch);
    const n = plane.length;
    if (planeKind(ch) === 'i16') {
      for (let i = 0; i < n; i++) plane[i] = (bytes[o + i]! | (bytes[o + n + i]! << 8)) << 16 >> 16;
      o += 2 * n;
    } else {
      new Uint8Array(plane.buffer).set(bytes.subarray(o, o + n));
      o += n;
    }
    planes[ch] = plane;
  }
  return { planes };
}

/* ---------------------------------------------------------------- blocks and patches */

export async function encodeBlock(b: RasterBlock): Promise<{ v: 1; data: string }> {
  return { v: 1, data: await pack(planesToBytes(b)) };
}

export async function decodeBlock(enc: { v: 1; data: string }): Promise<RasterBlock> {
  return bytesToPlanes(await unpack(enc.data, BLOCK_BYTES, 'raster block'));
}

export async function encodePatch(p: RasterPatch): Promise<{ v: 1; data: string; mask: string }> {
  const mask = new Uint8Array(MASK_BYTES);
  mask.set(p.pointMask, 0);
  mask.set(p.cellMask, POINTS);
  const [data, maskText] = await Promise.all([pack(planesToBytes(p.values)), pack(mask)]);
  return { v: 1, data, mask: maskText };
}

export async function decodePatch(enc: { v: 1; data: string; mask: string }): Promise<RasterPatch> {
  const [bytes, mask] = await Promise.all([unpack(enc.data, BLOCK_BYTES, 'raster patch'), unpack(enc.mask, MASK_BYTES, 'raster patch mask')]);
  return { values: bytesToPlanes(bytes), pointMask: mask.slice(0, POINTS), cellMask: mask.slice(POINTS) };
}
