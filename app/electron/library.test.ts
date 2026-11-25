// @vitest-environment node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { addBytesToLibrary, addFileToLibrary, importPack, listLibrary, scanPack, ThumbCache } from './library';

/** Library files and the thumbnail cache (DC-040), in a temporary folder. */
let tmp = '';
let library = '';
beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dc-library-'));
  library = path.join(tmp, 'library');
  fs.mkdirSync(library);
});
afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);

describe('listLibrary', () => {
  it('lists the files with size, time and sidecar text; no sidecars or hidden files', async () => {
    fs.writeFileSync(path.join(library, 'oak.png'), PNG);
    fs.writeFileSync(path.join(library, 'oak.png.dm.json'), '{"kind":"asset"}');
    fs.writeFileSync(path.join(library, 'wind.ogg'), 'ogg');
    fs.writeFileSync(path.join(library, '.DS_Store'), 'x');
    fs.mkdirSync(path.join(library, 'sub'));
    const list = (await listLibrary(library)).sort((a, b) => a.name.localeCompare(b.name));
    expect(list.map((e) => [e.name, e.size, e.sidecar])).toEqual([
      ['oak.png', PNG.length, '{"kind":"asset"}'],
      ['wind.ogg', 3, null],
    ]);
    expect(list[0].mtimeMs).toBeGreaterThan(0);
  });

  it('is empty without a library folder', async () => {
    expect(await listLibrary(path.join(tmp, 'none'))).toEqual([]);
  });
});

describe('adding files', () => {
  it('copies a file; the same content again is not copied; a taken name gets a free one', async () => {
    const src = path.join(tmp, 'tree.png');
    fs.writeFileSync(src, PNG);
    expect(await addFileToLibrary(library, src)).toEqual({ name: 'tree.png', reused: false });
    expect(await addFileToLibrary(library, src)).toEqual({ name: 'tree.png', reused: true });
    const other = path.join(tmp, 'other', 'tree.png');
    fs.mkdirSync(path.dirname(other));
    fs.writeFileSync(other, Buffer.concat([PNG, Buffer.from([9])]));
    expect(await addFileToLibrary(library, other)).toEqual({ name: 'tree-2.png', reused: false });
  });

  it('adds dropped bytes under their own name only, for supported types', async () => {
    expect(await addBytesToLibrary(library, 'rock.webp', new Uint8Array(PNG))).toEqual({ name: 'rock.webp', reused: false });
    expect(await addBytesToLibrary(library, 'rock-copy.webp', new Uint8Array(PNG))).toEqual({ name: 'rock.webp', reused: true });
    await expect(addBytesToLibrary(library, '../evil.png', new Uint8Array(PNG))).rejects.toThrow();
    await expect(addBytesToLibrary(library, 'notes.exe', new Uint8Array(PNG))).rejects.toThrow();
    await expect(addBytesToLibrary(library, 'x.dm.json', new Uint8Array(PNG))).rejects.toThrow();
  });
});

describe('ThumbCache', () => {
  const key = 'a'.repeat(40);
  const webp = new Uint8Array([...Buffer.from('RIFF'), 0, 0, 0, 0, ...Buffer.from('WEBP'), 1, 2]);

  it('keeps thumbnails by key in its folder', async () => {
    const cache = new ThumbCache(path.join(tmp, 'thumbs'));
    expect(await cache.read(key)).toBeNull();
    await cache.write(key, webp);
    expect(Array.from((await cache.read(key))!)).toEqual(Array.from(webp));
  });

  it('refuses odd keys, non-images and large files', async () => {
    const cache = new ThumbCache(path.join(tmp, 'thumbs'));
    await expect(cache.write('../x', webp)).rejects.toThrow();
    await expect(cache.read('../../settings')).rejects.toThrow();
    await expect(cache.write(key, new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]))).rejects.toThrow();
    await expect(cache.write(key, new Uint8Array(600 * 1024).fill(0).map((v, i) => (i < 12 ? webp[i] : v)))).rejects.toThrow();
  });
});

describe('pack import (DC-040b)', () => {
  let pack = '';
  beforeEach(() => {
    pack = path.join(tmp, 'Forest Pack');
    const put = (rel: string, data: Buffer | string) => {
      fs.mkdirSync(path.dirname(path.join(pack, rel)), { recursive: true });
      fs.writeFileSync(path.join(pack, rel), data);
    };
    put('Trees/Oak/oak_01.png', Buffer.concat([PNG, Buffer.from('1')]));
    put('Trees/Oak/oak_02.png', Buffer.concat([PNG, Buffer.from('2')]));
    put('Trees/readme.txt', 'x');
    put('Rocks/rock.png', Buffer.concat([PNG, Buffer.from('r')]));
    put('Rocks/rock-copy.png', Buffer.concat([PNG, Buffer.from('r')]));
    put('.hidden/x.png', PNG);
    put('top.png', Buffer.concat([PNG, Buffer.from('t')]));
    fs.symlinkSync(path.join(tmp), path.join(pack, 'escape'));
  });

  it('lists the folders with their asset files; no hidden folders, other files or links', async () => {
    const scan = await scanPack(pack);
    expect(scan.name).toBe('Forest Pack');
    expect(scan.folders).toEqual([
      { path: '', files: 1, bytes: PNG.length + 1 },
      { path: 'Rocks', files: 2, bytes: 2 * (PNG.length + 1) },
      { path: 'Trees', files: 0, bytes: 0 },
      { path: 'Trees/Oak', files: 2, bytes: 2 * (PNG.length + 1) },
    ]);
  });

  it('copies only the chosen folders, reports progress, reuses equal files', async () => {
    const progress: number[] = [];
    const out = (await importPack(pack, library, ['Rocks', 'Trees/Oak'], { onProgress: (done) => progress.push(done), cancelled: () => false })).files;
    expect(out.map((f) => [f.packPath, f.name, f.reused])).toEqual([
      ['Rocks/rock-copy.png', 'rock-copy.png', false],
      ['Rocks/rock.png', 'rock-copy.png', true],
      ['Trees/Oak/oak_01.png', 'oak_01.png', false],
      ['Trees/Oak/oak_02.png', 'oak_02.png', false],
    ]);
    expect(progress).toEqual([1, 2, 3, 4]);
    expect(fs.readdirSync(library).sort()).toEqual(['oak_01.png', 'oak_02.png', 'rock-copy.png']);
  });

  it('stops when cancelled, leaving only whole files', async () => {
    let n = 0;
    const out = (await importPack(pack, library, ['', 'Rocks', 'Trees/Oak'], { onProgress: () => n++, cancelled: () => n >= 2 })).files;
    expect(out).toHaveLength(2);
    expect(fs.readdirSync(library).filter((f) => f.includes('tmp'))).toEqual([]);
  });

  it('refuses folders that were not in the scan', async () => {
    await expect(importPack(pack, library, ['../'], { onProgress: () => undefined, cancelled: () => false })).rejects.toThrow();
    await expect(importPack(pack, library, ['escape'], { onProgress: () => undefined, cancelled: () => false })).rejects.toThrow();
  });
});

describe('volumes without hard links (exFAT, FAT, network shares)', () => {
  it('imports by renaming the copy instead; nothing half or hidden is left', async () => {
    const spy = vi.spyOn(fs.promises, 'link').mockRejectedValue(Object.assign(new Error('not supported'), { code: 'ENOTSUP' }));
    try {
      const src = path.join(tmp, 'tree.png');
      fs.writeFileSync(src, PNG);
      expect(await addFileToLibrary(library, src)).toEqual({ name: 'tree.png', reused: false });
      expect(await addBytesToLibrary(library, 'rock.webp', new Uint8Array([...PNG, 7]))).toEqual({ name: 'rock.webp', reused: false });
      expect(fs.readdirSync(library).sort()).toEqual(['rock.webp', 'tree.png']);
    } finally {
      spy.mockRestore();
    }
  });
});

describe('a pack import that fails part-way', () => {
  it('returns the files copied so far and names the one that failed', async () => {
    const pack = path.join(tmp, 'P');
    fs.mkdirSync(pack);
    fs.writeFileSync(path.join(pack, 'a.png'), Buffer.concat([PNG, Buffer.from('a')]));
    fs.writeFileSync(path.join(pack, 'b.png'), Buffer.concat([PNG, Buffer.from('b')]));
    const real = fs.promises.copyFile;
    const spy = vi.spyOn(fs.promises, 'copyFile').mockImplementation(async (from, to, mode) => {
      if (String(from).endsWith('b.png')) throw new Error('disk full');
      return real(from, to, mode);
    });
    try {
      const r = await importPack(pack, library, [''], { onProgress: () => undefined, cancelled: () => false });
      expect(r.files.map((f) => f.name)).toEqual(['a.png']);
      expect(r.failed).toBe('b.png');
      expect(fs.readdirSync(library)).toEqual(['a.png']);
    } finally {
      spy.mockRestore();
    }
  });
});
