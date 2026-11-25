// @vitest-environment node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { addBytesToLibrary, addFileToLibrary, listLibrary, ThumbCache } from './library';

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
