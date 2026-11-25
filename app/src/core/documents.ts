/**
 * File rules for every JSON document (campaign, map sidecar, scene, creature, …):
 *
 * - `schemaVersion`: a document from a newer app version is refused (read, but never written
 *   back, so its data survives); older ones are migrated step by step before validation.
 * - Unknown fields survive a round trip: the app validates with strict schemas (which drop them)
 *   and, when writing, merges the new content into what was read (`keepUnknown`). Lists of
 *   elements with an `id` (walls, areas, tokens …) are matched by id, so their unknown fields
 *   survive too.
 * - Ids are lowercase (`a–z`, digits, `-`, `_`): they appear in file names, and macOS and Windows
 *   treat `Scene-1` and `scene-1` as one file. New ids are random, never reused.
 *
 * Pure: no I/O, randomness injected.
 */
import { z } from 'zod';
import { migrateArea, migrateAreaOverride } from './areas';

export type DocumentKind = 'campaign' | 'map' | 'scene' | 'creature' | 'asset' | 'session';

/** Current version of each document kind. */
export const DOCUMENT_VERSIONS: Record<DocumentKind, number> = {
  campaign: 1,
  map: 3,
  scene: 5,
  creature: 1,
  asset: 2,
  session: 1,
};

type Raw = Record<string, unknown>;
/** Migrations per kind: `[n]` turns a version-n document into version n+1. */
export const MIGRATIONS: Record<DocumentKind, Record<number, (doc: Raw) => Raw>> = {
  campaign: {},
  // Areas: rectangle and kind → polygons and "secret" (DC-013).
  map: {
    1: (doc) => ({ ...doc, ...(Array.isArray(doc['zones']) ? { zones: doc['zones'].map(migrateArea) } : {}) }),
    // Version 3 adds cliffs (DC-014): nothing to change, older apps just must not write such files.
    2: (doc) => doc,
  },
  // The same for the scene's own areas and its overrides of map areas.
  scene: {
    1: (doc) => {
      const out: Raw = { ...doc };
      const overrides = doc['overrides'];
      if (isRecord(overrides)) out['overrides'] = Object.fromEntries(Object.entries(overrides).map(([k, v]) => [k, migrateAreaOverride(v)]));
      const added = doc['added'];
      if (isRecord(added) && Array.isArray(added['zones'])) out['added'] = { ...added, zones: added['zones'].map(migrateArea) };
      return out;
    },
    2: (doc) => doc,
    // Version 4: hiding is state of the start and of the play state (DC-103), no longer an override.
    3: (doc) => {
      const overrides = isRecord(doc['overrides']) ? doc['overrides'] : {};
      const hidden = Object.keys(overrides).filter((k) => isRecord(overrides[k]) && overrides[k]['hidden'] === true);
      const out: Raw = { ...doc, overrides: Object.fromEntries(Object.entries(overrides).filter(([k]) => !hidden.includes(k))), hidden };
      if (isRecord(doc['start'])) out['start'] = { ...doc['start'], hidden };
      return out;
    },
    // Version 5 adds scene-own assets and effect states (DC-110): nothing to change.
    4: (doc) => doc,
  },
  creature: {},
  // The first asset format (variants with props, never used by files) → E-27 (DC-040).
  asset: {
    1: (doc) => {
      const { assetType, variants: _v, blocksSight: _b, ...rest } = doc;
      return { ...rest, assetKind: 'prop', ...(typeof assetType === 'string' ? { subkind: assetType } : {}) };
    },
  },
  session: {},
};

export const ID_PATTERN = /^[a-z0-9][a-z0-9_-]{0,63}$/;
export const idSchema = z.string().regex(ID_PATTERN, 'id must be lowercase letters, digits, - or _');

export type ReadResult<T> =
  | { ok: true; value: T; raw: Raw }
  | { ok: false; reason: 'json' | 'invalid'; errors: string[] }
  /** Written by a newer app version: shown read-only or not at all, never overwritten. */
  | { ok: false; reason: 'newer'; version: number; errors: string[] };

function isRecord(x: unknown): x is Raw {
  return typeof x === 'object' && x !== null && !Array.isArray(x);
}

/** Reads a document: parse, check its version, migrate, validate. */
export function readDocument<T>(
  kind: DocumentKind,
  schema: z.ZodType<T>,
  json: string,
  versions: Record<DocumentKind, number> = DOCUMENT_VERSIONS,
  migrations: Record<DocumentKind, Record<number, (doc: Raw) => Raw>> = MIGRATIONS,
): ReadResult<T> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return { ok: false, reason: 'json', errors: ['not valid JSON'] };
  }
  if (!isRecord(parsed)) return { ok: false, reason: 'invalid', errors: ['(root): expected an object'] };
  const current = versions[kind];
  let version = typeof parsed['schemaVersion'] === 'number' ? parsed['schemaVersion'] : 1;
  if (!Number.isInteger(version) || version < 1) return { ok: false, reason: 'invalid', errors: ['schemaVersion: not a version'] };
  if (version > current) return { ok: false, reason: 'newer', version, errors: [`schemaVersion ${version} is newer than this app (${current})`] };
  let raw: Raw = parsed;
  while (version < current) {
    const step = migrations[kind][version];
    if (!step) return { ok: false, reason: 'invalid', errors: [`no migration from version ${version}`] };
    raw = { ...step(raw), schemaVersion: version + 1 };
    version++;
  }
  const r = schema.safeParse(raw);
  if (!r.success) return { ok: false, reason: 'invalid', errors: r.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`) };
  return { ok: true, value: r.data, raw };
}

/* ---------------------------------------------------------------- unknown fields */

/** Peels optional/default/nullable/readonly wrappers and a `preprocess` step off a schema. */
function unwrap(schema: z.ZodType): z.ZodType {
  let s = schema;
  for (let i = 0; i < 10; i++) {
    const def = (s as unknown as { _zod?: { def?: { type?: string; innerType?: z.ZodType; out?: z.ZodType } } })._zod?.def;
    if (def && (def.type === 'optional' || def.type === 'default' || def.type === 'nullable' || def.type === 'readonly' || def.type === 'prefault' || def.type === 'nonoptional' || def.type === 'catch') && def.innerType) {
      s = def.innerType;
    } else if (def?.type === 'pipe' && def.out) {
      s = def.out;
    } else break;
  }
  return s;
}

/**
 * `next` (what the app writes now) with everything `original` (what was read) had that the
 * schema does not know. Known fields always come from `next` – also when `next` leaves them out,
 * so a field the app cleared stays cleared.
 */
export function keepUnknown(schema: z.ZodType, original: unknown, next: unknown): unknown {
  const s = unwrap(schema);
  if (s instanceof z.ZodObject && isRecord(original) && isRecord(next)) {
    const shape = s.shape as Record<string, z.ZodType>;
    const out: Raw = {};
    for (const [k, v] of Object.entries(next)) out[k] = k in shape ? keepUnknown(shape[k]!, original[k], v) : v;
    for (const [k, v] of Object.entries(original)) if (!(k in shape) && !(k in out)) out[k] = v;
    return out;
  }
  if (s instanceof z.ZodArray && Array.isArray(original) && Array.isArray(next)) {
    const element = s.element as z.ZodType;
    const byId = new Map<unknown, unknown>();
    for (const o of original) if (isRecord(o) && typeof o['id'] === 'string') byId.set(o['id'], o);
    return next.map((n) => (isRecord(n) && typeof n['id'] === 'string' && byId.has(n['id']) ? keepUnknown(element, byId.get(n['id']), n) : n));
  }
  return next;
}

/* ---------------------------------------------------------------- ids */

const ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';

/**
 * A new random id `<prefix>-<8 characters>` that `taken` does not hold. `random` returns
 * numbers in [0, 1) (injected for tests).
 */
export function newId(prefix: string, taken: (id: string) => boolean, random: () => number = Math.random): string {
  for (;;) {
    let tail = '';
    for (let i = 0; i < 8; i++) tail += ALPHABET[Math.floor(random() * ALPHABET.length) % ALPHABET.length];
    const id = `${prefix}-${tail}`;
    if (!taken(id)) return id;
  }
}

/** A name as an id / file name part: lowercase, `-` between words. */
export function slugId(name: string, fallback = 'item'): string {
  const s = name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  return s || fallback;
}
