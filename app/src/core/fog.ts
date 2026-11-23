/**
 * Fog of war state on a cell grid with three states:
 *  - unexplored: cell never seen (opaque for players)
 *  - explored:   seen before ("memory fog")
 *  - visible:    inside a player's current sight (computed per frame, not stored)
 *
 * Locked cells (secret rooms) can never be revealed by vision or bulk reveal
 * until the DM unlocks them. Manual DM brushes may still reveal them on purpose.
 */
import { pointInPolygon, type Point } from './geometry';

export interface FogCellGrid {
  cols: number;
  rows: number;
  /** Map pixels per fog cell. */
  cellSize: number;
}

export class FogState {
  readonly cols: number;
  readonly rows: number;
  readonly cellSize: number;
  readonly explored: Uint8Array;
  readonly locked: Uint8Array;

  constructor(grid: FogCellGrid, explored?: Uint8Array, locked?: Uint8Array) {
    if (grid.cols <= 0 || grid.rows <= 0 || grid.cellSize <= 0) throw new Error('Invalid fog grid');
    this.cols = grid.cols;
    this.rows = grid.rows;
    this.cellSize = grid.cellSize;
    const n = grid.cols * grid.rows;
    this.explored = explored ?? new Uint8Array(n);
    this.locked = locked ?? new Uint8Array(n);
    if (this.explored.length !== n || this.locked.length !== n) throw new Error('Fog buffer size mismatch');
  }

  index(col: number, row: number): number {
    return row * this.cols + col;
  }

  inBounds(col: number, row: number): boolean {
    return col >= 0 && row >= 0 && col < this.cols && row < this.rows;
  }

  isExplored(col: number, row: number): boolean {
    return this.inBounds(col, row) && this.explored[this.index(col, row)] === 1;
  }

  exploredCount(): number {
    let n = 0;
    for (const v of this.explored) n += v;
    return n;
  }

  /** Marks a cell explored. Locked cells are skipped unless `force` is set. */
  reveal(col: number, row: number, force = false): void {
    if (!this.inBounds(col, row)) return;
    const i = this.index(col, row);
    if (this.locked[i] && !force) return;
    this.explored[i] = 1;
  }

  hide(col: number, row: number): void {
    if (this.inBounds(col, row)) this.explored[this.index(col, row)] = 0;
  }

  /** DM brush: affects every cell whose centre is within `radius` of `center`. */
  brush(center: Point, radius: number, mode: 'reveal' | 'hide'): void {
    this.forCellsInCircle(center, radius, (c, r) => (mode === 'reveal' ? this.reveal(c, r, true) : this.hide(c, r)));
  }

  /** DM rectangle tool (map pixels). */
  revealRect(x0: number, y0: number, x1: number, y1: number): void {
    const s = this.cellSize;
    const c0 = Math.floor(Math.min(x0, x1) / s);
    const c1 = Math.ceil(Math.max(x0, x1) / s);
    const r0 = Math.floor(Math.min(y0, y1) / s);
    const r1 = Math.ceil(Math.max(y0, y1) / s);
    for (let r = r0; r < r1; r++) for (let c = c0; c < c1; c++) this.reveal(c, r, true);
  }

  revealAll(): void {
    for (let i = 0; i < this.explored.length; i++) if (!this.locked[i]) this.explored[i] = 1;
  }

  hideAll(): void {
    this.explored.fill(0);
  }

  setLocked(cells: Iterable<[number, number]>, locked: boolean): void {
    for (const [c, r] of cells) if (this.inBounds(c, r)) this.locked[this.index(c, r)] = locked ? 1 : 0;
  }

  /**
   * Marks cells seen by a viewer. A cell counts as seen when its centre or one of
   * its slightly inset corners lies in the visibility polygon and the sight radius.
   */
  markVisible(origin: Point, radius: number, poly: readonly Point[]): number {
    const s = this.cellSize;
    let changed = 0;
    const inset = Math.min(1, s * 0.05);
    this.forCellsInCircle(origin, radius + s, (c, r) => {
      const i = this.index(c, r);
      if (this.explored[i] || this.locked[i]) return;
      const x = c * s;
      const y = r * s;
      const samples: Point[] = [
        { x: x + s / 2, y: y + s / 2 },
        { x: x + inset, y: y + inset },
        { x: x + s - inset, y: y + inset },
        { x: x + inset, y: y + s - inset },
        { x: x + s - inset, y: y + s - inset },
      ];
      const seen = samples.some(
        (p) => Math.hypot(p.x - origin.x, p.y - origin.y) <= radius && pointInPolygon(p, poly),
      );
      if (seen) {
        this.explored[i] = 1;
        changed++;
      }
    });
    return changed;
  }

  private forCellsInCircle(center: Point, radius: number, fn: (col: number, row: number) => void): void {
    const s = this.cellSize;
    const c0 = Math.max(0, Math.floor((center.x - radius) / s));
    const c1 = Math.min(this.cols - 1, Math.floor((center.x + radius) / s));
    const r0 = Math.max(0, Math.floor((center.y - radius) / s));
    const r1 = Math.min(this.rows - 1, Math.floor((center.y + radius) / s));
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        const cx = (c + 0.5) * s;
        const cy = (r + 0.5) * s;
        if (Math.hypot(cx - center.x, cy - center.y) <= radius) fn(c, r);
      }
    }
  }

  /** Compact run-length encoding for sidecar/scene files, e.g. "0:120,1:8,0:40". */
  encode(): string {
    return rle(this.explored);
  }

  static decode(grid: FogCellGrid, data: string, locked?: Uint8Array): FogState {
    return new FogState(grid, unrle(data, grid.cols * grid.rows), locked);
  }
}

export function rle(buf: Uint8Array): string {
  if (buf.length === 0) return '';
  const parts: string[] = [];
  let cur = buf[0];
  let n = 0;
  for (const v of buf) {
    if (v === cur) n++;
    else {
      parts.push(`${cur}:${n}`);
      cur = v;
      n = 1;
    }
  }
  parts.push(`${cur}:${n}`);
  return parts.join(',');
}

export function unrle(data: string, length: number): Uint8Array {
  const out = new Uint8Array(length);
  if (!data) return out;
  let i = 0;
  for (const part of data.split(',')) {
    const [v, n] = part.split(':').map(Number);
    if (!Number.isInteger(v) || !Number.isInteger(n) || n < 0 || (v !== 0 && v !== 1)) throw new Error('Corrupt fog data');
    if (i + n > length) throw new Error('Fog data longer than grid');
    out.fill(v, i, i + n);
    i += n;
  }
  if (i !== length) throw new Error('Fog data shorter than grid');
  return out;
}
