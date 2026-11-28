import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { DcApi } from '../platform/desktop-api';
import { closeCampaign, newCampaign, newSceneOnMap, openMapTab, readDoc, saveCampaign } from './campaign';
import { duplicateLibraryMap } from './library';
import { abortTerrainStroke, applyFogArea, applyMapToTv, beginTerrainStroke, setTool, terrainShape, terrainStrokePath, cancelTerrainCommand, checkpoint, finishTerrainCommand, fogAll, markDirty, moveTerrainStroke, produceFrame, redo, setTerrainPreview, setTvScene, setWorkspace, sightWalls, startTerrainCommand, state, tvRasterBlocks, undo, updateTerrainCommand } from './store';
import { terrainOf, setTerrain } from './terrain';
import { DRAWN_RESOURCE, mapSidecarFromScene } from '../core/persistence';
import { MapSidecarSchema } from '../core/sidecar';
import { createSampleScene } from '../sample/crypt';
import { rectPolygon } from '../core/fogModel';
import { rasterChecksum } from '../core/build/terrain/tvRaster';
import { biomeWeightsAt, classId, groundAt, paintBiome } from '../core/build/terrain/groundTool';
import { defaultTerrainBiome } from '../core/build/intent';
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

  it('the TV learns the names only of the biomes in the blocks it gets (a biome in unexplored ground stays unnamed)', async () => {
    await onTv();
    const t = paintBiome(paintBiome(terrainOf(MAP)!, 'map', [[3, 3, 1]], 'desert')!, 'map', [[60, 60, 1]], 'winter')!;
    setTerrain(MAP, t);
    const raster = produceFrame(1).map.raster!;
    expect(raster.palette).toEqual(['temperate', 'desert', null]);
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

  it('a drawn map without terrain: its default ground, no blocks (E-87)', async () => {
    files.set(MAP, JSON.stringify({ ...mapSidecarFromScene(createSampleScene(), DRAWN_RESOURCE, 'map'), name: 'Flat' }));
    await newCampaign('C', false);
    await newSceneOnMap(MAP);
    setWorkspace('play');
    setTvScene(state.scenePath);
    const { mapType, biome } = state.scene.map;
    expect(produceFrame(1).map.raster).toEqual({ stepFt: 10, palette: [defaultTerrainBiome(mapType, biome)], perspective: 0.45, erosion: true, lightAngle: state.scene.map.lightAngle, blocks: {} });
  });
});

describe('the tool "Stufe" (E-87)', () => {
  const paint = (from: { x: number; y: number }, to: { x: number; y: number }) => {
    beginTerrainStroke(from);
    moveTerrainStroke(to, { straight: false, invert: false }, false);
    moveTerrainStroke(to, { straight: false, invert: false }, true);
  };

  it('a stroke raises the ground to its start + 1, one step of undo; the cliff becomes a one-way wall', async () => {
    await hill();
    setTerrainPreview('live');
    startTerrainCommand();
    expect(state.tool).toBe('terrain');
    updateTerrainCommand({ shape: 'square', sizeCells: 1, mode: 'raise' });
    expect(state.scene.map.grid.cellWidth).toBe(70);
    const g = state.scene.map.grid;
    expect([g.originX, g.originY, g.rotationDeg]).toEqual([0, 0, 0]);
    paint({ x: 10.5 * 70, y: 10.5 * 70 }, { x: 13.5 * 70, y: 10.5 * 70 });
    expect(pointOf(terrainOf(MAP)!, 'map', 'step', 44, 42)).toBe(1);
    expect(state.dirty).toBe(true);
    const cliffs = sightWalls(state.scene, terrainOf(MAP)).filter((w) => w.kind === 'cliff' && w.id.startsWith('terrain:'));
    expect(cliffs.length).toBeGreaterThan(0);
    undo();
    expect(pointOf(terrainOf(MAP)!, 'map', 'step', 44, 42)).toBe(0);
    finishTerrainCommand();
    expect(state.terrainCommand).toBeNull();
  });

  it('Cancel takes back every stroke since the tool opened; the outline preview changes nothing until let go', async () => {
    await hill();
    const before = terrainOf(MAP);
    startTerrainCommand();
    updateTerrainCommand({ shape: 'square', sizeCells: 1, mode: 'raise' });
    setTerrainPreview('outline');
    beginTerrainStroke({ x: 10.5 * 70, y: 10.5 * 70 });
    moveTerrainStroke({ x: 12.5 * 70, y: 10.5 * 70 }, { straight: false, invert: false }, false);
    expect(terrainOf(MAP)).toBe(before);
    moveTerrainStroke({ x: 12.5 * 70, y: 10.5 * 70 }, { straight: false, invert: false }, true);
    expect(pointOf(terrainOf(MAP)!, 'map', 'step', 44, 42)).toBe(1);
    setTerrainPreview('live');
    cancelTerrainCommand();
    expect(terrainOf(MAP)).toBe(before);
    expect(state.terrainCommand).toBeNull();
  });

  it('Alt lowers instead; the pipette picks the step for "set"', async () => {
    await hill();
    startTerrainCommand();
    updateTerrainCommand({ shape: 'square', sizeCells: 1, mode: 'raise' });
    beginTerrainStroke({ x: 10.5 * 70, y: 10.5 * 70 });
    moveTerrainStroke({ x: 10.5 * 70, y: 10.5 * 70 }, { straight: false, invert: true }, true);
    expect(pointOf(terrainOf(MAP)!, 'map', 'step', 42, 42)).toBe(-1);
    // The hill's own point (1, 1) is at step 2.
    updateTerrainCommand({ picking: true });
    beginTerrainStroke({ x: 0.25 * 70, y: 0.25 * 70 });
    expect(state.terrainCommand).toMatchObject({ mode: 'set', picked: 2, picking: false });
  });

  it('a stroke ends with its command: it never paints later, also not on another map', async () => {
    await hill();
    setTerrainPreview('live');
    startTerrainCommand();
    updateTerrainCommand({ shape: 'square', sizeCells: 1, mode: 'raise' });
    const before = terrainOf(MAP);
    expect(beginTerrainStroke({ x: 10.5 * 70, y: 10.5 * 70 })).toBe(true);
    setTool('select');
    expect(terrainStrokePath()).toBeNull();
    startTerrainCommand();
    moveTerrainStroke({ x: 12.5 * 70, y: 10.5 * 70 }, { straight: false, invert: false }, true);
    expect(terrainOf(MAP)).toBe(before);
    // The pipette starts no stroke.
    updateTerrainCommand({ picking: true });
    expect(beginTerrainStroke({ x: 10.5 * 70, y: 10.5 * 70 })).toBe(false);
  });

  it('a stroke changing nothing leaves no step of undo; Escape takes back the stroke being painted', async () => {
    await hill();
    setTerrainPreview('live');
    startTerrainCommand();
    updateTerrainCommand({ shape: 'square', sizeCells: 1, mode: 'set', picked: 0 });
    const undoable = state.canUndo;
    beginTerrainStroke({ x: 10.5 * 70, y: 10.5 * 70 });
    moveTerrainStroke({ x: 10.5 * 70, y: 10.5 * 70 }, { straight: false, invert: false }, true);
    expect(state.canUndo).toBe(undoable);
    const before = terrainOf(MAP);
    updateTerrainCommand({ mode: 'raise' });
    beginTerrainStroke({ x: 10.5 * 70, y: 10.5 * 70 });
    moveTerrainStroke({ x: 12.5 * 70, y: 10.5 * 70 }, { straight: false, invert: false }, false);
    expect(terrainOf(MAP)).not.toBe(before);
    abortTerrainStroke();
    expect(terrainOf(MAP)).toBe(before);
  });

  it('a map whose terrain could not be read cannot be painted', async () => {
    await hill({ stepFt: 10, biomePalette: ['temperate'], stacks: { map: { base: { '0_0': { v: 1, data: 'AAAA' } } } } });
    startTerrainCommand();
    expect(state.terrainCommand).toBeNull();
    expect(state.log.some((l) => l.key === 'log.terrainReadOnly')).toBe(true);
  });
});

describe('ground, biome and fill (E-88)', () => {
  const stroke = (from: { x: number; y: number }, to: { x: number; y: number }, invert = false) => {
    beginTerrainStroke(from);
    moveTerrainStroke(to, { straight: false, invert }, false);
    moveTerrainStroke(to, { straight: false, invert }, true);
  };

  it('a ground stroke paints its class at its strength, one step of undo; Alt takes it back to Auto', async () => {
    await hill();
    startTerrainCommand('ground');
    updateTerrainCommand({ groundClass: 'rock', strength: 1, softness: 0, sizeCells: 1 });
    stroke({ x: 10.5 * 70, y: 10.5 * 70 }, { x: 12.5 * 70, y: 10.5 * 70 });
    expect(groundAt(terrainOf(MAP)!, 'map', 44, 42).get(classId('rock'))).toBe(1);
    // The steps are untouched: no cliff came from painting ground.
    expect(pointOf(terrainOf(MAP)!, 'map', 'step', 44, 42)).toBe(0);
    stroke({ x: 10.5 * 70, y: 10.5 * 70 }, { x: 12.5 * 70, y: 10.5 * 70 }, true);
    expect(groundAt(terrainOf(MAP)!, 'map', 44, 42).size).toBe(0);
    undo();
    expect(groundAt(terrainOf(MAP)!, 'map', 44, 42).get(classId('rock'))).toBe(1);
  });

  it('a biome stroke brings the biome into the palette; a fifth is refused with a note', async () => {
    await hill();
    startTerrainCommand('biome');
    updateTerrainCommand({ biome: 'desert', strength: 1, softness: 0, sizeCells: 2 });
    stroke({ x: 10.5 * 70, y: 10.5 * 70 }, { x: 11.5 * 70, y: 10.5 * 70 });
    expect(terrainOf(MAP)!.biomePalette).toEqual(['temperate', 'desert']);
    expect(biomeWeightsAt(terrainOf(MAP)!, 'map', 10, 10)).toEqual([0, 1, 0, 0]);
    for (const [i, b] of (['winter', 'swamp'] as const).entries()) {
      updateTerrainCommand({ biome: b });
      stroke({ x: (20.5 + i * 5) * 70, y: 20.5 * 70 }, { x: (20.5 + i * 5) * 70, y: 20.5 * 70 });
    }
    const full = terrainOf(MAP);
    updateTerrainCommand({ biome: 'dungeon' });
    stroke({ x: 30.5 * 70, y: 30.5 * 70 }, { x: 30.5 * 70, y: 30.5 * 70 });
    expect(terrainOf(MAP)).toBe(full);
    expect(state.log.some((l) => l.key === 'log.biomePaletteFull')).toBe(true);
  });

  it('a fill click gives the connected ground its class, inside the map, as one step of undo', async () => {
    await hill();
    startTerrainCommand('fill');
    updateTerrainCommand({ groundClass: 'gravel', tolerance: 0.1 });
    const before = terrainOf(MAP);
    expect(beginTerrainStroke({ x: 5.5 * 70, y: 5.5 * 70 })).toBe(false);
    const t = terrainOf(MAP)!;
    expect(t).not.toBe(before);
    expect(groundAt(t, 'map', 22, 22).get(classId('gravel'))).toBe(1);
    // The hill's raised point is on another step: not filled.
    expect(groundAt(t, 'map', 1, 1).size).toBe(0);
    undo();
    expect(terrainOf(MAP)).toBe(before);
  });
});

describe('fine height and slope (E-89)', () => {
  const stroke = (from: { x: number; y: number }, to: { x: number; y: number }, invert = false) => {
    beginTerrainStroke(from);
    moveTerrainStroke(to, { straight: false, invert }, false);
    moveTerrainStroke(to, { straight: false, invert }, true);
  };

  it('a fine height stroke raises by its amount, never makes a cliff; Alt lowers', async () => {
    await hill();
    startTerrainCommand('relief');
    updateTerrainCommand({ reliefMode: 'raise', amountFt: 4, softness: 0, sizeCells: 2 });
    stroke({ x: 10.5 * 70, y: 10.5 * 70 }, { x: 12.5 * 70, y: 10.5 * 70 });
    expect(pointOf(terrainOf(MAP)!, 'map', 'relief', 44, 42)).toBe(4 * 16);
    expect(pointOf(terrainOf(MAP)!, 'map', 'step', 44, 42)).toBe(0);
    stroke({ x: 20.5 * 70, y: 20.5 * 70 }, { x: 20.5 * 70, y: 20.5 * 70 }, true);
    expect(pointOf(terrainOf(MAP)!, 'map', 'relief', 82, 82)).toBe(-4 * 16);
  });

  it('a slope over a cliff takes its one-way walls away there; Alt brings them back', async () => {
    await hill();
    startTerrainCommand('step');
    updateTerrainCommand({ shape: 'square', sizeCells: 1, mode: 'raise' });
    for (let x = 10; x <= 16; x++) stroke({ x: (x + 0.5) * 70, y: 10.5 * 70 }, { x: (x + 0.5) * 70, y: 14.5 * 70 });
    const walls = () => sightWalls(state.scene, terrainOf(MAP)).filter((w) => w.id.startsWith('terrain:')).length;
    const before = walls();
    expect(before).toBeGreaterThan(0);
    startTerrainCommand('slope');
    updateTerrainCommand({ strength: 1, softness: 0, sizeCells: 3 });
    stroke({ x: 10 * 70, y: 11 * 70 }, { x: 10 * 70, y: 14 * 70 });
    expect(walls()).toBeLessThan(before);
    stroke({ x: 10 * 70, y: 11 * 70 }, { x: 10 * 70, y: 14 * 70 }, true);
    expect(walls()).toBe(before);
  });
});


describe('terrain over a picture map (E-60, E-90)', () => {
  const PIC = 'library/meadow.map.json';
  async function meadow() {
    files.set(PIC, JSON.stringify({ ...mapSidecarFromScene(createSampleScene(), 'library/meadow.webp', 'map'), name: 'Meadow' }));
    await newCampaign('C', false);
    await openMapTab(PIC);
  }

  it('the tools work there; it draws only what is painted, without light and shadow', async () => {
    await meadow();
    expect(state.scene.map.drawn).toBeFalsy();
    expect(terrainShape()).toBeNull();
    startTerrainCommand();
    updateTerrainCommand({ shape: 'square', sizeCells: 1, mode: 'raise' });
    expect(beginTerrainStroke({ x: 10.5 * 70, y: 10.5 * 70 })).toBe(true);
    moveTerrainStroke({ x: 13.5 * 70, y: 10.5 * 70 }, { straight: false, invert: false }, true);
    expect(pointOf(terrainOf(PIC)!, 'map', 'step', 44, 42)).toBe(1);
    expect(terrainShape()).toMatchObject({ overPicture: true });
    expect(sightWalls(state.scene, terrainOf(PIC)).some((w) => w.kind === 'cliff' && w.id.startsWith('terrain:'))).toBe(true);
  });

  it('the TV gets its raster once it has terrain, none before', async () => {
    await meadow();
    await newSceneOnMap(PIC);
    setWorkspace('play');
    setTvScene(state.scenePath);
    const g = state.scene.map.grid;
    fogAll(false);
    applyFogArea(rectPolygon(g.originX, g.originY, g.originX + 10 * g.cellWidth, g.originY + 10 * g.cellHeight), 'reveal');
    expect(produceFrame(1).map.raster).toBeNull();
    setTerrain(PIC, setPoints(emptyTerrain(['temperate']), 'map', 'step', [[2, 2, 1]]));
    expect(Object.keys(produceFrame(2).map.raster!.blocks)).toContain('0_0');
  });
});
