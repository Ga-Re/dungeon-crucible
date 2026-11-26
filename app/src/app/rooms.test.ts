import { beforeEach, describe, expect, it } from 'vitest';
import { addRoomDrag, addBuildPoint, deleteBuildSelection, endBuildCommand, finishBuildWall, moveBuildPoint, roomsToWalls, startBuildCommand, updateBuildCommand, updateRoom } from './build';
import { checkpoint, setWorkspace, sightWalls, state, toggleDoor, undo } from './store';
import { sceneMap } from '../core/build/sceneDrawing';

const roomWalls = () => sceneMap(state.scene).masonry.filter((w) => w.id.startsWith('room~'));

/** Parametric rooms (DC-026, E-45) in the Map Forge, on the sample crypt (cells of 70 px, 5 ft). */
describe('rooms', () => {
  beforeEach(() => {
    setWorkspace('forge');
    state.scene.map.rooms = [];
    state.buildSelection = null;
  });

  it('a rectangle dragged becomes a room with walls and a floor; one undoable step', () => {
    startBuildCommand('room');
    updateBuildCommand({ roomKind: 'rect', roomFloor: 'marble', thicknessFt: 1 });
    expect(addRoomDrag({ x: 3500, y: 3500 }, { x: 3510, y: 3505 }, false, 8)).toBe(false);
    expect(addRoomDrag({ x: 3502, y: 3498 }, { x: 3778, y: 3712 }, false, 8)).toBe(true);
    const [r] = state.scene.map.rooms!;
    expect(r).toMatchObject({ kind: 'rect', points: [{ x: 3500, y: 3500 }, { x: 3780, y: 3710 }], floor: 'marble', thickness: 14 });
    expect(state.buildSelection).toMatchObject({ kind: 'room', wall: r.id });
    expect(roomWalls()).toHaveLength(1);
    expect(sceneMap(state.scene).floors.some((f) => f.id === `room~${r.id}~floor`)).toBe(true);
    expect(sightWalls(state.scene).some((w) => w.id.startsWith(`room~${r.id}`))).toBe(true);
    undo();
    expect(state.scene.map.rooms ?? []).toEqual([]);
    endBuildCommand(false);
  });

  it('a polygon is clicked, a corridor ends with a double-click; a room cannot be drawn in a scene', () => {
    startBuildCommand('room');
    updateBuildCommand({ roomKind: 'polygon' });
    for (const p of [{ x: 3500, y: 3500 }, { x: 3780, y: 3500 }, { x: 3640, y: 3710 }]) addBuildPoint(p, 8);
    addBuildPoint({ x: 3501, y: 3501 }, 8);
    expect(state.scene.map.rooms!.at(-1)).toMatchObject({ kind: 'polygon' });
    updateBuildCommand({ roomKind: 'corridor', corridorWidthFt: 5 });
    for (const p of [{ x: 3500, y: 4000 }, { x: 3800, y: 4000 }]) addBuildPoint(p, 8);
    finishBuildWall();
    expect(state.scene.map.rooms!.at(-1)).toMatchObject({ kind: 'corridor', width: 70 });
    endBuildCommand(false);
    setWorkspace('play');
    startBuildCommand('room');
    expect(state.buildCommand).toBeNull();
  });

  it('two rooms side by side get a door that opens in play; rooms and the door state survive switching', () => {
    startBuildCommand('room');
    updateBuildCommand({ roomKind: 'rect' });
    addRoomDrag({ x: 3500, y: 3500 }, { x: 3780, y: 3710 }, false, 8);
    addRoomDrag({ x: 3780, y: 3500 }, { x: 4060, y: 3710 }, false, 8);
    endBuildCommand(false);
    const ids = state.scene.map.rooms!.map((r) => r.id);
    setWorkspace('play');
    expect(state.scene.map.rooms!.map((r) => r.id)).toEqual(ids);
    const door = sightWalls(state.scene).find((w) => w.kind === 'door' && w.id.includes(ids[0]));
    expect(door).toBeTruthy();
    expect(door!.open).toBeFalsy();
    toggleDoor(door!.id);
    expect(sightWalls(state.scene).find((w) => w.id === door!.id)!.open).toBe(true);
    setWorkspace('forge');
    setWorkspace('play');
    expect(sightWalls(state.scene).find((w) => w.id === door!.id)!.open).toBe(true);
    setWorkspace('forge');
  });

  it('a corner dragged reshapes it, Delete removes it, settings change; each undoable', () => {
    startBuildCommand('room');
    addRoomDrag({ x: 3500, y: 3500 }, { x: 3780, y: 3710 }, false, 8);
    endBuildCommand(false);
    const id = state.scene.map.rooms![0].id;
    checkpoint();
    moveBuildPoint({ kind: 'room', wall: id }, 2, { x: 3850, y: 3780 }, true, 8);
    expect(state.scene.map.rooms![0].points[1]).toEqual({ x: 3850, y: 3780 });
    updateRoom(id, { style: 'brick', floor: undefined });
    expect(state.scene.map.rooms![0].style).toBe('brick');
    expect(state.scene.map.rooms![0].floor).toBeUndefined();
    undo();
    expect(state.scene.map.rooms![0].floor).toBeDefined();
    undo();
    expect(state.scene.map.rooms![0].points[1]).toEqual({ x: 3780, y: 3710 });
    state.buildSelection = { kind: 'room', wall: id, point: null, door: null };
    deleteBuildSelection();
    expect(state.scene.map.rooms).toEqual([]);
  });

  it('turned into walls: the rooms go, their walls, door and floors stay as drawn ones with proper ids', () => {
    const walls = state.scene.map.masonry.length;
    startBuildCommand('room');
    addRoomDrag({ x: 3500, y: 3500 }, { x: 3780, y: 3710 }, false, 8);
    addRoomDrag({ x: 3780, y: 3500 }, { x: 4060, y: 3710 }, false, 8);
    endBuildCommand(false);
    const shown = roomWalls().length;
    roomsToWalls();
    expect(state.scene.map.rooms).toEqual([]);
    expect(state.scene.map.masonry.length).toBe(walls + shown);
    expect([...state.scene.map.masonry, ...state.scene.map.masonryDoors, ...state.scene.map.floors].every((x) => /^[a-z0-9_-]+$/.test(x.id))).toBe(true);
    expect(state.scene.map.masonryDoors.some((d) => state.scene.map.masonry.some((w) => w.id === d.wall))).toBe(true);
    undo();
    expect(state.scene.map.rooms).toHaveLength(2);
  });
});

describe('rooms after the review', () => {
  it('deleting a storey takes its rooms along', async () => {
    const { addStorey, deleteStorey, setWorkingStorey } = await import('./store');
    setWorkspace('forge');
    setWorkingStorey('');
    addStorey('Attic', true);
    const storey = state.scene.map.storey!;
    startBuildCommand('room');
    addRoomDrag({ x: 3500, y: 3500 }, { x: 3780, y: 3710 }, false, 8);
    endBuildCommand(false);
    expect(state.scene.map.rooms!.some((r) => r.storey === storey)).toBe(true);
    deleteStorey(storey);
    expect(state.scene.map.rooms!.some((r) => r.storey === storey)).toBe(false);
  });
});
