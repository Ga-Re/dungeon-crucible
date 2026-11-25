import { describe, expect, it } from 'vitest';
import { loadOpenTabs, saveOpenTabs } from './openTabs';

/** The open tabs of a campaign, kept on this device (E-30, DC-034 step 4). */
function memory() {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), m };
}

describe('open tabs', () => {
  it('are kept per campaign and read back', () => {
    const s = memory();
    const tabs = { tabs: [{ id: 'scenes/a.scene.json', kind: 'scene' as const, name: 'A' }, { id: 'map:library/b.png', kind: 'map' as const, name: 'B' }], active: 'map:library/b.png', tv: 'scenes/a.scene.json' };
    saveOpenTabs(s, '/root/campaigns/one', tabs);
    expect(loadOpenTabs(s, '/root/campaigns/one')).toEqual(tabs);
    expect(loadOpenTabs(s, '/root/campaigns/two')).toBeNull();
  });

  it('skip what they cannot read: broken entries, unknown kinds; nothing usable is none', () => {
    const s = memory();
    s.setItem('dc.openTabs:/c', JSON.stringify({ tabs: [{ id: 'scenes/a.scene.json', kind: 'scene', name: 'A' }, { id: 7 }, { id: 'x', kind: 'note', name: 'N' }], active: 5, tv: 'scenes/a.scene.json' }));
    expect(loadOpenTabs(s, '/c')).toEqual({ tabs: [{ id: 'scenes/a.scene.json', kind: 'scene', name: 'A' }], active: null, tv: 'scenes/a.scene.json' });
    s.setItem('dc.openTabs:/d', '{not json');
    expect(loadOpenTabs(s, '/d')).toBeNull();
    // A storage that throws (blocked) reads nothing and writes nothing, without failing.
    const blocked = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } };
    expect(loadOpenTabs(blocked, '/c')).toBeNull();
    expect(() => saveOpenTabs(blocked, '/c', { tabs: [], active: null, tv: null })).not.toThrow();
  });
});
