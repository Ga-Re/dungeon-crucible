import { describe, expect, it } from 'vitest';
import { applyObjects, catalogEntries, objectFileFor, objectsFromGroups, parseAssetObject, randomChoices, rollPlacement, sharedOf } from './assetObjects';
import { ASSET_VERSION, type AssetSidecar } from './sidecar';

/** Asset objects with variants (E-31, DC-112). */
const asset = (name: string, p: Partial<AssetSidecar> = {}): AssetSidecar => ({
  kind: 'asset', schemaVersion: ASSET_VERSION, name, assetKind: 'prop', tags: [], environments: [], collections: [], favorite: false, ...p,
});
const item = (file: string, a: AssetSidecar) => ({ relPath: `library/${file}`, asset: a });

describe('the object file', () => {
  it('is read with its defaults; one without variants or of another kind is no object', () => {
    const r = parseAssetObject(JSON.stringify({ kind: 'object', schemaVersion: 1, name: 'Simple hut', assetKind: 'prop', main: 'hut_roof.png', variants: [{ file: 'hut_roof.png', name: 'Roof' }] }));
    expect(r.ok && r.value).toMatchObject({ name: 'Simple hut', environments: [], collections: [], favorite: false });
    expect(parseAssetObject(JSON.stringify({ kind: 'object', schemaVersion: 1, name: 'X', assetKind: 'prop', main: 'a.png', variants: [] })).ok).toBe(false);
    expect(parseAssetObject(JSON.stringify({ kind: 'asset', schemaVersion: 3, name: 'X', assetKind: 'prop' })).ok).toBe(false);
  });

  it('gets a free file name from its name, next to its variants (the library is flat)', () => {
    expect(objectFileFor('Simple hut', new Set())).toBe('library/simple-hut.object.json');
    expect(objectFileFor('Simple hut', new Set(['library/simple-hut.object.json']))).toBe('library/simple-hut-2.object.json');
  });
});

describe('groups become objects', () => {
  it('a group of two or more files without an object: name and shared fields from the first file', () => {
    const items = [
      item('hut_roof.png', asset('hut roof', { group: 'Hut', subkind: 'building', environments: ['village'], sizeCells: { w: 3, h: 3 }, tags: ['roof'] })),
      item('hut_inside.png', asset('hut inside', { group: 'Hut', subkind: 'furniture' })),
      item('barrel.png', asset('barrel', { group: 'Barrel' })),
      item('rock.png', asset('rock')),
    ];
    const objs = objectsFromGroups(items, []);
    expect(objs).toHaveLength(1);
    // The first file by path is the main variant and gives the shared fields.
    expect(objs[0]).toMatchObject({
      name: 'Hut', assetKind: 'prop', subkind: 'furniture', environments: [], main: 'hut_inside.png',
      variants: [{ file: 'hut_inside.png', name: 'hut inside' }, { file: 'hut_roof.png', name: 'hut roof' }],
    });
    // A group that already has an object is left alone.
    expect(objectsFromGroups(items, [{ relPath: 'library/hut.object.json', doc: objs[0] }])).toEqual([]);
  });
});

describe('the catalog', () => {
  const roof = item('hut_roof.png', asset('hut roof', { group: 'Hut', subkind: 'building', tags: ['roof'] }));
  const burnt = item('hut_burnt.png', asset('hut burnt', { group: 'Hut', tags: ['burning'] }));
  const rock = item('rock.png', asset('rock'));
  const obj = {
    relPath: 'library/hut.object.json',
    doc: { kind: 'object' as const, schemaVersion: 1 as const, name: 'Simple hut', assetKind: 'prop' as const, subkind: 'building', environments: ['village'], collections: [], favorite: true, sizeCells: { w: 3, h: 3 }, main: 'hut_roof.png', variants: [{ file: 'hut_roof.png', name: 'Roof' }, { file: 'hut_burnt.png', name: 'Burnt' }] },
  };

  it('variants take the shared fields of their object; their own tags stay', () => {
    const [r, b] = applyObjects([roof, burnt, rock], [obj]);
    expect(r.asset).toMatchObject({ subkind: 'building', environments: ['village'], favorite: true, sizeCells: { w: 3, h: 3 }, tags: ['roof'] });
    expect(b.asset).toMatchObject({ subkind: 'building', tags: ['burning'] });
    expect(sharedOf(obj.doc)).toEqual({ assetKind: 'prop', subkind: 'building', environments: ['village'], collections: [], favorite: true, sizeCells: { w: 3, h: 3 } });
  });

  it('shows an object once (its main variant first) and single assets as they are', () => {
    const entries = catalogEntries(applyObjects([roof, burnt, rock], [obj]), [obj]);
    expect(entries.map((e) => [e.key, e.name, e.variants.map((v) => v.relPath)])).toEqual([
      ['library/rock.png', 'rock', ['library/rock.png']],
      ['library/hut.object.json', 'Simple hut', ['library/hut_roof.png', 'library/hut_burnt.png']],
    ]);
  });

  it('a variant listed whose file is gone is left out; an object with none left is not shown', () => {
    const entries = catalogEntries([rock], [obj]);
    expect(entries.map((e) => e.key)).toEqual(['library/rock.png']);
  });
});

describe('a random variant (E-31, DC-115)', () => {
  const barrels = [item('barrel_a.png', asset('a')), item('barrel_b.png', asset('b')), item('barrel_c.png', asset('c'))];
  const obj = { relPath: 'library/barrel.object.json', doc: { kind: 'object' as const, schemaVersion: 1 as const, name: 'Barrel', assetKind: 'prop' as const, environments: [], collections: [], favorite: false, main: 'barrel_a.png', variants: barrels.map((b) => ({ file: b.relPath.slice(8), name: b.asset.name })) } };

  it('chooses among the variants of the object; an asset in no object is the only one', () => {
    expect(randomChoices('library/barrel_a.png', barrels, [obj])).toEqual(['library/barrel_a.png', 'library/barrel_b.png', 'library/barrel_c.png']);
    expect(randomChoices('library/rock.png', barrels, [obj])).toEqual(['library/rock.png']);
  });

  it('never the inside of a house', () => {
    const house = [item('hut_roof.png', asset('roof', { interior: { asset: 'library/hut_in.png', walls: [], trigger: { mode: 'enter', nearFt: 10, confirm: false, leaveOff: true } } })), item('hut_in.png', asset('in'))];
    const hut = { relPath: 'library/hut.object.json', doc: { ...obj.doc, name: 'Hut', main: 'hut_roof.png', variants: [{ file: 'hut_roof.png', name: 'roof' }, { file: 'hut_in.png', name: 'in' }] } };
    expect(randomChoices('library/hut_roof.png', house, [hut])).toEqual(['library/hut_roof.png']);
  });
});

describe('placing with options (E-31, DC-116)', () => {
  const choices = ['library/a.png', 'library/b.png'];
  const opts = { variant: 'random' as const, randomRotation: true, rotationStep: 90 as const, rotation: 0, randomScale: true, scaleSpread: 0.1 };

  it('rolls the variant, the turn (by its step) and the size from one random source', () => {
    const r = [0.6, 0.6, 0.5].values();
    expect(rollPlacement(opts, choices, () => r.next().value!)).toEqual({ path: 'library/b.png', rotation: 180, scale: 1 });
    const low = rollPlacement(opts, choices, () => 0);
    expect(low).toEqual({ path: 'library/a.png', rotation: 0, scale: 0.9 });
  });

  it('a chosen variant, a fixed turn and size 1 when not random; free turns are whole degrees', () => {
    expect(rollPlacement({ ...opts, variant: 'library/b.png', randomRotation: false, rotation: 45, randomScale: false }, choices, () => 0.7)).toEqual({ path: 'library/b.png', rotation: 45, scale: 1 });
    expect(rollPlacement({ ...opts, rotationStep: 'free' }, choices, () => 0.5).rotation).toBe(180);
    expect(rollPlacement({ ...opts, rotationStep: 15 }, choices, () => 0.99).rotation).toBe(345);
  });
});
