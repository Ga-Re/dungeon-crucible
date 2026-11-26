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
