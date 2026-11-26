/**
 * Rescue copies and the crash notice (DC-003). A document whose save failed is kept in the
 * device's app storage (never in the root folder, never synced) and offered when its campaign
 * opens again: restore writes it back, discard drops it. A marker set at start and removed when
 * the window closes tells a clean end from a crash; after a crash the start screen says so.
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

function load(): RescueStore {
  try {
    return parseRescue(storage()?.getItem(KEY) ?? null);
  } catch {
    return parseRescue(null);
  }
}

/** Stores the copies; false when the device storage refused them (full, blocked). */
function store(s: RescueStore): boolean {
  try {
    const st = storage();
    if (!st) return false;
    st.setItem(KEY, serializeRescue(s));
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
export function keepRescue(path: string, text: string, base: string | null): void {
  if (!root()) return;
  if (!store(keepCopy(load(), { root: root(), path, text, at: Date.now(), session: SESSION, base }))) log('log.rescueFailed', { file: path });
}

/** A save of `path` succeeded: a copy of this run is no longer needed. */
export function savedOk(path: string): void {
  const s = load();
  if (!s.copies.length) return;
  store(dropAfterSave(s, root(), path, SESSION));
}

/** When a campaign opens: its copies, offered in a dialog (none: nothing shows). */
export function offerRescue(slug: string): void {
  state.rescueOffer = copiesFor(load(), root(), slug).sort((a, b) => b.at - a.at);
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
  store(dropCopy(load(), copy));
  state.rescueOffer = without(copy);
  log('log.rescueRestored', { file: copy.path });
  await reload();
  emit();
  return 'restored';
}

export function discardRescue(copy: RescueCopy): void {
  store(dropCopy(load(), copy));
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
