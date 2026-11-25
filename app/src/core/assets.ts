/**
 * The asset library (E-27, DC-040): what a library file is from its name, its sidecar (also the
 * older audio sidecars, which become sound assets), and the catalog's search, filters and
 * collections. Pure: no I/O; functions return new values and never change their input.
 */
import { readDocument, type ReadResult } from './documents';
import { ASSET_VERSION, AssetSidecarSchema, type AssetKind, type AssetSidecar } from './sidecar';

const IMAGE = /\.(png|jpe?g|webp)$/i;
const VIDEO = /\.(webm|mp4)$/i;
const AUDIO = /\.(mp3|ogg|oga|opus|wav|m4a|aac|flac)$/i;

/** Built-in subkinds per kind (shown translated); the DM may type others. */
export const SUBKINDS: Record<AssetKind, readonly string[]> = {
  prop: ['furniture', 'nature', 'building', 'dungeon', 'vehicle', 'item'],
  tile: ['floor', 'wall', 'room', 'terrain'],
  texture: ['floor', 'water', 'terrain'],
  effect: ['magic', 'weather', 'fire', 'water'],
  light: ['torch', 'lamp', 'fire', 'magic'],
  sound: ['ambience', 'sfx'],
  handout: ['letter', 'map', 'picture', 'portrait'],
};

/** Built-in environments (shown translated); the DM may type others. */
export const ENVIRONMENTS = ['dungeon', 'forest', 'city', 'mountain', 'coast', 'swamp', 'desert', 'snow', 'indoor', 'underwater', 'plains'] as const;

function baseName(relPath: string): string {
  return relPath.split('/').pop() ?? relPath;
}

/** The kind a file is imported as: images are props, videos effects, audio sounds; others none. */
export function kindFromFile(relPath: string): AssetKind | null {
  const name = baseName(relPath);
  if (IMAGE.test(name)) return 'prop';
  if (VIDEO.test(name)) return 'effect';
  if (AUDIO.test(name)) return 'sound';
  return null;
}

/** A size in cells at the end of the name: "_2x2", " 3x1", "-1x2". */
const SIZE = /[ _-](\d{1,2})x(\d{1,2})$/i;

/**
 * What a newly imported file starts with: its name without extension and size suffix
 * (underscores read as spaces), its kind from the file type, its size from a "_2x2" suffix.
 */
export function assetDefaults(relPath: string): { name: string; assetKind: AssetKind; sizeCells?: { w: number; h: number } } {
  let stem = baseName(relPath).replace(/\.[^.]+$/, '');
  const m = SIZE.exec(stem);
  const size = m ? { w: Number(m[1]), h: Number(m[2]) } : null;
  if (m) stem = stem.slice(0, m.index);
  const name = stem.replace(/_/g, ' ').replace(/\s+/g, ' ').trim() || baseName(relPath);
  return { name, assetKind: kindFromFile(relPath) ?? 'prop', ...(size && size.w > 0 && size.h > 0 ? { sizeCells: size } : {}) };
}

/**
 * Reads a library file's sidecar as an asset. An audio sidecar (before E-27) becomes a sound asset
 * with its category as subkind; the first asset format is migrated. A map sidecar is no asset.
 */
export function parseAssetSidecar(json: string, relPath: string): ReadResult<AssetSidecar> {
  let text = json;
  try {
    const raw = JSON.parse(json) as Record<string, unknown>;
    if (raw && raw['kind'] === 'audio') {
      const category = raw['category'] === 'sfx' ? 'sfx' : 'ambience';
      const { kind: _k, schemaVersion: _v, category: _c, ...rest } = raw;
      text = JSON.stringify({ ...rest, kind: 'asset', schemaVersion: ASSET_VERSION, name: assetDefaults(relPath).name, assetKind: 'sound', subkind: category });
    }
  } catch {
    /* readDocument reports it */
  }
  return readDocument('asset', AssetSidecarSchema, text);
}

/** A file of the catalog with its asset data. */
export interface CatalogItem {
  relPath: string;
  asset: AssetSidecar;
}

export interface CatalogFilter {
  query?: string;
  kinds?: readonly AssetKind[];
  subkind?: string;
  environment?: string;
  tag?: string;
  collection?: string;
  favorites?: boolean;
}

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

/** The items matching every filter given; the query looks at name, tags, subkind, environments and file name. */
export function filterAssets(items: readonly CatalogItem[], f: CatalogFilter): CatalogItem[] {
  const q = (f.query ?? '').trim().toLowerCase();
  return items.filter(({ relPath, asset: a }) => {
    if (f.kinds && f.kinds.length > 0 && !f.kinds.includes(a.assetKind)) return false;
    if (f.subkind && !(a.subkind && same(a.subkind, f.subkind))) return false;
    if (f.environment && !a.environments.some((e) => same(e, f.environment!))) return false;
    if (f.tag && !a.tags.some((t) => same(t, f.tag!))) return false;
    if (f.collection && !a.collections.some((c) => same(c, f.collection!))) return false;
    if (f.favorites && !a.favorite) return false;
    if (!q) return true;
    return [a.name, a.subkind ?? '', ...a.tags, ...a.environments, baseName(relPath)].some((v) => v.toLowerCase().includes(q));
  });
}

/** The subkinds the assets of `kind` use, each with how many have it (E-31, DC-111); in the order of `label`. */
export function subkindsOf(assets: readonly AssetSidecar[], kind: AssetKind, label: (s: string) => string = (s) => s): { subkind: string; n: number }[] {
  const counts = new Map<string, number>();
  for (const a of assets) if (a.assetKind === kind && a.subkind) counts.set(a.subkind, (counts.get(a.subkind) ?? 0) + 1);
  return [...counts].map(([subkind, n]) => ({ subkind, n })).sort((a, b) => label(a.subkind).localeCompare(label(b.subkind)));
}

/** Every collection the items use, sorted, one spelling each. */
export function collectionsOf(items: readonly CatalogItem[]): string[] {
  const seen = new Map<string, string>();
  for (const { asset } of items) for (const c of asset.collections) if (!seen.has(c.toLowerCase())) seen.set(c.toLowerCase(), c);
  return [...seen.values()].sort((a, b) => a.localeCompare(b));
}

export function addToCollection(a: AssetSidecar, name: string): AssetSidecar {
  const n = name.trim();
  if (!n || a.collections.some((c) => same(c, n))) return a;
  return { ...a, collections: [...a.collections, n] };
}

export function removeCollection(a: AssetSidecar, name: string): AssetSidecar {
  return { ...a, collections: a.collections.filter((c) => !same(c, name)) };
}

export function renameCollection(a: AssetSidecar, from: string, to: string): AssetSidecar {
  if (!a.collections.some((c) => same(c, from))) return a;
  return addToCollection(removeCollection(a, from), to);
}

/** A value all `assets` share (e.g. their kind), or "mixed" (multi-selection in the Properties panel). */
export function commonValue<T>(assets: readonly AssetSidecar[], pick: (a: AssetSidecar) => T): T | 'mixed' {
  const values = assets.map(pick);
  const first = JSON.stringify(values[0]);
  return values.every((v) => JSON.stringify(v) === first) ? values[0] : 'mixed';
}

/** A number at the end of a name (after the size suffix is gone): "oak_01", "wall 2", "door-3". */
const VARIANT = /^(.*?)[ _-]?(\d{1,3})$/;

/**
 * What a pack import adds to each file's defaults (E-27, DC-040b), by its path inside the pack:
 * the folders below the pack as tags plus "pack: <name>", and – for numbered siblings in the same
 * folder (oak_01, oak_02 …) – a group "<pack>: <base name>", so packs never mix their variants.
 */
export function packDefaults(pack: string, paths: readonly string[]): Map<string, { tags: string[]; group?: string }> {
  const variantOf = (p: string) => {
    const parts = p.split('/');
    const stem = assetDefaults(parts.pop()!).name.replace(/ /g, '_');
    const m = VARIANT.exec(stem);
    return m && m[1] ? { folder: parts.join('/'), base: m[1].replace(/_/g, ' ').trim() } : null;
  };
  const siblings = new Map<string, number>();
  for (const p of paths) {
    const v = variantOf(p);
    if (v) siblings.set(`${v.folder}\n${v.base}`, (siblings.get(`${v.folder}\n${v.base}`) ?? 0) + 1);
  }
  const out = new Map<string, { tags: string[]; group?: string }>();
  for (const p of paths) {
    const folders = p.split('/').slice(0, -1).filter(Boolean);
    const v = variantOf(p);
    const group = v && (siblings.get(`${v.folder}\n${v.base}`) ?? 0) > 1 ? `${pack}: ${v.base}` : undefined;
    out.set(p, { tags: [...folders, `pack: ${pack}`], ...(group ? { group } : {}) });
  }
  return out;
}

/** Image pixels → cells of the asset's footprint (the image fills its footprint). */
export function pixelsToCells(points: readonly [number, number][], imgW: number, imgH: number, size: { w: number; h: number }): [number, number][] {
  const round = (v: number) => Math.round(v * 1000) / 1000;
  return points.map(([x, y]) => [round((x / imgW) * size.w), round((y / imgH) * size.h)]);
}
