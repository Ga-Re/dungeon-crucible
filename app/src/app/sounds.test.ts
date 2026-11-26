import { describe, expect, it } from 'vitest';
import { addSound, placeHere, removeSound, selectSound, setWorkspace, soundAt, startPlacing, state, stopPlacing, undo, updateSound } from './store';

/** Sound sources in the Map Forge (E-37, DC-104a). The sample crypt has 70 px cells. */
describe('sound sources', () => {
  it('placed, selected, changed and removed – each an undoable step', () => {
    setWorkspace('forge');
    const before = state.scene.sounds.length;
    const id = addSound({ x: 700, y: 700 }, 'builtin:fire');
    expect(state.selectedSoundId).toBe(id);
    expect(state.scene.sounds.at(-1)).toMatchObject({ id, sound: 'builtin:fire', x: 700, y: 700, radiusFt: 30, fade: true });
    expect(soundAt({ x: 710, y: 690 })).toBe(id);
    expect(soundAt({ x: 900, y: 900 })).toBeNull();
    updateSound(id, { volume: 0.25 });
    expect(state.scene.sounds.find((x) => x.id === id)!.volume).toBe(0.25);
    undo();
    expect(state.scene.sounds.find((x) => x.id === id)!.volume).toBe(0.8);
    removeSound(id);
    expect(state.scene.sounds.length).toBe(before);
    expect(state.selectedSoundId).toBeNull();
    undo();
    expect(state.scene.sounds.length).toBe(before + 1);
    selectSound(null);
  });

  it('a sound from the Assets panel is placed as a sound source, snapped to the cell middle', () => {
    setWorkspace('forge');
    const before = state.scene.sounds.length;
    const assets = state.scene.map.assets.length;
    startPlacing('library/brook.ogg', 'Brook');
    placeHere({ x: 320, y: 880 });
    expect(state.scene.sounds.length).toBe(before + 1);
    expect(state.scene.map.assets.length).toBe(assets);
    expect(state.scene.sounds.at(-1)).toMatchObject({ sound: 'library/brook.ogg', x: 315, y: 875 });
    stopPlacing();
  });
});

describe('sound sources in a scene (DC-104c)', () => {
  it('switched off and on (hidden in the scene), a volume of its own, the scene\'s sound everywhere – each undoable', async () => {
    const { setSceneAmbientSound, setSoundPlaying } = await import('./store');
    setWorkspace('forge');
    const id = addSound({ x: 1400, y: 1400 }, 'builtin:brook');
    setWorkspace('play');
    expect(state.layer).not.toBe('map');
    const playing = () => state.scene.sounds.some((x) => x.id === id);
    expect(playing()).toBe(true);
    setSoundPlaying(id, false);
    expect(playing()).toBe(false);
    expect(state.scene.hidden.sounds.some((x) => x.id === id)).toBe(true);
    expect(state.selectedSoundId).toBe(id);
    expect(soundAt({ x: 1400, y: 1400 })).toBe(id);
    undo();
    expect(playing()).toBe(true);
    updateSound(id, { volume: 0.3 });
    expect(state.scene.sounds.find((x) => x.id === id)!.volume).toBe(0.3);
    setSceneAmbientSound('none');
    expect(state.scene.ambientOverride).toBe('none');
    setSceneAmbientSound({ sound: 'builtin:storm', volume: 0.7 });
    expect(state.scene.ambientOverride).toEqual({ sound: 'builtin:storm', volume: 0.7 });
    undo();
    expect(state.scene.ambientOverride).toBe('none');
    setSceneAmbientSound(null);
    expect(state.scene.ambientOverride).toBeUndefined();
  });
});
