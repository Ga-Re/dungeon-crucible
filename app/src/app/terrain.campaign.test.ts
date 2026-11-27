import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { DcApi } from '../platform/desktop-api';
import { closeCampaign, newCampaign, newSceneOnMap, openMapTab, readDoc, saveCampaign } from './campaign';
import { duplicateLibraryMap } from './library';
import { applyFogArea, applyMapToTv, checkpoint, fogAll, markDirty, produceFrame, redo, setTvScene, setWorkspace, state, tvRasterBlocks, undo } from './store';
import { terrainOf, setTerrain } from './terrain';
import { DRAWN_RESOURCE, mapSidecarFromScene } from '../core/persistence';
import { MapSidecarSchema } from '../core/sidecar';
import { createSampleScene } from '../sample/crypt';
import { rectPolygon } from '../core/fogModel';
import { rasterChecksum } from '../core/build/terrain/tvRaster';
import { emptyTerrain, encodeTerrain, EncodeCache, pointOf, setPoints } from '../core/build/terrain/state';

/** The terrain of an open map (E-84): out of the documents while open, back in every write. Files in memory. */
let files: Map<string, string>;
const MAP = 'library/hill.map.json';

beforeEach(() => {
  files = new Map();
  const api: Partial<DcApi> = {
    readText: async (rel: string) => {
      const t = files.get(rel);
      if (t === undefined) throw new Error('missing');
      return t;
    },
    writeText: async (rel: string, content: string) => void files.set(rel, content),
    listFiles: async (dir: string) => [...files.keys()].filter((k) => k.startsWith(`${dir}/`)),
    createCampaign: async (name: string) => name.toLowerCase(),
  };
  window.dc = new Proxy(api, { get: (t, k) => (t as Record<string | symbol, unknown>)[k] ?? (async () => []) }) as DcApi;
  state.root = { root: '/root', suggested: '/root' };
});
afterEach(async () => {
  await closeCampaign();
  delete window.dc;
});

/** A drawn map on disk with a plateau in its terrain. */
async function hill(terrain?: unknown) {
  const t = setPoints(emptyTerrain(['temperate']), 'map', 'step', [[1, 1, 2], [300, 0, 1]]);
  const doc = { ...mapSidecarFromScene(createSampleScene(), DRAWN_RESOURCE, 'map'), name: 'Hill', terrain: terrain ?? (await encodeTerrain(t, new EncodeCache())) };
  files.set(MAP, JSON.stringify(doc));
  await newCampaign('C', false);
  await openMapTab(MAP);
}
const onDisk = () => JSON.parse(files.get(MAP)!) as { terrain?: { stacks: Record<string, { base: Record<string, { data: string }> }> } };

describe('terrain of an open map (E-84)', () => {
  it('is decoded and taken out of the documents', async () => {
    await hill();
    expect(state.mapFile).toBe(MAP);
    expect(state.mapDoc).not.toHaveProperty('terrain');
    expect(pointOf(terrainOf(MAP)!, 'map', 'step', 1, 1)).toBe(2);
  });

  it('goes back into the file on saving; untouched blocks keep their encoding', async () => {
    await hill();
    const before = onDisk().terrain!.stacks['map']!.base;
    checkpoint();
    setTerrain(MAP, setPoints(terrainOf(MAP)!, 'map', 'step', [[1, 1, 5]]));
    markDirty();
    await saveCampaign(true);
    const after = onDisk().terrain!.stacks['map']!.base;
    expect(after['2_0']).toEqual(before['2_0']);
    expect(after['0_0']!.data).not.toBe(before['0_0']!.data);
  });

  it('undo and redo bring the terrain back, sharing what did not change', async () => {
    await hill();
    const first = terrainOf(MAP)!;
    checkpoint();
    setTerrain(MAP, setPoints(first, 'map', 'step', [[1, 1, 7]]));
    const second = terrainOf(MAP)!;
    expect(second.stacks.get('map')!.base.get('2_0')).toBe(first.stacks.get('map')!.base.get('2_0'));
    undo();
    expect(terrainOf(MAP)).toBe(first);
    redo();
    expect(terrainOf(MAP)).toBe(second);
  });

  it('a broken terrain: the map opens without it, read-only, with a note', async () => {
    await hill({ stepFt: 10, biomePalette: ['temperate'], stacks: { map: { base: { '0_0': { v: 1, data: 'AAAA' } } } } });
    const text = files.get(MAP);
    expect(terrainOf(MAP)).toBeNull();
    expect(state.log.some((l) => l.key === 'log.terrainBroken')).toBe(true);
    markDirty();
    await saveCampaign(true);
    expect(files.get(MAP)).toBe(text);
  });

  it('a broken terrain stays safe when the map file is read again', async () => {
    const broken = { stepFt: 10, biomePalette: ['temperate'], stacks: { map: { base: { '0_0': { v: 1, data: 'AAAA' } } } } };
    await hill(broken);
    const text = files.get(MAP);
    // The catalog, loading a scene and the export read the map file again.
    await readDoc(MAP, 'map', MapSidecarSchema);
    markDirty();
    await saveCampaign(true);
    expect(files.get(MAP)).toBe(text);
    // A copy takes the terrain as it is in the file, not none.
    const copy = await duplicateLibraryMap(MAP, 'Hill 2', true);
    expect((JSON.parse(files.get(copy!)!) as { terrain?: unknown }).terrain).toEqual(broken);
  });

  it('undo in a scene leaves the terrain alone (it is changed on the map only)', async () => {
    await hill();
    await newSceneOnMap(MAP);
    setWorkspace('play');
    expect(state.layer).toBe('scene');
    checkpoint();
    const edited = setPoints(terrainOf(MAP)!, 'map', 'step', [[1, 1, 9]]);
    setTerrain(MAP, edited);
    undo();
    expect(terrainOf(MAP)).toBe(edited);
  });

  it('a copy of the map keeps its terrain', async () => {
    await hill();
    const copy = await duplicateLibraryMap(MAP, 'Hill 2', true);
    const doc = JSON.parse(files.get(copy!)!) as { terrain?: unknown };
    expect(doc.terrain).toBeDefined();
  });
});

describe('terrain on the TV (E-85)', () => {
  /** The hill as a scene on the TV, explored over its first 10 × 10 cells only. */
  async function onTv() {
    await hill();
    await newSceneOnMap(MAP);
    setWorkspace('play');
    setTvScene(state.scenePath);
    const g = state.scene.map.grid;
    fogAll(false);
    applyFogArea(rectPolygon(g.originX, g.originY, g.originX + 10 * g.cellWidth, g.originY + 10 * g.cellHeight), 'reveal');
  }

  it('the frame names only explored blocks; their planes are there to send, by checksum', async () => {
    await onTv();
    const raster = produceFrame(1).map.raster!;
    expect(raster.palette).toEqual(['temperate']);
    // The explored cells and a margin of 2 around them (into the blocks left and above): not block 2_0.
    expect(Object.keys(raster.blocks).sort()).toEqual(['-1_-1', '-1_0', '0_-1', '0_0']);
    const block = tvRasterBlocks().get(raster.blocks['0_0']!)!;
    expect(rasterChecksum(block)).toBe(raster.blocks['0_0']);
  });

  it('a change of the terrain waits with the map for the DM, then reaches the TV', async () => {
    await onTv();
    const before = produceFrame(1).map.raster!.blocks['0_0'];
    setWorkspace('forge');
    checkpoint();
    setTerrain(MAP, setPoints(terrainOf(MAP)!, 'map', 'step', [[2, 2, 3]]));
    markDirty();
    expect(state.tvMapPending).toBe(true);
    expect(produceFrame(2).map.raster!.blocks['0_0']).toBe(before);
    applyMapToTv();
    expect(produceFrame(3).map.raster!.blocks['0_0']).not.toBe(before);
  });

  it('no terrain: no raster in the frame', async () => {
    files.set(MAP, JSON.stringify({ ...mapSidecarFromScene(createSampleScene(), DRAWN_RESOURCE, 'map'), name: 'Flat' }));
    await newCampaign('C', false);
    await newSceneOnMap(MAP);
    setWorkspace('play');
    setTvScene(state.scenePath);
    expect(produceFrame(1).map.raster).toBeNull();
  });
});
