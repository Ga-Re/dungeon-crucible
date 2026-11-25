import { describe, expect, it } from 'vitest';
import { endsAt } from '../core/walls';
import {
  flipSelectedCliffs, addWallPoint, cancelWallCommand, checkpoint, commitView, deleteSelectedWalls, endWallChain, finishWallCommand, moveWallEnds, selectWall, selectWallChain, setTool, setWallKind,
  setWorkspace, startWallCommand, state, undo, undoWallPoint, updateWallCommand,
} from './store';

/** The store starts with the sample crypt (browser mode). */
describe('"draw walls" command (DC-014)', () => {
  it('draws a chain, saves on OK as one undoable step under new ids, in the map', () => {
    setWorkspace('forge');
    const before = state.scene.walls.length;
    startWallCommand();
    expect(state.tool).toBe('wall');
    addWallPoint({ x: 0, y: 0 });
    addWallPoint({ x: 100, y: 0 });
    addWallPoint({ x: 100, y: 100 });
    expect(state.wallCommand!.walls).toHaveLength(2);
    // Not in the map before OK.
    expect(state.scene.walls).toHaveLength(before);
    expect(finishWallCommand()).toBe(true);

    const added = state.scene.walls.slice(before);
    expect(added).toMatchObject([
      { kind: 'wall', x1: 0, y1: 0, x2: 100, y2: 0 },
      { kind: 'wall', x1: 100, y1: 0, x2: 100, y2: 100 },
    ]);
    expect(new Set(added.map((w) => w.id)).size).toBe(2);
    expect(added.every((w) => /^wall-/.test(w.id))).toBe(true);
    expect(state.wallCommand).toBeNull();
    expect(state.tool).toBe('select');
    commitView();
    expect(state.mapDoc!.walls.some((w) => w.id === added[0].id)).toBe(true);

    undo();
    expect(state.scene.walls).toHaveLength(before);
    // The walls it added were selected; undo took them away, and the selection with them.
    expect(state.selectedWallIds).toEqual([]);
  });

  it('places single doors without a chain, ends a chain, takes the last piece back', () => {
    setWorkspace('forge');
    startWallCommand();
    updateWallCommand({ kind: 'door' });
    // A door does not chain by default.
    expect(state.wallCommand!.chain).toBe(false);
    addWallPoint({ x: 0, y: 0 });
    addWallPoint({ x: 50, y: 0 });
    expect(state.wallCommand!.start).toBeNull();
    updateWallCommand({ kind: 'window', chain: true });
    addWallPoint({ x: 0, y: 50 });
    addWallPoint({ x: 50, y: 50 });
    endWallChain();
    expect(state.wallCommand!.start).toBeNull();
    expect(state.wallCommand!.walls.map((w) => w.kind)).toEqual(['door', 'window']);
    undoWallPoint();
    expect(state.wallCommand!.walls).toHaveLength(1);
    // The chain goes on from the removed piece's start; a zero-length piece is not drawn.
    expect(state.wallCommand!.start).toEqual({ x: 0, y: 50 });
    addWallPoint({ x: 0, y: 50 });
    expect(state.wallCommand!.walls).toHaveLength(1);
    cancelWallCommand();
    expect(state.wallCommand).toBeNull();
  });

  it('another tool or workspace ends the command; the Orchestrator cannot start it', () => {
    setWorkspace('forge');
    startWallCommand();
    setTool('measure');
    expect(state.wallCommand).toBeNull();
    startWallCommand();
    setWorkspace('play');
    expect(state.wallCommand).toBeNull();
    startWallCommand();
    expect(state.wallCommand).toBeNull();
  });
});

describe('editing walls (DC-014)', () => {
  /** Draws an L joined at (500, y) and returns its two wall ids (each test its own y, apart from the others). */
  const drawL = (y: number): [string, string] => {
    setWorkspace('forge');
    startWallCommand();
    addWallPoint({ x: 400, y });
    addWallPoint({ x: 500, y });
    addWallPoint({ x: 500, y: y + 100 });
    finishWallCommand();
    const [a, b] = state.scene.walls.slice(-2);
    return [a.id, b.id];
  };

  it('selects a wall, its chain, and changes the kind of the selection', () => {
    const [a, b] = drawL(-1000);
    selectWall(a);
    expect(state.selectedWallIds).toEqual([a]);
    selectWall(b, true);
    expect(state.selectedWallIds).toEqual([a, b]);
    selectWall(a, true);
    expect(state.selectedWallIds).toEqual([b]);
    selectWallChain(a);
    expect([...state.selectedWallIds].sort()).toEqual([a, b].sort());
    setWallKind('window');
    expect(state.scene.walls.filter((w) => w.id === a || w.id === b).map((w) => w.kind)).toEqual(['window', 'window']);
    undo();
    expect(state.scene.walls.find((w) => w.id === a)!.kind).toBe('wall');
  });

  it('moves a joint with every wall end on it; a squashed wall disappears', () => {
    const [a, b] = drawL(-2000);
    const joint = endsAt(state.scene.walls, { x: 500, y: -2000 }, 1);
    expect(joint).toHaveLength(2);
    checkpoint();
    moveWallEnds(joint, { x: 520, y: -2020 }, false);
    moveWallEnds(joint, { x: 500, y: -1900 }, true);
    expect(state.scene.walls.find((w) => w.id === a)).toMatchObject({ x2: 500, y2: -1900 });
    // b's ends met: it is gone.
    expect(state.scene.walls.some((w) => w.id === b)).toBe(false);
    undo();
    expect(state.scene.walls.find((w) => w.id === b)).toMatchObject({ x1: 500, y1: -2000 });
  });

  it('deletes the selected walls as one step; only in the map', () => {
    const [a, b] = drawL(-3000);
    selectWallChain(a);
    const before = state.scene.walls.length;
    deleteSelectedWalls();
    expect(state.scene.walls).toHaveLength(before - 2);
    expect(state.selectedWallIds).toEqual([]);
    undo();
    expect(state.scene.walls.some((w) => w.id === b)).toBe(true);

    setWorkspace('play');
    const door = state.scene.walls.find((w) => w.kind === 'door')!;
    selectWall(door.id);
    expect(state.selectedWallIds).toEqual([]);
  });
});

describe('cliffs (DC-014, step 2)', () => {
  it('draws cliffs chained; "flip" turns the drawn and the next pieces round; OK saves them so', () => {
    setWorkspace('forge');
    const before = state.scene.walls.length;
    startWallCommand();
    updateWallCommand({ kind: 'cliff' });
    expect(state.wallCommand!.chain).toBe(true);
    addWallPoint({ x: 0, y: 4000 });
    addWallPoint({ x: 100, y: 4000 });
    updateWallCommand({ flip: true });
    addWallPoint({ x: 200, y: 4000 });
    finishWallCommand();
    // Saved reversed: the upper side (left of the direction) is now below on the map.
    expect(state.scene.walls.slice(before)).toMatchObject([
      { kind: 'cliff', x1: 100, y1: 4000, x2: 0, y2: 4000 },
      { kind: 'cliff', x1: 200, y1: 4000, x2: 100, y2: 4000 },
    ]);
  });

  it('flips the selected cliffs only, as one step', () => {
    setWorkspace('forge');
    startWallCommand();
    updateWallCommand({ kind: 'cliff' });
    addWallPoint({ x: 0, y: 5000 });
    addWallPoint({ x: 100, y: 5000 });
    updateWallCommand({ kind: 'wall' });
    addWallPoint({ x: 100, y: 5100 });
    finishWallCommand();
    const [c, w] = state.scene.walls.slice(-2);
    selectWallChain(c.id);
    flipSelectedCliffs();
    expect(state.scene.walls.find((q) => q.id === c.id)).toMatchObject({ x1: 100, x2: 0 });
    expect(state.scene.walls.find((q) => q.id === w.id)).toMatchObject({ x1: 100, y1: 5000, x2: 100, y2: 5100 });
    undo();
    expect(state.scene.walls.find((q) => q.id === c.id)).toMatchObject({ x1: 0, x2: 100 });
  });
});
