/**
 * The jobs the derivation workers run (E-53): pure functions of plain data, the same in the
 * worker and in tests. `handle` answers every request – an unknown or failing job with an error,
 * never by throwing – and names the buffers of its result, which go back transferred (the
 * worker keeps nothing). Inputs arrive as copies: the main thread's blocks never change and must
 * not be detached.
 */
import { pixelsToBitmap } from '../render/paint/surface';
import { applyPatches, BLOCK_CELLS, pointAt, SUBDIVISIONS, type RasterBlock, type RasterPatch } from '../core/build/terrain/block';

/**
 * A block's schematic preview, one pixel per cell (RGBA): rock dark, water blue, the ground grey,
 * lighter the higher its step. For checks in the Map Forge and the catalog until the real
 * pipeline paints (DC-128).
 */
export function previewPixels(b: RasterBlock): Uint8ClampedArray {
  const out = new Uint8ClampedArray(BLOCK_CELLS * BLOCK_CELLS * 4);
  for (let cy = 0; cy < BLOCK_CELLS; cy++)
    for (let cx = 0; cx < BLOCK_CELLS; cx++) {
      const i = (cy * BLOCK_CELLS + cx) * 4;
      out.set(previewColour(b, cx * SUBDIVISIONS, cy * SUBDIVISIONS), i);
      out[i + 3] = 255;
    }
  return out;
}

function previewColour(b: RasterBlock, x: number, y: number): [number, number, number] {
  if (pointAt(b, 'solid', x, y) >= 128) return [40, 38, 36];
  if (pointAt(b, 'water', x, y) >= 128) return [52, 104, 150];
  const v = 110 + pointAt(b, 'step', x, y) * 20;
  return [v, v, v - 8];
}

/** A block as received; anything else is refused (inputs cross a thread boundary). */
function block(b: unknown): RasterBlock {
  const planes = (b as RasterBlock | null)?.planes;
  if (!planes || !ArrayBuffer.isView(planes.step)) throw new Error('not a raster block');
  return b as RasterBlock;
}

export const JOBS = {
  /** A block as shown: its base with the patches of the active layers over it (E-58). */
  composeBlock: (input: { base: RasterBlock; patches: RasterPatch[] }): RasterBlock => applyPatches(block(input.base), input.patches),
  /** A block's schematic preview, as RGBA pixels of 32 × 32 cells. */
  blockPreview: (input: { block: RasterBlock }): Uint8ClampedArray => previewPixels(block(input.block)),
  /** The same as a picture, painted on an OffscreenCanvas (workers and windows alike). */
  blockPreviewBitmap: (input: { block: RasterBlock }): ImageBitmap => pixelsToBitmap(previewPixels(block(input.block)), BLOCK_CELLS, BLOCK_CELLS),
};

export type JobKind = keyof typeof JOBS;
export type JobInput<K extends JobKind> = Parameters<(typeof JOBS)[K]>[0];
export type JobOutput<K extends JobKind> = ReturnType<(typeof JOBS)[K]>;

export interface JobRequest<K extends JobKind = JobKind> {
  id: number;
  kind: K;
  input: JobInput<K>;
}

export type JobResponse = { id: number; ok: true; output: unknown } | { id: number; ok: false; error: string };

/** What of a result can be handed over without a copy – its buffers and pictures – each once. */
function transferablesOf(value: unknown, out = new Set<Transferable>()): Set<Transferable> {
  if (typeof ImageBitmap !== 'undefined' && value instanceof ImageBitmap) out.add(value);
  else if (ArrayBuffer.isView(value)) {
    if (value.buffer instanceof ArrayBuffer) out.add(value.buffer);
  } else if (value && typeof value === 'object') for (const v of Object.values(value)) transferablesOf(v, out);
  return out;
}

export function handle(req: JobRequest): { message: JobResponse; transfer: Transferable[] } {
  const job = (JOBS as Record<string, ((input: never) => unknown) | undefined>)[req.kind];
  if (!job) return { message: { id: req.id, ok: false, error: `unknown job ${req.kind}` }, transfer: [] };
  try {
    const output = job(req.input as never);
    return { message: { id: req.id, ok: true, output }, transfer: [...transferablesOf(output)] };
  } catch (e) {
    return { message: { id: req.id, ok: false, error: e instanceof Error ? e.message : String(e) }, transfer: [] };
  }
}
