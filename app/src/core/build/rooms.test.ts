import { describe, expect, it } from 'vitest';
import { deriveRooms, deriveRoomsByLayer, insertRoomPoint, movedRoomHandle, roomHandles, roomPolygon, withoutRoomPoint, type Room } from './rooms';
import type { Masonry } from './masonry';
import { isInside } from '../poly/fog';

const CELL = 70;
const rect = (id: string, x0: number, y0: number, x1: number, y1: number, extra: Partial<Room> = {}): Room => ({ id, kind: 'rect', points: [{ x: x0, y: y0 }, { x: x1, y: y1 }], style: 'dungeon-stone', thickness: 14, floor: 'dungeon-stone', seed: 1, ...extra });
const none = { masonry: [] as Masonry[], masonryDoors: [] };

/** Parametric rooms (DC-026, E-45). */
describe('rooms become walls, doors and floors', () => {
  it('one room: a closed wall around it and its floor', () => {
    const d = deriveRooms([rect('a', 0, 0, 280, 210)], none, CELL);
    const rings = d.masonry.filter((w) => w.closed);
    expect(rings).toHaveLength(1);
    expect(d.floors).toHaveLength(1);
    expect(isInside(d.floors[0].shape, [140, 105])).toBe(true);
    expect(d.masonryDoors).toEqual([]);
  });

  it('two rooms side by side: one outer wall, a wall between with a door', () => {
    const d = deriveRooms([rect('a', 0, 0, 280, 210), rect('b', 280, 0, 560, 210)], none, CELL);
    expect(d.masonry.filter((w) => w.closed)).toHaveLength(1);
    const between = d.masonry.filter((w) => !w.closed);
    expect(between).toHaveLength(1);
    expect(between[0].points.every((p) => Math.abs(p.x - 280) < 0.01)).toBe(true);
    expect(d.masonryDoors).toHaveLength(1);
    expect(d.masonryDoors[0].wall).toBe(between[0].id);
  });

  it('overlapping rooms melt into one, without a wall or door inside', () => {
    const d = deriveRooms([rect('a', 0, 0, 280, 210), rect('b', 210, 70, 490, 280)], none, CELL);
    expect(d.masonry.filter((w) => w.closed)).toHaveLength(1);
    expect(d.masonry.filter((w) => !w.closed)).toHaveLength(0);
    expect(d.masonryDoors).toEqual([]);
  });

  it('a hand-drawn wall crossing a room is cut where it runs inside; its door goes with the piece it is on', () => {
    const hand: Masonry = { id: 'h', points: [{ x: -140, y: 105 }, { x: 420, y: 105 }], closed: false, style: 'brick', thickness: 14, seed: 2 };
    const d = deriveRooms([rect('a', 0, 0, 280, 210)], { masonry: [hand], masonryDoors: [{ id: 'hd', wall: 'h', at: 490, width: 50, secret: false, crack: false }] }, CELL);
    const pieces = d.masonry.filter((w) => w.id === 'h' || w.id.startsWith('h~'));
    expect(pieces).toHaveLength(2);
    expect(pieces.some((w) => w.points.some((p) => p.x > 0 && p.x < 280 && Math.abs(p.y - 105) < 0.01 && w.points.length === 2 && Math.abs(w.points[0].x - w.points[1].x) > 200))).toBe(false);
    const door = d.masonryDoors.find((x) => x.id === 'hd')!;
    const piece = pieces.find((w) => w.id === door.wall)!;
    expect(piece.points.some((p) => p.x >= 280)).toBe(true);
    expect(door.at).toBeCloseTo(70);
  });

  it('a hand wall the rooms do not touch stays exactly as it is', () => {
    const hand: Masonry = { id: 'far', points: [{ x: 1000, y: 0 }, { x: 1200, y: 0 }], closed: false, style: 'brick', thickness: 14, seed: 2 };
    const d = deriveRooms([rect('a', 0, 0, 280, 210)], { masonry: [hand], masonryDoors: [] }, CELL);
    expect(d.masonry).toContain(hand);
  });

  it('a round room and a corridor have a shape around their middle and along their path', () => {
    const tower = roomPolygon({ id: 't', kind: 'circle', points: [{ x: 500, y: 500 }, { x: 640, y: 500 }], style: 'dungeon-stone', thickness: 14, seed: 1 });
    expect(isInside([{ outer: tower, holes: [] }], [500, 500])).toBe(true);
    expect(isInside([{ outer: tower, holes: [] }], [500, 650])).toBe(false);
    const corridor = roomPolygon({ id: 'c', kind: 'corridor', points: [{ x: 0, y: 35 }, { x: 350, y: 35 }, { x: 350, y: 385 }], width: 70, style: 'dungeon-stone', thickness: 14, seed: 1 });
    const shape = [{ outer: corridor, holes: [] }];
    expect(isInside(shape, [175, 35])).toBe(true);
    expect(isInside(shape, [350, 200])).toBe(true);
    expect(isInside(shape, [175, 200])).toBe(false);
  });

  it('a corridor ending at the wall of a room gets a door there', () => {
    const d = deriveRooms([rect('a', 0, 0, 280, 210), { id: 'c', kind: 'corridor', points: [{ x: 280, y: 105 }, { x: 560, y: 105 }], width: 70, style: 'dungeon-stone', thickness: 14, seed: 1 }], none, CELL);
    expect(d.masonryDoors).toHaveLength(1);
  });
});

describe('rooms in the scene drawing (E-45)', () => {
  const lists = () => ({ masonry: [] as Masonry[], masonryDoors: [], cliffs: [], waters: [], floors: [], grid: { cellWidth: CELL } });

  it('only the rooms of the storey shown are drawn; the result is reused while nothing changed', async () => {
    const { sceneMap } = await import('./sceneDrawing');
    const rooms = [rect('a', 0, 0, 280, 210), rect('b', 0, 0, 140, 140, { storey: 'up' })];
    const ground = { ...lists(), rooms };
    const shown = sceneMap({ map: ground });
    expect(shown.masonry.filter((w) => w.closed)).toHaveLength(1);
    expect(shown.floors).toHaveLength(1);
    expect(sceneMap({ map: ground })).toEqual(shown);
    expect(sceneMap({ map: ground }).masonry).toBe(shown.masonry);
    const up = sceneMap({ map: { ...lists(), rooms, storey: 'up' } });
    expect(up.masonry[0].id).toContain('room~b');
    const empty = { ...lists(), rooms: [] };
    expect(sceneMap({ map: empty })).toBe(empty);
  });
});

describe('editing a room (E-45)', () => {
  it('a rectangle is grabbed at its four corners; a corner moved keeps the opposite one', () => {
    const r = rect('a', 0, 0, 280, 210);
    expect(roomHandles(r)).toEqual([{ x: 0, y: 0 }, { x: 280, y: 0 }, { x: 280, y: 210 }, { x: 0, y: 210 }]);
    const m = movedRoomHandle(r, 1, { x: 350, y: -70 });
    expect(roomPolygon(m)).toEqual([[0, -70], [350, -70], [350, 210], [0, 210]]);
  });

  it('a round room moves with its centre and grows with its rim', () => {
    const c: Room = { ...rect('c', 0, 0, 0, 0), kind: 'circle', points: [{ x: 100, y: 100 }, { x: 200, y: 100 }] };
    expect(movedRoomHandle(c, 0, { x: 150, y: 100 }).points).toEqual([{ x: 150, y: 100 }, { x: 250, y: 100 }]);
    expect(movedRoomHandle(c, 1, { x: 100, y: 300 }).points[1]).toEqual({ x: 100, y: 300 });
  });

  it('a polygon gets a point on its outline, the closing side too, and loses points down to three', () => {
    const p: Room = { ...rect('p', 0, 0, 0, 0), kind: 'polygon', points: [{ x: 0, y: 0 }, { x: 280, y: 0 }, { x: 140, y: 210 }] };
    expect(insertRoomPoint(p, { x: 140, y: 2 }, 5)?.index).toBe(1);
    expect(insertRoomPoint(p, { x: 70, y: 105 }, 5)?.index).toBe(3);
    expect(insertRoomPoint(p, { x: 140, y: 100 }, 5)).toBeNull();
    expect(withoutRoomPoint(p, 0)).toBeNull();
    expect(withoutRoomPoint(rect('r', 0, 0, 70, 70), 0)).toBeNull();
  });
});

describe('rooms and layers, and the scene drawing (review)', () => {
  const lists = () => ({ masonry: [] as Masonry[], masonryDoors: [], cliffs: [], waters: [], floors: [], grid: { cellWidth: CELL } });

  it('rooms melt and cut only within their layer', () => {
    const hand: Masonry = { id: 'h', points: [{ x: -140, y: 105 }, { x: 420, y: 105 }], closed: false, style: 'brick', thickness: 14, seed: 2 };
    const d = deriveRoomsByLayer([rect('a', 0, 0, 280, 210), rect('b', 280, 0, 560, 210, { layer: 'wing' })], { masonry: [hand], masonryDoors: [] }, CELL);
    // Two rings, no door between layers; the base wall is cut by the base room only.
    expect(d.masonry.filter((w) => w.closed)).toHaveLength(2);
    expect(d.masonryDoors).toEqual([]);
    expect(d.masonry.filter((w) => w.id.startsWith('h')).map((w) => w.points.length)).toHaveLength(2);
    expect(d.masonry.find((w) => w.closed && w.layer === 'wing')?.id).toContain('room~b');
  });

  it('other map fields are never served from the cache', async () => {
    const { sceneMap } = await import('./sceneDrawing');
    const map = { ...lists(), rooms: [rect('a', 0, 0, 280, 210)], lightAngle: 45 };
    sceneMap({ map });
    map.lightAngle = 90;
    const cliffs = [{ id: 'c' }] as never[];
    (map as { cliffs: never[] }).cliffs = cliffs;
    const shown = sceneMap({ map });
    expect(shown.lightAngle).toBe(90);
    expect(shown.cliffs).toBe(cliffs);
  });

  it("a scene's own walls are not cut by rooms; a scene can hide a room's wall", async () => {
    const { sceneMap, emptyOwnDrawing } = await import('./sceneDrawing');
    const map = { ...lists(), rooms: [rect('a', 0, 0, 280, 210)] };
    const own = { ...emptyOwnDrawing(), masonry: [{ id: 'o', points: [{ x: 70, y: 105 }, { x: 210, y: 105 }], closed: false, style: 'brick' as const, thickness: 14, seed: 1 }] };
    const ring = sceneMap({ map }).masonry[0].id;
    const shown = sceneMap({ map, own, drawnHidden: [ring] });
    expect(shown.masonry.map((w) => w.id)).toEqual(['o']);
  });
});
