import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { DcApi } from '../platform/desktop-api';
import { closeCampaign, closeScene, newCampaign, newSceneOnMap, openCampaign, putOnTv, saveCampaign, switchScene } from './campaign';
import { activateSession, checkpoint, moveToken, state } from './store';

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
});
