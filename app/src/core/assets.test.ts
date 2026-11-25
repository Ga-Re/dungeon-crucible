import { describe, expect, it } from 'vitest';
import {
  addToCollection, assetDefaults, collectionsOf, searchSuggestions, subkindsOf, commonValue, filterAssets, kindFromFile, packDefaults, parseAssetSidecar, pixelsToCells, removeCollection, renameCollection, type CatalogItem,
} from './assets';
import { ASSET_VERSION, type AssetSidecar } from './sidecar';

/** Asset library (E-27, DC-040). */
const asset = (p: Partial<AssetSidecar> = {}): AssetSidecar => ({
  kind: 'asset', schemaVersion: ASSET_VERSION, name: 'Barrel', assetKind: 'prop', tags: [], environments: [], collections: [], favorite: false, ...p,
});

describe('defaults from the file name', () => {
  it('kind from the file type; unsupported files are no assets', () => {
    expect(kindFromFile('library/oak.png')).toBe('prop');
    expect(kindFromFile('library/rock.WEBP')).toBe('prop');
    expect(kindFromFile('library/portal.webm')).toBe('effect');
    expect(kindFromFile('library/river.mp4')).toBe('effect');
    expect(kindFromFile('library/wind.ogg')).toBe('sound');
    expect(kindFromFile('library/notes.txt')).toBeNull();
  });

  it('name without size suffix and extension; size from "_2x2"', () => {
    expect(assetDefaults('library/oak_01_2x2.png')).toEqual({ name: 'oak 01', assetKind: 'prop', sizeCells: { w: 2, h: 2 } });
    expect(assetDefaults('library/Long-Table 3x1.webp')).toEqual({ name: 'Long-Table', assetKind: 'prop', sizeCells: { w: 3, h: 1 } });
    expect(assetDefaults('library/cave-wind.ogg')).toEqual({ name: 'cave-wind', assetKind: 'sound' });
  });
});

describe('reading sidecars', () => {
  it('reads an asset sidecar of version 2', () => {
    const r = parseAssetSidecar(JSON.stringify(asset({ tags: ['wood'], sizeCells: { w: 1, h: 1 } })), 'library/barrel.png');
    expect(r.ok && r.value).toMatchObject({ name: 'Barrel', assetKind: 'prop', tags: ['wood'] });
  });

  it('an audio sidecar becomes a sound asset (ambience or sound effect), tags kept', () => {
    const r = parseAssetSidecar(JSON.stringify({ kind: 'audio', schemaVersion: 1, category: 'sfx', tags: ['door'] }), 'library/door-creak.ogg');
    expect(r.ok && r.value).toEqual(asset({ name: 'door-creak', assetKind: 'sound', subkind: 'sfx', tags: ['door'] }));
  });

  it('an old asset sidecar (version 1) is migrated', () => {
    const v1 = { kind: 'asset', schemaVersion: 1, name: 'Oak', tags: ['tree'], assetType: 'nature', sizeCells: { w: 2, h: 2 }, blocksSight: true, variants: [{ id: 'v', name: 'v', file: 'oak.png' }] };
    const r = parseAssetSidecar(JSON.stringify(v1), 'library/oak.png');
    expect(r.ok && r.value).toMatchObject({ name: 'Oak', assetKind: 'prop', subkind: 'nature', tags: ['tree'], sizeCells: { w: 2, h: 2 } });
  });

  it('a map sidecar is no asset', () => {
    expect(parseAssetSidecar(JSON.stringify({ kind: 'map', schemaVersion: 3 }), 'library/crypt.png').ok).toBe(false);
  });
});

describe('the catalog', () => {
  const items: CatalogItem[] = [
    { relPath: 'library/oak.png', asset: asset({ name: 'Oak', subkind: 'nature', tags: ['tree', 'pack: Forest'], environments: ['forest'], collections: ['Crypt set'], favorite: true }) },
    { relPath: 'library/table.png', asset: asset({ name: 'Long table', subkind: 'furniture', environments: ['indoor'] }) },
    { relPath: 'library/wind.ogg', asset: asset({ name: 'Wind', assetKind: 'sound', subkind: 'ambience', collections: ['Crypt set', 'Storm'] }) },
  ];
  const names = (xs: CatalogItem[]) => xs.map((x) => x.asset.name);

  it('searches name, tags, subkind, environments and file name, in any case', () => {
    expect(names(filterAssets(items, { query: 'TREE' }))).toEqual(['Oak']);
    expect(names(filterAssets(items, { query: 'furni' }))).toEqual(['Long table']);
    expect(names(filterAssets(items, { query: 'wind.ogg' }))).toEqual(['Wind']);
    expect(names(filterAssets(items, { query: '' }))).toEqual(['Oak', 'Long table', 'Wind']);
  });

  it('filters by kind, environment, collection and favourites together', () => {
    expect(names(filterAssets(items, { kinds: ['sound'] }))).toEqual(['Wind']);
    expect(names(filterAssets(items, { environment: 'forest' }))).toEqual(['Oak']);
    expect(names(filterAssets(items, { collection: 'Crypt set', kinds: ['prop'] }))).toEqual(['Oak']);
    expect(names(filterAssets(items, { favorites: true }))).toEqual(['Oak']);
  });

  it('lists collections; adds, renames and removes them on assets', () => {
    expect(collectionsOf(items)).toEqual(['Crypt set', 'Storm']);
    const oak = items[0].asset;
    expect(addToCollection(oak, 'Storm').collections).toEqual(['Crypt set', 'Storm']);
    expect(addToCollection(oak, 'crypt SET').collections).toEqual(['Crypt set']);
    expect(renameCollection(oak, 'Crypt set', 'Vhal crypt').collections).toEqual(['Vhal crypt']);
    expect(removeCollection(oak, 'Crypt set').collections).toEqual([]);
    // The asset given is never changed.
    expect(oak.collections).toEqual(['Crypt set']);
  });

  it('a field shared by all selected assets, or "mixed"', () => {
    expect(commonValue([items[0].asset, items[1].asset], (a) => a.assetKind)).toBe('prop');
    expect(commonValue([items[0].asset, items[2].asset], (a) => a.assetKind)).toBe('mixed');
  });
});

describe('defaults from a pack (DC-040b)', () => {
  it('folders below the pack become tags, the pack a "pack:" tag; variants share a group', () => {
    const out = packDefaults('Forest Pack', ['Trees/Oak/oak_01_2x2.png', 'Trees/Oak/oak_02_2x2.png', 'Trees/Oak/acorn.png', 'rock.png', 'Sounds/wind.ogg']);
    expect(out.get('Trees/Oak/oak_01_2x2.png')).toEqual({ tags: ['Trees', 'Oak', 'pack: Forest Pack'], group: 'Forest Pack: oak' });
    expect(out.get('Trees/Oak/oak_02_2x2.png')!.group).toBe('Forest Pack: oak');
    // A single file is no variant.
    expect(out.get('Trees/Oak/acorn.png')).toEqual({ tags: ['Trees', 'Oak', 'pack: Forest Pack'] });
    expect(out.get('rock.png')).toEqual({ tags: ['pack: Forest Pack'] });
    expect(out.get('Sounds/wind.ogg')).toEqual({ tags: ['Sounds', 'pack: Forest Pack'] });
  });

  it('only numbered siblings in the same folder are variants', () => {
    const out = packDefaults('P', ['a/door-1.png', 'b/door-2.png', 'a/wall 1.png', 'a/wall 2.webp']);
    expect(out.get('a/door-1.png')!.group).toBeUndefined();
    expect(out.get('a/wall 1.png')!.group).toBe('P: wall');
    expect(out.get('a/wall 2.webp')!.group).toBe('P: wall');
  });
});

describe('outline in cells (DC-109)', () => {
  it('maps image pixels onto the footprint', () => {
    expect(pixelsToCells([[0, 0], [200, 100], [100, 200]], 200, 200, { w: 2, h: 2 })).toEqual([[0, 0], [2, 1], [1, 2]]);
  });
});

describe('subkinds in the Browser (E-31, DC-111)', () => {
  it('lists the subkinds of a kind with their numbers, by their label', () => {
    const list = [asset({ subkind: 'building' }), asset({ subkind: 'building' }), asset({ subkind: 'nature' }), asset({}), asset({ assetKind: 'tile', subkind: 'floor' })];
    expect(subkindsOf(list, 'prop')).toEqual([{ subkind: 'building', n: 2 }, { subkind: 'nature', n: 1 }]);
    expect(subkindsOf(list, 'prop', (s) => (s === 'nature' ? 'A nature' : s)).map((x) => x.subkind)).toEqual(['nature', 'building']);
  });
});

describe('search suggestions (E-31, DC-114)', () => {
  const list = [
    asset({ name: 'Simple hut', subkind: 'building', tags: ['burning', 'roof'], environments: ['village'], collections: ['Brandenburg'] }),
    asset({ name: 'Barrel', subkind: 'furniture', tags: ['Wood'] }),
  ];
  const labels = { kind: (k: string) => (k === 'prop' ? 'Prop' : k), subkind: (s: string) => ({ building: 'Gebäude', furniture: 'Möbel' })[s] ?? s, env: (e: string) => (e === 'village' ? 'Dorf' : e) };

  it('offers what starts with the text typed – tags, kinds, subkinds, environments, collections, names – by their labels', () => {
    expect(searchSuggestions(list, 'b', labels).map((s) => [s.type, s.label])).toEqual([
      ['tag', 'burning'], ['collection', 'Brandenburg'], ['name', 'Barrel'],
    ]);
    expect(searchSuggestions(list, 'ge', labels)).toEqual([{ type: 'subkind', value: 'building', label: 'Gebäude', kind: 'prop' }]);
    expect(searchSuggestions(list, 'DO', labels)).toEqual([{ type: 'environment', value: 'village', label: 'Dorf' }]);
    expect(searchSuggestions(list, '', labels)).toEqual([]);
  });

  it('the free text also finds translated kinds and subkinds and collections', () => {
    const items = list.map((a, i) => ({ relPath: `library/${i}.png`, asset: a }));
    expect(filterAssets(items, { query: 'gebäu' }, labels).map((a) => a.asset.name)).toEqual(['Simple hut']);
    expect(filterAssets(items, { query: 'brandenb' }, labels).map((a) => a.asset.name)).toEqual(['Simple hut']);
  });
});
