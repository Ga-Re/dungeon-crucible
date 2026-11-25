import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { DcApi, LibraryEntry } from '../platform/desktop-api';
import { DEFAULT_GRID } from '../core/grid';
import { MAP_VERSION } from '../core/sidecar';
import { createDrawnMap, duplicateLibraryMap, refreshLibraryMaps, trashBlocked, updateLibraryMap } from './library';
import { state } from './store';

/** Map copies in the library (E-32, DC-118), files kept in memory. */
let files: Map<string, string>;
const hall = {
  kind: 'map', schemaVersion: MAP_VERSION, name: 'Hall', resource: 'library/hall.png', isVideo: false, widthPx: 700, heightPx: 490, grid: DEFAULT_GRID,
  tags: ['inn'], mapType: 'building',
  walls: [{ id: 'w1', kind: 'wall', x1: 0, y1: 0, x2: 70, y2: 0 }],
};

beforeEach(() => {
  files = new Map([
    ['library/hall.png', ''],
    ['library/hall.png.dm.json', JSON.stringify(hall)],
  ]);
  const entries = (): LibraryEntry[] => [...files.keys()].filter((k) => k.startsWith('library/') && !k.endsWith('.dm.json')).map((k) => ({ name: k.slice(8), size: 1, mtimeMs: 1, sidecar: files.get(`${k}.dm.json`) ?? null }));
  const api: Partial<DcApi> = {
    listLibrary: async () => entries(),
    readText: async (rel: string) => {
      const t = files.get(rel);
      if (t === undefined) throw new Error('missing');
      return t;
    },
    writeText: async (rel: string, content: string) => void files.set(rel, content),
  };
  window.dc = new Proxy(api, { get: (t, k) => (t as Record<string | symbol, unknown>)[k] ?? (async () => []) }) as DcApi;
  state.root = { root: '/root', suggested: '/root' };
  state.campaign = null;
});
afterEach(() => {
  delete window.dc;
});

describe('map copies', () => {
  it('a copy is its own map file on the same picture; "only the map" leaves the walls out; the catalog lists both', async () => {
    await refreshLibraryMaps();
    expect(state.libraryMaps.map((m) => m.mapFile)).toEqual(['library/hall.png.dm.json']);
    const file = await duplicateLibraryMap('library/hall.png.dm.json', 'Hall (copy)', false);
    expect(file).toBe('library/hall-copy.map.json');
    const copy = JSON.parse(files.get(file!)!);
    expect(copy).toMatchObject({ kind: 'map', name: 'Hall (copy)', resource: 'library/hall.png', tags: ['inn'], walls: [] });
    expect(state.libraryMaps.map((m) => [m.name, m.mapFile, m.copy])).toEqual([['Hall', 'library/hall.png.dm.json', false], ['Hall (copy)', 'library/hall-copy.map.json', true]]);
    expect(state.mapSelected).toBe(file);
    // "With everything": the walls too, under new ids.
    const all = JSON.parse(files.get((await duplicateLibraryMap('library/hall.png.dm.json', 'Hall 2', true))!)!);
    expect(all.walls).toHaveLength(1);
    expect(all.walls[0].id).not.toBe('w1');
    // The original picture cannot go to the trash while copies use it; a copy no scene uses can.
    const original = state.libraryMaps.find((m) => !m.copy)!;
    expect(trashBlocked(original, [])).toBe('pictureShared');
    expect(trashBlocked(state.libraryMaps.find((m) => m.copy)!, [])).toBeNull();
    // A copy's catalog data are changed in its own file.
    await updateLibraryMap('library/hall-copy.map.json', { name: 'Cellar' });
    expect(JSON.parse(files.get('library/hall-copy.map.json')!).name).toBe('Cellar');
    expect(JSON.parse(files.get('library/hall.png.dm.json')!).name).toBe('Hall');
  });
});

describe('drawn maps (E-33)', () => {
  it('are listed in the catalog without a picture, as maps of their own', async () => {
    files.set('library/cellar.map.json', JSON.stringify({ ...hall, name: 'Cellar', resource: 'drawn:', walls: [] }));
    await refreshLibraryMaps();
    const cellar = state.libraryMaps.find((m) => m.mapFile === 'library/cellar.map.json');
    expect(cellar).toMatchObject({ name: 'Cellar', resource: 'drawn:', drawn: true, copy: false, isVideo: false });
    // It shares no picture: it can go to the trash while no scene uses it.
    expect(trashBlocked(cellar!, [])).toBeNull();
    expect(trashBlocked(cellar!, [{ campaign: 'C', scene: 'S' }])).toBe('copyUsed');
  });
});

describe('a new drawn map (E-33)', () => {
  it('is a map file of its own without a picture, listed (opened in a tab with a campaign open)', async () => {
    const file = await createDrawnMap('Keller');
    expect(file).toBe('library/keller.map.json');
    const doc = JSON.parse(files.get(file!)!);
    expect(doc).toMatchObject({ kind: 'map', name: 'Keller', resource: 'drawn:', masonry: [], masonryDoors: [], origin: { x: 0, y: 0 } });
    expect(state.libraryMaps.find((m) => m.mapFile === file)).toMatchObject({ drawn: true });
    // A second one gets a free name.
    expect(await createDrawnMap('Keller')).toBe('library/keller-2.map.json');
  });
});
