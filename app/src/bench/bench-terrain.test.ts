import { describe, expect, it } from 'vitest';
import { cliffLines } from '../core/build/terrain/cliffs';
import { classWeightsAtPx, materialCliffOptions, materialWeights } from '../core/build/terrain/cliffMaterial';
import { biomeWeightsAtPx } from '../core/build/terrain/groundSample';
import { shownStack } from '../core/build/terrain/state';
import { BAKE_BELOW } from '../render/pixi/terrainBake';
import { benchTerrain, TERRAIN_GRID, TERRAIN_MAP, TERRAIN_PALETTE, terrainCamera, TERRAIN_CYCLE_MS, terrainFog, terrainTokens } from './bench-terrain';

/** The terrain benchmark scene (DC-126, E-91): what it has to show to measure the terrain at its worst. */
describe('the terrain benchmark scene', () => {
  const t = benchTerrain();
  const blocks = shownStack(t, 'map', []);
  const lines = cliffLines({ blocks, missingIsUnknown: false }, materialCliffOptions(blocks, TERRAIN_GRID, t.biomePalette, t.stepFt));

  it('is a 96 × 96 cell map with four biomes', () => {
    expect(TERRAIN_MAP).toEqual({ width: 96 * 140, height: 96 * 140 });
    expect(t.biomePalette).toEqual([...TERRAIN_PALETTE]);
    // Blocks of 32 cells: the whole map is painted.
    expect(blocks.size).toBeGreaterThanOrEqual(9);
  });

  it('has cliffs of 10, 20 and 40 ft (and terraces between) in many materials', () => {
    const drops = new Set(lines.map((l) => l.drop));
    for (const d of [1, 2, 4]) expect(drops).toContain(d);
    const materials = new Set<string>();
    for (const l of lines)
      for (let i = 1; i + 1 < l.points.length; i += 8) {
        // A little to the left of the line, on its upper side, as the renderer reads it.
        const [a, b] = [l.points[i - 1]!, l.points[i + 1]!];
        const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
        const p = { x: l.points[i]!.x + ((b.y - a.y) / len) * 49, y: l.points[i]!.y - ((b.x - a.x) / len) * 49 };
        for (const [m, w] of materialWeights(biomeWeightsAtPx(blocks, TERRAIN_GRID, p), t.biomePalette, classWeightsAtPx(blocks, TERRAIN_GRID, p), l.drop * t.stepFt)) if (w > 0.5) materials.add(m);
      }
    expect(materials.size, [...materials].join()).toBeGreaterThanOrEqual(8);
  });

  it('fog and tokens lie on the map', () => {
    for (const area of terrainFog()) for (const [x, y] of area.outer) expect(x <= TERRAIN_MAP.width && y <= TERRAIN_MAP.height).toBe(true);
    expect(terrainTokens()).toHaveLength(20);
  });

  it('the camera goes from the whole map (baked blocks) to play distance and back', () => {
    const view = { width: 3840, height: 2160 };
    const zooms = Array.from({ length: 48 }, (_, i) => terrainCamera((i * TERRAIN_CYCLE_MS) / 48, view).zoom);
    expect(Math.min(...zooms)).toBeLessThan(BAKE_BELOW);
    expect(Math.max(...zooms)).toBeGreaterThan(0.8);
    expect(terrainCamera(0, view)).toEqual(terrainCamera(TERRAIN_CYCLE_MS, view));
  });
});
