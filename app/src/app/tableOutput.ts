/**
 * Sends player frames to the table window. A frame goes out at least every
 * 250 ms so the table's freshness check (heartbeat) stays satisfied; when the
 * DM app stalls or closes, the table goes black on its own.
 */
import { closeTableWindow, listMonitors, moveTableToMonitor, onTableReady, openTableWindow, sendFrame } from '../platform/bridge';
import { emit, log, produceFrame, state } from './store';

const INTERVAL_MS = 100;
let timer: ReturnType<typeof setInterval> | null = null;

export function startFrameLoop(): void {
  if (timer) return;
  void onTableReady(() => {
    if (state.tableOpen) void sendFrame(produceFrame(Date.now())).catch(() => undefined);
  });
  timer = setInterval(() => {
    const frame = produceFrame(Date.now());
    if (state.tableOpen) void sendFrame(frame).catch(() => undefined);
  }, INTERVAL_MS);
}

export async function refreshMonitors(): Promise<void> {
  try {
    state.monitors = await listMonitors();
  } catch {
    state.monitors = [];
  }
  emit();
}

/** The table defaults to the first monitor that is not the DM's primary (index 0). */
export function defaultTableMonitor(): number {
  return state.monitors.find((m) => m.index !== 0)?.index ?? 0;
}

export async function openTable(monitorIndex = defaultTableMonitor()): Promise<void> {
  if (state.tableOpen) {
    await moveTableTo(monitorIndex);
    return;
  }
  try {
    await openTableWindow(monitorIndex);
  } catch (e) {
    log('log.tableFailed', { error: String(e) });
    emit();
    return;
  }
  state.tableOpen = true;
  state.tableMonitor = monitorIndex;
  emit();
}

export async function moveTableTo(monitorIndex: number): Promise<void> {
  if (!state.tableOpen) {
    await openTable(monitorIndex);
    return;
  }
  // Black while moving: the window is briefly non-fullscreen on its way.
  const wasBlack = state.scene.table.blackout;
  state.scene.table.blackout = true;
  emit();
  try {
    await moveTableToMonitor(monitorIndex);
    state.tableMonitor = monitorIndex;
  } finally {
    setTimeout(() => {
      state.scene.table.blackout = wasBlack;
      emit();
    }, 400);
  }
}

export async function closeTable(): Promise<void> {
  await closeTableWindow();
  state.tableOpen = false;
  emit();
}
