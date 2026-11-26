import { describe, expect, it } from 'vitest';
import { addStair, addStorey, answerStairAsk, moveToken, setWorkingStorey, setWorkspace, state, updateStair } from './store';

/** Stairs (DC-026, E-44). The sample crypt has 70 px cells. */
describe('stairs', () => {
  it('need a second storey; then lead from the storey worked on to the one above', () => {
    setWorkspace('forge');
    setWorkingStorey('');
    const none = state.scene.map.storeys?.length ? null : addStair({ x: 0, y: 0, w: 70, h: 70 });
    expect(none).toBeNull();
    addStorey('Gallery', true);
    const gallery = state.scene.map.storey!;
    setWorkingStorey('');
    const id = addStair({ x: 1400, y: 1400, w: 70, h: 140 })!;
    const s = state.scene.map.stairs!.find((x) => x.id === id)!;
    expect(s).toMatchObject({ to: gallery, dir: 'n' });
    expect(s.from).toBeUndefined();
    updateStair(id, { dir: 'e' });
    expect(state.scene.map.stairs!.find((x) => x.id === id)!.dir).toBe('e');
  });

  it('a figure set down on stairs asks; yes puts it on the other storey, no leaves it', () => {
    setWorkspace('play');
    setWorkingStorey('');
    const stair = state.scene.map.stairs!.at(-1)!;
    const [a, b] = state.scene.tokens;
    moveToken(a.id, { x: stair.x + 35, y: stair.y + 35 }, true);
    expect(state.stairAsks.map((x) => x.tokenId)).toEqual([a.id]);
    answerStairAsk(a.id, false);
    expect(state.scene.tokens.some((t) => t.id === a.id)).toBe(true);
    moveToken(b.id, { x: stair.x + 35, y: stair.y + 105 }, true);
    answerStairAsk(b.id, true);
    expect(state.scene.tokens.some((t) => t.id === b.id)).toBe(false);
    expect(state.scene.offStoreyTokens!.find((t) => t.id === b.id)!.storey).toBe(stair.to);
    expect(state.stairAsks).toEqual([]);
  });
});
