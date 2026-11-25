/**
 * Library files for the Asset Vault (E-27, DC-040), run in the main process: listing the library
 * in one go, adding files (a file the library already has, by content, is not copied again; a
 * taken name gets a free one), and the thumbnail cache in the app's data folder.
 *
 * Dropped files arrive as bytes, not as paths: the DM window never makes the main process read a
 * path outside the root folder.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { LibraryEntry } from '../src/platform/desktop-api';
import { SIDECAR_SUFFIX, freeName, sha256 } from './archive';

export const ASSET_EXTENSIONS = ['png', 'jpg', 'jpeg', 'webp', 'webm', 'mp4', 'mp3', 'ogg', 'oga', 'opus', 'wav', 'm4a', 'aac', 'flac'];

/** A dropped file may be at most this large. */
const MAX_DROP_BYTES = 1024 * 1024 * 1024;


/** The library's files (not sidecars, not hidden ones) with their sidecars. */
export async function listLibrary(library: string): Promise<LibraryEntry[]> {
  let names: string[];
  try {
    names = await fs.promises.readdir(library);
  } catch {
    return [];
  }
  const out: LibraryEntry[] = [];
  for (const name of names) {
    if (name.startsWith('.') || name.endsWith(SIDECAR_SUFFIX)) continue;
    let st: fs.Stats;
    try {
      st = await fs.promises.stat(path.join(library, name));
    } catch {
      // Gone meanwhile (a sync client) or a broken link: one file, not the whole list.
      continue;
    }
    if (!st.isFile()) continue;
    let sidecar: string | null = null;
    try {
      sidecar = await fs.promises.readFile(path.join(library, name + SIDECAR_SUFFIX), 'utf8');
    } catch {
      /* none */
    }
    out.push({ name, size: st.size, mtimeMs: st.mtimeMs, sidecar });
  }
  return out;
}

/** A library file with the same content (same size first, then the hash), if any. */
async function sameContent(library: string, size: number, hash: () => Promise<string>): Promise<string | null> {
  for (const name of await fs.promises.readdir(library)) {
    if (name.endsWith(SIDECAR_SUFFIX) || name.startsWith('.')) continue;
    const candidate = path.join(library, name);
    const st = await fs.promises.stat(candidate).catch(() => null);
    if (!st?.isFile() || st.size !== size) continue;
    if ((await sha256(candidate)) === (await hash())) return name;
  }
  return null;
}

function once<T>(fn: () => Promise<T>): () => Promise<T> {
  let p: Promise<T> | null = null;
  return () => (p ??= fn());
}

/** Copies a file (picked in the native dialog) into the library. */
export async function addFileToLibrary(library: string, src: string): Promise<{ name: string; reused: boolean }> {
  await fs.promises.mkdir(library, { recursive: true });
  const size = (await fs.promises.stat(src)).size;
  const existing = await sameContent(library, size, once(() => sha256(src)));
  if (existing) return { name: existing, reused: true };
  return { name: await copyIn(library, src, path.basename(src)), reused: false };
}

/** Writes a dropped file's bytes into the library under its own (base) name, for supported types only. */
export async function addBytesToLibrary(library: string, fileName: string, bytes: Uint8Array): Promise<{ name: string; reused: boolean }> {
  const ext = path.extname(fileName).slice(1).toLowerCase();
  if (fileName !== path.basename(fileName) || fileName.startsWith('.') || !ASSET_EXTENSIONS.includes(ext)) throw new Error('Not an asset file');
  if (bytes.byteLength > MAX_DROP_BYTES) throw new Error('File too large');
  await fs.promises.mkdir(library, { recursive: true });
  const existing = await sameContent(library, bytes.byteLength, once(async () => crypto.createHash('sha256').update(bytes).digest('hex')));
  if (existing) return { name: existing, reused: true };
  const name = freeName(library, fileName);
  // Written aside first: a crash leaves no half file in the library. `link` never replaces a file.
  const tmp = path.join(library, `.${name}.tmp-drop`);
  await fs.promises.writeFile(tmp, bytes);
  try {
    await fs.promises.link(tmp, path.join(library, name));
  } finally {
    await fs.promises.rm(tmp, { force: true });
  }
  return { name, reused: false };
}

const KEY = /^[a-f0-9]{16,64}$/;
const MAX_THUMB_BYTES = 512 * 1024;

function isThumbImage(b: Uint8Array): boolean {
  const ascii = (from: number, to: number) => String.fromCharCode(...b.subarray(from, to));
  const png = b[0] === 0x89 && ascii(1, 4) === 'PNG';
  const webp = ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP';
  return b.byteLength >= 12 && (png || webp);
}

/**
 * Thumbnails of library files, on this device only (app data folder, E-27): made by the DM
 * window, stored and read here by key. Only PNG and WebP images of limited size are kept.
 */
export class ThumbCache {
  constructor(private readonly dir: string) {}

  private file(key: string): string {
    if (!KEY.test(key)) throw new Error('Bad thumbnail key');
    return path.join(this.dir, `${key}.img`);
  }

  async read(key: string): Promise<Uint8Array | null> {
    const file = this.file(key);
    try {
      return new Uint8Array(await fs.promises.readFile(file));
    } catch {
      return null;
    }
  }

  async write(key: string, bytes: Uint8Array): Promise<void> {
    const file = this.file(key);
    if (bytes.byteLength > MAX_THUMB_BYTES || !isThumbImage(bytes)) throw new Error('Not a thumbnail');
    await fs.promises.mkdir(this.dir, { recursive: true });
    // Written aside, then renamed: a broken thumbnail is never kept.
    await fs.promises.writeFile(`${file}.tmp`, bytes);
    await fs.promises.rename(`${file}.tmp`, file);
  }
}

/* ---------- Pack import (DC-040b) ---------- */

export interface PackFolder {
  /** Path inside the pack, `/`-separated; '' is the pack folder itself. */
  path: string;
  /** Asset files directly in it. */
  files: number;
  bytes: number;
}

export interface PackScan {
  name: string;
  folders: PackFolder[];
}

interface PackEntry {
  folder: string;
  packPath: string;
  abs: string;
  size: number;
}

/**
 * Every folder of a pack and its asset files. Hidden files and folders, sidecars, other file
 * types and links are left out – a link could lead out of the pack.
 */
async function walkPack(dir: string): Promise<{ folders: PackFolder[]; files: PackEntry[] }> {
  const folders: PackFolder[] = [];
  const files: PackEntry[] = [];
  const visit = async (rel: string): Promise<void> => {
    const here: PackFolder = { path: rel, files: 0, bytes: 0 };
    folders.push(here);
    const abs = rel ? path.join(dir, ...rel.split('/')) : dir;
    const names = (await fs.promises.readdir(abs)).sort();
    for (const name of names) {
      if (name.startsWith('.')) continue;
      const full = path.join(abs, name);
      const st = await fs.promises.lstat(full).catch(() => null);
      if (!st || st.isSymbolicLink()) continue;
      const childRel = rel ? `${rel}/${name}` : name;
      if (st.isDirectory()) await visit(childRel);
      else if (st.isFile() && !name.endsWith(SIDECAR_SUFFIX) && ASSET_EXTENSIONS.includes(path.extname(name).slice(1).toLowerCase())) {
        here.files++;
        here.bytes += st.size;
        files.push({ folder: rel, packPath: childRel, abs: full, size: st.size });
      }
    }
  };
  await visit('');
  folders.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  return { folders, files };
}

/** What the DM chooses from: the pack's name and its folders with their asset files. */
export async function scanPack(dir: string): Promise<PackScan> {
  return { name: path.basename(dir), folders: (await walkPack(dir)).folders };
}

/** The library's files by size, with their hashes once needed: finds equal files fast in large imports. */
class LibraryIndex {
  private bySize = new Map<number, string[]>();
  private hashes = new Map<string, string>();

  private constructor(private readonly library: string) {}

  static async load(library: string): Promise<LibraryIndex> {
    const index = new LibraryIndex(library);
    for (const e of await listLibrary(library)) index.note(e.name, e.size);
    return index;
  }

  note(name: string, size: number, hash?: string): void {
    this.bySize.set(size, [...(this.bySize.get(size) ?? []), name]);
    if (hash) this.hashes.set(name, hash);
  }

  async find(size: number, hash: () => Promise<string>): Promise<string | null> {
    for (const name of this.bySize.get(size) ?? []) {
      let h = this.hashes.get(name);
      if (!h) {
        h = await sha256(path.join(this.library, name));
        this.hashes.set(name, h);
      }
      if (h === (await hash())) return name;
    }
    return null;
  }
}

/** Copies a file in under a free name: aside first, then linked, so a crash or cancel leaves no half file. */
async function copyIn(library: string, src: string, fileName: string): Promise<string> {
  const name = freeName(library, fileName);
  const tmp = path.join(library, `.${name}.tmp-copy`);
  await fs.promises.copyFile(src, tmp);
  try {
    await fs.promises.link(tmp, path.join(library, name));
  } finally {
    await fs.promises.rm(tmp, { force: true });
  }
  return name;
}

export interface PackFile {
  /** Path inside the pack. */
  packPath: string;
  /** File name in the library. */
  name: string;
  reused: boolean;
}

export interface PackRun {
  onProgress(done: number, total: number, packPath: string): void;
  /** Asked before each file: true stops the import (files already copied stay). */
  cancelled(): boolean;
}

/**
 * Copies the asset files of the chosen folders (only folders the scan found) into the flat
 * library, one by one: an equal file is reused, a taken name gets a free one.
 */
export async function importPack(dir: string, library: string, chosen: readonly string[], run: PackRun): Promise<PackFile[]> {
  const { folders, files } = await walkPack(dir);
  const known = new Set(folders.map((f) => f.path));
  for (const f of chosen) if (!known.has(f)) throw new Error('Not a folder of the pack');
  const wanted = new Set(chosen);
  const todo = files.filter((f) => wanted.has(f.folder)).sort((a, b) => (a.packPath < b.packPath ? -1 : 1));
  await fs.promises.mkdir(library, { recursive: true });
  const index = await LibraryIndex.load(library);
  const out: PackFile[] = [];
  for (const f of todo) {
    if (run.cancelled()) break;
    const hash = once(() => sha256(f.abs));
    const existing = await index.find(f.size, hash);
    if (existing) out.push({ packPath: f.packPath, name: existing, reused: true });
    else {
      const name = await copyIn(library, f.abs, path.basename(f.abs));
      index.note(name, f.size, await hash());
      out.push({ packPath: f.packPath, name, reused: false });
    }
    run.onProgress(out.length, todo.length, f.packPath);
  }
  return out;
}
