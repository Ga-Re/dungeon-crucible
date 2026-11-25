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

/** The open campaign: its folder `campaigns/<slug>/` in the root folder. */
export interface CampaignInfo {
  slug: string;
  name: string;
}

/** The root folder (null: not chosen yet) and the one suggested for a first start. */
export interface RootInfo {
  root: string | null;
  suggested: string;
}

/** A campaign folder in the root folder (`campaigns/<slug>/`) with the manifest's last change. */
export interface CampaignListEntry {
  slug: string;
  modifiedAt: number;
}

/** A library file with its sidecar text (Asset Vault, DC-040). */
export interface LibraryEntry {
  /** File name in `library/`. */
  name: string;
  size: number;
  mtimeMs: number;
  /** Text of `<name>.dm.json`, if there is one. */
  sidecar: string | null;
}

/** A pack folder the DM picked (DC-040b): its folders; the path stays in the main process. */
export interface PackScanInfo {
  /** Names this pack in later calls. */
  token: string;
  name: string;
  folders: { path: string; files: number; bytes: number }[];
}

/** A file of a pack import: where it was in the pack, where it is in the library. */
export interface PackImported {
  packPath: string;
  relPath: string;
  reused: boolean;
}

export interface PackProgress {
  token: string;
  done: number;
  total: number;
  file: string;
}

/** A file put into the library. */
export interface LibraryImport {
  /** Path relative to the root folder (`library/<file>`), with forward slashes. */
  relPath: string;
  /** Absolute path, for `assetUrlFor`. */
  absPath: string;
  /** The library had a file with the same content already; nothing was copied. */
  reused: boolean;
}

export type Unsubscribe = () => void;

/** Why importing a campaign archive failed. */
export type CampaignError = 'notCampaign' | 'unsafe' | 'tooLarge' | 'targetNotEmpty' | 'failed';
export type ImportResultInfo =
  | { ok: true; slug: string; library: { added: number; reused: number; renamed: number; kept: number } }
  | { ok: false; error: CampaignError };
export type ExportResult = { ok: true; file: string; files: number } | { ok: false; error: 'insideRoot' | 'failed' };

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

  /** The root folder holding `library/` and `campaigns/`. */
  rootInfo(): Promise<RootInfo>;
  /** Sets the root: the suggested folder, or one the user picks (null: cancelled). */
  chooseRoot(useSuggested: boolean): Promise<RootInfo | null>;

  /** Files, by path relative to the root folder (confined to it). */
  readText(rel: string): Promise<string>;
  writeText(rel: string, content: string): Promise<void>;
  listFiles(dir: string): Promise<string[]>;
  absolutePath(rel: string): Promise<string>;
  /** Moves a file (with its sidecar unless `withSidecar` is false) to the root's trash. */
  trash(rel: string, withSidecar: boolean): Promise<void>;

  listCampaigns(): Promise<CampaignListEntry[]>;
  /** A new campaign folder named after `name`; returns its slug. */
  createCampaign(name: string): Promise<string>;
  trashCampaign(slug: string): Promise<void>;

  /** Picks a map or audio file and puts it into the library (null: cancelled). */
  importToLibrary(kind: 'map' | 'audio'): Promise<LibraryImport | null>;
  /** The library's files with their sidecars (Asset Vault). */
  listLibrary(): Promise<LibraryEntry[]>;
  /** Picks any number of asset files and puts them into the library ([] when cancelled). */
  importAssets(): Promise<LibraryImport[]>;
  /** Puts a dropped file into the library from its bytes (never from a path). */
  importDropped(fileName: string, bytes: Uint8Array): Promise<LibraryImport>;
  /** Picks a pack folder and lists its folders (null: cancelled). */
  pickPack(): Promise<PackScanInfo | null>;
  /** Imports the chosen folders of a picked pack; progress comes through `onPackProgress`. */
  importPack(token: string, folders: string[]): Promise<PackImported[]>;
  /** Stops a running pack import after the current file. */
  cancelPack(token: string): Promise<void>;
  onPackProgress(cb: (p: PackProgress) => void): () => void;
  /** Thumbnail cache on this device (app data folder): by key, PNG/WebP only. */
  readThumb(key: string): Promise<Uint8Array | null>;
  writeThumb(key: string, bytes: Uint8Array): Promise<void>;

  /** Writes campaign `slug` as .zip; `libraryFiles` (root-relative) come along, [] = campaign only. */
  exportCampaignArchive(slug: string, name: string, libraryFiles: string[]): Promise<ExportResult | null>;
  /** Imports a campaign archive into the root folder (null: cancelled). */
  importCampaignArchive(): Promise<ImportResultInfo | null>;

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
