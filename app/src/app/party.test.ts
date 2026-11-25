import { describe, expect, it } from 'vitest';
import { addPlayer, placeParty, removePlayer, setWorkspace, state, undo, updatePlayer } from './store';

/** The store starts with the sample crypt (browser mode): Thorin and Lyra stand in the scene. */
describe('party in the app (DC-096)', () => {
  it('place party adds the present characters the scene lacks, undoably; absent players are left out', () => {
    setWorkspace('play');
    state.scene.tokens = state.scene.tokens.filter((t) => t.creatureId !== 'lyra-moonfeather');
    const before = state.scene.tokens.length;

    const anna = addPlayer('Anna');
    updatePlayer(anna, { characterId: 'thorin-ironbeard' });
    const ben = addPlayer('Ben');
    updatePlayer(ben, { characterId: 'lyra-moonfeather', present: false });
    placeParty();
    expect(state.scene.tokens.length).toBe(before);

    updatePlayer(ben, { present: true });
    placeParty();
    expect(state.scene.tokens.length).toBe(before + 1);
    expect(state.scene.tokens.at(-1)).toMatchObject({ creatureId: 'lyra-moonfeather', kind: 'pc', name: 'Lyra Moonfeather' });
    undo();
    expect(state.scene.tokens.length).toBe(before);

    // Clearing the link removes the field (no `characterId: undefined` in the file).
    updatePlayer(ben, { characterId: undefined });
    expect('characterId' in state.players.find((p) => p.id === ben)!).toBe(false);
    removePlayer(anna);
    removePlayer(ben);
    expect(state.players).toEqual([]);
  });

  it('the Map Forge places no tokens', () => {
    const p = addPlayer('Cem');
    updatePlayer(p, { characterId: 'ash-wight' });
    setWorkspace('forge');
    const n = state.scene.tokens.length;
    placeParty();
    expect(state.scene.tokens.length).toBe(n);
    setWorkspace('play');
    removePlayer(p);
  });
});
