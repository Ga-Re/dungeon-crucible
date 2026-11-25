/**
 * Platform bridge: monitors, table window, frame transport and the campaign folder.
 * In the desktop app (Electron) it uses `window.dc` / `window.dcTable` from the preload
 * scripts; in a plain browser (development) it falls back to window.open + BroadcastChannel.
 */
import type { PlayerFrame } from '../core/projection';
import type { FloatingBackend } from '../dock/nativeWindows';
import { assetUrlFor } from './asset-url';
import type { CampaignInfo, DcApi, DcTableApi, LibraryEntry, LibraryImport, MonitorInfo, ScreenSetupInfo } from './desktop-api';
export type { CampaignError, CampaignListEntry, RootInfo } from './desktop-api';

export type { CampaignInfo, LibraryEntry, LibraryImport, MonitorInfo };

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

export const rootInfo = () => dc().rootInfo();
export const chooseRoot = (useSuggested: boolean) => dc().chooseRoot(useSuggested);
/** Files by path relative to the root folder. */
export const readText = (rel: string) => dc().readText(rel);
export const writeText = (rel: string, content: string) => dc().writeText(rel, content);
export const listFiles = (dir: string) => dc().listFiles(dir);
export const absolutePath = (rel: string) => dc().absolutePath(rel);
export const trashFile = (rel: string, withSidecar = true) => dc().trash(rel, withSidecar);
export const listCampaignFolders = () => dc().listCampaigns();
export const createCampaignFolder = (name: string) => dc().createCampaign(name);
export const trashCampaignFolder = (slug: string) => dc().trashCampaign(slug);
export const importToLibrary = (kind: 'map' | 'audio') => dc().importToLibrary(kind);
export const listLibrary = () => dc().listLibrary();
export const importAssets = () => dc().importAssets();
export const importDropped = (fileName: string, bytes: Uint8Array) => dc().importDropped(fileName, bytes);
export const readThumb = (key: string) => dc().readThumb(key);
export const writeThumb = (key: string, bytes: Uint8Array) => dc().writeThumb(key, bytes);
export const exportCampaignArchive = (slug: string, name: string, libraryFiles: string[]) => dc().exportCampaignArchive(slug, name, libraryFiles);
export const importCampaignArchive = () => dc().importCampaignArchive();

/** URL the pages (DM and table) can load a campaign file from. */
export async function assetUrl(absPath: string): Promise<string> {
  return assetUrlFor(absPath);
}

/** Display work areas for floating windows (desktop app; null in the browser). Synchronous. */
export function screenSetupSync(): ScreenSetupInfo | null {
  return isDesktop() ? dc().screensSync() : null;
}

export async function screenSetup(): Promise<ScreenSetupInfo | null> {
  return isDesktop() ? dc().screens() : null;
}

let floating: FloatingBackend | null | undefined;

/** Native windows for floating panels (desktop app only; the browser shows overlays). */
export function floatingBackend(): FloatingBackend | null {
  if (floating !== undefined) return floating;
  if (!isDesktop()) return (floating = null);
  const api = dc();
  floating = {
    setBounds: (name, bounds) => api.setFloatBounds(name, bounds),
    onMoved: (cb) => api.onFloatMoved(cb),
    onClosed: (cb) => api.onFloatClosed(cb),
    contentOrigin: () => api.contentOrigin(),
  };
  return floating;
}
