/**
 * The open campaign folder. Pages only ever pass paths relative to it. Also creates campaign
 * folders, and imports/exports campaigns as archives.
 */
import { app, dialog, type BrowserWindow } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import type { CampaignInfo, CampaignResult, ExportResult, ImportedFile, RecentStatus } from '../src/platform/desktop-api';
import { ArchiveError, CAMPAIGN_FILE_NAME, archiveCampaignName, extractArchive, writeArchive } from './archive';
import { folderName, isInside, listFilesIn, safeJoin, toRel, uniquePath, writeAtomic } from './files';

const MAP_EXTENSIONS = ['png', 'jpg', 'jpeg', 'webp', 'mp4', 'webm'];
const AUDIO_EXTENSIONS = ['mp3', 'ogg', 'oga', 'opus', 'wav', 'm4a', 'aac', 'flac'];

export class Campaign {
  private root: string | null = null;

  private requireRoot(): string {
    if (!this.root) throw new Error('No campaign folder open');
    return this.root;
  }

  async activate(folder: string): Promise<CampaignInfo> {
    const real = await fs.promises.realpath(folder);
    if (!(await fs.promises.stat(real)).isDirectory()) throw new Error('Not a folder');
    this.root = real;
    return { root: real, name: path.basename(real) };
  }

  async pick(win: BrowserWindow): Promise<CampaignInfo | null> {
    const r = await dialog.showOpenDialog(win, { title: 'Campaign folder', properties: ['openDirectory', 'createDirectory'] });
    const folder = r.filePaths[0];
    if (r.canceled || !folder) return null;
    return this.activate(folder);
  }

  /** No campaign open any more (back on the start screen). */
  close(): void {
    this.root = null;
  }

  /**
   * Creates a campaign folder: the user picks where (suggested: Documents/<name>). The folder
   * must be new or empty. The page writes the campaign's files afterwards.
   */
  async create(win: BrowserWindow, name: string): Promise<CampaignResult | null> {
    const r = await dialog.showSaveDialog(win, {
      title: 'New campaign',
      defaultPath: path.join(app.getPath('documents'), folderName(name)),
      buttonLabel: 'Create',
      properties: ['createDirectory'],
    });
    if (r.canceled || !r.filePath) return null;
    try {
      if (!(await isEmptyOrMissing(r.filePath))) return { ok: false, error: 'targetNotEmpty' };
      await fs.promises.mkdir(r.filePath, { recursive: true });
      return { ok: true, campaign: await this.activate(r.filePath) };
    } catch {
      return { ok: false, error: 'failed' };
    }
  }

  /** Imports a campaign archive (.zip) into a new folder the user picks. */
  async importArchive(win: BrowserWindow): Promise<CampaignResult | null> {
    const open = await dialog.showOpenDialog(win, { title: 'Import campaign', properties: ['openFile'], filters: [{ name: 'Campaign archive', extensions: ['zip'] }] });
    const zip = open.filePaths[0];
    if (open.canceled || !zip) return null;
    try {
      const name = (await archiveCampaignName(zip)) ?? path.basename(zip, path.extname(zip));
      const save = await dialog.showSaveDialog(win, {
        title: 'Folder for the imported campaign',
        defaultPath: path.join(app.getPath('documents'), folderName(name)),
        buttonLabel: 'Import',
        properties: ['createDirectory'],
      });
      if (save.canceled || !save.filePath) return null;
      await extractArchive(zip, save.filePath);
      return { ok: true, campaign: await this.activate(save.filePath) };
    } catch (e) {
      return { ok: false, error: e instanceof ArchiveError ? e.code : 'failed' };
    }
  }

  /** Writes the open campaign as an archive (.zip) where the user picks. */
  async exportArchive(win: BrowserWindow, name: string): Promise<ExportResult | null> {
    const root = this.requireRoot();
    const r = await dialog.showSaveDialog(win, {
      title: 'Export campaign',
      defaultPath: path.join(app.getPath('documents'), `${folderName(name)}.zip`),
      filters: [{ name: 'Campaign archive', extensions: ['zip'] }],
    });
    if (r.canceled || !r.filePath) return null;
    if (isInside(root, path.resolve(r.filePath))) return { ok: false, error: 'insideCampaign' };
    try {
      const files = await writeArchive(root, r.filePath, folderName(name));
      return { ok: true, file: r.filePath, files };
    } catch {
      return { ok: false, error: 'failed' };
    }
  }

  /** Whether each of these folders (recent campaigns) still holds a campaign. */
  async status(folders: unknown): Promise<RecentStatus[]> {
    if (!Array.isArray(folders)) return [];
    return Promise.all(
      folders.slice(0, 50).map(async (f): Promise<RecentStatus> => {
        if (typeof f !== 'string' || !path.isAbsolute(f)) return 'missing';
        try {
          return (await fs.promises.stat(path.join(f, CAMPAIGN_FILE_NAME))).isFile() ? 'ok' : 'missing';
        } catch {
          return 'missing';
        }
      }),
    );
  }

  readText(rel: string): Promise<string> {
    return fs.promises.readFile(safeJoin(this.requireRoot(), rel), 'utf8');
  }

  writeText(rel: string, content: string): Promise<void> {
    return writeAtomic(safeJoin(this.requireRoot(), rel), content);
  }

  listFiles(dir: string): Promise<string[]> {
    const root = this.requireRoot();
    return listFilesIn(root, dir === '' || dir === '.' ? root : safeJoin(root, dir));
  }

  absolutePath(rel: string): string {
    return safeJoin(this.requireRoot(), rel);
  }

  /** Picks an image or video map and copies it into `maps/`. */
  importMap(win: BrowserWindow): Promise<ImportedFile | null> {
    return this.importInto(win, 'Maps', MAP_EXTENSIONS, 'maps');
  }

  /** Picks an audio file and copies it into `audio/` (ambience) or `audio/sfx/` (sound effects). */
  importAudio(win: BrowserWindow, sfx: boolean): Promise<ImportedFile | null> {
    return this.importInto(win, 'Audio', AUDIO_EXTENSIONS, sfx ? 'audio/sfx' : 'audio');
  }

  private async importInto(win: BrowserWindow, filter: string, extensions: string[], folder: string): Promise<ImportedFile | null> {
    const root = this.requireRoot();
    const r = await dialog.showOpenDialog(win, { properties: ['openFile'], filters: [{ name: filter, extensions }] });
    const src = r.filePaths[0];
    if (r.canceled || !src) return null;
    const dir = safeJoin(root, folder);
    await fs.promises.mkdir(dir, { recursive: true });
    const realSrc = await fs.promises.realpath(src);
    let dest: string;
    if (path.dirname(realSrc) === (await fs.promises.realpath(dir))) {
      dest = realSrc; // already there
    } else {
      dest = uniquePath(dir, path.basename(src));
      await fs.promises.copyFile(src, dest);
    }
    return { relPath: toRel(root, dest), absPath: dest };
  }

  /** Whether a page may load this absolute file through the asset protocol. */
  async allows(absPath: string): Promise<string | null> {
    if (!this.root) return null;
    try {
      const real = await fs.promises.realpath(absPath);
      return isInside(this.root, real) ? real : null;
    } catch {
      return null;
    }
  }
}

async function isEmptyOrMissing(dir: string): Promise<boolean> {
  try {
    return (await fs.promises.readdir(dir)).filter((n) => n !== '.DS_Store').length === 0;
  } catch (e) {
    return (e as NodeJS.ErrnoException).code === 'ENOENT';
  }
}

