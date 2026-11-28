/**
 * Detail levels of the terrain (Teil B §22.3, E-90): seen from far, the terrain is drawn from
 * textures baked per block instead of its hundreds of meshes – one quad per block. A level is the
 * screen's scale in device pixels rounded up to a power of two (1/16 … 1/4 px per map px), so the
 * baked textures together are about as large as the screen. A block is baked again when it or a
 * neighbour changed (shadows and ragged ground reach across a block's edge), the cliffs were built
 * again or the level changed, a few per frame; until every block has its texture the live terrain
 * shows. Close in they are freed. Shared by the DM window and the TV.
 */
import { Container, Matrix, Mesh, MeshGeometry, RenderTexture, type Renderer } from 'pixi.js';
import { BLOCK_CELLS, type RasterBlock } from '../../core/build/terrain/block';
import { neighbourKeys } from '../../core/build/terrain/groundSample';
import { fromCellSpace, toCellSpace, type GridConfig } from '../../core/grid';

/** At or below this scale (screen px per map px) the baked blocks show. */
export const BAKE_BELOW = 0.25;
const FINEST = 1 / 4;
const COARSEST = 1 / 16;
/** Time to spend baking per frame (ms); at least one block is baked. */
const BUDGET_MS = 6;

/** The level for a scale: the next power of two at or above it, within FINEST … COARSEST. */
export function bakeLevel(scale: number): number {
  return Math.min(FINEST, Math.max(COARSEST, 2 ** Math.ceil(Math.log2(Math.max(scale, 1e-6)))));
}

/** The keys of the blocks whose cells cover `area` (map px) on `grid`. */
export function blocksCovering(grid: GridConfig, area: { x: number; y: number; width: number; height: number }): string[] {
  const corners = [
    { x: area.x, y: area.y },
    { x: area.x + area.width, y: area.y },
    { x: area.x, y: area.y + area.height },
    { x: area.x + area.width, y: area.y + area.height },
  ].map((p) => toCellSpace(grid, p));
  const [x0, x1] = [Math.floor(Math.min(...corners.map((c) => c.x)) / BLOCK_CELLS), Math.floor(Math.max(...corners.map((c) => c.x)) / BLOCK_CELLS)];
  const [y0, y1] = [Math.floor(Math.min(...corners.map((c) => c.y)) / BLOCK_CELLS), Math.floor(Math.max(...corners.map((c) => c.y)) / BLOCK_CELLS)];
  const keys: string[] = [];
  for (let by = y0; by <= y1; by++) for (let bx = x0; bx <= x1; bx++) keys.push(`${bx}_${by}`);
  return keys;
}

/** Map px → block (bx, by)'s texture of w × h px: through its cells, as the grid may be turned (the block never is). */
export function bakeTransform(grid: GridConfig, bx: number, by: number, w: number, h: number): Matrix {
  const o = fromCellSpace(grid, { x: bx * BLOCK_CELLS, y: by * BLOCK_CELLS });
  const ex = fromCellSpace(grid, { x: bx * BLOCK_CELLS + 1, y: by * BLOCK_CELLS });
  const ey = fromCellSpace(grid, { x: bx * BLOCK_CELLS, y: by * BLOCK_CELLS + 1 });
  const toMap = new Matrix(ex.x - o.x, ex.y - o.y, ey.x - o.x, ey.y - o.y, o.x, o.y);
  return toMap.invert().prepend(new Matrix(w / BLOCK_CELLS, 0, 0, h / BLOCK_CELLS, 0, 0));
}

export interface BakeInput {
  readonly blocks: ReadonlyMap<string, RasterBlock>;
  readonly grid: GridConfig;
  readonly area: { readonly x: number; readonly y: number; readonly width: number; readonly height: number };
  /** Anything else that changes how every block looks (palette, light, band width …). */
  readonly look: string;
  /**
   * Rises whenever the cliff lines were built again: a line's texture, biome and foot run along all
   * of it, so a change at one end can show blocks away – every block is then due (the old ones show
   * until baked again).
   */
  readonly cliffs: number;
}

/** What a block was baked from. */
export interface BakedFrom {
  readonly level: number;
  readonly cliffs: number;
  /** The blocks around it (`neighbourKeys`), by identity. */
  readonly refs: readonly unknown[];
}

/** Whether a block baked from `had` is due again: at `level`, the cliffs at `cliffs`, its neighbours `around` now in `blocks`. */
export function bakeDue(had: BakedFrom | undefined, level: number, cliffs: number, around: readonly string[], blocks: ReadonlyMap<string, RasterBlock>): boolean {
  if (!had || had.level !== level || had.cliffs !== cliffs) return true;
  for (let i = 0; i < around.length; i++) if (had.refs[i] !== blocks.get(around[i]!)) return true;
  return false;
}

interface Baked extends BakedFrom {
  texture: RenderTexture;
  mesh: Mesh<MeshGeometry>;
}

export interface TerrainBake {
  /** The baked blocks; shown instead of the live terrain when far enough out. */
  readonly view: Container;
  /** The terrain changed (after the live terrain was built): which blocks to bake again. */
  update(input: BakeInput | null): void;
  /**
   * Before a frame at `scale` (device px per map px): bakes what is due within the budget, shows
   * baked or live. True if more is due.
   */
  prepare(scale: number): boolean;
  destroy(): void;
}

/** Bakes `live` (the terrain's live layers, drawn in map px) block by block with `renderer`. */
export function createTerrainBake(renderer: Renderer, live: Container): TerrainBake {
  const view = new Container();
  view.visible = false;
  const baked = new Map<string, Baked>();
  let input: BakeInput | null = null;
  /** The blocks the map covers, each with the keys of the blocks around it. */
  let keys = new Map<string, readonly string[]>();
  let look = '';

  const drop = (b: Baked) => {
    view.removeChild(b.mesh);
    b.mesh.geometry.destroy(true);
    b.mesh.destroy();
    b.texture.destroy(true);
  };
  const dropAll = () => {
    for (const b of baked.values()) drop(b);
    baked.clear();
  };

  const bake = (key: string, level: number, now: BakeInput) => {
    const [bx, by] = key.split('_').map(Number) as [number, number];
    const { grid } = now;
    const w = Math.max(1, Math.round(BLOCK_CELLS * grid.cellWidth * level));
    const h = Math.max(1, Math.round(BLOCK_CELLS * grid.cellHeight * level));
    const transform = bakeTransform(grid, bx, by, w, h);
    const had = baked.get(key);
    const texture = had && had.texture.width === w && had.texture.height === h ? had.texture : RenderTexture.create({ width: w, height: h });
    const shown = live.visible;
    live.visible = true;
    renderer.render({ container: live, target: texture, transform, clear: true, clearColor: [0, 0, 0, 0] });
    live.visible = shown;
    const from = { level, cliffs: now.cliffs, refs: keys.get(key)!.map((k) => now.blocks.get(k)) };
    if (had && had.texture === texture) {
      baked.set(key, { ...had, ...from });
      return;
    }
    if (had) drop(had);
    const corners = [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
    ].map(([u, v]) => fromCellSpace(grid, { x: (bx + u!) * BLOCK_CELLS, y: (by + v!) * BLOCK_CELLS }));
    const geometry = new MeshGeometry({ positions: new Float32Array(corners.flatMap((p) => [p.x, p.y])), uvs: new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]), indices: new Uint32Array([0, 1, 2, 0, 2, 3]) });
    const mesh = new Mesh({ geometry, texture });
    view.addChild(mesh);
    baked.set(key, { ...from, texture, mesh });
  };

  return {
    view,
    update(next) {
      input = next;
      if (!next) {
        dropAll();
        keys = new Map();
        look = '';
        return;
      }
      const nextLook = JSON.stringify([next.look, next.grid, next.area]);
      if (nextLook !== look) {
        // Every block looks different now: none is kept (a stale one would show until baked again).
        dropAll();
        look = nextLook;
        keys = new Map(
          blocksCovering(next.grid, next.area).map((k) => {
            const [bx, by] = k.split('_').map(Number) as [number, number];
            return [k, neighbourKeys(bx, by)];
          }),
        );
      }
    },
    prepare(scale) {
      if (!input || scale > BAKE_BELOW) {
        // Close in, the live terrain shows: the baked textures are freed (baked again when needed).
        if (baked.size) dropAll();
        view.visible = false;
        live.visible = true;
        return false;
      }
      const now = input;
      const level = bakeLevel(scale);
      const start = performance.now();
      let more = false;
      for (const [k, around] of keys) {
        if (!bakeDue(baked.get(k), level, now.cliffs, around, now.blocks)) continue;
        if (performance.now() - start > BUDGET_MS) {
          more = true;
          break;
        }
        bake(k, level, now);
      }
      // Live until every block has a texture; then the baked ones, even if some are still due.
      const complete = baked.size === keys.size;
      view.visible = complete;
      live.visible = !complete;
      return more;
    },
    destroy() {
      dropAll();
      view.destroy({ children: true });
    },
  };
}
