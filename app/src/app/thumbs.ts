/**
 * Thumbnails for the Asset Vault (E-27): made here from the library file (an image, or a frame of
 * a video) on a canvas, kept by the main process in this device's cache (app data folder) under a
 * key from the file's absolute path, size and time – a changed file gets a new one. Sounds have none.
 */
import { kindFromFile } from '../core/assets';
import { absolutePath, assetUrl, readThumb, writeThumb } from '../platform/bridge';

const MAX_PX = 256;
/** Thumbnails made at the same time (decoding large images is heavy). */
const PARALLEL = 3;

const made = new Map<string, Promise<string | null>>();
const waiting: (() => void)[] = [];
let running = 0;

async function slot<T>(work: () => Promise<T>): Promise<T> {
  if (running >= PARALLEL) await new Promise<void>((go) => waiting.push(go));
  running++;
  try {
    return await work();
  } finally {
    running--;
    waiting.shift()?.();
  }
}

async function keyOf(absPath: string, size: number, mtimeMs: number): Promise<string> {
  const data = new TextEncoder().encode(`${absPath}|${size}|${mtimeMs}`);
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', data));
  return [...hash.slice(0, 20)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Draws `source` (w × h) scaled down to fit MAX_PX and returns it as WebP. */
async function toWebp(source: CanvasImageSource, w: number, h: number): Promise<Uint8Array | null> {
  if (!w || !h) return null;
  const scale = Math.min(1, MAX_PX / Math.max(w, h));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(w * scale));
  canvas.height = Math.max(1, Math.round(h * scale));
  canvas.getContext('2d')?.drawImage(source, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob | null>((done) => canvas.toBlob(done, 'image/webp', 0.82));
  return blob ? new Uint8Array(await blob.arrayBuffer()) : null;
}

async function render(url: string, video: boolean): Promise<Uint8Array | null> {
  if (!video) {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = url;
    await img.decode();
    return toWebp(img, img.naturalWidth, img.naturalHeight);
  }
  const v = document.createElement('video');
  v.crossOrigin = 'anonymous';
  v.muted = true;
  v.preload = 'auto';
  v.src = url;
  try {
    await withTimeout(new Promise<void>((ok, fail) => {
      v.onloadeddata = () => ok();
      v.onerror = () => fail(new Error('video'));
    }));
    // A frame a little in: the first is often black.
    v.currentTime = Math.min(0.5, (v.duration || 1) / 2);
    await withTimeout(new Promise<void>((ok) => (v.onseeked = () => ok())));
    return await toWebp(v, v.videoWidth, v.videoHeight);
  } finally {
    v.removeAttribute('src');
    v.load();
  }
}

/** A video that never loads must not hold a slot for good. */
function withTimeout<T>(p: Promise<T>, ms = 10_000): Promise<T> {
  return Promise.race([p, new Promise<T>((_, fail) => setTimeout(() => fail(new Error('timeout')), ms))]);
}

/** An object URL of the thumbnail of a library file, or null (sounds, unreadable files). */
export function thumbnailUrl(relPath: string, size: number, mtimeMs: number): Promise<string | null> {
  const kind = kindFromFile(relPath);
  if (kind !== 'prop' && kind !== 'effect') return Promise.resolve(null);
  const id = `${relPath}|${size}|${mtimeMs}`;
  let p = made.get(id);
  if (!p) {
    p = slot(async () => {
      try {
        const abs = await absolutePath(relPath);
        const key = await keyOf(abs, size, mtimeMs);
        let bytes = await readThumb(key);
        if (!bytes) {
          bytes = await render(await assetUrl(abs), kind === 'effect');
          // Not cached is no loss: it is made again next time.
          if (bytes) await writeThumb(key, bytes).catch(() => undefined);
        }
        return bytes ? URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'image/webp' })) : null;
      } catch {
        // Not remembered: the next time the card is shown it is tried again.
        made.delete(id);
        return null;
      }
    });
    made.set(id, p);
  }
  return p;
}
