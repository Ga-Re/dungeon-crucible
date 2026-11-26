import { describe, expect, it } from 'vitest';
import { isInside } from '../poly/fog';
import type { Polygon } from '../poly/types';
import { paintFloor, type FloorPatch } from './floors';

const square = (x: number, y: number, s: number): Polygon => ({ outer: [[x, y], [x + s, y], [x + s, y + s], [x, y + s]], holes: [] });
let n = 0;
const fresh = () => `floor-${++n}`;
const at = (patches: FloorPatch[], x: number, y: number) => patches.find((p) => isInside(p.shape, [x, y]))?.style ?? null;

describe('paintFloor (E-33, DC-107b)', () => {
  it('paints a new floor area', () => {
    const out = paintFloor([], square(0, 0, 100), 'marble', false, fresh);
    expect(out).toHaveLength(1);
    expect(at(out, 50, 50)).toBe('marble');
  });

  it('the same floor merges into one area', () => {
    const a = paintFloor([], square(0, 0, 100), 'marble', false, fresh);
    const b = paintFloor(a, square(80, 0, 100), 'marble', false, fresh);
    expect(b).toHaveLength(1);
    expect(at(b, 150, 50)).toBe('marble');
    expect(b[0].id).toBe(a[0].id);
  });

  it('painting over another floor replaces it there', () => {
    const a = paintFloor([], square(0, 0, 100), 'marble', false, fresh);
    const b = paintFloor(a, square(50, 0, 100), 'carpet', false, fresh);
    expect(at(b, 25, 50)).toBe('marble');
    expect(at(b, 75, 50)).toBe('carpet');
  });

  it('the eraser takes floor away; an area erased whole goes', () => {
    const a = paintFloor([], square(0, 0, 100), 'gravel', false, fresh);
    const b = paintFloor(a, square(0, 0, 50), 'gravel', true, fresh);
    expect(at(b, 25, 25)).toBeNull();
    expect(at(b, 75, 75)).toBe('gravel');
    expect(paintFloor(b, square(-10, -10, 200), 'gravel', true, fresh)).toEqual([]);
  });
});
