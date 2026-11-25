import { describe, expect, it } from 'vitest';
import { createSampleScene } from '../../sample/crypt';
import type { Scene } from '../scene';
import { foundKey } from './masonry';
import { masonrySightWalls, toggledMasonryDoor, withMasonry } from './sight';

function scene(): Scene {
  const s = createSampleScene();
  s.map.masonry = [
    { id: 'm-a', points: [{ x: 0, y: 0 }, { x: 200, y: 0 }], closed: false, style: 'dungeon-stone', thickness: 10, seed: 1 },
    { id: 'm-b', points: [{ x: 0, y: 100 }, { x: 200, y: 100 }], closed: false, style: 'dungeon-stone', thickness: 10, seed: 2, layer: 'upper' },
  ];
  s.map.masonryDoors = [{ id: 'd-a', wall: 'm-a', at: 100, width: 40, secret: true, crack: false }];
  s.map.layers = [{ id: 'upper', name: 'Upper', height: 1, defaultActive: false, editorHidden: false, locked: false }];
  return s;
}

describe('masonrySightWalls', () => {
  it('derives the walls of the active layers, with the scene door states', () => {
    const s = scene();
    s.masonryDoorsOpen = { 'd-a': true };
    const walls = masonrySightWalls(s, false);
    expect(walls.some((w) => w.id.startsWith('m-b'))).toBe(false);
    expect(walls.find((w) => w.id === 'd-a')).toMatchObject({ kind: 'secret-door', open: true });
    s.layersOn = { upper: true };
    expect(masonrySightWalls(s, false).some((w) => w.id.startsWith('m-b'))).toBe(true);
  });

  it('takes every layer in the Map Forge', () => {
    expect(masonrySightWalls(scene(), true).some((w) => w.id.startsWith('m-b'))).toBe(true);
  });

  it('gives the same list while nothing changed', () => {
    const s = scene();
    expect(masonrySightWalls(s, false)).toBe(masonrySightWalls(s, false));
    s.masonryDoorsOpen = { 'd-a': true };
    expect(masonrySightWalls(s, false).find((w) => w.id === 'd-a')?.open).toBe(true);
  });
});

describe('withMasonry', () => {
  it('is the walls themselves without drawn walls, and a stable list with them', () => {
    const walls = createSampleScene().walls;
    expect(withMasonry(walls, [])).toBe(walls);
    const extra = masonrySightWalls(scene(), true);
    const both = withMasonry(walls, extra);
    expect(both).toHaveLength(walls.length + extra.length);
    expect(withMasonry(walls, extra)).toBe(both);
  });

  it('sees walls changed in place', () => {
    const walls = createSampleScene().walls;
    const extra = masonrySightWalls(scene(), true);
    const before = withMasonry(walls, extra);
    walls.push({ id: 'late', kind: 'wall', x1: 0, y1: 1500, x2: 100, y2: 1500 });
    expect(withMasonry(walls, extra).some((w) => w.id === 'late')).toBe(true);
    walls[0].x1 += 10;
    const moved = withMasonry(walls, extra);
    expect(moved[0].x1).toBe(walls[0].x1);
    expect(moved).not.toBe(before);
  });
});

describe('toggledMasonryDoor', () => {
  it('opens and closes a door; opening a secret door marks it found for good', () => {
    const s = scene();
    const opened = toggledMasonryDoor(s.map.masonryDoors, {}, 'd-a');
    expect(opened).toEqual({ 'd-a': true, [foundKey('d-a')]: true });
    expect(toggledMasonryDoor(s.map.masonryDoors, opened!, 'd-a')).toEqual({ 'd-a': false, [foundKey('d-a')]: true });
  });

  it('does not mark a plain door found', () => {
    const doors = [{ id: 'd', wall: 'm-a', at: 50, width: 40, secret: false, crack: false }];
    expect(toggledMasonryDoor(doors, {}, 'd')).toEqual({ d: true });
  });

  it('is null for an unknown door', () => {
    expect(toggledMasonryDoor(scene().map.masonryDoors, {}, 'x')).toBeNull();
  });
});

describe('masonrySightWalls after an edit in place', () => {
  it('sees moved points', () => {
    const s = scene();
    masonrySightWalls(s, true);
    s.map.masonry[0].points[1].x = 300;
    expect(masonrySightWalls(s, true).find((w) => w.id.startsWith('m-a#0~1'))?.x2).toBe(300);
  });
});
