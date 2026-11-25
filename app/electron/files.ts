/**
 * Campaign folder file access and file responses for the custom protocols. Every path from
 * a page is relative to the campaign folder; anything that would leave it is refused.
 * (Port of the former Rust module `campaign.rs`.)
 */
import fs from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';

/** Joins `rel` onto `root`, rejecting empty, absolute paths, drive letters and `..`. */
export function safeJoin(root: string, rel: string): string {
  if (rel.length === 0) throw new Error('Empty path');
  if (/^[\\/]/.test(rel) || /^[a-zA-Z]:/.test(rel) || path.isAbsolute(rel)) throw new Error(`Path not allowed: ${rel}`);
  const parts: string[] = [];
  for (const part of rel.split(/[\\/]+/)) {
    if (part === '' || part === '.') continue;
    if (part === '..') throw new Error(`Path not allowed: ${rel}`);
    parts.push(part);
  }
  if (parts.length === 0) throw new Error('Empty path');
  return path.join(root, ...parts);
}

/** `p` relative to `root`, with forward slashes. */
export function toRel(root: string, p: string): string {
  return path.relative(root, p).split(path.sep).join('/');
}

/** True when `p` is `root` itself or lies inside it (both already resolved). */
export function isInside(root: string, p: string): boolean {
  const r = path.relative(root, p);
  return r === '' || (!r.startsWith('..') && !path.isAbsolute(r));
}

/** `dir/name`, or `dir/stem-2.ext`, `-3`, … if taken. */
export function uniquePath(dir: string, name: string, exists: (p: string) => boolean = fs.existsSync): string {
  const candidate = path.join(dir, name);
  if (!exists(candidate)) return candidate;
  const ext = path.extname(name);
  const stem = name.slice(0, name.length - ext.length);
  for (let i = 2; ; i++) {
    const c = path.join(dir, `${stem}-${i}${ext}`);
    if (!exists(c)) return c;
  }
}

/** Writes atomically: temp file next to the target, then rename. */
export async function writeAtomic(file: string, content: string): Promise<void> {
  await fs.promises.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp-write`;
  await fs.promises.writeFile(tmp, content, 'utf8');
  await fs.promises.rename(tmp, file);
}

/** Files (not folders) directly inside `dir`, relative to `root`, sorted. */
export async function listFilesIn(root: string, dir: string): Promise<string[]> {
  let entries: fs.Dirent[];
  try {
    entries = await fs.promises.readdir(dir, { withFileTypes: true });
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw e;
  }
  return entries.filter((e) => e.isFile()).map((e) => toRel(root, path.join(dir, e.name))).sort();
}

export type ByteRange = { start: number; end: number } | 'unsatisfiable' | null;

/** Parses a single `Range: bytes=…` header against a file size. null = whole file. */
export function parseRange(header: string | null, size: number): ByteRange {
  if (!header) return null;
  const m = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!m || (m[1] === '' && m[2] === '')) return null;
  let start: number;
  let end: number;
  if (m[1] === '') {
    // Suffix: the last N bytes.
    const n = Number(m[2]);
    if (n === 0) return 'unsatisfiable';
    start = Math.max(0, size - n);
    end = size - 1;
  } else {
    start = Number(m[1]);
    end = m[2] === '' ? size - 1 : Math.min(Number(m[2]), size - 1);
  }
  if (start >= size || start > end) return 'unsatisfiable';
  return { start, end };
}

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.oga': 'audio/ogg',
  '.opus': 'audio/ogg',
  '.wav': 'audio/wav',
  '.m4a': 'audio/mp4',
  '.aac': 'audio/aac',
  '.flac': 'audio/flac',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.wasm': 'application/wasm',
  '.md': 'text/markdown; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
};

export function mimeType(file: string): string {
  return MIME[path.extname(file).toLowerCase()] ?? 'application/octet-stream';
}

/** A file as an HTTP-like response, honouring a Range header (needed for video). */
export async function fileResponse(file: string, rangeHeader: string | null, extra: Record<string, string> = {}): Promise<Response> {
  let stat: fs.Stats;
  try {
    stat = await fs.promises.stat(file);
  } catch {
    return new Response('Not found', { status: 404 });
  }
  if (!stat.isFile()) return new Response('Not found', { status: 404 });
  const headers: Record<string, string> = { 'Content-Type': mimeType(file), 'Accept-Ranges': 'bytes', ...extra };
  const range = parseRange(rangeHeader, stat.size);
  if (range === 'unsatisfiable') {
    return new Response(null, { status: 416, headers: { ...headers, 'Content-Range': `bytes */${stat.size}` } });
  }
  const body = (opts?: { start: number; end: number }) => Readable.toWeb(fs.createReadStream(file, opts)) as unknown as ReadableStream<Uint8Array>;
  if (range) {
    return new Response(body(range), {
      status: 206,
      headers: { ...headers, 'Content-Length': String(range.end - range.start + 1), 'Content-Range': `bytes ${range.start}-${range.end}/${stat.size}` },
    });
  }
  return new Response(stat.size === 0 ? null : body(), { status: 200, headers: { ...headers, 'Content-Length': String(stat.size) } });
}

/** A campaign name as a folder/file name: no path separators or characters some systems refuse. */
export function folderName(name: string): string {
  const clean = name.replace(/[\\/:*?"<>|\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').replace(/^[.\s]+/, '').trim();
  return clean.slice(0, 80) || 'Campaign';
}
