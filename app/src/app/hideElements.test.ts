import { describe, expect, it } from 'vitest';
import { cleanUpOrphans, commitView, currentChanges, resetToMap, setWorkspace, state, toggleHidden, undo } from './store';
import { sceneIssues } from '../core/persistence';

/** The store starts with the sample crypt as a map and a scene on it (browser mode). */
describe('hiding map elements in a scene (DC-103)', () => {
  it('hides and shows a wall in the play state, undoably; the map keeps it', () => {
    setWorkspace('play');
    const wall = state.scene.walls.find((w) => w.kind === 'wall')!;
    toggleHidden(wall.id);
    expect(state.scene.walls.some((w) => w.id === wall.id)).toBe(false);
    expect(state.scene.hidden.walls.map((w) => w.id)).toEqual([wall.id]);
    expect(currentChanges()).toContainEqual({ id: wall.id, kind: 'walls', status: 'hidden' });
    commitView();
    expect(state.sceneDoc!.hidden).toEqual([wall.id]);
    expect(state.mapDoc!.walls.some((w) => w.id === wall.id)).toBe(true);

    undo();
    expect(state.scene.walls.some((w) => w.id === wall.id)).toBe(true);
    expect(state.scene.hidden.walls).toEqual([]);
  });

  it('the Map Forge cannot hide anything', () => {
    setWorkspace('forge');
    const wall = state.scene.walls[0];
    toggleHidden(wall.id);
    expect(state.scene.hidden.walls).toEqual([]);
    setWorkspace('play');
  });

  it('"reset to map" undoes a changed element', () => {
    setWorkspace('play');
    const light = state.scene.lights[0];
    const dim = light.dimFt;
    light.dimFt = dim + 30;
    expect(currentChanges()).toContainEqual({ id: light.id, kind: 'lights', status: 'changed' });
    resetToMap(light.id);
    expect(state.scene.lights.find((l) => l.id === light.id)!.dimFt).toBe(dim);
    expect(currentChanges().some((c) => c.id === light.id)).toBe(false);
  });

  it('cleans up orphaned changes as one undoable step', () => {
    setWorkspace('play');
    commitView();
    state.sceneDoc = { ...state.sceneDoc!, overrides: { ...state.sceneDoc!.overrides, gone: { dimFt: 5 } }, hidden: [...state.sceneDoc!.hidden, 'lost'] };
    expect(sceneIssues(state.mapDoc!, state.sceneDoc).orphaned).toEqual(['gone', 'lost']);
    cleanUpOrphans();
    expect(sceneIssues(state.mapDoc!, state.sceneDoc).orphaned).toEqual([]);
    undo();
    expect(sceneIssues(state.mapDoc!, state.sceneDoc).orphaned).toEqual(['gone', 'lost']);
  });
});

describe('undo while editing the start state', () => {
  it('hides for the start; undo keeps the play state and its ambience', async () => {
    const { setEditStart } = await import('./campaign');
    setWorkspace('play');
    await setEditStart(true);
    // The play state's ambience (not playing while the start is edited).
    state.sceneDoc = { ...state.sceneDoc!, ambience: [{ path: 'library/rain.ogg', volume: 0.5 }] };
    const door = state.scene.walls.find((w) => w.kind === 'door')!;
    toggleHidden(door.id);
    commitView();
    expect(state.sceneDoc!.start!.hidden).toContain(door.id);
    expect(state.sceneDoc!.hidden).not.toContain(door.id);
    undo();
    expect(state.sceneDoc!.start!.hidden).not.toContain(door.id);
    expect(state.sceneDoc!.ambience).toEqual([{ path: 'library/rain.ogg', volume: 0.5 }]);
    await setEditStart(false);
  });
});
