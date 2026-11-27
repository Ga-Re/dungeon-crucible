/**
 * Rescue copies and the crash notice (DC-003). A document whose save failed is kept in the
 * device's app storage (never in the root folder, never synced) and offered when its campaign
 * opens again: restore writes it back, discard drops it. The copies live in IndexedDB (E-55: map
 * files with rasters outgrow the small localStorage); copies an older version kept in
 * localStorage move over once. A marker set at start and removed when the window closes tells a
 * clean end from a crash; after a crash the start screen says so – it stays in localStorage,
 * which closing can still write to.
 */
import { copiesFor, dropAfterSave, dropCopy, keepCopy, parseRescue, restoreCheck, serializeRescue, type RescueCopy, type RescueStore } from '../core/rescue';
import { newId } from '../core/documents';
import { readText, writeText } from '../platform/bridge';
import { emit, log, state } from './store';

const KEY = 'dc.rescueCopies';
const RUNNING = 'dc.running';

/** This run of the app: a later successful save drops only copies kept in it. */
const SESSION = newId('session', () => false);

function storage(): Storage | null {
  try {
    return localStorage;
  } catch {
    return null;
  }
}

/** Where the serialized copies are kept: IndexedDB in the app, memory in tests. */
export interface RescueBackend {
  read(): Promise<string | null>;
  write(text: string): Promise<void>;
}

const DB = 'dungeon-crucible';
const STORE = 'rescue';

function request<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error ?? new Error('IndexedDB request failed'));
  });
}

let db: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  db ??= new Promise((resolve, reject) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error ?? new Error('IndexedDB could not be opened'));
  });
  return db;
}

/** The app's backend: one record in IndexedDB. */
const indexedBackend: RescueBackend = {
  async read() {
    const d = await openDb();
    return ((await request(d.transaction(STORE).objectStore(STORE).get(KEY))) as string | undefined) ?? null;
  },
  async write(text) {
    const d = await openDb();
    const tx = d.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(text, KEY);
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('IndexedDB write failed'));
      tx.onabort = () => reject(tx.error ?? new Error('IndexedDB write aborted'));
    });
  },
};

/** `inner`, taking over the copies an older version kept in localStorage the first time it has none. */
export function takingOverLocalStorage(inner: RescueBackend, st: Storage | null): RescueBackend {
  return {
    async read() {
      const text = await inner.read();
      if (text !== null) return text;
      const old = st?.getItem(KEY) ?? null;
      if (old !== null) {
        await inner.write(old);
        st?.removeItem(KEY);
      }
      return old;
    },
    write: (text) => inner.write(text),
  };
}

let backend: RescueBackend = takingOverLocalStorage(indexedBackend, storage());

/** Tests: copies kept in `b` from now on (jsdom has no IndexedDB). */
export function useRescueBackendForTests(b: RescueBackend): void {
  backend = b;
}

async function load(): Promise<RescueStore> {
  try {
    return parseRescue(await backend.read());
  } catch {
    return parseRescue(null);
  }
}

/** Read, change and write of the copies one after another: two saves never overwrite each other's copy. */
let queue: Promise<unknown> = Promise.resolve();

function serial<T>(work: () => Promise<T>): Promise<T> {
  const next = queue.then(work, work);
  queue = next.catch(() => undefined);
  return next;
}

/** Stores the copies; false when the device storage refused them (full, blocked). */
async function store(s: RescueStore): Promise<boolean> {
  try {
    await backend.write(serializeRescue(s));
    return true;
  } catch {
    return false;
  }
}

const root = () => state.root?.root ?? '';

/**
 * A save of `path` failed: keep what would have been written (compact JSON, device storage is
 * small) and what the file was when the app last read or wrote it (`base`, see `fileHash`).
 */
export async function keepRescue(path: string, text: string, base: string | null): Promise<void> {
  if (!root()) return;
  const r = root();
  const kept = await serial(async () => store(keepCopy(await load(), { root: r, path, text, at: Date.now(), session: SESSION, base })));
  if (!kept) log('log.rescueFailed', { file: path });
}

/** A save of `path` succeeded: a copy of this run is no longer needed. */
export async function savedOk(path: string): Promise<void> {
  const r = root();
  await serial(async () => {
    const s = await load();
    if (s.copies.length) await store(dropAfterSave(s, r, path, SESSION));
  });
}

/** When a campaign opens: its copies, offered in a dialog (none: nothing shows). */
export async function offerRescue(slug: string): Promise<void> {
  state.rescueOffer = copiesFor(await load(), root(), slug).sort((a, b) => b.at - a.at);
  emit();
}

export type RestoreResult = 'restored' | 'changed' | 'newer' | 'failed';

const without = (copy: RescueCopy) => state.rescueOffer.filter((c) => !(c.path === copy.path && c.session === copy.session));

/**
 * "Restore": the copy is written back and the campaign reloads what it shows. Not over a file
 * from a newer app version (`newer`), and over a file changed since only when `overwrite` (the DM
 * confirmed after `changed`).
 */
export async function restoreRescue(copy: RescueCopy, reload: () => Promise<void>, overwrite = false): Promise<RestoreResult> {
  let file: string | null;
  try {
    file = await readText(copy.path);
  } catch {
    file = null;
  }
  const check = restoreCheck(copy, file);
  if (check === 'newer' || (check === 'changed' && !overwrite)) return check;
  try {
    await writeText(copy.path, JSON.stringify(JSON.parse(copy.text), null, 2));
  } catch (e) {
    log('log.saveFailed', { error: String(e) });
    return 'failed';
  }
  await serial(async () => store(dropCopy(await load(), copy)));
  state.rescueOffer = without(copy);
  log('log.rescueRestored', { file: copy.path });
  await reload();
  emit();
  return 'restored';
}

export async function discardRescue(copy: RescueCopy): Promise<void> {
  await serial(async () => store(dropCopy(await load(), copy)));
  state.rescueOffer = without(copy);
  emit();
}

/**
 * At start: whether the app ended without closing its window last time (a crash or a forced
 * quit). Marks this run as running; closing the window clears the mark.
 */
let started: boolean | null = null;

export function startRunMarker(target: Pick<Window, 'addEventListener'> = window): boolean {
  // Once per run: React's development mode starts effects twice.
  if (started === null) started = markRun(target);
  return started;
}

/** Tests: as if the app started anew. */
export function resetRunMarkerForTests(): void {
  started = null;
}

function markRun(target: Pick<Window, 'addEventListener'>): boolean {
  const st = storage();
  if (!st) return false;
  let crashed = false;
  try {
    crashed = st.getItem(RUNNING) !== null;
    st.setItem(RUNNING, String(Date.now()));
  } catch {
    return false;
  }
  target.addEventListener('beforeunload', () => {
    try {
      st.removeItem(RUNNING);
    } catch {
      /* storage gone: the next start shows a notice it need not – harmless */
    }
  });
  return crashed;
}
