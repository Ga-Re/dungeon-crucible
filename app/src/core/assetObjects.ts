/**
 * Asset objects with variants (E-31, DC-112): an object file bundles library files as variants of
 * one thing (a hut: roof, inside, burnt …) and holds what they share. Variants take the object's
 * shared fields; the catalog shows an object once. Groups of files from before (E-27) become
 * objects. Pure: no I/O.
 */
import { readDocument, slugId, type ReadResult } from './documents';
import { AssetObjectSchema, OBJECT_VERSION, type AssetObject, type AssetSidecar } from './sidecar';

export interface ObjectFile {
  /** The object file, e.g. `library/simple-hut.object.json`. */
  relPath: string;
  doc: AssetObject;
}

interface Item {
  relPath: string;
  asset: AssetSidecar;
}

/** The fields an object's variants share (E-31). */
export type SharedFields = Pick<AssetObject, 'assetKind' | 'subkind' | 'environments' | 'sizeCells' | 'collections' | 'favorite'>;

export function parseAssetObject(json: string): ReadResult<AssetObject> {
  return readDocument('object', AssetObjectSchema, json);
}

export function sharedOf(o: SharedFields): SharedFields {
  return {
    assetKind: o.assetKind,
    ...(o.subkind ? { subkind: o.subkind } : {}),
    environments: [...o.environments],
    collections: [...o.collections],
    favorite: o.favorite,
    ...(o.sizeCells ? { sizeCells: { ...o.sizeCells } } : {}),
  };
}

const fileOf = (relPath: string) => relPath.replace(/^library\//, '');

/** A free object file for `name` in the (flat) library. */
export function objectFileFor(name: string, taken: ReadonlySet<string>): string {
  const base = slugId(name, 'object');
  let p = `library/${base}.object.json`;
  for (let i = 2; taken.has(p); i++) p = `library/${base}-${i}.object.json`;
  return p;
}

/**
 * Objects for groups of two or more files that no object covers yet: named after the group, the
 * first file (by path) the main variant and the giver of the shared fields; variants named after
 * their assets.
 */
export function objectsFromGroups(items: readonly Item[], objects: readonly ObjectFile[]): AssetObject[] {
  const covered = new Set(objects.flatMap((o) => o.doc.variants.map((v) => `library/${v.file}`)));
  const groups = new Map<string, Item[]>();
  for (const it of items) {
    const g = it.asset.group;
    if (!g || covered.has(it.relPath)) continue;
    groups.set(g, [...(groups.get(g) ?? []), it]);
  }
  const out: AssetObject[] = [];
  for (const [name, members] of groups) {
    if (members.length < 2) continue;
    const sorted = [...members].sort((a, b) => a.relPath.localeCompare(b.relPath));
    const first = sorted[0].asset;
    out.push({
      kind: 'object', schemaVersion: OBJECT_VERSION, name,
      ...sharedOf(first),
      main: fileOf(sorted[0].relPath),
      variants: sorted.map((m) => ({ file: fileOf(m.relPath), name: m.asset.name })),
    });
  }
  return out;
}

/** The items with their objects' shared fields (and the object's name as their group). */
export function applyObjects<T extends Item>(items: readonly T[], objects: readonly ObjectFile[]): T[] {
  const of = new Map<string, AssetObject>();
  for (const o of objects) for (const v of o.doc.variants) of.set(`library/${v.file}`, o.doc);
  return items.map((it) => {
    const o = of.get(it.relPath);
    return o ? { ...it, asset: { ...it.asset, ...sharedOf(o), ...(o.subkind ? {} : { subkind: undefined }), ...(o.sizeCells ? {} : { sizeCells: undefined }), group: o.name } } : it;
  });
}

/** One entry of the catalog: an object with its variants (main first), or a single asset. */
export interface CatalogEntry<T extends Item> {
  /** The object file, or the single asset's file. */
  key: string;
  name: string;
  object: ObjectFile | null;
  variants: T[];
}

/** The catalog: each object once (with the variants whose files exist), each other asset by itself; by name. */
export function catalogEntries<T extends Item>(items: readonly T[], objects: readonly ObjectFile[]): CatalogEntry<T>[] {
  const byPath = new Map(items.map((i) => [i.relPath, i]));
  const inObject = new Set<string>();
  const out: CatalogEntry<T>[] = [];
  for (const o of objects) {
    const variants = o.doc.variants.map((v) => byPath.get(`library/${v.file}`)).filter((v): v is T => !!v);
    for (const v of variants) inObject.add(v.relPath);
    if (!variants.length) continue;
    const main = variants.findIndex((v) => v.relPath === `library/${o.doc.main}`);
    if (main > 0) variants.unshift(...variants.splice(main, 1));
    out.push({ key: o.relPath, name: o.doc.name, object: o, variants });
  }
  for (const it of items) if (!inObject.has(it.relPath)) out.push({ key: it.relPath, name: it.asset.name, object: null, variants: [it] });
  return out.sort((a, b) => a.name.localeCompare(b.name) || a.key.localeCompare(b.key));
}

/**
 * A random variant of the object `relPath` belongs to (E-31, DC-115), from its variants that are
 * no house's inside; an asset in no object is itself. `random` gives 0 ≤ x < 1.
 */
export function randomVariant(relPath: string, items: readonly Item[], objects: readonly ObjectFile[], random: () => number): string {
  const o = objects.find((x) => x.doc.variants.some((v) => `library/${v.file}` === relPath));
  if (!o) return relPath;
  const paths = o.doc.variants.map((v) => `library/${v.file}`);
  const mine = items.filter((i) => paths.includes(i.relPath));
  const insides = new Set(mine.flatMap((i) => (i.asset.interior ? [i.asset.interior.asset] : [])));
  const choice = mine.map((i) => i.relPath).filter((p) => !insides.has(p));
  if (!choice.length) return relPath;
  return choice[Math.min(choice.length - 1, Math.floor(random() * choice.length))];
}
