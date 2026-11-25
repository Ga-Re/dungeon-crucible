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
  const name = freeName(library, path.basename(src));
  await fs.promises.copyFile(src, path.join(library, name), fs.constants.COPYFILE_EXCL);
  return { name, reused: false };
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
