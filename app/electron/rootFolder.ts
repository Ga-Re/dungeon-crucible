/**
 * The root folder: one folder (often in a synced location) holding the global library and the
 * campaigns.
 *
 *   <root>/library/          maps, assets (incl. audio), creatures – flat, with sidecars `<file>.dm.json`
 *   <root>/campaigns/<slug>/ one folder per campaign
 *   <root>/.trash/<time>/    deleted files, restorable
 *
 * The root is chosen only through the native folder dialog (or the saved device setting) and is
 * stored in the app's data folder, never in the root. Pages pass paths relative to the root;
 * every access is confined to it (no absolute paths, no `..`, no way out through symbolic links).
 */
import { app, dialog, type BrowserWindow } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import type { CampaignListEntry, ExportResult, ImportResultInfo, LibraryEntry, LibraryImport, RootInfo } from '../src/platform/desktop-api';
import { ArchiveError, CAMPAIGN_FILE_NAME, SIDECAR_SUFFIX, campaignSlug, freeName, importArchive, writeArchive } from './archive';
import { ASSET_EXTENSIONS, addBytesToLibrary, addFileToLibrary, listLibrary } from './library';
import { folderName, isInside, listFilesIn, safeJoin, toRel, writeAtomic } from './files';

const MAP_EXTENSIONS = ['png', 'jpg', 'jpeg', 'webp', 'mp4', 'webm'];
const AUDIO_EXTENSIONS = ['mp3', 'ogg', 'oga', 'opus', 'wav', 'm4a', 'aac', 'flac'];
const SETTINGS_FILE = 'settings.json';

export class RootFolder {
  private root: string | null = null;

  /** Reads the saved root (device setting). A root that is gone counts as none. */
  async load(): Promise<void> {
    try {
      const s: unknown = JSON.parse(await fs.promises.readFile(this.settingsFile(), 'utf8'));
      const r = (s as { root?: unknown }).root;
      if (typeof r === 'string' && (await isDir(r))) this.root = await fs.promises.realpath(r);
    } catch {
      this.root = null;
    }
  }

  private settingsFile(): string {
    return path.join(app.getPath('userData'), SETTINGS_FILE);
  }

  private suggested(): string {
    return path.join(app.getPath('documents'), 'Dungeon Crucible');
  }

  info(): RootInfo {
    return { root: this.root, suggested: this.suggested() };
  }

  /**
   * Sets the root: the suggested folder (created if needed) or one the user picks. Creates
   * `library/` and `campaigns/` in it.
   */
  async choose(win: BrowserWindow, useSuggested: boolean): Promise<RootInfo | null> {
    let folder: string;
    if (useSuggested) {
      folder = this.suggested();
    } else {
      const r = await dialog.showOpenDialog(win, { title: 'Folder for Dungeon Crucible', defaultPath: this.root ?? this.suggested(), properties: ['openDirectory', 'createDirectory'] });
      if (r.canceled || !r.filePaths[0]) return null;
      folder = r.filePaths[0];
    }
    await fs.promises.mkdir(path.join(folder, 'library'), { recursive: true });
    await fs.promises.mkdir(path.join(folder, 'campaigns'), { recursive: true });
    this.root = await fs.promises.realpath(folder);
    await writeAtomic(this.settingsFile(), JSON.stringify({ root: this.root }, null, 2));
    return this.info();
  }

  private requireRoot(): string {
    if (!this.root) throw new Error('No root folder');
    return this.root;
  }

  /**
   * An absolute path for `rel` inside the root. The deepest part that exists must really be
   * inside the root, so a symbolic link cannot lead out of it.
   */
  private async confined(rel: string): Promise<string> {
    const root = this.requireRoot();
    const abs = safeJoin(root, rel);
    let probe = abs;
    for (;;) {
      try {
        const real = await fs.promises.realpath(probe);
        if (real !== root && !isInside(root, real)) throw new Error(`Path not allowed: ${rel}`);
        return abs;
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
        const up = path.dirname(probe);
        if (up === probe) throw e;
        probe = up;
      }
    }
  }

  /* ---------- files (paths relative to the root) */

  async readText(rel: string): Promise<string> {
    return fs.promises.readFile(await this.confined(rel), 'utf8');
  }

  async writeText(rel: string, content: string): Promise<void> {
    return writeAtomic(await this.confined(rel), content);
  }

  async listFiles(dir: string): Promise<string[]> {
    const root = this.requireRoot();
    return listFilesIn(root, dir === '' || dir === '.' ? root : await this.confined(dir));
  }

  absolutePath(rel: string): Promise<string> {
    return this.confined(rel);
  }

  /** Whether a page may load this absolute file through the asset protocol: library files only. */
  async allowsAsset(absPath: string): Promise<string | null> {
    if (!this.root) return null;
    try {
      const real = await fs.promises.realpath(absPath);
      return isInside(path.join(this.root, 'library'), real) ? real : null;
    } catch {
      return null;
    }
  }

  /** Moves a file (and, unless told not to, its sidecar) to `.trash/<time>/<same path>`, never overwriting. */
  async trash(rel: string, withSidecar = true): Promise<void> {
    const root = this.requireRoot();
    const src = await this.confined(rel);
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const base = path.join(root, '.trash', stamp);
    const moves: [string, string][] = [[src, rel]];
    if (withSidecar) moves.push([`${src}${SIDECAR_SUFFIX}`, `${rel}${SIDECAR_SUFFIX}`]);
    for (const [from, relPath] of moves) {
      if (!fs.existsSync(from)) continue;
      const dest = safeJoin(base, relPath);
      await fs.promises.mkdir(path.dirname(dest), { recursive: true });
      await fs.promises.rename(from, dest);
    }
  }

  /* ---------- campaigns */

  /** Campaign folders (those with a manifest), with the manifest's last change. */
  async listCampaigns(): Promise<CampaignListEntry[]> {
    const dir = path.join(this.requireRoot(), 'campaigns');
    let entries: fs.Dirent[];
    try {
      entries = await fs.promises.readdir(dir, { withFileTypes: true });
    } catch {
      return [];
    }
    const out: CampaignListEntry[] = [];
    for (const e of entries) {
      if (!e.isDirectory() || e.name.startsWith('.')) continue;
      try {
        const st = await fs.promises.stat(path.join(dir, e.name, CAMPAIGN_FILE_NAME));
        out.push({ slug: e.name, modifiedAt: st.mtimeMs });
      } catch {
        /* no manifest: not a campaign */
      }
    }
    return out;
  }

  /** A new, empty campaign folder named after `name` (a free name under `campaigns/`). */
  async createCampaign(name: string): Promise<string> {
    const dir = path.join(this.requireRoot(), 'campaigns');
    await fs.promises.mkdir(dir, { recursive: true });
    const slug = freeName(dir, campaignSlug(name));
    await fs.promises.mkdir(path.join(dir, slug));
    return slug;
  }

  /** Moves a whole campaign folder to the trash. */
  async trashCampaign(slug: string): Promise<void> {
    if (!/^[a-z0-9][a-z0-9_-]*$/.test(slug)) throw new Error('Not a campaign');
    await this.trash(`campaigns/${slug}`);
  }

  /* ---------- library */

  /**
   * Picks a file and puts it into the library. A file the library already has (same content)
   * is not copied again; a name that is taken gets a free one.
   */
  async importToLibrary(win: BrowserWindow, kind: 'map' | 'audio'): Promise<LibraryImport | null> {
    const root = this.requireRoot();
    const r = await dialog.showOpenDialog(win, {
      properties: ['openFile'],
      filters: [kind === 'map' ? { name: 'Maps', extensions: MAP_EXTENSIONS } : { name: 'Audio', extensions: AUDIO_EXTENSIONS }],
    });
    const src = r.filePaths[0];
    if (r.canceled || !src) return null;
    return this.libraryImport(await addFileToLibrary(path.join(root, 'library'), src));
  }

  private libraryImport(added: { name: string; reused: boolean }): LibraryImport {
    const abs = path.join(this.requireRoot(), 'library', added.name);
    return { relPath: toRel(this.requireRoot(), abs), absPath: abs, reused: added.reused };
  }

  /** The library's files with their sidecars, in one go (Asset Vault, DC-040). */
  async listLibrary(): Promise<LibraryEntry[]> {
    return listLibrary(path.join(this.requireRoot(), 'library'));
  }

  /** Picks any number of asset files and puts them into the library. */
  async importAssets(win: BrowserWindow): Promise<LibraryImport[]> {
    const root = this.requireRoot();
    const r = await dialog.showOpenDialog(win, { properties: ['openFile', 'multiSelections'], filters: [{ name: 'Assets', extensions: ASSET_EXTENSIONS }] });
    if (r.canceled) return [];
    const out: LibraryImport[] = [];
    for (const src of r.filePaths) out.push(this.libraryImport(await addFileToLibrary(path.join(root, 'library'), src)));
    return out;
  }

  /** Puts a file dropped on the DM window into the library (its bytes, under its own name). */
  async importDropped(fileName: string, bytes: Uint8Array): Promise<LibraryImport> {
    return this.libraryImport(await addBytesToLibrary(path.join(this.requireRoot(), 'library'), fileName, bytes));
  }

  /* ---------- archives */

  /** Writes a campaign as .zip where the user picks; `libraryFiles` empty: campaign data only. */
  async exportArchive(win: BrowserWindow, slug: string, name: string, libraryFiles: string[]): Promise<ExportResult | null> {
    const root = this.requireRoot();
    const r = await dialog.showSaveDialog(win, {
      title: 'Export campaign',
      defaultPath: path.join(app.getPath('documents'), `${folderName(name)}.zip`),
      filters: [{ name: 'Campaign archive', extensions: ['zip'] }],
    });
    if (r.canceled || !r.filePath) return null;
    if (isInside(root, path.resolve(r.filePath))) return { ok: false, error: 'insideRoot' };
    try {
      const files = await writeArchive(await this.confined(`campaigns/${slug}`), path.join(root, 'library'), libraryFiles.map((f) => path.basename(f)), r.filePath);
      return { ok: true, file: r.filePath, files };
    } catch {
      return { ok: false, error: 'failed' };
    }
  }

  /** Imports a campaign archive into the root (campaign under `campaigns/`, files into the library). */
  async importArchive(win: BrowserWindow): Promise<ImportResultInfo | null> {
    const root = this.requireRoot();
    const r = await dialog.showOpenDialog(win, { title: 'Import campaign', properties: ['openFile'], filters: [{ name: 'Campaign archive', extensions: ['zip'] }] });
    const zip = r.filePaths[0];
    if (r.canceled || !zip) return null;
    try {
      const res = await importArchive(zip, root);
      return { ok: true, slug: res.slug, library: res.library };
    } catch (e) {
      return { ok: false, error: e instanceof ArchiveError ? e.code : 'failed' };
    }
  }
}

async function isDir(p: string): Promise<boolean> {
  try {
    return (await fs.promises.stat(p)).isDirectory();
  } catch {
    return false;
  }
}
