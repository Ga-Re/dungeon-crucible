import { describe, expect, it } from 'vitest';
import { DEFAULT_GRID } from '../../grid';
import { emptyTerrain, pointOf, setPoints } from './state';
import { applyStroke, brushOutline, brushPoints, lassoPoints, snapLasso, STEP_MAX, STEP_MIN, strokeStep } from './stepTool';

/**
 * The tool "Stufe" (E-87, Teil B §4.7, §18.3): a stroke sets the ground it covers to its start's
 * step ± 1 (or to a step picked), however often it passes; raising never lowers and lowering
 * never raises. Brushes round, square on the grid (or on quarter cells) and a lasso.
 */
const grid = { ...DEFAULT_GRID, cellWidth: 70, cellHeight: 70, originX: 0, originY: 0, rotationDeg: 0 };
const at = (cx: number, cy: number) => ({ x: cx * 70, y: cy * 70 });
const keys = (pts: Iterable<readonly [number, number]>) => new Set([...pts].map(([x, y]) => `${x},${y}`));

describe('the step a stroke sets', () => {
  it('its start ± 1, or the step picked; within −8 … +15', () => {
    expect(strokeStep('raise', 2, 0)).toBe(3);
    expect(strokeStep('lower', 2, 0)).toBe(1);
    expect(strokeStep('set', 2, 5)).toBe(5);
    expect(strokeStep('raise', STEP_MAX, 0)).toBe(STEP_MAX);
    expect(strokeStep('lower', STEP_MIN, 0)).toBe(STEP_MIN);
    expect(strokeStep('set', 0, 99)).toBe(STEP_MAX);
  });
});

describe('brushes', () => {
  it('a square brush of one cell covers that cell\'s support points, its far edge included', () => {
    const pts = keys(brushPoints([at(2.5, 3.5)], 'square', 1, grid, false));
    expect(pts.size).toBe(25);
    expect(pts.has('8,12')).toBe(true);
    expect(pts.has('12,16')).toBe(true);
    expect(pts.has('13,12')).toBe(false);
  });

  it('a square brush on quarter cells snaps to quarter cells', () => {
    const pts = keys(brushPoints([at(2.6, 3.6)], 'square', 1, grid, true));
    // One cell wide (4 quarters) about the quarter cell under the pointer.
    expect(pts.size).toBe(25);
    expect(pts.has('9,13')).toBe(true);
    expect(pts.has('8,12')).toBe(false);
  });

  it('a round brush covers a disc; a stroke covers its whole path', () => {
    const disc = keys(brushPoints([at(5, 5)], 'round', 2, grid, false));
    expect(disc.has('20,20')).toBe(true);
    expect(disc.has('24,20')).toBe(true);
    expect(disc.has('24,24')).toBe(false);
    const line = keys(brushPoints([at(5, 5), at(15, 5)], 'round', 1, grid, false));
    for (let x = 20; x <= 60; x++) expect(line.has(`${x},20`)).toBe(true);
  });

  it('a lasso fills its inside, the border included; its corners snap to cell (or quarter) corners', () => {
    const square = [at(1, 1), at(3, 1), at(3, 3), at(1, 3)];
    const pts = keys(lassoPoints(square, grid));
    expect(pts.size).toBe(81);
    expect(snapLasso(at(1.2, 2.9), grid, false)).toEqual(at(1, 3));
    expect(snapLasso(at(1.2, 2.9), grid, true)).toEqual(at(1.25, 3));
  });

  it('the square brush\'s outline is the square it paints', () => {
    expect(brushOutline(at(2.5, 3.5), 'square', 1, grid, false)).toEqual([at(2, 3), at(3, 3), at(3, 4), at(2, 4)]);
    expect(brushOutline(at(2.5, 3.5), 'round', 2, grid, false)[0]).toEqual(at(3.5, 3.5));
  });

  it('follows a turned grid', () => {
    const turned = { ...grid, rotationDeg: 90 };
    // Cell (0, 0) of a grid turned by 90° lies left of the origin.
    const pts = keys(brushPoints([{ x: -35, y: 35 }], 'square', 1, turned, false));
    expect(pts.has('0,0')).toBe(true);
    expect(pts.has('4,4')).toBe(true);
  });
});

describe('a stroke', () => {
  const pts = [...brushPoints([at(2.5, 2.5), at(6.5, 2.5)], 'square', 1, grid, false)];

  it('raises to its start + 1 however often it passes (plateau logic), and never lowers', () => {
    const hill = setPoints(emptyTerrain(['temperate']), 'map', 'step', [[30, 10, 4]]);
    const once = applyStroke(hill, 'map', pts, 'raise', 1);
    const twice = applyStroke(once, 'map', pts, 'raise', 1);
    expect(pointOf(twice, 'map', 'step', 10, 10)).toBe(1);
    // A higher step under the stroke stays.
    expect(pointOf(twice, 'map', 'step', 30, 10)).toBe(4);
  });

  it('lowering never raises; setting sets', () => {
    const t = setPoints(emptyTerrain(['temperate']), 'map', 'step', [[10, 10, 3], [20, 10, -2]]);
    const lowered = applyStroke(t, 'map', pts, 'lower', 2);
    expect(pointOf(lowered, 'map', 'step', 10, 10)).toBe(2);
    expect(pointOf(lowered, 'map', 'step', 20, 10)).toBe(-2);
    const set = applyStroke(t, 'map', pts, 'set', 1);
    expect(pointOf(set, 'map', 'step', 20, 10)).toBe(1);
  });

  it('paints the stack it is given and leaves blocks it does not reach shared', () => {
    const far = setPoints(emptyTerrain(['temperate']), 'map', 'step', [[1000, 1000, 1]]);
    const out = applyStroke(far, 'cellar', pts, 'raise', 1);
    expect(pointOf(out, 'cellar', 'step', 10, 10)).toBe(1);
    expect(pointOf(out, 'map', 'step', 10, 10)).toBe(0);
    expect(out.stacks.get('map')).toBe(far.stacks.get('map'));
  });
});
