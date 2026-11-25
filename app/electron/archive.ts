/**
 * Campaigns as archives (.zip), streamed so large maps and videos never sit in memory whole.
 *
 * Layout:
 *   campaign/…          the campaign folder (campaign.dm.json, scenes/, …)
 *   library/<file>      optional: library files the campaign uses (flat, sidecars included)
 * Older archives (the campaign folder at the top, or in one top-level folder) are read as
 * campaign-only archives.
 *
 * An archive is untrusted: `planExtraction` accepts only plain files with relative paths (no
 * absolute paths, no `..`, no symbolic links), within size and count limits, and only when it
 * holds a campaign.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import yauzl from 'yauzl';
import yazl from 'yazl';

/** The campaign manifest (same name as `CAMPAIGN_FILE` in `src/core/sidecar.ts`). */
export const CAMPAIGN_FILE_NAME = 'campaign.dm.json';
export const SIDECAR_SUFFIX = '.dm.json';

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
  /** Archive file name → path inside the campaign folder. */
  campaign: Map<string, string>;
  /** Archive file name → file name in the library (flat). */
  library: Map<string, string>;
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

  const campaign = new Map<string, string>();
  const library = new Map<string, string>();
  if (files.some((f) => f.rel === `campaign/${CAMPAIGN_FILE_NAME}`)) {
    for (const f of files) {
      if (f.rel.startsWith('campaign/')) campaign.set(f.name, f.rel.slice('campaign/'.length));
      // Library files are flat; anything deeper is not ours and is left out.
      else if (/^library\/[^/]+$/.test(f.rel)) library.set(f.name, f.rel.slice('library/'.length));
    }
    return { campaign, library, totalBytes };
  }
  // Older archives: the campaign at the top or in one top-level folder.
  let prefix: string | null = null;
  if (files.some((f) => f.rel === CAMPAIGN_FILE_NAME)) prefix = '';
  else {
    const tops = new Set(files.map((f) => f.rel.split('/')[0]!));
    const top = [...tops][0];
    if (tops.size === 1 && top && files.some((f) => f.rel === `${top}/${CAMPAIGN_FILE_NAME}`)) prefix = `${top}/`;
  }
  if (prefix === null) throw new ArchiveError('notCampaign');
  for (const f of files) if (f.rel.startsWith(prefix)) campaign.set(f.name, f.rel.slice(prefix.length));
  return { campaign, library, totalBytes };
}

/* ---------------------------------------------------------------- zip reading */

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

function toInfo(e: yauzl.Entry): ArchiveEntryInfo {
  return { fileName: e.fileName, uncompressedSize: e.uncompressedSize, mode: (e.externalFileAttributes >>> 16) & 0xffff };
}

export async function sha256(file: string): Promise<string> {
  const h = crypto.createHash('sha256');
  for await (const chunk of fs.createReadStream(file) as AsyncIterable<Buffer>) h.update(chunk);
  return h.digest('hex');
}

/* ---------------------------------------------------------------- import */

export interface ImportResult {
  /** Folder name under `campaigns/`. */
  slug: string;
  library: { added: number; reused: number; renamed: number; kept: number };
}

/** A campaign name as a folder name (lowercase, see `documents.ts`). */
export function campaignSlug(name: string): string {
  const s = name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  return s || 'campaign';
}

export function freeName(dir: string, name: string): string {
  if (!fs.existsSync(path.join(dir, name))) return name;
  const ext = name.endsWith(SIDECAR_SUFFIX) ? '' : path.extname(name);
  const stem = name.slice(0, name.length - ext.length);
  for (let i = 2; ; i++) if (!fs.existsSync(path.join(dir, `${stem}-${i}${ext}`))) return `${stem}-${i}${ext}`;
}

/** Media files are renamed on a clash (their references are rewritten); other files keep the library's copy. */
const MEDIA = /\.(png|jpe?g|webp|gif|mp4|webm|mp3|ogg|oga|opus|wav|m4a|aac|flac)$/i;

/**
 * Imports a campaign archive into the root folder: the campaign into `campaigns/<free slug>/`,
 * library files into `library/` (same content: not copied again; a media file with the same name
 * but other content: renamed, and the campaign's references to it rewritten; other files: the
 * library's own copy wins).
 */
export async function importArchive(zipFile: string, rootDir: string): Promise<ImportResult> {
  const zip = await openZip(zipFile);
  const work = path.join(rootDir, `.import-${crypto.randomBytes(4).toString('hex')}`);
  try {
    const entries = await readEntries(zip);
    const plan = planExtraction(entries.map(toInfo));
    const extract = async (e: yauzl.Entry, dest: string) => {
      if (!dest.startsWith(work + path.sep)) throw new ArchiveError('unsafe');
      await fs.promises.mkdir(path.dirname(dest), { recursive: true });
      await pipeline(await entryStream(zip, e), fs.createWriteStream(dest, { flags: 'wx' }));
    };
    for (const e of entries) {
      const c = plan.campaign.get(e.fileName);
      if (c !== undefined) await extract(e, path.join(work, 'campaign', ...c.split('/')));
      const l = plan.library.get(e.fileName);
      if (l !== undefined) await extract(e, path.join(work, 'library', l));
    }

    // Library files: media first, so their sidecars can follow them.
    const libraryDir = path.join(rootDir, 'library');
    await fs.promises.mkdir(libraryDir, { recursive: true });
    const result: ImportResult['library'] = { added: 0, reused: 0, renamed: 0, kept: 0 };
    const renames = new Map<string, string>();
    const reused = new Set<string>();
    const names = [...plan.library.values()];
    const media = names.filter((n) => !n.endsWith(SIDECAR_SUFFIX));
    for (const name of media) {
      const src = path.join(work, 'library', name);
      const dest = path.join(libraryDir, name);
      if (!fs.existsSync(dest)) {
        await fs.promises.rename(src, dest);
        result.added++;
      } else if ((await sha256(src)) === (await sha256(dest))) {
        reused.add(name);
        result.reused++;
      } else if (MEDIA.test(name)) {
        const free = freeName(libraryDir, name);
        await fs.promises.rename(src, path.join(libraryDir, free));
        renames.set(name, free);
        result.renamed++;
      } else {
        result.kept++;
      }
    }
    for (const name of names.filter((n) => n.endsWith(SIDECAR_SUFFIX))) {
      const base = name.slice(0, -SIDECAR_SUFFIX.length);
      // A file the library already had keeps its own sidecar (its grid, walls …).
      if (reused.has(base)) continue;
      const target = renames.has(base) ? `${renames.get(base)!}${SIDECAR_SUFFIX}` : name;
      const dest = path.join(libraryDir, target);
      if (fs.existsSync(dest)) {
        result.kept++;
        continue;
      }
      await fs.promises.rename(path.join(work, 'library', name), dest);
    }

    // The campaign, with references to renamed library files rewritten.
    if (renames.size > 0) await rewriteReferences(path.join(work, 'campaign'), renames);
    const manifestName = await readManifestName(path.join(work, 'campaign', CAMPAIGN_FILE_NAME));
    const campaignsDir = path.join(rootDir, 'campaigns');
    await fs.promises.mkdir(campaignsDir, { recursive: true });
    const slug = freeName(campaignsDir, campaignSlug(manifestName ?? path.basename(zipFile, path.extname(zipFile))));
    await fs.promises.rename(path.join(work, 'campaign'), path.join(campaignsDir, slug));
    return { slug, library: result };
  } finally {
    zip.close();
    await fs.promises.rm(work, { recursive: true, force: true });
  }
}

async function readManifestName(file: string): Promise<string | null> {
  try {
    const name: unknown = JSON.parse(await fs.promises.readFile(file, 'utf8'))?.name;
    return typeof name === 'string' && name.trim() ? name.trim() : null;
  } catch {
    return null;
  }
}

/** Replaces `library/<old>` (and its sidecar path) in every string of every JSON file under `dir`. */
async function rewriteReferences(dir: string, renames: Map<string, string>): Promise<void> {
  const map = new Map<string, string>();
  for (const [from, to] of renames) {
    map.set(`library/${from}`, `library/${to}`);
    map.set(`library/${from}${SIDECAR_SUFFIX}`, `library/${to}${SIDECAR_SUFFIX}`);
  }
  const walk = (v: unknown): unknown => {
    if (typeof v === 'string') return map.get(v) ?? v;
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x)]));
    return v;
  };
  for (const rel of await filesUnder(dir)) {
    if (!rel.endsWith('.json')) continue;
    const file = path.join(dir, ...rel.split('/'));
    try {
      const json: unknown = JSON.parse(await fs.promises.readFile(file, 'utf8'));
      await fs.promises.writeFile(file, JSON.stringify(walk(json), null, 2));
    } catch {
      /* not JSON: leave it */
    }
  }
}

/* ---------------------------------------------------------------- export */

/** All files under `dir` (no hidden files, no symbolic links), relative, sorted. */
export async function filesUnder(dir: string, base = dir): Promise<string[]> {
  const out: string[] = [];
  for (const d of await fs.promises.readdir(dir, { withFileTypes: true })) {
    if (d.name.startsWith('.')) continue;
    const abs = path.join(dir, d.name);
    if (d.isDirectory()) out.push(...(await filesUnder(abs, base)));
    else if (d.isFile()) out.push(path.relative(base, abs).split(path.sep).join('/'));
  }
  return out.sort();
}

/**
 * Writes a campaign folder as an archive, with `libraryFiles` (names in the flat library;
 * their sidecars come along) or campaign-only (`[]`). Written to a temporary file first, so a
 * failed export never leaves a broken archive. Returns the number of files.
 */
export async function writeArchive(campaignDir: string, libraryDir: string, libraryFiles: readonly string[], zipFile: string): Promise<number> {
  const zip = new yazl.ZipFile();
  const compress = (name: string) => !MEDIA.test(name); // media is compressed already
  let count = 0;
  for (const rel of await filesUnder(campaignDir)) {
    zip.addFile(path.join(campaignDir, ...rel.split('/')), `campaign/${rel}`, { compress: compress(rel) });
    count++;
  }
  const added = new Set<string>();
  for (const name of libraryFiles) {
    for (const n of [name, `${name}${SIDECAR_SUFFIX}`]) {
      if (added.has(n) || n.includes('/') || n.includes('\\') || n.startsWith('.')) continue;
      const file = path.join(libraryDir, n);
      if (!fs.existsSync(file)) continue;
      zip.addFile(file, `library/${n}`, { compress: compress(n) });
      added.add(n);
      count++;
    }
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
  return count;
}
