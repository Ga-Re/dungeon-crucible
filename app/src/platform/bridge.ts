/**
 * Platform bridge: monitors, table window, frame transport and the campaign folder.
 * In the desktop app (Electron) it uses `window.dc` / `window.dcTable` from the preload
 * scripts; in a plain browser (development) it falls back to window.open + BroadcastChannel.
 */
import type { PlayerFrame } from '../core/projection';
import { assetUrlFor } from './asset-url';
import type { CampaignInfo, DcApi, DcTableApi, ImportedFile, MonitorInfo } from './desktop-api';

export type { CampaignInfo, ImportedFile, MonitorInfo };

declare global {
  interface Window {
    dc?: DcApi;
    dcTable?: DcTableApi;
  }
}

const CHANNEL = 'dc-table';

/** True in the desktop app's DM window. */
export function isDesktop(): boolean {
  return typeof window !== 'undefined' && !!window.dc;
}

function dc(): DcApi {
  if (!window.dc) throw new Error('Desktop app only');
  return window.dc;
}

export async function listMonitors(): Promise<MonitorInfo[]> {
  if (isDesktop()) return dc().listDisplays();
  // Browser: only the current screen is known.
  return [{ index: 0, name: 'Browser screen', x: 0, y: 0, width: screen.width * devicePixelRatio, height: screen.height * devicePixelRatio, scaleFactor: devicePixelRatio }];
}

export function onMonitorsChanged(cb: () => void): () => void {
  return isDesktop() ? dc().onDisplaysChanged(cb) : () => undefined;
}

let browserTable: Window | null = null;

export async function openTableWindow(monitorIndex: number): Promise<void> {
  if (isDesktop()) return dc().openTable(monitorIndex, 'Dungeon Crucible – Table');
  if (!browserTable || browserTable.closed) browserTable = window.open('table.html', 'dc-table', 'popup,width=960,height=540');
}

export async function closeTableWindow(): Promise<void> {
  if (isDesktop()) return dc().closeTable();
  browserTable?.close();
  browserTable = null;
}

/** Moves the table window to another display (same path as opening). */
export async function moveTableToMonitor(monitorIndex: number): Promise<void> {
  if (isDesktop()) await dc().openTable(monitorIndex, 'Dungeon Crucible – Table');
}

/** Called when the table window has (re)loaded, so the DM window can resend the current frame at once. */
export function onTableReady(cb: () => void): () => void {
  if (!isDesktop()) return () => undefined;
  return dc().onTableReady(() => {
    cb();
    setTimeout(cb, 1000);
  });
}

/** Called when the table window was closed from outside the app (e.g. Alt+F4). */
export function onTableClosed(cb: () => void): () => void {
  return isDesktop() ? dc().onTableClosed(cb) : () => undefined;
}

let channel: BroadcastChannel | null = null;

/** Sends a frame to the table window only (never broadcast to other windows). */
export async function sendFrame(frame: PlayerFrame): Promise<void> {
  if (isDesktop()) {
    dc().sendFrame(frame);
    return;
  }
  channel ??= new BroadcastChannel(CHANNEL);
  channel.postMessage(frame);
}

/** Table side: subscribe to incoming frames. Returns an unsubscribe function. */
export async function onFrame(cb: (data: unknown) => void): Promise<() => void> {
  if (window.dcTable) return window.dcTable.onFrame(cb);
  const ch = new BroadcastChannel(CHANNEL);
  ch.onmessage = (e) => cb(e.data);
  return () => ch.close();
}

/* ---------- Campaign folders (desktop only) ---------- */

export const pickCampaignFolder = () => dc().pickCampaignFolder();
export const openCampaignFolder = (path: string) => dc().openCampaignFolder(path);
export const readText = (rel: string) => dc().readText(rel);
export const writeText = (rel: string, content: string) => dc().writeText(rel, content);
export const listFiles = (dir: string) => dc().listFiles(dir);
export const absolutePath = (rel: string) => dc().absolutePath(rel);
export const importMapFileNative = () => dc().importMapFile();

/** URL the pages (DM and table) can load a campaign file from. */
export async function assetUrl(absPath: string): Promise<string> {
  return assetUrlFor(absPath);
}
