import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { DcApi, LibraryEntry } from '../platform/desktop-api';
import { refreshLibraryMaps } from './library';
import { state } from './store';
import { backToCatalog, closeAssetTab, draftChanged, closeAssetEditor, openAssetEditor, saveAssetEditor, updateEditorDraft, closePackImport, runPackImport, startPackImport, togglePackFolder, deleteCollectionEverywhere, importVaultAssets, refreshVault, renameCollectionEverywhere, selectAsset, toggleFavorite, updateSelectedAssets } from './vault';

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
        // A file the library has already is reused (same content), not copied.
        const reused = files.has(`library/${name}`);
        files.set(`library/${name}`, '');
        return { relPath: `library/${name}`, absPath: `/root/library/${name}`, reused };
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
    expect(JSON.parse(files.get('library/rock_2x2.png.dm.json')!)).toMatchObject({ kind: 'asset', schemaVersion: 3, name: 'rock', assetKind: 'prop', sizeCells: { w: 2, h: 2 } });
    expect(JSON.parse(files.get('library/portal.webm.dm.json')!)).toMatchObject({ assetKind: 'effect' });
    expect(state.vault.selected).toEqual(['library/rock_2x2.png', 'library/portal.webm']);
  });

  it('a file the library has as a map, unreadable or without a sidecar is left alone on import', async () => {
    const before = new Map(files);
    picked = ['crypt.png', 'broken.png', 'plain.png'];
    await importVaultAssets();
    for (const f of ['library/crypt.png.dm.json', 'library/broken.png.dm.json']) expect(files.get(f)).toBe(before.get(f));
    expect(files.has('library/plain.png.dm.json')).toBe(false);
    expect(state.vault.selected).toEqual([]);
    expect(state.log[0]).toMatchObject({ key: 'log.assetsNotAssets', params: { n: 3 } });
  });

  it('renaming a collection writes only the assets in it', async () => {
    await refreshVault();
    await renameCollectionEverywhere('Forest', 'Old forest');
    // The sound without a sidecar is not in the collection: no file for it.
    expect(files.has('library/wind.ogg.dm.json')).toBe(false);
  });

  it('a change shows at once: the catalog list is a new one', async () => {
    await refreshVault();
    const list = state.vault.items;
    await toggleFavorite('library/oak.png');
    expect(state.vault.items).not.toBe(list);
    expect(state.vault.items.find((i) => i.relPath === 'library/oak.png')!.asset.favorite).toBe(true);
  });

  it('a failed write is reported, not swallowed', async () => {
    await refreshVault();
    window.dc!.writeText = async () => {
      throw new Error('disk full');
    };
    await toggleFavorite('library/oak.png');
    expect(state.log[0]).toMatchObject({ key: 'log.assetWriteFailed' });
    expect(state.vault.items.find((i) => i.relPath === 'library/oak.png')!.asset.favorite).toBe(false);
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

describe('importing audio in the soundboard', () => {
  it('never writes over a sidecar it cannot read', async () => {
    const { importAudio } = await import('./soundboard');
    files.set('library/hum.ogg', '');
    files.set('library/hum.ogg.dm.json', JSON.stringify({ kind: 'asset', schemaVersion: 99, name: 'Hum' }));
    window.dc!.importToLibrary = async () => ({ relPath: 'library/hum.ogg', absPath: '/root/library/hum.ogg', reused: true });
    window.dc!.listFiles = async () => [];
    state.campaign = { slug: 'c', name: 'C' };
    await importAudio(true);
    expect(JSON.parse(files.get('library/hum.ogg.dm.json')!)).toEqual({ kind: 'asset', schemaVersion: 99, name: 'Hum' });
    state.campaign = null;
  });
});

describe('pack import (DC-040b)', () => {
  it('chooses folders, imports them with folder tags, pack tag and variant groups, then sums up', async () => {
    const progress: ((p: { token: string; done: number; total: number; file: string }) => void)[] = [];
    let asked: string[] = [];
    window.dc!.pickPack = async () => ({
      token: 't1', name: 'Forest Pack',
      folders: [{ path: '', files: 0, bytes: 0 }, { path: 'Trees', files: 2, bytes: 2 }, { path: 'Sounds', files: 1, bytes: 1 }, { path: 'Empty', files: 0, bytes: 0 }],
    });
    window.dc!.onPackProgress = (cb) => {
      progress.push(cb);
      return () => undefined;
    };
    window.dc!.importPack = async (_token, folders) => {
      asked = folders;
      files.set('library/oak_01.png', '');
      files.set('library/oak_02.png', '');
      progress.forEach((cb) => cb({ token: 't1', done: 2, total: 2, file: 'Trees/oak_02.png' }));
      return {
        files: [
          { packPath: 'Trees/oak_01.png', relPath: 'library/oak_01.png', reused: false },
          { packPath: 'Trees/oak_02.png', relPath: 'library/oak_02.png', reused: false },
          { packPath: 'Trees/oak.png', relPath: 'library/oak.png', reused: true },
          // The same picture twice in the pack: the second is the first one, copied just now.
          { packPath: 'Trees/oak_01 copy.png', relPath: 'library/oak_01.png', reused: true },
        ],
        failed: null,
      };
    };
    await startPackImport();
    const pack = state.vault.pack!;
    expect(pack.phase).toBe('choose');
    // Folders with files are chosen; empty ones not.
    expect([...pack.chosen].sort()).toEqual(['Sounds', 'Trees']);
    togglePackFolder('Sounds');
    await runPackImport();
    expect(asked).toEqual(['Trees']);
    expect(JSON.parse(files.get('library/oak_01.png.dm.json')!)).toMatchObject({ name: 'oak 01', tags: ['Trees', 'pack: Forest Pack'], group: 'Forest Pack: oak' });
    // A file the library had is left as it is.
    expect(JSON.parse(files.get('library/oak.png.dm.json')!).tags).toBeUndefined();
    expect(state.vault.pack).toMatchObject({ phase: 'done', result: { imported: 2, reused: 2, skipped: 0, cancelled: false } });
    closePackImport();
    expect(state.vault.pack).toBeNull();
  });
});

describe('the asset editor (DC-109)', () => {
  it('edits a draft – size, cover, light – and saves it on OK; unknown fields survive', async () => {
    await refreshVault();
    openAssetEditor('library/oak.png');
    expect(state.vault.editor).toMatchObject({ relPath: 'library/oak.png', tool: 'select' });
    updateEditorDraft((a) => ({ ...a, sizeCells: { w: 2, h: 2 }, cover: { shape: 'circle', x: 1, y: 1, r: 0.5 } }));
    // Nothing is written before OK.
    expect(JSON.parse(files.get('library/oak.png.dm.json')!).cover).toBeUndefined();
    await saveAssetEditor();
    expect(JSON.parse(files.get('library/oak.png.dm.json')!)).toMatchObject({ sizeCells: { w: 2, h: 2 }, cover: { shape: 'circle', x: 1, y: 1, r: 0.5 }, plugin: { x: 1 } });
    expect(state.vault.editor).toBeNull();
  });

  it('a light source starts with a light in its middle, an effect with a loop; Cancel discards', async () => {
    files.set('library/torch.png', '');
    files.set('library/torch.png.dm.json', JSON.stringify({ kind: 'asset', schemaVersion: 2, name: 'Torch', assetKind: 'light', sizeCells: { w: 1, h: 2 } }));
    files.set('library/portal.webm', '');
    files.set('library/portal.webm.dm.json', JSON.stringify({ kind: 'asset', schemaVersion: 2, name: 'Portal', assetKind: 'effect' }));
    await refreshVault();
    openAssetEditor('library/torch.png');
    expect(state.vault.editor!.draft.light).toMatchObject({ x: 0.5, y: 1, brightFt: 20, dimFt: 40 });
    closeAssetEditor();
    expect(JSON.parse(files.get('library/torch.png.dm.json')!).light).toBeUndefined();
    openAssetEditor('library/portal.webm');
    expect(state.vault.editor!.draft.effect).toEqual({ loop: true, trigger: false });
  });
});

/** Assets as tabs (E-30, DC-034c): each keeps its editor's draft until OK or Cancel. */
describe('asset tabs', () => {
  it('open the editor as a tab in the Vault; a draft left for the catalog or another asset stays', async () => {
    await importVaultAssets();
    await refreshVault();
    state.tabs = [];
    openAssetEditor('library/oak.png');
    expect(state.ws).toBe('vault');
    expect(state.tabs.map((t) => [t.kind, t.name])).toEqual([['asset', 'Oak']]);
    updateEditorDraft((a) => ({ ...a, sizeCells: { w: 3, h: 3 } }));
    backToCatalog();
    expect(state.vault.editor).toBeNull();
    expect(state.assetTab).toBeNull();
    expect(draftChanged(state.vault.drafts['library/oak.png'])).toBe(true);
    openAssetEditor('library/wind.ogg');
    expect(state.tabs).toHaveLength(2);
    // Back to the oak: its draft as it was left; not saved yet.
    openAssetEditor('library/oak.png');
    expect(state.vault.editor!.draft.sizeCells).toEqual({ w: 3, h: 3 });
    expect(JSON.parse(files.get('library/oak.png.dm.json')!).sizeCells).toBeUndefined();
    await saveAssetEditor();
    expect(JSON.parse(files.get('library/oak.png.dm.json')!).sizeCells).toEqual({ w: 3, h: 3 });
    // Saved: the tab stays, without a draft.
    expect(state.tabs).toHaveLength(2);
    expect(state.vault.drafts['library/oak.png']).toBeUndefined();
    // Cancel drops the draft and closes the tab.
    openAssetEditor('library/wind.ogg');
    closeAssetEditor();
    expect(state.tabs.map((t) => t.id)).toEqual(['asset:library/oak.png']);
    closeAssetTab('library/oak.png');
    expect(state.tabs).toEqual([]);
  });
});
