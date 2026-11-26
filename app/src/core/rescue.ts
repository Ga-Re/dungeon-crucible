/**
 * Rescue copies (DC-003, Dungeon-Manager T-114b): a document whose save failed (e.g. the cloud
 * folder was unreachable) is kept in the device's app storage – outside the root folder, never
 * synced – and offered when its campaign opens again. One copy per file, the newest. A later
 * successful save drops only a copy kept in the same app session; one from an earlier session
 * stays until the DM restores or discards it, and a failed save in a later session never
 * replaces it (that one keeps its own copy). Restoring checks that the file is still what the
 * copy was based on. Pure.
 */
import { z } from 'zod';

const VERSION = 2;

const copySchema = z.object({
  /** The root folder the file belongs to. */
  root: z.string(),
  /** Its path relative to the root folder. */
  path: z.string(),
  /** The document as it would have been written. */
  text: z.string(),
  /** When the save failed (ms). */
  at: z.number(),
  /** The app session it failed in. */
  session: z.string(),
  /** `fileHash` of the file as the app last read or wrote it; null: the file did not exist. */
  base: z.string().nullable(),
});
export type RescueCopy = z.infer<typeof copySchema>;

const storeSchema = z.object({ version: z.literal(VERSION), copies: z.array(copySchema) });
export type RescueStore = z.infer<typeof storeSchema>;

/** The stored copies; nothing from missing, broken or foreign data. */
export function parseRescue(raw: string | null): RescueStore {
  if (!raw) return { version: VERSION, copies: [] };
  try {
    const r = storeSchema.safeParse(JSON.parse(raw));
    return r.success ? r.data : { version: VERSION, copies: [] };
  } catch {
    return { version: VERSION, copies: [] };
  }
}

export function serializeRescue(store: RescueStore): string {
  return JSON.stringify(store);
}

const same = (c: RescueCopy, root: string, path: string, session: string) => c.root === root && c.path === path && c.session === session;

/** Keeps `copy`, replacing only the copy of the same file from the same session. */
export function keepCopy(store: RescueStore, copy: RescueCopy): RescueStore {
  return { ...store, copies: [...store.copies.filter((c) => !same(c, copy.root, copy.path, copy.session)), copy] };
}

/** A save of `path` succeeded: a copy of it from this session is no longer needed. */
export function dropAfterSave(store: RescueStore, root: string, path: string, session: string): RescueStore {
  return { ...store, copies: store.copies.filter((c) => !same(c, root, path, session)) };
}

/** Drops one copy (restored or discarded). */
export function dropCopy(store: RescueStore, copy: Pick<RescueCopy, 'root' | 'path' | 'session'>): RescueStore {
  return { ...store, copies: store.copies.filter((c) => !same(c, copy.root, copy.path, copy.session)) };
}

/** The copies a campaign offers: its own files and those of the library, in this root folder. */
export function copiesFor(store: RescueStore, root: string, slug: string): RescueCopy[] {
  return store.copies.filter((c) => c.root === root && (c.path.startsWith(`campaigns/${slug}/`) || c.path.startsWith('library/')));
}

/** A short fingerprint of a JSON document's content (formatting ignored); FNV-1a. */
export function fileHash(text: string): string {
  let canonical = text;
  try {
    canonical = JSON.stringify(JSON.parse(text));
  } catch {
    /* not JSON: the text as it is */
  }
  let h = 0x811c9dc5;
  for (let i = 0; i < canonical.length; i++) {
    h ^= canonical.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return `${(h >>> 0).toString(16)}:${canonical.length}`;
}

const versionOf = (text: string): number => {
  try {
    const v = (JSON.parse(text) as { schemaVersion?: unknown }).schemaVersion;
    return typeof v === 'number' ? v : 1;
  } catch {
    return 1;
  }
};

/**
 * Whether a copy may be written back over the file as it is now (null: missing): `newer` – the
 * file comes from a newer app version and is never overwritten; `changed` – the file is no longer
 * what the copy was based on (another device, a later save), so the DM confirms first.
 */
export function restoreCheck(copy: Pick<RescueCopy, 'text' | 'base'>, file: string | null): 'ok' | 'changed' | 'newer' {
  if (file !== null && versionOf(file) > versionOf(copy.text)) return 'newer';
  const now = file === null ? null : fileHash(file);
  return now === copy.base ? 'ok' : 'changed';
}
