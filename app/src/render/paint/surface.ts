/**
 * The painting base for derivation workers (E-53): a surface is an OffscreenCanvas – no DOM, so
 * the same painting runs in a worker and in a window – and its picture leaves as an ImageBitmap,
 * transferred without a copy. Painting code takes the surface's 2D context, never a document.
 */

export interface Surface {
  readonly canvas: OffscreenCanvas;
  readonly context: OffscreenCanvasRenderingContext2D;
}

export function createSurface(width: number, height: number): Surface {
  if (typeof OffscreenCanvas === 'undefined') throw new Error('no OffscreenCanvas: painting needs a browser or a worker');
  const canvas = new OffscreenCanvas(Math.max(1, Math.round(width)), Math.max(1, Math.round(height)));
  const context = canvas.getContext('2d');
  if (!context) throw new Error('no 2D context for a surface');
  return { canvas, context };
}

/** RGBA pixels of `width` × `height` as a picture to hand on. */
export function pixelsToBitmap(pixels: Uint8ClampedArray, width: number, height: number): ImageBitmap {
  const s = createSurface(width, height);
  s.context.putImageData(new ImageData(new Uint8ClampedArray(pixels), width, height), 0, 0);
  return s.canvas.transferToImageBitmap();
}
