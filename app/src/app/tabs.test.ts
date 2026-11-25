import { describe, expect, it } from 'vitest';
import { sceneFromDocuments } from '../core/persistence';
import { activateSession, answerTvAsk, applyMapToTv, placeAsset, setAssetInfo, checkpoint, clearTabs, closeSessionTab, commitView, moveToken, produceFrame, replaceScene, setTvScene, setWorkspace, state, undo } from './store';

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

  it('the TV stays on its scene while another tab is shown, until a scene is put there; its tab closed, it is black', () => {
    setWorkspace('play');
    clearTabs();
    open('scenes/a.scene.json', 'A');
    // The first scene opened goes on the TV.
    expect(state.tvScenePath).toBe('scenes/a.scene.json');
    const pc = state.scene.tokens.find((t) => t.kind === 'pc')!;
    const from = pc.x;
    moveToken(pc.id, { x: from + 70, y: pc.y }, true);
    // The TV centred on A somewhere: A keeps that centre; the other table settings are the TV's.
    state.scene.table.centerX = 123;
    open('scenes/b.scene.json', 'B');
    expect(state.tvScenePath).toBe('scenes/a.scene.json');
    expect(produceFrame(Date.now()).center.x).toBe(123);
    expect(state.scene.table.centerX).not.toBe(123);
    // The TV shows A (in the background): its character moved, B's did not.
    const tvX = () => produceFrame(Date.now()).tokens.find((t) => t.id === pc.id)?.x;
    expect(tvX()).toBe(from + 70);
    moveToken(pc.id, { x: from - 70, y: pc.y }, true);
    expect(tvX()).toBe(from + 70);
    // A question answered with no changes nothing; the command puts B there.
    state.tvAsk = 'scenes/b.scene.json';
    answerTvAsk(false);
    expect(state.tvScenePath).toBe('scenes/a.scene.json');
    setTvScene('scenes/b.scene.json');
    expect(tvX()).toBe(from - 70);
    closeSessionTab('scenes/b.scene.json');
    expect(state.tvScenePath).toBeNull();
    expect(produceFrame(Date.now()).blackout).toBe(true);
    expect(produceFrame(Date.now()).tokens).toEqual([]);
  });

  it('a map opens on its own as a tab in the Map Forge; the Orchestrator shows a scene instead', () => {
    setWorkspace('play');
    clearTabs();
    open('scenes/a.scene.json', 'A');
    replaceScene(sceneFromDocuments(base.map, null, null, undefined, 'map'), { resource: 'library/other.png', fileName: 'library/other.png', scenePath: null, sceneName: 'Other', docs: { map: structuredClone(base.map), scene: null }, mapTab: true });
    expect(state.tabs.map((x) => [x.kind, x.name])).toEqual([['scene', 'A'], ['map', 'Other']]);
    expect(state.activeTab).toBe('map:library/other.png');
    expect(state.scenePath).toBeNull();
    activateSession('scenes/a.scene.json');
    // Back to the map: always the Map Forge.
    activateSession('map:library/other.png');
    expect(state.ws).toBe('forge');
    expect(state.layer).toBe('map');
    // The Orchestrator shows the scene on the TV instead.
    setWorkspace('play');
    expect(state.activeTab).toBe('scenes/a.scene.json');
    expect(state.layer).toBe('scene');
    // The TV never had the map.
    expect(state.tvScenePath).toBe('scenes/a.scene.json');
  });

  it('map changes to the TV scene wait for "on the TV"; its scene changes go there at once', () => {
    setWorkspace('play');
    clearTabs();
    setAssetInfo({ 'library/barrel.png': { name: 'barrel', kind: 'prop', url: 'dc-asset://file/barrel.png', video: false } });
    open('scenes/a.scene.json', 'A');
    const assets = () => produceFrame(Date.now()).assets.length;
    const before = assets();
    setWorkspace('forge');
    placeAsset('library/barrel.png', { x: 315, y: 875 });
    expect(state.tvMapPending).toBe(true);
    expect(assets()).toBe(before);
    // Back in the Orchestrator: the scene's changes reach the TV, the map's still wait.
    setWorkspace('play');
    expect(assets()).toBe(before);
    const pc = state.scene.tokens.find((t) => t.kind === 'pc')!;
    moveToken(pc.id, { x: pc.x + 70, y: pc.y }, true);
    expect(produceFrame(Date.now()).tokens.find((t) => t.id === pc.id)?.x).toBe(pc.x);
    applyMapToTv();
    expect(state.tvMapPending).toBe(false);
    expect(assets()).toBe(before + 1);
  });

  it('a map tab of the map of the TV scene: its changes wait as well', () => {
    setWorkspace('play');
    clearTabs();
    setAssetInfo({ 'library/barrel.png': { name: 'barrel', kind: 'prop', url: 'dc-asset://file/barrel.png', video: false } });
    open('scenes/a.scene.json', 'A');
    const before = produceFrame(Date.now()).assets.length;
    setWorkspace('forge');
    replaceScene(sceneFromDocuments(base.map, null, null, undefined, 'map'), { resource: base.resource, fileName: base.fileName, scenePath: null, sceneName: 'Crypt', docs: { map: structuredClone(base.map), scene: null }, mapTab: true });
    expect(state.activeTab).toBe(`map:${base.resource}`);
    placeAsset('library/barrel.png', { x: 315, y: 875 });
    expect(state.tvMapPending).toBe(true);
    expect(produceFrame(Date.now()).assets.length).toBe(before);
    applyMapToTv();
    expect(produceFrame(Date.now()).assets.length).toBe(before + 1);
  });
});
