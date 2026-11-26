import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { DcApi } from '../platform/desktop-api';
import { closeCampaign, closeScene, closeTab, newCampaign, newCreature, newSceneOnMap, openCampaign, pictureOf, putOnTv, saveCampaign, showTab, switchScene } from './campaign';
import { showMapCatalog } from './library';
import { activateSession, checkpoint, moveToken, openCreatureTab, setNextTransition, setWorkspace, state } from './store';

/** Scene tabs with the campaign's files (E-30, DC-034): saving, closing, opening again. Files kept in memory. */
let files: Map<string, string>;

beforeEach(() => {
  files = new Map();
  const api: Partial<DcApi> = {
    readText: async (rel: string) => {
      const t = files.get(rel);
      if (t === undefined) throw new Error('missing');
      return t;
    },
    writeText: async (rel: string, content: string) => void files.set(rel, content),
    listFiles: async (dir: string) => [...files.keys()].filter((k) => k.startsWith(`${dir}/`)),
    createCampaign: async (name: string) => name.toLowerCase(),
  };
  // Everything else the campaign asks for (library, audio …) answers empty.
  window.dc = new Proxy(api, { get: (t, k) => (t as Record<string | symbol, unknown>)[k] ?? (async () => []) }) as DcApi;
  state.root = { root: '/root', suggested: '/root' };
});
afterEach(async () => {
  await closeCampaign();
  delete window.dc;
});

const scene = (path: string) => JSON.parse(files.get(`campaigns/c/${path}`)!) as { tokens: { id: string; x: number }[]; ambience: { path: string }[] };

describe('scene tabs and the campaign files', () => {
  it('a tab put away with changes is saved – also when it is closed in the background', async () => {
    await newCampaign('C', true);
    const a = state.scenePath!;
    await newSceneOnMap('builtin:crypt');
    const b = state.scenePath!;
    expect(state.tabs.map((t) => t.id)).toEqual([a, b]);
    // A change in B, then A shown before any save (as switching the workspace does).
    const pc = state.scene.tokens.find((t) => t.kind === 'pc')!;
    checkpoint();
    moveToken(pc.id, { x: pc.x + 70, y: pc.y }, true);
    const moved = state.scene.tokens.find((t) => t.id === pc.id)!.x;
    activateSession(a);
    expect(state.tabs.find((t) => t.id === b)!.unsaved).toBe(true);
    await closeScene(b);
    expect(scene(b).tokens.find((t) => t.id === pc.id)!.x).toBe(moved);
  });

  it('nothing is on the TV until put there; opening the campaign again brings the tabs back, the TV black', async () => {
    await newCampaign('C', true);
    const a = state.scenePath!;
    expect(state.tvScenePath).toBeNull();
    await newSceneOnMap('builtin:crypt');
    const b = state.scenePath!;
    await putOnTv(b);
    expect(state.tvScenePath).toBe(b);
    await switchScene(a);
    // B stays on the TV.
    expect(state.tvScenePath).toBe(b);
    await saveCampaign(true);
    await closeCampaign({ toStart: false });
    await openCampaign('c');
    expect(state.tabs.map((t) => t.id)).toEqual([a, b]);
    expect(state.activeTab).toBe(a);
    expect(state.tvScenePath).toBe(b);
    expect(state.scene.table.blackout).toBe(true);
    // "Scene on the TV" releases it.
    await putOnTv(b);
    expect(state.scene.table.blackout).toBe(false);
  });

  it('the TV changes scene with the new map\'s transition or the one chosen for this change (DC-105)', async () => {
    await newCampaign('C', true);
    const a = state.scenePath!;
    await putOnTv(a);
    // The first scene on the TV fades in.
    expect(state.tvCut.play).toBe('in');
    await newSceneOnMap('builtin:crypt');
    const b = state.scenePath!;
    await putOnTv(b);
    expect(state.tvCut).toMatchObject({ play: 'fade', ms: 1000 });
    setNextTransition('black');
    await putOnTv(a);
    expect(state.tvCut).toMatchObject({ play: 'black', ms: 1000 });
    // Only for that change.
    expect(state.nextTransition).toBeNull();
    const n = state.tvCut.n;
    await putOnTv(a);
    expect(state.tvCut.n).toBe(n);
  });

  it('closing the TV scene leaves the ambience of the next scene in its file', async () => {
    await newCampaign('C', true);
    const a = state.scenePath!;
    await putOnTv(a);
    await newSceneOnMap('builtin:crypt');
    const b = state.scenePath!;
    // B's own ambience (B is not on the TV: the soundboard does not touch it).
    state.sceneDoc!.ambience = [{ path: 'library/wind.ogg', volume: 0.5 }];
    checkpoint();
    await saveCampaign(true);
    expect(scene(b).ambience.map((x) => x.path)).toEqual(['library/wind.ogg']);
    await closeScene(a);
    expect(state.tvScenePath).toBeNull();
    // Now the soundboard follows B and has its ambience.
    expect(state.soundboard.ambience.some((x) => x.id === 'library/wind.ogg')).toBe(true);
  });

  it('creatures open as tabs in the Creatures workspace; the scene behind and the TV stay', async () => {
    await newCampaign('C', true);
    const a = state.scenePath!;
    await putOnTv(a);
    setWorkspace('play');
    const lyra = state.creatures.find((c) => c.role === 'pc')!;
    openCreatureTab(lyra.id);
    expect(state.ws).toBe('creatures');
    expect(state.tabs.map((t) => t.kind)).toEqual(['scene', 'creature']);
    expect(state.creatures[state.selectedCreatureIdx].id).toBe(lyra.id);
    expect(state.activeTab).toBe(a);
    expect(state.tvScenePath).toBe(a);
    // The scene's tab: back to the Orchestrator.
    await showTab(a);
    expect(state.ws).toBe('play');
    // A new creature has an id of its own and opens as a tab.
    newCreature('monster', 'Ghast');
    const ghast = state.creatures.at(-1)!;
    expect(state.creatures.filter((c) => c.id === ghast.id)).toHaveLength(1);
    expect(state.creatureTab).toBe(`creature:${ghast.id}`);
    // Kept with the campaign, back on opening.
    await saveCampaign(true);
    await closeCampaign({ toStart: false });
    await openCampaign('c');
    expect(state.tabs.map((t) => t.id)).toEqual([a, `creature:${lyra.id}`, `creature:${ghast.id}`]);
    // Closed: its neighbour is shown.
    await showTab(`creature:${ghast.id}`);
    await closeTab(`creature:${ghast.id}`);
    expect(state.tabs.map((t) => t.id)).toEqual([a, `creature:${lyra.id}`]);
    expect(state.creatureTab).toBe(`creature:${lyra.id}`);
  });

  it('closing a creature tab elsewhere than in Creatures changes nothing else', async () => {
    await newCampaign('C', true);
    const a = state.scenePath!;
    await newSceneOnMap('builtin:crypt');
    const b = state.scenePath!;
    await switchScene(a);
    openCreatureTab(state.creatures[0].id);
    const lyra = state.creatureTab!;
    await showTab(a);
    expect(state.ws).toBe('play');
    await closeTab(lyra);
    expect(state.ws).toBe('play');
    expect(state.activeTab).toBe(a);
    expect(state.tabs.map((t) => t.id)).toEqual([a, b]);
  });

  it('back from the map catalog to the tab already open: its tab, "Edit" or its scene in the list show it again (E-32)', async () => {
    await newCampaign('C', true);
    const a = state.scenePath!;
    setWorkspace('forge');
    expect(state.forgeCatalog).toBe(false);
    showMapCatalog();
    expect(state.forgeCatalog).toBe(true);
    await switchScene(a);
    expect(state.forgeCatalog).toBe(false);
    expect(state.activeTab).toBe(a);
  });

  it('a map not opened yet is opened by its picture, never by its sidecar path', () => {
    expect(pictureOf('library/plain.png.dm.json')).toBe('library/plain.png');
    expect(pictureOf('library/plain.png')).toBe('library/plain.png');
  });
});
