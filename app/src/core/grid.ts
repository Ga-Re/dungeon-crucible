/**
 * Grid model, calibration with an N×N box and physical table calibration.
 *
 * Map space: pixels of the map image. The grid is described in map space.
 * Table space: physical pixels of the table monitor. Physical calibration finds
 * the zoom at which one grid cell is exactly `inchesPerCell` inches on the glass,
 * so real miniatures (1 inch bases) fit the squares.
 */
import type { Point } from './geometry';

/** Square grids only (decision E-7: the hex grid was removed). */
export type GridType = 'square';

export interface GridConfig {
  type: GridType;
  /** Cell width in map pixels. */
  cellWidth: number;
  /** Cell height in map pixels. Equal to cellWidth for undistorted maps. */
  cellHeight: number;
  /** Map-pixel position of a grid corner. */
  originX: number;
  originY: number;
  /** Grid rotation relative to the image, in degrees. */
  rotationDeg: number;
  /** Game distance represented by one cell (5 ft in D&D). */
  feetPerCell: number;
}

export const DEFAULT_GRID: GridConfig = {
  type: 'square',
  cellWidth: 70,
  cellHeight: 70,
  originX: 0,
  originY: 0,
  rotationDeg: 0,
  feetPerCell: 5,
};

/** A square box on the map (map px): its top left corner and side length. */
export interface GridBox {
  x: number;
  y: number;
  size: number;
}

/**
 * The square dragged from `a` towards `b` (E-7): its side is the longer of the two drag
 * distances, and it lies in the direction of the drag.
 */
export function squareBox(a: Point, b: Point): GridBox {
  const size = Math.max(Math.abs(b.x - a.x), Math.abs(b.y - a.y));
  return { x: b.x < a.x ? a.x - size : a.x, y: b.y < a.y ? a.y - size : a.y, size };
}

/**
 * Grid calibration (E-7, DC-021): a box laid over `cells` × `cells` cells of the map's printed
 * grid gives the cell size and the offset. The grid is not turned; nothing changes for an empty
 * box or cell count.
 */
export function gridFromBox(grid: GridConfig, box: GridBox, cells: number): GridConfig {
  if (box.size <= 0 || cells < 1) return grid;
  const cell = box.size / cells;
  return { ...grid, cellWidth: cell, cellHeight: cell, rotationDeg: 0, originX: mod(box.x, cell), originY: mod(box.y, cell) };
}

/** Moves the grid by (dx, dy) map px; the offset stays within one cell. */
export function shiftGrid(grid: GridConfig, dx: number, dy: number): GridConfig {
  return { ...grid, originX: mod(grid.originX + dx, grid.cellWidth), originY: mod(grid.originY + dy, grid.cellHeight) };
}

/* ---------- Physical table calibration ---------- */

export interface DisplaySpec {
  /** Visible diagonal in inches, e.g. 55. */
  diagonalInches: number;
  widthPx: number;
  heightPx: number;
}

/** Pixels per inch of a display from its diagonal and resolution. */
export function pixelsPerInch(d: DisplaySpec): number {
  if (d.diagonalInches <= 0) throw new Error('Diagonal must be positive');
  return Math.hypot(d.widthPx, d.heightPx) / d.diagonalInches;
}

/** Physical size of the display area in inches. */
export function displaySizeInches(d: DisplaySpec): { width: number; height: number } {
  const ppi = pixelsPerInch(d);
  return { width: d.widthPx / ppi, height: d.heightPx / ppi };
}

/**
 * Zoom factor (table pixels per map pixel) so one grid cell measures
 * `inchesPerCell` inches on the table. `ppiCorrection` lets the user fine-tune
 * after measuring with a ruler (1 = no correction).
 */
export function tableZoomForPhysicalGrid(
  grid: Pick<GridConfig, 'cellWidth'>,
  display: DisplaySpec,
  inchesPerCell = 1,
  ppiCorrection = 1,
): number {
  const tableCellPx = pixelsPerInch(display) * ppiCorrection * inchesPerCell;
  return tableCellPx / grid.cellWidth;
}

/** How many grid cells fit on the table at physical scale. */
export function cellsVisibleOnTable(display: DisplaySpec, inchesPerCell = 1): { cols: number; rows: number } {
  const size = displaySizeInches(display);
  return { cols: Math.floor(size.width / inchesPerCell), rows: Math.floor(size.height / inchesPerCell) };
}

/**
 * Correction factor from a ruler check: the user draws a test square that should
 * be `expectedInches` wide and measures `measuredInches`.
 */
export function ppiCorrectionFromMeasurement(expectedInches: number, measuredInches: number): number {
  if (measuredInches <= 0) throw new Error('Measured size must be positive');
  return expectedInches / measuredInches;
}

/* ---------- Cell addressing ---------- */

export interface CellCoord {
  col: number;
  row: number;
}

function toGridSpace(grid: GridConfig, p: Point): Point {
  const r = (-grid.rotationDeg * Math.PI) / 180;
  const x = p.x - grid.originX;
  const y = p.y - grid.originY;
  return { x: x * Math.cos(r) - y * Math.sin(r), y: x * Math.sin(r) + y * Math.cos(r) };
}

function fromGridSpace(grid: GridConfig, p: Point): Point {
  const r = (grid.rotationDeg * Math.PI) / 180;
  return {
    x: p.x * Math.cos(r) - p.y * Math.sin(r) + grid.originX,
    y: p.x * Math.sin(r) + p.y * Math.cos(r) + grid.originY,
  };
}

/** A map point in cells of the grid, not rounded (column, row; turned with the grid). */
export function toCellSpace(grid: GridConfig, p: Point): Point {
  const g = toGridSpace(grid, p);
  return { x: g.x / grid.cellWidth, y: g.y / grid.cellHeight };
}

/** A point in cells of the grid (column, row, not rounded) as a map point: the inverse of `toCellSpace`. */
export function fromCellSpace(grid: GridConfig, p: Point): Point {
  return fromGridSpace(grid, { x: p.x * grid.cellWidth, y: p.y * grid.cellHeight });
}

/** Cell containing a map point. */
export function cellAt(grid: GridConfig, p: Point): CellCoord {
  const g = toGridSpace(grid, p);
  return { col: Math.floor(g.x / grid.cellWidth), row: Math.floor(g.y / grid.cellHeight) };
}

/** Map-space centre of a cell. */
export function cellCenter(grid: GridConfig, c: CellCoord): Point {
  return fromGridSpace(grid, { x: (c.col + 0.5) * grid.cellWidth, y: (c.row + 0.5) * grid.cellHeight });
}

/** Snaps a point to the nearest grid corner (also on a rotated grid). */
export function snapToCorner(grid: GridConfig, p: Point): Point {
  const g = toGridSpace(grid, p);
  return fromGridSpace(grid, { x: Math.round(g.x / grid.cellWidth) * grid.cellWidth, y: Math.round(g.y / grid.cellHeight) * grid.cellHeight });
}

/** Snaps a point to the nearest cell centre. */
export function snapToCell(grid: GridConfig, p: Point): Point {
  return cellCenter(grid, cellAt(grid, p));
}

/**
 * Distance in feet between two map points using the 2024 rules default for a
 * square grid: every square, diagonal or not, costs one cell.
 */
export function gridDistanceFeet(grid: GridConfig, a: Point, b: Point): number {
  const ca = cellAt(grid, a);
  const cb = cellAt(grid, b);
  return Math.max(Math.abs(ca.col - cb.col), Math.abs(ca.row - cb.row)) * grid.feetPerCell;
}

function mod(a: number, n: number): number {
  return ((a % n) + n) % n;
}
