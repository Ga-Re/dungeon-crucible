/**
 * The open campaign folder. Pages only ever pass paths relative to it.
 */
import { dialog, type BrowserWindow } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import type { CampaignInfo, ImportedFile } from '../src/platform/desktop-api';
import { isInside, listFilesIn, safeJoin, toRel, uniquePath, writeAtomic } from './files';

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
