/**
 * Grid model, 3-point calibration and physical table calibration.
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

export interface CalibrationResult {
  cellWidth: number;
  cellHeight: number;
  rotationDeg: number;
  originX: number;
  originY: number;
  /** Relative difference between cell width and height (0 = perfectly square). */
  distortion: number;
  /** Angle between the two measured axes minus 90° (0 = perfectly orthogonal). */
  skewDeg: number;
}

/**
 * 3-point calibration: `origin` is a grid corner, `alongX` a corner `cellsX`
 * cells to the right, `alongY` a corner `cellsY` cells down. Using several cells
 * per axis reduces click error.
 */
export function calibrateFromThreePoints(
  origin: Point,
  alongX: Point,
  alongY: Point,
  cellsX = 1,
  cellsY = 1,
): CalibrationResult {
  if (cellsX <= 0 || cellsY <= 0) throw new Error('Cell counts must be positive');
  const ax = { x: alongX.x - origin.x, y: alongX.y - origin.y };
  const ay = { x: alongY.x - origin.x, y: alongY.y - origin.y };
  const lenX = Math.hypot(ax.x, ax.y);
  const lenY = Math.hypot(ay.x, ay.y);
  if (lenX < 1e-6 || lenY < 1e-6) throw new Error('Calibration points must be distinct');
  const cellWidth = lenX / cellsX;
  const cellHeight = lenY / cellsY;
  const rotationDeg = (Math.atan2(ax.y, ax.x) * 180) / Math.PI;
  const between = (Math.acos(clamp((ax.x * ay.x + ax.y * ay.y) / (lenX * lenY), -1, 1)) * 180) / Math.PI;
  return {
    cellWidth,
    cellHeight,
    rotationDeg,
    originX: mod(origin.x, cellWidth),
    originY: mod(origin.y, cellHeight),
    distortion: Math.abs(cellWidth - cellHeight) / Math.max(cellWidth, cellHeight),
    skewDeg: between - 90,
  };
}

export function applyCalibration(grid: GridConfig, c: CalibrationResult): GridConfig {
  return {
    ...grid,
    cellWidth: c.cellWidth,
    cellHeight: c.cellHeight,
    rotationDeg: c.rotationDeg,
    originX: c.originX,
    originY: c.originY,
  };
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

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function mod(a: number, n: number): number {
  return ((a % n) + n) % n;
}
