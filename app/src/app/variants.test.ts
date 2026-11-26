import { describe, expect, it } from 'vitest';
import { pictureOf, setPictureResolver, setSceneVariant, setWorkspace, state, undo } from './store';

/** Map variants in a scene (DC-023, E-41). */
describe('map variants', () => {
  it('a scene shows a variant: its picture once looked up (black until then), its light; undo goes back', async () => {
    setWorkspace('play');
    state.scene.map.variants = [{ id: 'night', name: 'Night', image: 'library/night.png', ambient: 'lit' }];
    state.mapDoc!.variants = state.scene.map.variants;
    let release: (u: string) => void = () => undefined;
    setPictureResolver((p) => new Promise((r) => { release = (u) => r(`${u}:${p}`); }));
    const before = state.scene.ambient;
    setSceneVariant('night');
    expect(state.scene.variant).toBe('night');
    expect(state.scene.ambient).toBe('lit');
    // Not looked up yet: nothing, never the map's own picture.
    expect(pictureOf(state.scene).url).toBeNull();
    release('dc-asset://x');
    await new Promise((r) => setTimeout(r, 0));
    expect(pictureOf(state.scene).url).toBe('dc-asset://x:library/night.png');
    undo();
    expect(state.scene.variant).toBeUndefined();
    expect(state.scene.ambient).toBe(before);
    expect(pictureOf(state.scene).url).toBe(state.scene.map.imageUrl);
  });
});
