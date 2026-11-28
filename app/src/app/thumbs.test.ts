import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DcApi } from '../platform/desktop-api';

/** A drawn map's thumbnail (E-90): made by the renderer once per version of its file, kept in this device's cache. */
const preview = vi.fn<(mapFile: string, maxPx: number) => Promise<Uint8Array | null>>();
vi.mock('./mapPreview', () => ({ drawnMapPreview: (f: string, px: number) => preview(f, px) }));

let cache: Map<string, Uint8Array>;
beforeEach(() => {
  cache = new Map();
  preview.mockReset();
  const api: Partial<DcApi> = {
    absolutePath: async (rel: string) => `/root/${rel}`,
    readThumb: async (key: string) => cache.get(key) ?? null,
    writeThumb: async (key: string, bytes: Uint8Array) => void cache.set(key, bytes),
  };
  window.dc = api as DcApi;
  URL.createObjectURL = vi.fn(() => 'blob:thumb');
});

describe('drawn map thumbnails', () => {
  it('drawn once per version of the map file and kept; a new version is drawn again', async () => {
    const { drawnMapThumbnailUrl } = await import('./thumbs');
    preview.mockResolvedValue(new Uint8Array([1, 2, 3]));
    expect(await drawnMapThumbnailUrl('library/keep.map.json', 100, 1)).toBe('blob:thumb');
    expect(preview).toHaveBeenCalledWith('library/keep.map.json', 256);
    expect(cache.size).toBe(1);
    expect(await drawnMapThumbnailUrl('library/keep.map.json', 100, 1)).toBe('blob:thumb');
    expect(preview).toHaveBeenCalledTimes(1);
    await drawnMapThumbnailUrl('library/keep.map.json', 120, 2);
    expect(preview).toHaveBeenCalledTimes(2);
    expect(cache.size).toBe(2);
  });

  it('a map that cannot be drawn has none, and nothing is kept', async () => {
    const { drawnMapThumbnailUrl } = await import('./thumbs');
    preview.mockResolvedValue(null);
    expect(await drawnMapThumbnailUrl('library/broken.map.json', 10, 1)).toBeNull();
    expect(cache.size).toBe(0);
  });
});
