// @vitest-environment node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { assetPathFrom, assetUrlFor } from '../src/platform/asset-url';
import { fileResponse, isInside, parseRange, safeJoin, toRel, uniquePath } from './files';

describe('safeJoin', () => {
  const r = path.join(path.sep, 'campaign');
  it('accepts nested relative paths', () => {
    expect(safeJoin(r, 'maps/crypt.webp')).toBe(path.join(r, 'maps', 'crypt.webp'));
    expect(safeJoin(r, './notes/a.md')).toBe(path.join(r, 'notes', 'a.md'));
  });
  it('rejects escapes', () => {
    for (const bad of ['../etc/passwd', 'maps/../../x', '/etc/passwd', '', 'C:/Windows', '\\\\server\\share', '..\\x', '.']) {
      expect(() => safeJoin(r, bad), bad).toThrow();
    }
  });
});

describe('isInside / toRel', () => {
  it('works with the platform separator', () => {
    const r = path.join(path.sep, 'c');
    expect(isInside(r, path.join(r, 'maps', 'a.png'))).toBe(true);
    expect(isInside(r, r)).toBe(true);
    expect(isInside(r, path.join(path.sep, 'cx', 'a'))).toBe(false);
    expect(isInside(r, path.join(path.sep, 'a'))).toBe(false);
    expect(toRel(r, path.join(r, 'maps', 'a.png'))).toBe('maps/a.png');
  });
});

describe('uniquePath', () => {
  it('appends a counter when taken', () => {
    const taken = new Set([path.join('d', 'map.png'), path.join('d', 'map-2.png')]);
    const exists = (p: string) => taken.has(p);
    expect(uniquePath('d', 'map.png', exists)).toBe(path.join('d', 'map-3.png'));
    expect(uniquePath('d', 'other.png', exists)).toBe(path.join('d', 'other.png'));
  });
});

describe('parseRange', () => {
  it('handles open, closed, suffix and invalid ranges', () => {
    expect(parseRange(null, 100)).toBeNull();
    expect(parseRange('bytes=0-', 100)).toEqual({ start: 0, end: 99 });
    expect(parseRange('bytes=10-19', 100)).toEqual({ start: 10, end: 19 });
    expect(parseRange('bytes=90-500', 100)).toEqual({ start: 90, end: 99 });
    expect(parseRange('bytes=-10', 100)).toEqual({ start: 90, end: 99 });
    expect(parseRange('bytes=100-', 100)).toBe('unsatisfiable');
    expect(parseRange('bytes=5-2', 100)).toBe('unsatisfiable');
    expect(parseRange('items=0-1', 100)).toBeNull();
  });
});

describe('fileResponse', () => {
  it('serves whole files and byte ranges', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dc-files-'));
    const f = path.join(dir, 'a.webm');
    fs.writeFileSync(f, '0123456789');
    const whole = await fileResponse(f, null);
    expect(whole.status).toBe(200);
    expect(whole.headers.get('content-type')).toBe('video/webm');
    expect(await whole.text()).toBe('0123456789');
    const part = await fileResponse(f, 'bytes=2-4');
    expect(part.status).toBe(206);
    expect(part.headers.get('content-range')).toBe('bytes 2-4/10');
    expect(await part.text()).toBe('234');
    expect((await fileResponse(path.join(dir, 'missing'), null)).status).toBe(404);
    fs.rmSync(dir, { recursive: true });
  });
});

describe('asset URLs', () => {
  it('round-trip absolute paths, including Windows paths and spaces', () => {
    for (const p of ['/Users/a b/Kampagne/maps/Gruft #1.webp', 'C:\\Users\\x\\maps\\k.mp4']) {
      expect(assetPathFrom(assetUrlFor(p))).toBe(p);
    }
    expect(assetPathFrom('https://example.com/x')).toBeNull();
  });
});
