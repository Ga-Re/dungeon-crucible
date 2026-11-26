import { describe, expect, it, vi } from 'vitest';

// The next picture loads only when the test says so.
let release: (() => void) | null = null;
vi.mock('./mapImages', () => ({
  loadMapImage: (url: string) => new Promise((resolve) => { release = () => resolve({ url }); }),
  createMapVideo: () => new Promise(() => undefined),
}));

const { bindMap } = await import('./mapBinding');

/**
 * Fail-closed (DC-105): while the next map loads, the one before must not stay under the new
 * scene's fog – its areas the old scene kept covered would show through.
 */
describe('changing the map', () => {
  it('removes the old picture at once and sets the new one when it has loaded', async () => {
    const calls: unknown[] = [];
    const renderer = { setMap: (img: unknown) => calls.push(img), setVideo: () => undefined, setDrawing: () => undefined, setDecals: () => undefined } as never;
    const map = bindMap(renderer, document.createElement('div'));
    const first = map.set('a.png', false);
    release!();
    await first;
    expect(calls).toEqual([null, { url: 'a.png' }]);
    const second = map.set('b.png', false);
    // Still loading: the old picture is gone already.
    expect(calls.at(-1)).toBeNull();
    release!();
    await second;
    expect(calls.at(-1)).toEqual({ url: 'b.png' });
  });
});

describe('cut and adjustment of a picture (DC-022)', async () => {
  const { cropIn, pictureFilter } = await import('./mapBinding');
  it('the cut stays inside the picture, in whole pixels', () => {
    expect(cropIn(undefined, 100, 80)).toBeNull();
    expect(cropIn({ x: -5, y: 10.4, w: 500, h: 30 }, 100, 80)).toEqual({ x: 0, y: 10, w: 100, h: 30 });
  });
  it('an adjustment becomes one filter', () => {
    expect(pictureFilter(undefined)).toBe('');
    expect(pictureFilter({ brightness: 1.2, contrast: 0.9, saturation: 1, hue: -20 })).toBe('brightness(1.2) contrast(0.9) saturate(1) hue-rotate(-20deg)');
  });
});
