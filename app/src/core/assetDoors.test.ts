import { describe, expect, it } from 'vitest';
import { assetDoorWalls, cutForDoors, wallsWithAssetDoors } from './assetDoors';
import { DEFAULT_GRID } from './grid';
import type { Wall } from './scene';

/** Doors that assets bring (E-29, DC-042 step 2). Grid: 70 px cells. */
const grid = DEFAULT_GRID;
const info = { 'library/door.png': { sizeCells: { w: 1, h: 1 }, door: { x1: 0, y1: 0.5, x2: 1, y2: 0.5 } } };
const place = (p: Partial<{ id: string; x: number; y: number; rotation: number; scale: number }> = {}) => ({ id: 'd1', assetPath: 'library/door.png', x: 105, y: 140, rotation: 0, scale: 1, ...p });
const wall = (id: string, x1: number, y1: number, x2: number, y2: number, extra: Partial<Wall> = {}): Wall => ({ id, kind: 'wall', x1, y1, x2, y2, ...extra });
const ends = (ws: readonly Wall[]) => ws.map((w) => [w.id, w.kind, Math.round(w.x1), Math.round(w.y1), Math.round(w.x2), Math.round(w.y2)]);

describe('door of a placed asset', () => {
  it('lies where the door line is on the turned and scaled footprint; closed unless the scene opened it', () => {
    expect(ends(assetDoorWalls([place()], info, grid, {}))).toEqual([['d1:door', 'door', 70, 140, 140, 140]]);
    expect(ends(assetDoorWalls([place({ rotation: 90 })], info, grid, {}))).toEqual([['d1:door', 'door', 105, 105, 105, 175]]);
    expect(assetDoorWalls([place()], info, grid, { 'd1:door': true })[0].open).toBe(true);
    expect(assetDoorWalls([place()], info, grid, {})[0].open).toBe(false);
  });

  it('takes the layer of its placement; assets without a door bring none', () => {
    expect(assetDoorWalls([{ ...place(), layer: 'inside' }], info, grid, {})[0].layer).toBe('inside');
    expect(assetDoorWalls([{ ...place(), assetPath: 'library/rock.png' }], info, grid, {})).toEqual([]);
  });
});

describe('cutting the wall open', () => {
  const door = assetDoorWalls([place()], info, grid, {});

  it('a wall the door lies on gets a gap there', () => {
    expect(ends(cutForDoors([wall('w', 0, 140, 420, 140)], door))).toEqual([
      ['w~1', 'wall', 0, 140, 70, 140],
      ['w~2', 'wall', 140, 140, 420, 140],
    ]);
  });

  it('also when the wall runs the other way or the door sits a pixel off', () => {
    expect(ends(cutForDoors([wall('w', 420, 141, 0, 141)], door))).toEqual([
      ['w~1', 'wall', 420, 141, 140, 141],
      ['w~2', 'wall', 70, 141, 0, 141],
    ]);
  });

  it('a door over a wall end leaves one piece; a wall off the door line or a door stays whole', () => {
    expect(ends(cutForDoors([wall('w', 100, 140, 420, 140)], door))).toEqual([['w~2', 'wall', 140, 140, 420, 140]]);
    expect(ends(cutForDoors([wall('w', 0, 160, 420, 160)], door))).toEqual([['w', 'wall', 0, 160, 420, 160]]);
    expect(ends(cutForDoors([wall('x', 0, 140, 420, 140, { kind: 'door' })], door))).toEqual([['x', 'door', 0, 140, 420, 140]]);
  });

  it('two doors on one wall: two gaps; the pieces keep the layer', () => {
    const two = assetDoorWalls([place(), place({ id: 'd2', x: 315 })], info, grid, {});
    const out = cutForDoors([wall('w', 0, 140, 420, 140, { layer: 'l' })], two);
    expect(ends(out).map((e) => e.slice(2))).toEqual([[0, 140, 70, 140], [140, 140, 280, 140], [350, 140, 420, 140]]);
    expect(out.every((w) => w.layer === 'l')).toBe(true);
  });
});

describe('the walls sight and light use', () => {
  it('are the cut walls plus the asset doors; the same list while nothing changed', () => {
    const walls = [wall('w', 0, 140, 420, 140)];
    const a = wallsWithAssetDoors(walls, [place()], info, grid, {});
    expect(ends(a).map((e) => e[0])).toEqual(['w~1', 'w~2', 'd1:door']);
    expect(wallsWithAssetDoors(walls, [place()], info, grid, {})).toBe(a);
    // Without asset doors: the walls themselves.
    expect(wallsWithAssetDoors(walls, [], info, grid, {})).toBe(walls);
  });
});
