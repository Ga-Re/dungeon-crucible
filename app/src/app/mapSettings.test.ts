import { describe, expect, it } from 'vitest';
import { applyMapSettings, commitView, currentMapSettings, openMapSettings, setWorkspace, state, undo } from './store';

/** The store starts with the sample crypt (browser mode). */
describe('map settings (DC-011)', () => {
  it('apply in the Map Forge: one undoable step, written to the map', () => {
    setWorkspace('forge');
    const before = currentMapSettings();
    const next = { ...before, name: '  Crypt of Ash  ', mapType: 'building' as const, region: ' forest ', tags: ['undead', 'crypt'], biome: 'asche' as const, ambient: 'lit' as const };
    expect(applyMapSettings(next)).toBe(true);
    commitView();
    expect(state.mapDoc).toMatchObject({ name: 'Crypt of Ash', mapType: 'building', biome: 'forest', tags: ['undead', 'crypt'], fogBiome: 'asche', ambient: 'lit' });

    undo();
    expect(currentMapSettings()).toEqual(before);
  });

  it('refuses an empty name and works only in the Map Forge', () => {
    setWorkspace('forge');
    expect(applyMapSettings({ ...currentMapSettings(), name: '   ' })).toBe(false);
    setWorkspace('play');
    expect(applyMapSettings({ ...currentMapSettings(), name: 'X' })).toBe(false);
    openMapSettings();
    expect(state.mapSettingsOpen).toBe(false);
  });
});
