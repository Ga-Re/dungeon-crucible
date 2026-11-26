/**
 * Rescue copies (DC-003, Dungeon-Manager T-114b): a document whose save failed (e.g. the cloud
 * folder was unreachable) is kept in the device's app storage – outside the root folder, never
 * synced – and offered when its campaign opens again. One copy per file, the newest. A later
 * successful save drops only a copy kept in the same app session; one from an earlier session
 * stays until the DM restores or discards it. Pure.
 */
import { z } from 'zod';

const VERSION = 1;

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

const same = (c: RescueCopy, root: string, path: string) => c.root === root && c.path === path;

export function keepCopy(store: RescueStore, copy: RescueCopy): RescueStore {
  return { ...store, copies: [...store.copies.filter((c) => !same(c, copy.root, copy.path)), copy] };
}

/** A save of `path` succeeded: a copy of it from this session is no longer needed. */
export function dropAfterSave(store: RescueStore, root: string, path: string, session: string): RescueStore {
  return { ...store, copies: store.copies.filter((c) => !(same(c, root, path) && c.session === session)) };
}

export function dropCopy(store: RescueStore, root: string, path: string): RescueStore {
  return { ...store, copies: store.copies.filter((c) => !same(c, root, path)) };
}

/** The copies a campaign offers: its own files and those of the library, in this root folder. */
export function copiesFor(store: RescueStore, root: string, slug: string): RescueCopy[] {
  return store.copies.filter((c) => c.root === root && (c.path.startsWith(`campaigns/${slug}/`) || c.path.startsWith('library/')));
}
