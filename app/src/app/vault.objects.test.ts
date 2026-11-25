import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { DcApi, LibraryEntry } from '../platform/desktop-api';
import { state } from './store';
import { addVariant, objectOf, refreshVault, removeVariant, selectEntry, setMainVariant, shownEntries, updateSelectedAssets } from './vault';

/** Asset objects with variants in the Vault (E-31, DC-112), on a library kept in memory. */
let files: Map<string, string>;
const side = (p: string) => JSON.parse(files.get(p)!);
const sidecar = (name: string, extra: object = {}) => JSON.stringify({ kind: 'asset', schemaVersion: 3, name, assetKind: 'prop', ...extra });

beforeEach(() => {
  files = new Map([
    ['library/hut_roof.png', ''],
    ['library/hut_roof.png.dm.json', sidecar('hut roof', { group: 'Hut', subkind: 'building', tags: ['roof'] })],
    ['library/hut_inside.png', ''],
    ['library/hut_inside.png.dm.json', sidecar('hut inside', { group: 'Hut' })],
    ['library/barrel.png', ''],
    ['library/barrel.png.dm.json', sidecar('barrel')],
    ['library/barrel_2.png', ''],
    ['library/barrel_2.png.dm.json', sidecar('barrel broken', { tags: ['broken'] })],
  ]);
  const entries = (): LibraryEntry[] => [...files.keys()].filter((k) => !k.endsWith('.dm.json')).map((k) => ({ name: k.slice('library/'.length), size: 1, mtimeMs: 1, sidecar: files.get(`${k}.dm.json`) ?? null }));
  const api: Partial<DcApi> = {
    listLibrary: async () => entries(),
    readText: async (rel: string) => {
      const t = files.get(rel);
      if (t === undefined) throw new Error('missing');
      return t;
    },
    writeText: async (rel: string, content: string) => void files.set(rel, content),
    trash: async (rel: string) => void files.delete(rel),
  };
  window.dc = api as DcApi;
  state.root = { root: '/root', suggested: '/root' };
  state.vault.objects = [];
  state.vault.filter = {};
});
afterEach(() => {
  delete window.dc;
});

describe('asset objects', () => {
  it('a group from before becomes an object file; the catalog shows it once', async () => {
    await refreshVault();
    expect(files.has('library/hut.object.json')).toBe(true);
    expect(side('library/hut.object.json')).toMatchObject({ kind: 'object', name: 'Hut', main: 'hut_inside.png', variants: [{ file: 'hut_inside.png' }, { file: 'hut_roof.png' }] });
    expect(shownEntries().map((e) => [e.name, e.variants.length])).toEqual([['barrel', 1], ['barrel broken', 1], ['Hut', 2]]);
    // Read again: the object is read, not made anew.
    await refreshVault();
    expect([...files.keys()].filter((k) => k.endsWith('.object.json'))).toEqual(['library/hut.object.json']);
  });

  it('a shared field changed on the object goes to every variant; tags stay their own', async () => {
    await refreshVault();
    selectEntry(shownEntries().find((e) => e.name === 'Hut')!, 'single');
    expect(state.vault.selected.sort()).toEqual(['library/hut_inside.png', 'library/hut_roof.png']);
    await updateSelectedAssets((a) => ({ ...a, environments: ['village'] }));
    expect(side('library/hut.object.json').environments).toEqual(['village']);
    const roof = state.vault.items.find((i) => i.relPath === 'library/hut_roof.png')!;
    expect(roof.asset).toMatchObject({ environments: ['village'], tags: ['roof'] });
    // The search finds the object by a tag of one of its variants.
    state.vault.filter = { query: 'roof' };
    expect(shownEntries().map((e) => e.name)).toEqual(['Hut']);
  });

  it('adding a variant to a single asset makes an object; the main variant is chosen; taking one out dissolves it', async () => {
    await refreshVault();
    expect(await addVariant('library/barrel.png', 'library/barrel_2.png')).toBe(true);
    const o = objectOf('library/barrel.png')!;
    expect(o.relPath).toBe('library/barrel.object.json');
    expect(o.doc.variants.map((v) => v.file)).toEqual(['barrel.png', 'barrel_2.png']);
    expect(shownEntries().find((e) => e.name === 'barrel')!.variants.map((v) => v.relPath)).toEqual(['library/barrel.png', 'library/barrel_2.png']);
    await setMainVariant('library/barrel_2.png');
    expect(shownEntries().find((e) => e.name === 'barrel')!.variants[0].relPath).toBe('library/barrel_2.png');
    expect(await removeVariant('library/barrel.png')).toBe(true);
    expect(files.has('library/barrel.object.json')).toBe(false);
    expect(objectOf('library/barrel_2.png')).toBeNull();
    // No group left behind that would make the object again.
    await refreshVault();
    expect(files.has('library/barrel.object.json')).toBe(false);
  });
});
