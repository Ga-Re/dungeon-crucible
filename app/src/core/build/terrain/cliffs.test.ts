import { describe, expect, it } from 'vitest';
import { DEFAULT_GRID } from '../../grid';
import { belowCliff } from '../../scene';
import { BLOCK_POINTS, newBlock, withPoints, type RasterBlock } from './block';
import { CliffCache, cliffLines, cliffWalls, reliefLines, type CliffSource } from './cliffs';
import { UNKNOWN_STEP } from './tvRaster';

/**
 * Cliffs from the step raster (E-46, E-87, Teil B §11.1): lines in map px with the higher ground on
 * their left, a drop of several steps as one higher cliff, the same lines for the DM and the TV, and
 * one-way walls along their top edge.
 */
const grid = { ...DEFAULT_GRID, cellWidth: 70, cellHeight: 70, originX: 0, originY: 0, rotationDeg: 0 };
const CELL = 70;
/** Support points per cell. */
const SUB = 4;

/** A block with `step` set over the support points [x0, x1) × [y0, y1) (local). */
function plateau(x0: number, y0: number, x1: number, y1: number, step: number, base: RasterBlock = newBlock()): RasterBlock {
  const edits: [number, number, number][] = [];
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) edits.push([x, y, step]);
  return withPoints(base, 'step', edits);
}
const source = (blocks: Record<string, RasterBlock>, missingIsUnknown = false): CliffSource => ({ blocks: new Map(Object.entries(blocks)), missingIsUnknown });
const opts = { grid, noiseCells: 0 };

describe('cliff lines from the step raster', () => {
  it('a plateau gives one closed line around it, at the cell edges, the higher ground on its left', () => {
    // Cells 2…5 (support points 8…24) one step up.
    const lines = cliffLines(source({ '0_0': plateau(8, 8, 25, 25, 1) }), opts);
    expect(lines).toHaveLength(1);
    const [line] = lines;
    expect(line!.closed).toBe(true);
    expect(line!.drop).toBe(1);
    const xs = line!.points.map((p) => p.x);
    // Half way between the last high and the first low support point: 24.5 points = 6.125 cells … about the edge.
    expect(Math.min(...xs)).toBeGreaterThan(7.4 * (CELL / SUB) - 1);
    expect(Math.max(...xs)).toBeLessThan(24.6 * (CELL / SUB) + 1);
    // Every wall sees the plateau's middle as its upper side.
    const middle = { x: 16 * (CELL / SUB), y: 16 * (CELL / SUB) };
    for (const w of cliffWalls(lines, grid)) expect(belowCliff(w, middle)).toBe(false);
  });

  it('a drop of two steps at once is one cliff of two steps; terraces are two cliffs', () => {
    const steep = cliffLines(source({ '0_0': plateau(8, 8, 25, 25, 2) }), opts);
    expect(steep.map((l) => l.drop)).toEqual([2]);
    const terraces = cliffLines(source({ '0_0': plateau(12, 12, 21, 21, 2, plateau(4, 4, 29, 29, 1)) }), opts);
    expect(terraces.map((l) => l.drop).sort()).toEqual([1, 1]);
  });

  it('a pit: the higher ground is outside, so the line runs the other way round', () => {
    const lines = cliffLines(source({ '0_0': plateau(8, 8, 25, 25, -1) }), opts);
    expect(lines).toHaveLength(1);
    const middle = { x: 16 * (CELL / SUB), y: 16 * (CELL / SUB) };
    for (const w of cliffWalls(lines, grid)) expect(belowCliff(w, middle)).toBe(true);
  });

  it('a plateau across a block edge, and one on the edge of the painted blocks, closes all the same', () => {
    const across = cliffLines(source({ '0_0': plateau(120, 8, BLOCK_POINTS, 20, 1), '1_0': plateau(0, 8, 10, 20, 1) }), opts);
    expect(across).toHaveLength(1);
    expect(across[0]!.closed).toBe(true);
    // Only the right block painted, its plateau touching its left edge: the left block counts as flat.
    const edge = cliffLines(source({ '1_0': plateau(0, 8, 10, 20, 1) }), opts);
    expect(edge).toHaveLength(1);
    expect(edge[0]!.closed).toBe(true);
  });

  it('on the TV a missing block is unknown: no edge along it, the line stays open', () => {
    const lines = cliffLines(source({ '1_0': plateau(0, 8, 10, 20, 1) }, true), opts);
    expect(lines).toHaveLength(1);
    expect(lines[0]!.closed).toBe(false);
  });

  it('on the TV a point it was not sent is unknown too: raised ground at the edge of what it knows has no cliff', () => {
    // Known: support points 0…40 at step 1 (a plateau seen from on top); the rest of the block unknown.
    const edits: [number, number, number][] = [];
    for (let y = 0; y < BLOCK_POINTS; y++) for (let x = 0; x < BLOCK_POINTS; x++) edits.push([x, y, x <= 40 && y <= 40 ? 1 : UNKNOWN_STEP]);
    expect(cliffLines(source({ '0_0': withPoints(newBlock(), 'step', edits) }, true), opts)).toEqual([]);
  });

  it('where the slope mask is at least half, the cliff gives way to a ramp: the line opens there (E-89)', () => {
    const base = plateau(8, 8, 25, 25, 1);
    // A slope over the plateau's left edge, rows 12…20.
    const edits: [number, number, number][] = [];
    for (let y = 12; y <= 20; y++) for (let x = 5; x <= 11; x++) edits.push([x, y, 200]);
    const sloped = withPoints(base, 'slope', edits);
    const lines = cliffLines(source({ '0_0': sloped }), opts);
    expect(lines).toHaveLength(1);
    expect(lines[0]!.closed).toBe(false);
    // Both its ends are where the slope begins: there it runs out to a point (Teil B §11.5 „Auslauf“).
    expect(lines[0]!.runOut).toEqual([true, true]);
    // A weak slope keeps the cliff.
    const weak = withPoints(base, 'slope', edits.map(([x, y]) => [x, y, 100]));
    expect(cliffLines(source({ '0_0': weak }), opts)[0]!.closed).toBe(true);
  });

  it('a line ending where only the drop changes (a terrace meets lower ground) does not run out', () => {
    // Two steps up over the top half; below it, level 0 on the left and level 1 on the right.
    const edits: [number, number, number][] = [];
    for (let y = 0; y < 40; y++) for (let x = 0; x < 80; x++) {
      const v = y < 20 ? 2 : x >= 40 ? 1 : 0;
      if (v) edits.push([x, y, v]);
    }
    const lines = cliffLines(source({ '0_0': withPoints(newBlock(), 'step', edits) }), opts);
    expect(lines.some((l) => !l.closed)).toBe(true);
    for (const l of lines) expect(l.runOut).toEqual([false, false]);
  });

  it('erosion edges: along the upper rim of fine height steeper than 45°, none on a gentle slope (E-89)', () => {
    // Relief rising along x over the whole block, then level: steep (2 ft per support point, 1.25 ft
    // apart) or gentle (0.5 ft); a missing right neighbour is level with the top.
    const ramp = (perPoint: number) => {
      const edits: [number, number, number][] = [];
      for (let y = 0; y < BLOCK_POINTS; y++) for (let x = 0; x < BLOCK_POINTS; x++) edits.push([x, y, Math.round(Math.min(x, 9) * perPoint * 16)]);
      return withPoints(newBlock(), 'relief', edits);
    };
    const on = (b: ReturnType<typeof ramp>) => cliffLines({ blocks: new Map([['0_0', b]]), missingIsUnknown: true }, { ...opts, erosion: true });
    // The steep ramp meets its level top at x = 9: one edge there, the higher ground on its left.
    const rims = on(ramp(2));
    expect(rims.length).toBeGreaterThanOrEqual(1);
    for (const l of rims) for (const p of l.points) expect(Math.abs(p.x / (70 / 4) - 9)).toBeLessThan(1.5);
    expect(on(ramp(0.5))).toEqual([]);
    // Steps make no erosion edges, fine height no cliffs.
    expect(cliffLines(source({ '0_0': plateau(8, 8, 25, 25, 1) }), { ...opts, erosion: true })).toEqual([]);
    expect(cliffLines(source({ '0_0': ramp(2) }), opts)).toEqual([]);
  });

  it('erosion edges run on across block edges, and steep is 45° for the map\'s cell size', () => {
    // Relief rising steeply to the right edge of block -1_0, block 0_0 level with its top: the rim
    // lies on the edge between them.
    const edits: [number, number, number][] = [];
    for (let y = 0; y < BLOCK_POINTS; y++) for (let x = 110; x < BLOCK_POINTS; x++) edits.push([x, y, (x - 109) * 32]);
    const left = withPoints(newBlock(), 'relief', edits);
    const topEdits: [number, number, number][] = [];
    for (let y = 0; y < BLOCK_POINTS; y++) for (let x = 0; x < BLOCK_POINTS; x++) topEdits.push([x, y, 19 * 32]);
    const right = withPoints(newBlock(), 'relief', topEdits);
    // (Block 0_0's right edge drops to the missing level ground beyond it: a rim of its own.)
    const atSeam = (o: typeof opts) => cliffLines(source({ '-1_0': left, '0_0': right }), { ...o, erosion: true }).filter((l) => l.points.every((p) => Math.abs(p.x / (70 / 4)) < 1.5));
    const seam = atSeam(opts).flatMap((l) => l.points);
    // It runs the whole height of the blocks.
    expect(Math.max(...seam.map((p) => p.y)) - Math.min(...seam.map((p) => p.y))).toBeGreaterThan(120 * (70 / 4));
    // 2 ft per support point is steep in 5 ft cells (1.25 ft apart), not in 10 ft cells (2.5 ft apart).
    expect(atSeam({ ...opts, grid: { ...grid, feetPerCell: 10 } })).toEqual([]);
  });

  it('height lines leave out ground just off level (no specks at 0 ft)', () => {
    const speck = withPoints(newBlock(), 'relief', [[20, 20, -1], [21, 20, 3]]);
    expect(reliefLines(new Map([['0_0', speck]]), grid)).toEqual([]);
  });

  it('height lines of the fine height every 2 ft, for the DM (E-89)', () => {
    const edits: [number, number, number][] = [];
    for (let y = 0; y < 40; y++) for (let x = 0; x < 40; x++) edits.push([x, y, Math.max(0, 6 * 16 - Math.round(Math.hypot(x - 20, y - 20) * 8))]);
    const hill = withPoints(newBlock(), 'relief', edits);
    // A hill of 6 ft: rings at 2 and 4 ft (and where it reaches 6).
    expect(reliefLines(new Map([['0_0', hill]]), grid).length).toBeGreaterThanOrEqual(2);
    expect(reliefLines(new Map([['0_0', newBlock()]]), grid)).toEqual([]);
  });

  it('the same raster gives the same lines (DM and TV draw alike), noise sampled at the world position', () => {
    const blocks = { '0_0': plateau(8, 8, 25, 25, 1) };
    const a = cliffLines(source(blocks), { grid, noiseCells: 0.15 });
    const b = cliffLines(source(blocks), { grid, noiseCells: 0.15 }, new CliffCache());
    expect(b).toEqual(a);
  });

  it('the edge wanders by what lies on its upper side (Teil B §11.1): straight where nothing wanders, more where more does', () => {
    const blocks = { '0_0': plateau(8, 8, 25, 25, 1) };
    const [still] = cliffLines(source(blocks), { grid, noiseCells: 0.15, noiseAt: () => 0 });
    const [flat] = cliffLines(source(blocks), { grid, noiseCells: 0 });
    expect(still!.points).toEqual(flat!.points);
    const [rock] = cliffLines(source(blocks), { grid, noiseCells: 0, noiseAt: () => 0.15 });
    const [same] = cliffLines(source(blocks), { grid, noiseCells: 0.15 });
    rock!.points.forEach((p, i) => {
      expect(p.x).toBeCloseTo(same!.points[i]!.x, 6);
      expect(p.y).toBeCloseTo(same!.points[i]!.y, 6);
    });
    // Asked at points on the upper side (inside the plateau), with the line's drop.
    const asked: { p: { x: number; y: number }; drop: number }[] = [];
    cliffLines(source(blocks), { grid, noiseCells: 0, noiseAt: (p, drop) => (asked.push({ p, drop }), 0) });
    const inside = (p: { x: number; y: number }) => p.x > 2 * CELL && p.x < 6.25 * CELL && p.y > 2 * CELL && p.y < 6.25 * CELL;
    expect(asked.length).toBeGreaterThan(0);
    expect(asked.every((a) => inside(a.p) && a.drop === 1)).toBe(true);
  });

  it('follows a turned and shifted grid', () => {
    const turned = { ...grid, rotationDeg: 90, originX: 1000, originY: 500 };
    const [line] = cliffLines(source({ '0_0': plateau(8, 8, 25, 25, 1) }), { grid: turned, noiseCells: 0 });
    // Cell space x grows downwards on a grid turned by 90°, y to the left of the origin.
    expect(Math.min(...line!.points.map((p) => p.y))).toBeGreaterThan(500);
    expect(Math.max(...line!.points.map((p) => p.x))).toBeLessThan(1000);
  });

  it('an edit recomputes only the blocks it touches and their neighbours', () => {
    const cache = new CliffCache();
    const far = plateau(8, 8, 25, 25, 1);
    const blocks: Record<string, RasterBlock> = { '0_0': plateau(8, 8, 25, 25, 1), '5_5': far };
    cliffLines(source(blocks), opts, cache);
    const before = cache.computed;
    cliffLines(source({ ...blocks, '0_0': plateau(8, 8, 30, 30, 1) }), opts, cache);
    // 0_0 and the three blocks left/up of it that see its points; 5_5 and its neighbours come from the cache.
    expect(cache.computed - before).toBeLessThanOrEqual(4);
  });

  it('a large map (25 blocks with a wavy plateau) is worked out in well under 100 ms', () => {
    const blocks: Record<string, RasterBlock> = {};
    for (let by = 0; by < 5; by++)
      for (let bx = 0; bx < 5; bx++) {
        const edits: [number, number, number][] = [];
        for (let y = 0; y < BLOCK_POINTS; y++)
          for (let x = 0; x < BLOCK_POINTS; x++) {
            const gx = bx * BLOCK_POINTS + x;
            const gy = by * BLOCK_POINTS + y;
            edits.push([x, y, gy < 300 + Math.sin(gx / 20) * 40 ? 1 : 0]);
          }
        blocks[`${bx}_${by}`] = withPoints(newBlock(), 'step', edits);
      }
    // The fastest of three runs: other test files share the machine.
    let fastest = Infinity;
    for (let run = 0; run < 3; run++) {
      const t0 = performance.now();
      expect(cliffLines(source(blocks), { grid, noiseCells: 0.15 }).length).toBeGreaterThan(0);
      fastest = Math.min(fastest, performance.now() - t0);
    }
    expect(fastest).toBeLessThan(100);
  });
});
