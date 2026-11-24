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

/** A floating panel window's bounds in desktop coordinates (logical pixels). */
export interface FloatBounds {
  x: number;
  y: number;
  width: number;
  height: number;
  /** Window opacity 0–1 (lowered while the panel is dragged). */
  opacity?: number;
}

/** A display's work area (without menu bar / taskbar) in desktop coordinates, logical pixels. */
export interface ScreenArea {
  /** Stable id of the display while it is connected. */
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

/** All displays, and the one the DM window is on. */
export interface ScreenSetupInfo {
  screens: ScreenArea[];
  main: ScreenArea;
}

/** DM window. */
export interface DcApi {
  listDisplays(): Promise<MonitorInfo[]>;
  /** A display was plugged in, removed or changed its resolution. */
  onDisplaysChanged(cb: () => void): Unsubscribe;
  /** Work areas of all displays (for floating windows). Synchronous: needed before the first layout. */
  screensSync(): ScreenSetupInfo | null;
  screens(): Promise<ScreenSetupInfo>;

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

  /**
   * Floating panel windows (opened by the page with `window.open('about:blank', 'dc-float:…')`).
   * Moves/resizes one; the first call shows it without taking the focus.
   */
  setFloatBounds(name: string, bounds: FloatBounds): void;
  /** The system moved or resized a floating window (reported after it settles). */
  onFloatMoved(cb: (name: string, bounds: FloatBounds) => void): Unsubscribe;
  /** A floating window was closed (by the page or the system, e.g. ⌘W). */
  onFloatClosed(cb: (name: string) => void): Unsubscribe;
  /** Desktop position of the DM window's content area (top-left, logical pixels). */
  contentOrigin(): Promise<{ x: number; y: number }>;
}

/** Table window: may only receive frames. */
export interface DcTableApi {
  onFrame(cb: (frame: unknown) => void): Unsubscribe;
}
