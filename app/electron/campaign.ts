/**
 * The open campaign folder. Pages only ever pass paths relative to it.
 */
import { dialog, type BrowserWindow } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import type { CampaignInfo, ImportedFile } from '../src/platform/desktop-api';
import { isInside, listFilesIn, safeJoin, toRel, uniquePath, writeAtomic } from './files';

const MAP_EXTENSIONS = ['png', 'jpg', 'jpeg', 'webp', 'mp4', 'webm'];

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
  async importMap(win: BrowserWindow): Promise<ImportedFile | null> {
    const root = this.requireRoot();
    const r = await dialog.showOpenDialog(win, { properties: ['openFile'], filters: [{ name: 'Maps', extensions: MAP_EXTENSIONS }] });
    const src = r.filePaths[0];
    if (r.canceled || !src) return null;
    const maps = path.join(root, 'maps');
    await fs.promises.mkdir(maps, { recursive: true });
    const realSrc = await fs.promises.realpath(src);
    let dest: string;
    if (path.dirname(realSrc) === maps) {
      dest = realSrc; // already in maps/
    } else {
      dest = uniquePath(maps, path.basename(src));
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
