/**
 * Sends player frames to the table window. A frame goes out at least every
 * 250 ms so the table's freshness check (heartbeat) stays satisfied; when the
 * DM app stalls or closes, the table goes black on its own.
 */
import { closeTableWindow, listMonitors, moveTableToMonitor, onMonitorsChanged, onTableClosed, onTableReady, openTableWindow, sendFrame, sendRaster } from '../platform/bridge';
import { RASTER_SENT_CAPACITY, rasterBatches, SentBlocks } from '../core/build/terrain/tvRaster';
import type { RasterBlock } from '../core/build/terrain/block';
import { emit, log, produceFrame, state, tvRasterBlocks } from './store';

const INTERVAL_MS = 100;
let timer: ReturnType<typeof setInterval> | null = null;

export function startFrameLoop(): void {
  if (timer) return;
  onTableReady(() => {
    // A (re)loaded TV holds no terrain blocks: they all go again.
    rasterSent.clear();
    if (state.tableOpen) send(produceFrame(Date.now()));
  });
  onTableClosed(() => {
    rasterSent.clear();
    state.tableOpen = false;
    emit();
  });
  onMonitorsChanged(() => void refreshMonitors());
  timer = setInterval(() => {
    const frame = produceFrame(Date.now());
    if (state.tableOpen) send(frame);
  }, INTERVAL_MS);
}

/** A frame to the TV, the terrain blocks it names first: the TV finds them when the frame comes. */
function send(frame: ReturnType<typeof produceFrame>): void {
  pushRaster(tvRasterBlocks());
  void sendFrame(frame).catch(() => undefined);
}

/** The terrain blocks (by checksum) the TV has been sent since it last loaded (E-61, E-85). */
const rasterSent = new SentBlocks(RASTER_SENT_CAPACITY);

/** Sends the TV the terrain blocks (by checksum) a frame names that it does not have yet. */
function pushRaster(blocks: ReadonlyMap<string, RasterBlock>): void {
  if (!state.tableOpen) return;
  for (const batch of rasterBatches(blocks, rasterSent)) sendRaster(batch);
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
