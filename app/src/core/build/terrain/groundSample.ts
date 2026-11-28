/**
 * The ground of a block as the splat drawing reads it (E-88): per class present the weights on the
 * block's support points and the first ones of its right and lower neighbours, and the biome
 * weights of its cells with a ring of the neighbours' cells around them (cell centres lie inside,
 * so a block edge falls between two of them) – neighbouring blocks meet without a seam. Each layer
 * is drawn over what lies below it in a fixed order (Auto, then the classes by number; the first
 * biome, then the others by place) and covers its share of that: the weight over the weights up
 * to and with it. A missing neighbour counts as Auto ground of the first biome. Pure.
 */
import { toCellSpace, type GridConfig } from '../../grid';
import type { Point } from '../../geometry';
import { BLOCK_CELLS, BLOCK_POINTS, blockKeyOf, SUBDIVISIONS, type RasterBlock } from './block';

/** Side of a block's point data: its points and the neighbours' first ones. */
export const POINT_SIDE = BLOCK_POINTS + 1;
/** Side of a block's cell data: its cells and a ring of its neighbours'. */
export const CELL_SIDE = BLOCK_CELLS + 2;

export interface BlockGround {
  /**
   * Per class number present, on POINT_SIDE² points (four bytes each): R its weight, G the weights
   * up to and with it (Auto and the classes of lower number), so its share of what lies below is R / G.
   */
  readonly classes: ReadonlyMap<number, Uint8Array>;
  /** RGBA per cell, CELL_SIDE² cells: the weights of the palette's four places. */
  readonly biomes: Uint8Array;
  /** Palette places other than the first with weight somewhere in the block. */
  readonly slots: ReadonlySet<number>;
}

/** The blocks a block's data reads, by their offset from it (−1 … 1 each way). */
export function neighbourKeys(bx: number, by: number): string[] {
  const out: string[] = [];
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) out.push(`${bx + dx}_${by + dy}`);
  return out;
}

/** The ground of block (bx, by) of `blocks` for drawing. */
export function blockGround(bx: number, by: number, blocks: ReadonlyMap<string, RasterBlock>): BlockGround {
  const at = (dx: number, dy: number) => blocks.get(`${bx + dx}_${by + dy}`);
  // Points: its own and the right and lower neighbours' first.
  const pointWeights: Map<number, number>[] = [];
  const present = new Set<number>();
  for (let y = 0; y < POINT_SIDE; y++)
    for (let x = 0; x < POINT_SIDE; x++) {
      const b = at(x === BLOCK_POINTS ? 1 : 0, y === BLOCK_POINTS ? 1 : 0);
      const m = new Map<number, number>();
      if (b) {
        const i = (y % BLOCK_POINTS) * BLOCK_POINTS + (x % BLOCK_POINTS);
        for (const [cc, cw] of [['ground1Class', 'ground1Weight'], ['ground2Class', 'ground2Weight']] as const) {
          const c = b.planes[cc][i]!;
          const w = b.planes[cw][i]!;
          if (!c || !w) continue;
          m.set(c, Math.min(255, (m.get(c) ?? 0) + w));
          present.add(c);
        }
      }
      pointWeights.push(m);
    }
  const ids = [...present].sort((a, b) => a - b);
  const classes = new Map(ids.map((c) => [c, new Uint8Array(POINT_SIDE * POINT_SIDE * 4)] as const));
  pointWeights.forEach((m, p) => {
    let painted = 0;
    for (const w of m.values()) painted += w;
    // Up to and with each class: Auto, then the classes by number.
    let below = 255 - Math.min(255, painted);
    for (const c of ids) {
      const w = m.get(c) ?? 0;
      below += w;
      const plane = classes.get(c)!;
      plane[p * 4] = w;
      plane[p * 4 + 1] = Math.min(255, below);
      plane[p * 4 + 3] = 255;
    }
  });
  // Cells: its own and a ring of its neighbours'.
  const biomes = new Uint8Array(CELL_SIDE * CELL_SIDE * 4);
  const slots = new Set<number>();
  for (let y = 0; y < CELL_SIDE; y++)
    for (let x = 0; x < CELL_SIDE; x++) {
      const cx = x - 1;
      const cy = y - 1;
      const b = at(Math.floor(cx / BLOCK_CELLS), Math.floor(cy / BLOCK_CELLS));
      const i = (cy - Math.floor(cy / BLOCK_CELLS) * BLOCK_CELLS) * BLOCK_CELLS + (cx - Math.floor(cx / BLOCK_CELLS) * BLOCK_CELLS);
      const o = (y * CELL_SIDE + x) * 4;
      const w = b ? [b.planes.biome1[i]!, b.planes.biome2[i]!, b.planes.biome3[i]!, b.planes.biome4[i]!] : [255, 0, 0, 0];
      w.forEach((v, k) => {
        biomes[o + k] = v;
        if (k > 0 && v > 0) slots.add(k);
      });
    }
  return { classes, biomes, slots };
}

/** The biome weights (0…1, four palette places) of the cell at map point `p`; a block not there: the first biome. */
export function biomeWeightsAtPx(blocks: ReadonlyMap<string, RasterBlock>, grid: GridConfig, p: Point): number[] {
  const c = toCellSpace(grid, p);
  const cx = Math.floor(c.x);
  const cy = Math.floor(c.y);
  const b = blocks.get(blockKeyOf(cx * SUBDIVISIONS, cy * SUBDIVISIONS));
  if (!b) return [1, 0, 0, 0];
  const i = (cy - Math.floor(cy / BLOCK_CELLS) * BLOCK_CELLS) * BLOCK_CELLS + (cx - Math.floor(cx / BLOCK_CELLS) * BLOCK_CELLS);
  return [b.planes.biome1[i]!, b.planes.biome2[i]!, b.planes.biome3[i]!, b.planes.biome4[i]!].map((v) => v / 255);
}
