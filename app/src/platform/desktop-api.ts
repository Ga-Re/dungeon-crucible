/**
 * The API the Electron preload scripts expose to the pages (`window.dc` in the DM window,
 * `window.dcTable` in the table window). Types only: shared by `electron/` and `src/`.
 */

export interface MonitorInfo {
  index: number;
  name: string;
  /** Position of the display's top-left corner in desktop coordinates (logical pixels). */
  x: number;
  y: number;
  /** Resolution in physical pixels. */
  width: number;
  height: number;
  scaleFactor: number;
}

export interface CampaignInfo {
  root: string;
  name: string;
}

export interface ImportedFile {
  /** Path relative to the campaign folder, with forward slashes. */
  relPath: string;
  /** Absolute path, for `assetUrlFor`. */
  absPath: string;
}

export type Unsubscribe = () => void;

/** DM window. */
export interface DcApi {
  listDisplays(): Promise<MonitorInfo[]>;
  /** A display was plugged in, removed or changed its resolution. */
  onDisplaysChanged(cb: () => void): Unsubscribe;

  /** Opens the table window fullscreen on display `index`, or moves it there. */
  openTable(index: number, title: string): Promise<void>;
  closeTable(): Promise<void>;
  /** Sends a player frame to the table window only. */
  sendFrame(frame: unknown): void;
  /** The table window has (re)loaded and wants the current frame. */
  onTableReady(cb: () => void): Unsubscribe;
  /** The table window was closed by the operating system or the user. */
  onTableClosed(cb: () => void): Unsubscribe;

  pickCampaignFolder(): Promise<CampaignInfo | null>;
  openCampaignFolder(path: string): Promise<CampaignInfo>;
  readText(rel: string): Promise<string>;
  writeText(rel: string, content: string): Promise<void>;
  listFiles(dir: string): Promise<string[]>;
  absolutePath(rel: string): Promise<string>;
  importMapFile(): Promise<ImportedFile | null>;
}

/** Table window: may only receive frames. */
export interface DcTableApi {
  onFrame(cb: (frame: unknown) => void): Unsubscribe;
}
