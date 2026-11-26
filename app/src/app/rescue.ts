/**
 * Rescue copies and the crash notice (DC-003). A document whose save failed is kept in the
 * device's app storage (never in the root folder, never synced) and offered when its campaign
 * opens again: restore writes it back, discard drops it. A marker set at start and removed when
 * the window closes tells a clean end from a crash; after a crash the start screen says so.
 */
import { copiesFor, dropAfterSave, dropCopy, keepCopy, parseRescue, serializeRescue, type RescueCopy, type RescueStore } from '../core/rescue';
import { newId } from '../core/documents';
import { writeText } from '../platform/bridge';
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

/** A save of `path` failed: keep what would have been written. */
export function keepRescue(path: string, text: string): void {
  if (!root()) return;
  if (!store(keepCopy(load(), { root: root(), path, text, at: Date.now(), session: SESSION }))) log('log.rescueFailed', { file: path });
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

/** "Restore": the copy is written back; the campaign then reloads what it shows. */
export async function restoreRescue(copy: RescueCopy, reload: () => Promise<void>): Promise<boolean> {
  try {
    await writeText(copy.path, copy.text);
  } catch (e) {
    log('log.saveFailed', { error: String(e) });
    return false;
  }
  store(dropCopy(load(), copy.root, copy.path));
  state.rescueOffer = state.rescueOffer.filter((c) => c.path !== copy.path);
  log('log.rescueRestored', { file: copy.path });
  await reload();
  emit();
  return true;
}

export function discardRescue(copy: RescueCopy): void {
  store(dropCopy(load(), copy.root, copy.path));
  state.rescueOffer = state.rescueOffer.filter((c) => c.path !== copy.path);
  emit();
}

/**
 * At start: whether the app ended without closing its window last time (a crash or a forced
 * quit). Marks this run as running; closing the window clears the mark.
 */
export function startRunMarker(target: Pick<Window, 'addEventListener'> = window): boolean {
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
