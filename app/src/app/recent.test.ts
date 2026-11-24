import { describe, expect, it } from 'vitest';
import { MAX_RECENT, RECENT_KEY, addRecent, loadRecent, removeRecent, saveRecent, type StorageLike } from './recent';

class Mem implements StorageLike {
  data = new Map<string, string>();
  getItem(k: string) {
    return this.data.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.data.set(k, v);
  }
}

const r = (root: string, openedAt = 1) => ({ root, name: root.slice(1), openedAt });

describe('recent campaigns', () => {
  it('puts the opened campaign on top, once, and keeps at most 12', () => {
    let list = [r('/a'), r('/b'), r('/c')];
    list = addRecent(list, r('/b', 9));
    expect(list.map((x) => x.root)).toEqual(['/b', '/a', '/c']);
    expect(list[0]!.openedAt).toBe(9);
    for (let i = 0; i < 20; i++) list = addRecent(list, r(`/x${i}`));
    expect(list).toHaveLength(MAX_RECENT);
    expect(list[0]!.root).toBe('/x19');
    expect(removeRecent(list, '/x19')[0]!.root).toBe('/x18');
  });

  it('stores and loads; ignores broken entries; takes over the former last campaign', () => {
    const s = new Mem();
    saveRecent(s, [r('/a'), r('/b')]);
    expect(loadRecent(s).map((x) => x.root)).toEqual(['/a', '/b']);
    s.setItem(RECENT_KEY, JSON.stringify([r('/a'), { root: 5 }, null, 'x']));
    expect(loadRecent(s)).toEqual([r('/a')]);
    s.setItem(RECENT_KEY, '{broken');
    expect(loadRecent(s)).toEqual([]);
    const legacy = new Mem();
    legacy.setItem('dc.lastCampaign', '/Users/me/Documents/Ashes');
    expect(loadRecent(legacy)).toEqual([{ root: '/Users/me/Documents/Ashes', name: 'Ashes', openedAt: 0 }]);
    expect(loadRecent(null)).toEqual([]);
  });
});
