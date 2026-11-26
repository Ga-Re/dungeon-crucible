import { describe, expect, it } from 'vitest';
import { copiesFor, dropAfterSave, dropCopy, keepCopy, parseRescue, serializeRescue, type RescueCopy } from './rescue';

const copy = (path: string, extra: Partial<RescueCopy> = {}): RescueCopy => ({ root: '/root', path, text: '{}', at: 1000, session: 's1', ...extra });

describe('rescue copies (DC-003)', () => {
  it('reads nothing from missing, broken or foreign data', () => {
    expect(parseRescue(null).copies).toEqual([]);
    expect(parseRescue('not json').copies).toEqual([]);
    expect(parseRescue(JSON.stringify({ version: 99, copies: [copy('x')] })).copies).toEqual([]);
    expect(parseRescue(JSON.stringify({ version: 1, copies: [{ path: 1 }] })).copies).toEqual([]);
  });

  it('round-trips and keeps one copy per file (the newest)', () => {
    let store = keepCopy(parseRescue(null), copy('campaigns/a/scenes/x.scene.json', { text: 'old' }));
    store = keepCopy(store, copy('campaigns/a/scenes/x.scene.json', { text: 'new', at: 2000 }));
    const back = parseRescue(serializeRescue(store));
    expect(back.copies).toHaveLength(1);
    expect(back.copies[0]).toMatchObject({ text: 'new', at: 2000 });
  });

  it('a later save drops only a copy of the same session', () => {
    let store = keepCopy(parseRescue(null), copy('library/m.map.json', { session: 'old' }));
    store = keepCopy(store, copy('campaigns/a/campaign.dm.json', { session: 's1' }));
    store = dropAfterSave(store, '/root', 'library/m.map.json', 's1');
    store = dropAfterSave(store, '/root', 'campaigns/a/campaign.dm.json', 's1');
    expect(store.copies.map((c) => c.path)).toEqual(['library/m.map.json']);
  });

  it("lists a campaign's copies: its own files and the library, of this root folder only", () => {
    let store = parseRescue(null);
    for (const c of [copy('campaigns/a/scenes/x.scene.json'), copy('campaigns/b/scenes/y.scene.json'), copy('library/m.map.json'), copy('library/n.map.json', { root: '/other' })]) store = keepCopy(store, c);
    expect(copiesFor(store, '/root', 'a').map((c) => c.path)).toEqual(['campaigns/a/scenes/x.scene.json', 'library/m.map.json']);
  });

  it('drops a copy (restored or discarded)', () => {
    const store = keepCopy(parseRescue(null), copy('library/m.map.json'));
    expect(dropCopy(store, '/root', 'library/m.map.json').copies).toEqual([]);
  });
});
