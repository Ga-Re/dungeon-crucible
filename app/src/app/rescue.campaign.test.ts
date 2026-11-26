import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { DcApi } from '../platform/desktop-api';
import { closeCampaign, newCampaign, openCampaign, reloadCampaign, saveCampaign } from './campaign';
import { discardRescue, restoreRescue, startRunMarker } from './rescue';
import { checkpoint, moveToken, state } from './store';

/** Rescue copies and the crash notice (DC-003). Files kept in memory; a save can be made to fail. */
let files: Map<string, string>;
let failing: (rel: string) => boolean;

beforeEach(() => {
  files = new Map();
  failing = () => false;
  localStorage.clear();
  const api: Partial<DcApi> = {
    readText: async (rel: string) => {
      const t = files.get(rel);
      if (t === undefined) throw new Error('missing');
      return t;
    },
    writeText: async (rel: string, content: string) => {
      if (failing(rel)) throw new Error('cloud folder unreachable');
      files.set(rel, content);
    },
    listFiles: async (dir: string) => [...files.keys()].filter((k) => k.startsWith(`${dir}/`)),
    createCampaign: async (name: string) => name.toLowerCase(),
  };
  window.dc = new Proxy(api, { get: (t, k) => (t as Record<string | symbol, unknown>)[k] ?? (async () => []) }) as DcApi;
  state.root = { root: '/root', suggested: '/root' };
});
afterEach(async () => {
  failing = () => false;
  await closeCampaign();
  delete window.dc;
});

/** A change that cannot be saved: the scene file is unreachable. Returns the scene path and the moved x. */
async function failedSave() {
  await newCampaign('C', true);
  const scenePath = `campaigns/c/${state.scenePath!}`;
  const pc = state.scene.tokens.find((t) => t.kind === 'pc')!;
  checkpoint();
  moveToken(pc.id, { x: pc.x + 70, y: pc.y }, true);
  const x = state.scene.tokens.find((t) => t.id === pc.id)!.x;
  failing = (rel) => rel === scenePath;
  await saveCampaign(true);
  await closeCampaign();
  failing = () => false;
  // As if the app started again: the copy now comes from an earlier session.
  const raw = JSON.parse(localStorage.getItem('dc.rescueCopies')!) as { copies: { session: string }[] };
  for (const c of raw.copies) c.session = 'earlier';
  localStorage.setItem('dc.rescueCopies', JSON.stringify(raw));
  return { scenePath, pcId: pc.id, x };
}

const savedX = (scenePath: string, id: string) => (JSON.parse(files.get(scenePath)!) as { tokens: { id: string; x: number }[] }).tokens.find((t) => t.id === id)!.x;

describe('rescue copies (DC-003)', () => {
  it('a failed save keeps a copy that is offered when the campaign opens; restore writes it back', async () => {
    const { scenePath, pcId, x } = await failedSave();
    expect(savedX(scenePath, pcId)).not.toBe(x);
    await openCampaign('c');
    expect(state.rescueOffer.map((c) => c.path)).toEqual([scenePath]);
    expect(await restoreRescue(state.rescueOffer[0], reloadCampaign)).toBe(true);
    expect(savedX(scenePath, pcId)).toBe(x);
    expect(state.rescueOffer).toEqual([]);
    expect(state.scene.tokens.find((t) => t.id === pcId)!.x).toBe(x);
    // Gone for good: the next opening offers nothing.
    await openCampaign('c');
    expect(state.rescueOffer).toEqual([]);
  });

  it('discard drops the copy and leaves the file as it is', async () => {
    const { scenePath, pcId, x } = await failedSave();
    await openCampaign('c');
    discardRescue(state.rescueOffer[0]);
    expect(state.rescueOffer).toEqual([]);
    expect(savedX(scenePath, pcId)).not.toBe(x);
    await openCampaign('c');
    expect(state.rescueOffer).toEqual([]);
  });

  it('a later successful save in the same session drops the copy', async () => {
    await newCampaign('C', true);
    const scenePath = `campaigns/c/${state.scenePath!}`;
    const pc = state.scene.tokens.find((t) => t.kind === 'pc')!;
    checkpoint();
    moveToken(pc.id, { x: pc.x + 70, y: pc.y }, true);
    failing = (rel) => rel === scenePath;
    await saveCampaign(true);
    expect(localStorage.getItem('dc.rescueCopies')).toContain(scenePath);
    failing = () => false;
    checkpoint();
    moveToken(pc.id, { x: pc.x + 140, y: pc.y }, true);
    await saveCampaign(true);
    expect(JSON.parse(localStorage.getItem('dc.rescueCopies')!).copies).toEqual([]);
  });
});

describe('crash notice (DC-003)', () => {
  it('a run that did not close its window is noticed at the next start', () => {
    const handlers: (() => void)[] = [];
    const target = { addEventListener: (_: string, h: () => void) => void handlers.push(h) } as unknown as Window;
    expect(startRunMarker(target)).toBe(false);
    // Crashed: the window never closed.
    expect(startRunMarker(target)).toBe(true);
    // Closed cleanly this time.
    handlers.forEach((h) => h());
    expect(startRunMarker(target)).toBe(false);
  });
});
