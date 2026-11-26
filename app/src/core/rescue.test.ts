import { describe, expect, it } from 'vitest';
import { copiesFor, dropAfterSave, dropCopy, fileHash, keepCopy, parseRescue, restoreCheck, serializeRescue, type RescueCopy } from './rescue';

const copy = (path: string, extra: Partial<RescueCopy> = {}): RescueCopy => ({ root: '/root', path, text: '{}', at: 1000, session: 's1', base: null, ...extra });

describe('rescue copies (DC-003)', () => {
  it('reads nothing from missing, broken or foreign data', () => {
    expect(parseRescue(null).copies).toEqual([]);
    expect(parseRescue('not json').copies).toEqual([]);
    expect(parseRescue(JSON.stringify({ version: 99, copies: [copy('x')] })).copies).toEqual([]);
    expect(parseRescue(JSON.stringify({ version: 2, copies: [copy('x')] })).copies).toHaveLength(1);
    expect(parseRescue(JSON.stringify({ version: 1, copies: [{ path: 1 }] })).copies).toEqual([]);
  });

  it('round-trips and keeps one copy per file and session (the newest)', () => {
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
    expect(dropCopy(store, copy('library/m.map.json')).copies).toEqual([]);
  });

  it('a failed save in a later session never replaces the copy of an earlier one', () => {
    let store = keepCopy(parseRescue(null), copy('library/m.map.json', { session: 'earlier', text: 'X' }));
    store = keepCopy(store, copy('library/m.map.json', { session: 's1', text: 'without X' }));
    store = dropAfterSave(store, '/root', 'library/m.map.json', 's1');
    expect(store.copies.map((c) => c.text)).toEqual(['X']);
  });

  it('restoring checks the file: unchanged, changed since, gone, or from a newer app version', () => {
    const file = JSON.stringify({ schemaVersion: 3, a: 1 }, null, 2);
    const mine = { text: JSON.stringify({ schemaVersion: 3, a: 2 }), base: fileHash(file) };
    expect(restoreCheck(mine, file)).toBe('ok');
    // Formatting does not count as a change.
    expect(restoreCheck(mine, JSON.stringify({ schemaVersion: 3, a: 1 }))).toBe('ok');
    expect(restoreCheck(mine, JSON.stringify({ schemaVersion: 3, a: 5 }))).toBe('changed');
    expect(restoreCheck(mine, null)).toBe('changed');
    expect(restoreCheck({ ...mine, base: null }, null)).toBe('ok');
    expect(restoreCheck({ ...mine, base: null }, file)).toBe('changed');
    expect(restoreCheck(mine, JSON.stringify({ schemaVersion: 4, a: 1 }))).toBe('newer');
  });
});
