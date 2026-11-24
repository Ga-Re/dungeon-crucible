/**
 * Campaigns as archives (.zip): export a campaign folder, import one into a new folder.
 * Both stream, so large maps and videos never sit in memory as a whole.
 *
 * An archive is untrusted: `planExtraction` accepts only plain files with relative paths inside
 * the target (no absolute paths, no `..`, no symbolic links), within size and count limits, and
 * only when it holds a campaign (`campaign.dm.json` at the top or in one top-level folder).
 */
import fs from 'node:fs';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import yauzl from 'yauzl';
import yazl from 'yazl';

/** The campaign manifest (same name as `CAMPAIGN_FILE` in `src/core/sidecar.ts`). */
export const CAMPAIGN_FILE_NAME = 'campaign.dm.json';

export const ARCHIVE_LIMITS = {
  /** Total size of all files once extracted. */
  maxBytes: 32 * 1024 ** 3,
  maxEntries: 50_000,
};

export interface ArchiveEntryInfo {
  fileName: string;
  uncompressedSize: number;
  /** Unix mode from the archive (0 if unknown). */
  mode: number;
}

export interface ExtractionPlan {
  /** Path inside the archive that is the campaign folder ('' or 'Name/'). */
  prefix: string;
  /** Archive file name → path relative to the target folder. */
  files: Map<string, string>;
  totalBytes: number;
}

export class ArchiveError extends Error {
  constructor(readonly code: 'notCampaign' | 'unsafe' | 'tooLarge' | 'targetNotEmpty') {
    super(code);
  }
}

/** Files that are packed by operating systems, not part of a campaign. */
function isJunk(rel: string): boolean {
  const parts = rel.split('/');
  return parts[0] === '__MACOSX' || parts.some((p) => p === '.DS_Store' || p === 'Thumbs.db');
}

const S_IFMT = 0o170000;
const S_IFLNK = 0o120000;

/** Checks every entry and decides where each file goes. Throws `ArchiveError`. */
export function planExtraction(entries: readonly ArchiveEntryInfo[]): ExtractionPlan {
  if (entries.length > ARCHIVE_LIMITS.maxEntries) throw new ArchiveError('tooLarge');
  const files: { name: string; rel: string; size: number }[] = [];
  for (const e of entries) {
    const rel = e.fileName.replace(/\\/g, '/');
    if (rel.endsWith('/')) continue; // directory
    if (isJunk(rel)) continue;
    if (rel.startsWith('/') || /^[a-zA-Z]:/.test(rel)) throw new ArchiveError('unsafe');
    const parts = rel.split('/');
    if (parts.some((p) => p === '..' || p === '' || p === '.')) throw new ArchiveError('unsafe');
    if ((e.mode & S_IFMT) === S_IFLNK) throw new ArchiveError('unsafe');
    files.push({ name: e.fileName, rel, size: e.uncompressedSize });
  }
  const totalBytes = files.reduce((s, f) => s + f.size, 0);
  if (totalBytes > ARCHIVE_LIMITS.maxBytes) throw new ArchiveError('tooLarge');

  let prefix: string | null = null;
  if (files.some((f) => f.rel === CAMPAIGN_FILE_NAME)) prefix = '';
  else {
    const tops = new Set(files.map((f) => f.rel.split('/')[0]!));
    const top = [...tops][0];
    if (tops.size === 1 && top && files.some((f) => f.rel === `${top}/${CAMPAIGN_FILE_NAME}`)) prefix = `${top}/`;
  }
  if (prefix === null) throw new ArchiveError('notCampaign');

  const out = new Map<string, string>();
  for (const f of files) {
    if (!f.rel.startsWith(prefix)) continue;
    out.set(f.name, f.rel.slice(prefix.length));
  }
  return { prefix, files: out, totalBytes };
}

function openZip(file: string): Promise<yauzl.ZipFile> {
  return new Promise((resolve, reject) => {
    yauzl.open(file, { lazyEntries: true, autoClose: false, decodeStrings: true, validateEntrySizes: true, strictFileNames: false }, (err, zip) => (err || !zip ? reject(err ?? new Error('zip')) : resolve(zip)));
  });
}

function readEntries(zip: yauzl.ZipFile): Promise<yauzl.Entry[]> {
  return new Promise((resolve, reject) => {
    const list: yauzl.Entry[] = [];
    zip.on('entry', (e: yauzl.Entry) => {
      list.push(e);
      if (list.length > ARCHIVE_LIMITS.maxEntries) {
        reject(new ArchiveError('tooLarge'));
        return;
      }
      zip.readEntry();
    });
    zip.on('end', () => resolve(list));
    zip.on('error', reject);
    zip.readEntry();
  });
}

function entryStream(zip: yauzl.ZipFile, e: yauzl.Entry): Promise<NodeJS.ReadableStream> {
  return new Promise((resolve, reject) => zip.openReadStream(e, (err, s) => (err || !s ? reject(err ?? new Error('zip')) : resolve(s))));
}

/** Reads the campaign name from an archive's manifest (for the suggested folder name). */
export async function archiveCampaignName(zipFile: string): Promise<string | null> {
  const zip = await openZip(zipFile);
  try {
    const entries = await readEntries(zip);
    const plan = planExtraction(entries.map(toInfo));
    const manifest = entries.find((e) => plan.files.get(e.fileName) === CAMPAIGN_FILE_NAME);
    if (!manifest || manifest.uncompressedSize > 1024 * 1024) return null;
    const chunks: Buffer[] = [];
    for await (const c of (await entryStream(zip, manifest)) as AsyncIterable<Buffer>) chunks.push(c);
    const name: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'))?.name;
    return typeof name === 'string' && name.trim() ? name.trim() : null;
  } catch (e) {
    if (e instanceof ArchiveError) throw e;
    return null;
  } finally {
    zip.close();
  }
}

function toInfo(e: yauzl.Entry): ArchiveEntryInfo {
  return { fileName: e.fileName, uncompressedSize: e.uncompressedSize, mode: (e.externalFileAttributes >>> 16) & 0xffff };
}

/** Extracts the campaign in `zipFile` into `target`, which must not exist or be empty. */
export async function extractArchive(zipFile: string, target: string): Promise<void> {
  if (fs.existsSync(target) && (await fs.promises.readdir(target)).length > 0) throw new ArchiveError('targetNotEmpty');
  const zip = await openZip(zipFile);
  try {
    const entries = await readEntries(zip);
    const plan = planExtraction(entries.map(toInfo));
    await fs.promises.mkdir(target, { recursive: true });
    const root = await fs.promises.realpath(target);
    for (const e of entries) {
      const rel = plan.files.get(e.fileName);
      if (rel === undefined) continue;
      const dest = path.join(root, ...rel.split('/'));
      if (!dest.startsWith(root + path.sep)) throw new ArchiveError('unsafe');
      await fs.promises.mkdir(path.dirname(dest), { recursive: true });
      await pipeline(await entryStream(zip, e), fs.createWriteStream(dest, { flags: 'wx' }));
    }
  } finally {
    zip.close();
  }
}

/** All files of a campaign folder (no hidden files, no symbolic links), as relative paths. */
async function campaignFiles(root: string, dir = root): Promise<string[]> {
  const out: string[] = [];
  for (const d of await fs.promises.readdir(dir, { withFileTypes: true })) {
    if (d.name.startsWith('.')) continue;
    const abs = path.join(dir, d.name);
    if (d.isDirectory()) out.push(...(await campaignFiles(root, abs)));
    else if (d.isFile()) out.push(path.relative(root, abs).split(path.sep).join('/'));
  }
  return out.sort();
}

/**
 * Writes the campaign folder `root` as `zipFile` (inside a top-level folder `folderName`).
 * Written to a temporary file first, so a failed export never leaves a broken archive.
 */
export async function writeArchive(root: string, zipFile: string, folderName: string): Promise<number> {
  const files = await campaignFiles(root);
  const zip = new yazl.ZipFile();
  for (const rel of files) {
    // Media is compressed already; storing it is faster and as small.
    const compress = !/\.(png|jpe?g|webp|gif|mp4|webm|mp3|ogg|oga|opus|m4a|aac|flac)$/i.test(rel);
    zip.addFile(path.join(root, ...rel.split('/')), `${folderName}/${rel}`, { compress });
  }
  zip.end();
  const tmp = `${zipFile}.part`;
  try {
    await pipeline(zip.outputStream, fs.createWriteStream(tmp));
    await fs.promises.rename(tmp, zipFile);
  } catch (e) {
    await fs.promises.rm(tmp, { force: true });
    throw e;
  }
  return files.length;
}
