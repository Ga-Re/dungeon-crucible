import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { DcApi } from '../platform/desktop-api';
import { MAP_FILE_WARN_BYTES, writeDoc } from './campaign';
import { state } from './store';
import { MapSidecarSchema } from '../core/sidecar';
import { mapSidecarFromScene } from '../core/persistence';
import { createSampleScene } from '../sample/crypt';

/** A map file over 8 MB is written, with a note in the log (O-A1, E-83). */
let files: Map<string, string>;
beforeEach(() => {
  files = new Map();
  const api: Partial<DcApi> = { writeText: async (rel: string, content: string) => void files.set(rel, content) };
  window.dc = new Proxy(api, { get: (t, k) => (t as Record<string | symbol, unknown>)[k] ?? (async () => []) }) as DcApi;
  state.log = [];
});
afterEach(() => {
  delete window.dc;
});

describe('large map files', () => {
  const map = () => MapSidecarSchema.parse(JSON.parse(JSON.stringify(mapSidecarFromScene(createSampleScene(), 'builtin:crypt'))));

  it('a normal map file is written without a note', async () => {
    await writeDoc('library/a.map.json', MapSidecarSchema, map());
    expect(files.has('library/a.map.json')).toBe(true);
    expect(state.log.some((l) => l.key === 'log.mapFileLarge')).toBe(false);
  });

  it('one over the limit is written and noted with its size', async () => {
    const big = { ...map(), tags: ['x'.repeat(MAP_FILE_WARN_BYTES)] };
    await writeDoc('library/b.map.json', MapSidecarSchema, big);
    expect(files.has('library/b.map.json')).toBe(true);
    expect(state.log.find((l) => l.key === 'log.mapFileLarge')?.params).toMatchObject({ file: 'library/b.map.json', mb: 8 });
  });
});
