/**
 * Platform bridge: monitors, table window and frame transport.
 * In the desktop app it uses Tauri commands and events; in a plain browser
 * (development) it falls back to window.open + BroadcastChannel.
 */
import type { PlayerFrame } from '../core/projection';

export interface MonitorInfo {
  index: number;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  scaleFactor: number;
}

export const FRAME_EVENT = 'player-frame';
const CHANNEL = 'dc-table';

export function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const core = await import('@tauri-apps/api/core');
  return core.invoke<T>(cmd, args);
}

export async function listMonitors(): Promise<MonitorInfo[]> {
  if (isTauri()) return invoke<MonitorInfo[]>('list_monitors');
  // Browser: only the current screen is known.
  return [{ index: 0, name: 'Browser screen', x: 0, y: 0, width: screen.width * devicePixelRatio, height: screen.height * devicePixelRatio, scaleFactor: devicePixelRatio }];
}

let browserTable: Window | null = null;

export async function openTableWindow(monitorIndex: number): Promise<MonitorInfo | null> {
  if (isTauri()) return invoke<MonitorInfo>('open_table_window', { monitorIndex });
  if (!browserTable || browserTable.closed) browserTable = window.open('table.html', 'dc-table', 'popup,width=960,height=540');
  return null;
}

export async function closeTableWindow(): Promise<void> {
  if (isTauri()) {
    await invoke('close_table_window');
    return;
  }
  browserTable?.close();
  browserTable = null;
}

export async function moveWindowToMonitor(label: string, monitorIndex: number): Promise<MonitorInfo | null> {
  if (isTauri()) return invoke<MonitorInfo>('move_window_to_monitor', { label, monitorIndex });
  return null;
}

let channel: BroadcastChannel | null = null;

/** Sends a frame to the table window only (never broadcast to other windows). */
export async function sendFrame(frame: PlayerFrame): Promise<void> {
  if (isTauri()) {
    const ev = await import('@tauri-apps/api/event');
    await ev.emitTo('table', FRAME_EVENT, frame);
    return;
  }
  channel ??= new BroadcastChannel(CHANNEL);
  channel.postMessage(frame);
}

/** Table side: subscribe to incoming frames. Returns an unsubscribe function. */
export async function onFrame(cb: (data: unknown) => void): Promise<() => void> {
  if (isTauri()) {
    const ev = await import('@tauri-apps/api/event');
    const un = await ev.listen(FRAME_EVENT, (e) => cb(e.payload));
    return un;
  }
  const ch = new BroadcastChannel(CHANNEL);
  ch.onmessage = (e) => cb(e.data);
  return () => ch.close();
}

/* ---------- Campaign folders (desktop only) ---------- */

export interface CampaignInfo {
  root: string;
  name: string;
}

export interface ImportedFile {
  relPath: string;
  absPath: string;
}

export const pickCampaignFolder = () => invoke<CampaignInfo | null>('pick_campaign_folder');
export const openCampaignFolder = (path: string) => invoke<CampaignInfo>('open_campaign_folder', { path });
export const readText = (rel: string) => invoke<string>('read_text', { rel });
export const writeText = (rel: string, content: string) => invoke<void>('write_text', { rel, content });
export const listFiles = (dir: string) => invoke<string[]>('list_files', { dir });
export const absolutePath = (rel: string) => invoke<string>('absolute_path', { rel });
export const importMapFileNative = () => invoke<ImportedFile | null>('import_map_file');

/** URL the webviews (DM and table) can load a campaign file from. */
export async function assetUrl(absPath: string): Promise<string> {
  const core = await import('@tauri-apps/api/core');
  return core.convertFileSrc(absPath);
}
