import { describe, expect, it } from 'vitest';
import { activateSession, checkpoint, clearTabs, closeSessionTab, commitView, moveToken, replaceScene, setWorkspace, state, undo } from './store';

/** Scenes as tabs (E-30, DC-034 step 1): each keeps its state and undo history while another is shown. */
describe('scene tabs', () => {
  // Every scene starts from the same files (taken once, before any test changes them).
  setWorkspace('play');
  commitView();
  const base = { map: structuredClone(state.mapDoc!), doc: structuredClone(state.sceneDoc!), scene: structuredClone(state.scene), resource: state.mapResource, fileName: state.mapFileName };
  const open = (path: string, name: string) => {
    replaceScene(structuredClone(base.scene), { resource: base.resource, fileName: base.fileName, scenePath: path, sceneName: name, docs: { map: structuredClone(base.map), scene: { ...structuredClone(base.doc), name } } });
  };

  it('opens scenes as tabs; switching keeps each scene with its changes and its own undo', () => {
    setWorkspace('play');
    clearTabs();
    open('scenes/a.scene.json', 'A');
    const pc = state.scene.tokens.find((t) => t.kind === 'pc')!;
    const from = { x: pc.x, y: pc.y };
    checkpoint();
    moveToken(pc.id, { x: from.x + 70, y: from.y }, true);
    open('scenes/b.scene.json', 'B');
    expect(state.tabs.map((x) => x.name)).toEqual(['A', 'B']);
    expect(state.scenePath).toBe('scenes/b.scene.json');
    expect(state.canUndo).toBe(false);
    // B is its own scene: the move in A is not in it.
    expect(state.scene.tokens.find((t) => t.id === pc.id)!.x).toBe(from.x);

    expect(activateSession('scenes/a.scene.json')).toBe(true);
    expect(state.sceneName).toBe('A');
    expect(state.scene.tokens.find((t) => t.id === pc.id)!.x).toBe(from.x + 70);
    expect(state.canUndo).toBe(true);
    undo();
    expect(state.scene.tokens.find((t) => t.id === pc.id)!.x).toBe(from.x);
  });

  it('closing the tab shown shows its neighbour; closing the last shows no scene', () => {
    setWorkspace('play');
    clearTabs();
    open('scenes/a.scene.json', 'A');
    open('scenes/b.scene.json', 'B');
    open('scenes/c.scene.json', 'C');
    activateSession('scenes/b.scene.json');
    // A tab in the background closes without changing what is shown.
    closeSessionTab('scenes/c.scene.json');
    expect(state.tabs.map((x) => x.name)).toEqual(['A', 'B']);
    expect(state.sceneName).toBe('B');
    closeSessionTab('scenes/b.scene.json');
    expect(state.sceneName).toBe('A');
    closeSessionTab('scenes/a.scene.json');
    expect(state.tabs).toEqual([]);
    expect(state.scenePath).toBeNull();
    expect(state.mapDoc).toBeNull();
  });

  it('a tab opened in the Map Forge shows the map; switching keeps the workspace', () => {
    setWorkspace('play');
    clearTabs();
    open('scenes/a.scene.json', 'A');
    open('scenes/b.scene.json', 'B');
    setWorkspace('forge');
    activateSession('scenes/a.scene.json');
    expect(state.layer).toBe('map');
    expect(state.ws).toBe('forge');
  });
});
