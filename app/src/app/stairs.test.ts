import { describe, expect, it } from 'vitest';
import { addStair, addStorey, answerStairAsk, deleteStorey, moveToken, setWorkingStorey, setWorkspace, state, undo, updateStair } from './store';

/** A storey above the map and stairs up to it, drawn in the Map Forge; returns their ids. */
function stairsUp(name: string, at: number): { storey: string; stair: string } {
  setWorkspace('forge');
  setWorkingStorey('');
  addStorey(name, true);
  const storey = state.scene.map.storey!;
  setWorkingStorey('');
  const stair = addStair({ x: at, y: 1400, w: 70, h: 140 })!;
  // Earlier tests made storeys too: these stairs lead to this one.
  updateStair(stair, { to: storey });
  return { storey, stair };
}

/** Stairs (DC-026, E-44). The sample crypt has 70 px cells. */
describe('stairs', () => {
  it('need a second storey; then lead from the storey worked on to the nearest above', () => {
    setWorkspace('forge');
    if (!state.scene.map.storeys?.length) expect(addStair({ x: 0, y: 0, w: 70, h: 70 })).toBeNull();
    const { storey, stair } = stairsUp('Gallery', 1400);
    const s = state.scene.map.stairs!.find((x) => x.id === stair)!;
    expect(s).toMatchObject({ to: storey, dir: 'n' });
    expect(s.from).toBeUndefined();
  });

  it('a figure set down on stairs asks; yes puts it on the other storey in one undoable step, no leaves it', () => {
    const { stair } = stairsUp('Loft', 1540);
    setWorkspace('play');
    setWorkingStorey('');
    const s = state.scene.map.stairs!.find((x) => x.id === stair)!;
    const [a, b] = state.scene.tokens;
    moveToken(a.id, { x: s.x + 35, y: s.y + 35 }, true);
    expect(state.stairAsks.map((x) => x.tokenId)).toEqual([a.id]);
    answerStairAsk(a.id, false);
    expect(state.scene.tokens.some((t) => t.id === a.id)).toBe(true);
    moveToken(b.id, { x: s.x + 35, y: s.y + 105 }, true);
    answerStairAsk(b.id, true);
    expect(state.scene.offStoreyTokens!.find((t) => t.id === b.id)!.storey).toBe(s.to);
    undo();
    expect(state.scene.tokens.some((t) => t.id === b.id)).toBe(true);
  });

  it('a question gone stale does nothing: the step undone, or the figure moved off', () => {
    const { stair } = stairsUp('Tower', 1680);
    setWorkspace('play');
    setWorkingStorey('');
    const s = state.scene.map.stairs!.find((x) => x.id === stair)!;
    const t = state.scene.tokens[0];
    moveToken(t.id, { x: s.x + 35, y: s.y + 35 }, true);
    moveToken(t.id, { x: s.x - 300, y: s.y }, true);
    expect(state.stairAsks).toEqual([]);
    moveToken(t.id, { x: s.x + 35, y: s.y + 35 }, true);
    state.scene.tokens = state.scene.tokens.filter((x) => x.id !== t.id);
    answerStairAsk(t.id, true);
    expect(state.scene.offStoreyTokens?.some((x) => x.id === t.id) ?? false).toBe(false);
  });

  it('changed from its upper end it still runs from the lower; deleting a storey takes its stairs', () => {
    const { storey, stair } = stairsUp('Attic', 1820);
    setWorkingStorey(storey);
    // Seen from the attic it leads down to the map itself: unchanged, "from" stays the lower end.
    updateStair(stair, { from: '' });
    expect(state.scene.map.stairs!.find((x) => x.id === stair)).toMatchObject({ to: storey });
    deleteStorey(storey);
    expect(state.scene.map.stairs!.some((x) => x.id === stair)).toBe(false);
  });
});
