import { fitCamera, zoomAt, type Camera, type Size } from '../render/pixi/camera';
import type { TokenShape } from '../render/pixi/renderer';
import { DEFAULT_GRID, type GridConfig } from '../core/grid';
import type { Point } from '../core/geometry';
import type { TerrainBiome } from '../core/build/terrainKeys';
import { emptyTerrain, type TerrainState } from '../core/build/terrain/state';
import { applyStroke, lassoPoints } from '../core/build/terrain/stepTool';
import { brushCells, brushWeights, paintBiome, paintGround, type GroundClass } from '../core/build/terrain/groundTool';
import { paintRelief, paintSlope } from '../core/build/terrain/heightTool';
import type { BenchArea } from './bench-scene';

// The terrain benchmark scene (DC-126, E-91): a large drawn map as the Map Forge paints it – four
// biomes, cliffs of 10 to 40 ft in many materials, ground classes, fine height, erosion edges and
// shading – under fog with tokens, and a camera that zooms from the whole map (drawn from baked
// blocks) down to play distance. Pure data: the benchmark page draws it with the real renderer.

/** Cells per side. */
export const TERRAIN_CELLS = 96;
/** Grid cells in map pixels, as in the video scene. */
export const TERRAIN_CELL = 140;
export const TERRAIN_MAP: Size = { width: TERRAIN_CELLS * TERRAIN_CELL, height: TERRAIN_CELLS * TERRAIN_CELL };
export const TERRAIN_GRID: GridConfig = { ...DEFAULT_GRID, cellWidth: TERRAIN_CELL, cellHeight: TERRAIN_CELL, originX: 0, originY: 0, rotationDeg: 0 };
/** Four biomes: as many as a map's palette holds (E-88). */
export const TERRAIN_PALETTE: readonly TerrainBiome[] = ['temperate', 'desert', 'winter', 'swamp'];

const STACK = 'map';
const c = (x: number, y: number): Point => ({ x: x * TERRAIN_CELL, y: y * TERRAIN_CELL });

/** A rough polygon around (cx, cy) of rx × ry cells, `corners` points, irregular by a fixed pattern. */
function blob(cx: number, cy: number, rx: number, ry: number, corners = 12): Point[] {
  return Array.from({ length: corners }, (_, i) => {
    const a = (i / corners) * Math.PI * 2;
    const k = 1 + 0.12 * Math.sin(i * 2.7 + cx);
    return c(cx + Math.cos(a) * rx * k, cy + Math.sin(a) * ry * k);
  });
}

/** What each quadrant puts on top of its plateaus, so their cliffs show different materials (`cliffMaterial.ts`). */
const QUADRANTS: readonly { biome: TerrainBiome; ox: number; oy: number; onMiddle: GroundClass; onHigh: GroundClass }[] = [
  { biome: 'temperate', ox: 0, oy: 0, onMiddle: 'rock', onHigh: 'earth' },
  { biome: 'desert', ox: 48, oy: 0, onMiddle: 'earth', onHigh: 'rock' },
  { biome: 'winter', ox: 0, oy: 48, onMiddle: 'snow', onHigh: 'earth' },
  { biome: 'swamp', ox: 48, oy: 48, onMiddle: 'rock', onHigh: 'grass' },
];

/** The terrain of the scene, built with the Map Forge's own tools. */
export function benchTerrain(): TerrainState {
  let t = emptyTerrain(TERRAIN_PALETTE);
  const ground = (path: Point[], size: number, cls: GroundClass) => (t = paintGround(t, STACK, brushWeights(path, size, 0.3, TERRAIN_GRID), cls));
  for (const q of QUADRANTS) {
    const x = (dx: number) => q.ox + dx;
    const y = (dy: number) => q.oy + dy;
    if (q.biome !== TERRAIN_PALETTE[0]) t = paintBiome(t, STACK, brushCells([c(x(24), y(24))], 64, 0.25, TERRAIN_GRID), q.biome) ?? t;
    // A low plateau with a paved top (a built wall) and a ramp on one side.
    t = applyStroke(t, STACK, lassoPoints(blob(x(11), y(11), 7, 5), TERRAIN_GRID), 'raise', 1);
    ground([c(x(5), y(11)), c(x(17), y(11))], 12, 'paving');
    t = paintSlope(t, STACK, brushWeights([c(x(18), y(10)), c(x(18), y(13))], 2.5, 0.3, TERRAIN_GRID), false);
    // A middle plateau (20 ft) with the quadrant's class on top.
    t = applyStroke(t, STACK, lassoPoints(blob(x(33), y(12), 8, 6), TERRAIN_GRID), 'raise', 2);
    ground([c(x(26), y(12)), c(x(40), y(12))], 14, q.onMiddle);
    // A high plateau (40 ft) with a terrace, half of its top another class.
    t = applyStroke(t, STACK, lassoPoints(blob(x(20), y(34), 11, 7, 16), TERRAIN_GRID), 'raise', 4);
    t = applyStroke(t, STACK, lassoPoints(blob(x(22), y(34), 5, 3), TERRAIN_GRID), 'raise', 1);
    ground([c(x(8), y(30)), c(x(16), y(38))], 10, q.onHigh);
    // A hill, a steep gully (erosion edges) and some loose ground below.
    t = paintRelief(t, STACK, brushWeights([c(x(39), y(36))], 9, 1, TERRAIN_GRID), 'raise', { amountFt: 9, strength: 1, startFt: 0 });
    t = paintRelief(t, STACK, brushWeights([c(x(36), y(40)), c(x(44), y(44))], 2, 0.2, TERRAIN_GRID), 'lower', { amountFt: 6, strength: 1, startFt: 0 });
    ground([c(x(4), y(24)), c(x(12), y(26))], 5, 'gravel');
  }
  return t;
}

/** Fog as play leaves it on a large map: most explored, a few regions still dark, a hidden room inside. */
export function terrainFog(): BenchArea[] {
  const rect = (x: number, y: number, w: number, h: number): [number, number][] => [
    [x * TERRAIN_CELL, y * TERRAIN_CELL],
    [(x + w) * TERRAIN_CELL, y * TERRAIN_CELL],
    [(x + w) * TERRAIN_CELL, (y + h) * TERRAIN_CELL],
    [x * TERRAIN_CELL, (y + h) * TERRAIN_CELL],
  ];
  return [
    { outer: rect(0, 0, 70, 60), holes: [rect(30, 20, 6, 5)] },
    { outer: rect(70, 0, 26, 40), holes: [] },
    { outer: rect(0, 60, 51, 36), holes: [] },
    { outer: rect(50, 50, 46, 46), holes: [rect(80, 82, 8, 6)] },
  ];
}

/** 20 tokens round the middle of the map. */
export function terrainTokens(): TokenShape[] {
  return Array.from({ length: 20 }, (_, i) => {
    const cells = i === 0 ? 3 : i < 3 ? 2 : 1;
    return {
      id: `terrain-${String(i)}`,
      name: `T${String(i + 1)}`,
      x: (40 + (i % 5) * 4) * TERRAIN_CELL,
      y: (40 + Math.floor(i / 5) * 4) * TERRAIN_CELL,
      width: cells * TERRAIN_CELL,
      height: cells * TERRAIN_CELL,
      ...(i === 0 && { active: true }),
    };
  });
}

/** How long one camera cycle takes, in milliseconds. */
export const TERRAIN_CYCLE_MS = 24_000;

/**
 * The camera at `ms` for a view of `view` CSS pixels: the whole map fitted (far out: the baked
 * blocks), then zoomed in up to 6× on a point that wanders across the map and back.
 */
export function terrainCamera(ms: number, view: Size): Camera {
  const fitted = fitCamera(TERRAIN_MAP, view, 0);
  const phase = (ms % TERRAIN_CYCLE_MS) / TERRAIN_CYCLE_MS;
  const wave = (1 - Math.cos(phase * 2 * Math.PI)) / 2;
  const anchor = {
    x: view.width * (0.3 + 0.4 * phase),
    y: view.height * (0.4 + 0.25 * Math.sin(phase * 2 * Math.PI)),
  };
  return zoomAt(fitted, 1 + 5 * wave, anchor, view);
}
