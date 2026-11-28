// The scenes of the image comparisons (DC-126, E-91): fixed terrain the real renderer draws the same
// every time – no animation, no time, no randomness – so a picture that changes shows a change in
// how the terrain is drawn. Developer tool: its text is English on purpose.
import { DEFAULT_GRID, type GridConfig } from '../core/grid';
import type { Point } from '../core/geometry';
import type { TerrainBiome } from '../core/build/terrainKeys';
import { emptyTerrain, type TerrainState } from '../core/build/terrain/state';
import { applyStroke, lassoPoints } from '../core/build/terrain/stepTool';
import { brushWeights, paintGround, type GroundClass } from '../core/build/terrain/groundTool';
import { paintRelief, paintSlope } from '../core/build/terrain/heightTool';
import { benchTerrain, TERRAIN_GRID, TERRAIN_MAP } from '../bench/bench-terrain';
import type { Camera, Size } from '../render/pixi/camera';
import { fitCamera } from '../render/pixi/camera';

/** Size of every picture (CSS px at resolution 1). */
export const VISUAL_VIEW: Size = { width: 512, height: 512 };

export interface VisualScene {
  readonly terrain: TerrainState;
  readonly grid: GridConfig;
  readonly map: Size;
  readonly camera: Camera;
}

const CELL = 70;
const GRID: GridConfig = { ...DEFAULT_GRID, cellWidth: CELL, cellHeight: CELL, originX: 0, originY: 0, rotationDeg: 0 };
const SMALL: Size = { width: 14 * CELL, height: 14 * CELL };
const c = (x: number, y: number): Point => ({ x: x * CELL, y: y * CELL });
const poly = (pts: [number, number][]) => lassoPoints(pts.map(([x, y]) => c(x, y)), GRID);

/** Plateaus of 10, 20 and 40 ft in `biome`, `cls` painted over the whole map (null: Auto). */
function plateaus(biome: TerrainBiome, cls: GroundClass | null): TerrainState {
  let t = emptyTerrain([biome]);
  t = applyStroke(t, 'map', poly([[1, 1], [3, 0.8], [5.2, 1.2], [5.5, 3], [5, 5.2], [2.5, 5.4], [1, 4.5]]), 'raise', 1);
  t = applyStroke(t, 'map', poly([[8, 1], [11, 0.7], [13.2, 1.5], [13, 4], [11.5, 5.5], [8.5, 5.2], [7.8, 3]]), 'raise', 2);
  t = applyStroke(t, 'map', poly([[1.5, 8], [5, 7.6], [9, 8.2], [12.5, 8], [13, 10.5], [10, 12], [6, 11.6], [2, 12.2], [1.2, 10]]), 'raise', 4);
  if (cls) t = paintGround(t, 'map', brushWeights([c(0, 7), c(14, 7)], 30, 0.1, GRID), cls);
  return t;
}

/** A plateau with a ramp, a higher block casting shadow, a hill, a gully with erosion edges. */
function heights(): TerrainState {
  let t = emptyTerrain(['temperate']);
  t = applyStroke(t, 'map', poly([[1, 1], [7, 1], [7, 6], [1, 6]]), 'raise', 1);
  t = paintSlope(t, 'map', brushWeights([c(7, 2.5), c(7, 4.5)], 2.5, 0.3, GRID), false);
  t = applyStroke(t, 'map', poly([[9, 1], [12, 1], [12, 4], [9, 4]]), 'raise', 2);
  t = paintRelief(t, 'map', brushWeights([c(4, 10)], 6, 1, GRID), 'raise', { amountFt: 8, strength: 1, startFt: 0 });
  t = paintRelief(t, 'map', brushWeights([c(9, 8), c(12, 12)], 2, 0.2, GRID), 'lower', { amountFt: 6, strength: 1, startFt: 0 });
  return t;
}

const small = (terrain: TerrainState): VisualScene => ({ terrain, grid: GRID, map: SMALL, camera: fitCamera(SMALL, VISUAL_VIEW, 0) });

/** The scenes by name; each builds its terrain when asked. */
export const VISUAL_SCENES: Record<string, () => VisualScene> = {
  'sandstone-heights': () => small(plateaus('temperate', null)),
  'granite-ice': () => small(plateaus('winter', 'snow')),
  'clay': () => small(plateaus('desert', 'earth')),
  'built-walls': () => small(plateaus('swamp', 'paving')),
  'slope-shade-erosion': () => small(heights()),
  // The bench map far out: drawn from baked blocks.
  'bench-far': () => ({ terrain: benchTerrain(), grid: TERRAIN_GRID, map: TERRAIN_MAP, camera: fitCamera(TERRAIN_MAP, VISUAL_VIEW, 0) }),
};
