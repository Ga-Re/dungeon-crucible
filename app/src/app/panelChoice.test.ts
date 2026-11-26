import { describe, expect, it } from 'vitest';
import { choosablePanels, DEFAULT_PANELS, offeredPanels, panelsKey, setOffered } from './panelChoice';
import { WORKSPACES, WORKSPACE_ORDER } from './workspaces';

class Memory {
  data = new Map<string, string>();
  getItem(k: string) {
    return this.data.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.data.set(k, v);
  }
  removeItem(k: string) {
    this.data.delete(k);
  }
}

/** Panels each workspace offers (DC-120, E-39). */
describe('panels per workspace', () => {
  it('each workspace offers at least the panels of its layout by default, never its canvas', () => {
    for (const ws of WORKSPACE_ORDER) {
      const l = WORKSPACES[ws].layout;
      for (const id of [...l.left, ...l.right, ...l.bottom, ...(l.floating ?? []).map((f) => f.id)]) expect(DEFAULT_PANELS[ws]).toContain(id);
      expect(DEFAULT_PANELS[ws]).not.toContain(l.center);
      expect(choosablePanels(ws)).not.toContain(l.center);
    }
  });

  it('a choice is kept per workspace and device; reset brings the default back', () => {
    const s = new Memory();
    expect(offeredPanels('forge', s)).toEqual(DEFAULT_PANELS.forge);
    setOffered('forge', 'log', false, s);
    expect(offeredPanels('forge', s)).not.toContain('log');
    expect(offeredPanels('play', s)).toContain('log');
    setOffered('forge', 'dice', true, s);
    expect(offeredPanels('forge', s)).toContain('dice');
    setOffered('forge', null, true, s);
    expect(offeredPanels('forge', s)).toEqual(DEFAULT_PANELS.forge);
  });

  it('unknown, broken or canvas entries in the setting are ignored', () => {
    const s = new Memory();
    s.setItem(panelsKey('forge'), JSON.stringify(['log', 'map', 'nonsense', 3]));
    expect(offeredPanels('forge', s)).toEqual(['log']);
    s.setItem(panelsKey('forge'), '{broken');
    expect(offeredPanels('forge', s)).toEqual(DEFAULT_PANELS.forge);
  });
});
