/**
 * Scheduling of derivations (E-53, Teil B §9.2): after an edit, the blocks it changed and their
 * neighbours within a stage's halo are derived again, those nearest the view first. Every job
 * carries its block's generation: a result of a job begun before a newer one is stale and
 * dropped, so a slow job never paints over a newer state. Pure.
 */
import { BLOCK_CELLS } from '../terrain/block';

/** How many blocks a halo of `cells` reaches beyond a block's edge. */
export function haloBlocks(cells: number): number {
  return Math.ceil(Math.max(0, cells) / BLOCK_CELLS);
}

const parse = (key: string) => {
  const [bx, by] = key.split('_').map(Number);
  return { bx: bx!, by: by! };
};

/** The changed blocks and every block within `halo` blocks of one (a square around it). */
export function dirtyBlocks(changed: Iterable<string>, halo: number): Set<string> {
  const out = new Set<string>();
  for (const key of changed) {
    const { bx, by } = parse(key);
    for (let dy = -halo; dy <= halo; dy++) for (let dx = -halo; dx <= halo; dx++) out.add(`${bx + dx}_${by + dy}`);
  }
  return out;
}

/** `keys` nearest `focus` (a block position, e.g. the view's centre) first; ties in key order. */
export function byDistance(keys: Iterable<string>, focus: { bx: number; by: number }): string[] {
  const d = (key: string) => {
    const { bx, by } = parse(key);
    return Math.max(Math.abs(bx - focus.bx), Math.abs(by - focus.by));
  };
  return [...keys].sort((a, b) => d(a) - d(b) || (a < b ? -1 : a > b ? 1 : 0));
}

/** The newest job per block: a job may deliver only while it is still its block's newest. */
export class Generations {
  private readonly latest = new Map<string, number>();
  private next = 1;

  begin(key: string): number {
    const g = this.next++;
    this.latest.set(key, g);
    return g;
  }

  current(key: string, generation: number): boolean {
    return this.latest.get(key) === generation;
  }

  /** The block is gone (or no longer shown): no job of it delivers any more. */
  drop(key: string): void {
    this.latest.delete(key);
  }
}
