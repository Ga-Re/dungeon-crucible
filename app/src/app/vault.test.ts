import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { DcApi, LibraryEntry } from '../platform/desktop-api';
import { refreshLibraryMaps } from './library';
import { state } from './store';
import { deleteCollectionEverywhere, importVaultAssets, refreshVault, renameCollectionEverywhere, selectAsset, toggleFavorite, updateSelectedAssets } from './vault';

/** The Asset Vault on a library kept in memory (DC-040). */
let files: Map<string, string>;
let picked: string[];

function entries(): LibraryEntry[] {
  return [...files.keys()]
    .filter((k) => k.startsWith('library/') && !k.endsWith('.dm.json'))
    .map((k) => ({ name: k.slice('library/'.length), size: 1, mtimeMs: 1, sidecar: files.get(`${k}.dm.json`) ?? null }));
}

beforeEach(() => {
  files = new Map([
    ['library/oak.png', ''],
    ['library/oak.png.dm.json', JSON.stringify({ kind: 'asset', schemaVersion: 2, name: 'Oak', assetKind: 'prop', collections: ['Forest'], plugin: { x: 1 } })],
    ['library/crypt.png', ''],
    ['library/crypt.png.dm.json', JSON.stringify({ kind: 'map', schemaVersion: 3, name: 'Crypt' })],
    ['library/plain.png', ''],
    ['library/wind.ogg', ''],
    ['library/door.ogg', ''],
    ['library/door.ogg.dm.json', JSON.stringify({ kind: 'audio', schemaVersion: 1, category: 'sfx', tags: [] })],
    ['library/broken.png', ''],
    ['library/broken.png.dm.json', '{ not json'],
  ]);
  picked = [];
  const api: Partial<DcApi> = {
    listLibrary: async () => entries(),
    listFiles: async (dir: string) => [...files.keys()].filter((k) => k.startsWith(`${dir}/`) && !k.endsWith('.dm.json')),
    readText: async (rel: string) => {
      const t = files.get(rel);
      if (t === undefined) throw new Error('missing');
      return t;
    },
    writeText: async (rel: string, content: string) => {
      files.set(rel, content);
    },
    importAssets: async () =>
      picked.map((name) => {
        files.set(`library/${name}`, '');
        return { relPath: `library/${name}`, absPath: `/root/library/${name}`, reused: false };
      }),
  };
  window.dc = api as DcApi;
  state.root = { root: '/root', suggested: '/root' };
});
afterEach(() => {
  delete window.dc;
});

const names = () => state.vault.items.map((i) => i.asset.name).sort();

describe('the Asset Vault', () => {
  it('shows assets and sounds; maps, images without a sidecar and unreadable files stay out', async () => {
    await refreshVault();
    expect(names()).toEqual(['Oak', 'door', 'wind']);
    expect(state.vault.items.find((i) => i.asset.name === 'door')!.asset).toMatchObject({ assetKind: 'sound', subkind: 'sfx' });
  });

  it('the Map Forge lists no assets as maps', async () => {
    await refreshLibraryMaps();
    expect(state.libraryMaps.map((m) => m.resource).sort()).toEqual(['library/broken.png', 'library/crypt.png', 'library/plain.png']);
  });

  it('imports files with their defaults and selects them', async () => {
    picked = ['rock_2x2.png', 'portal.webm'];
    await importVaultAssets();
    expect(JSON.parse(files.get('library/rock_2x2.png.dm.json')!)).toMatchObject({ kind: 'asset', schemaVersion: 2, name: 'rock', assetKind: 'prop', sizeCells: { w: 2, h: 2 } });
    expect(JSON.parse(files.get('library/portal.webm.dm.json')!)).toMatchObject({ assetKind: 'effect' });
    expect(state.vault.selected).toEqual(['library/rock_2x2.png', 'library/portal.webm']);
  });

  it('edits the selection in the files; unknown fields survive', async () => {
    await refreshVault();
    selectAsset('library/oak.png', 'single');
    selectAsset('library/wind.ogg', 'toggle');
    await updateSelectedAssets((a) => ({ ...a, environments: ['forest'] }));
    const oak = JSON.parse(files.get('library/oak.png.dm.json')!);
    expect(oak).toMatchObject({ environments: ['forest'], plugin: { x: 1 } });
    // The sound had no sidecar: it gets one now.
    expect(JSON.parse(files.get('library/wind.ogg.dm.json')!)).toMatchObject({ assetKind: 'sound', environments: ['forest'] });
  });

  it('stars a favourite; renames and deletes a collection everywhere', async () => {
    await refreshVault();
    await toggleFavorite('library/oak.png');
    expect(JSON.parse(files.get('library/oak.png.dm.json')!).favorite).toBe(true);
    await renameCollectionEverywhere('Forest', 'Old forest');
    expect(JSON.parse(files.get('library/oak.png.dm.json')!).collections).toEqual(['Old forest']);
    await deleteCollectionEverywhere('Old forest');
    expect(JSON.parse(files.get('library/oak.png.dm.json')!).collections).toEqual([]);
  });

  it('selects one, toggles more, and a range', async () => {
    await refreshVault();
    const order = state.vault.items.map((i) => i.relPath);
    selectAsset(order[0], 'single');
    selectAsset(order[2], 'range');
    expect(state.vault.selected).toEqual(order.slice(0, 3));
    selectAsset(order[1], 'toggle');
    expect(state.vault.selected).toEqual([order[0], order[2]]);
  });
});
