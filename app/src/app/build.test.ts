import { beforeEach, describe, expect, it } from 'vitest';
import { addBuildPoint, addBuildStroke, buildHit, paintFloorStroke, setMapLook, flipWater, setWaterAnimated, updateWater, deleteBuildSelection, flipCliff, updateCliff, endBuildCommand, finishBuildWall, insertBuildPoint, moveBuildPoint, placeBuildDoor, selectBuild, splitBuildWall, startBuildCommand, updateBuildCommand, updateBuildDoor } from './build';
import { checkpoint, setWorkspace, sightWalls, state, undo } from './store';

/** The "Build" tab (E-33, DC-107a) in the Map Forge, on the sample crypt (cells of 70 px, 5 ft). */
describe('build tab', () => {
  beforeEach(() => {
    setWorkspace('forge');
    state.scene.map.masonry = [];
    state.scene.map.masonryDoors = [];
    state.scene.map.cliffs = [];
    state.scene.map.drawn = false;
    state.buildSelection = null;
  });

  it('draws a wall point by point; it counts for sight and is one undoable step', () => {
    startBuildCommand('wall');
    updateBuildCommand({ style: 'brick', thicknessFt: 2 });
    addBuildPoint({ x: 0, y: 3000 }, 8);
    addBuildPoint({ x: 280, y: 3000 }, 8);
    addBuildPoint({ x: 280, y: 3280 }, 8);
    finishBuildWall();
    const [w] = state.scene.map.masonry;
    expect(w).toMatchObject({ style: 'brick', thickness: 28, closed: false });
    expect(w.points).toHaveLength(3);
    expect(state.buildSelection).toEqual({ kind: 'wall', wall: w.id, point: null, door: null });
    expect(sightWalls(state.scene).some((x) => x.id.startsWith(`${w.id}#`))).toBe(true);
    // Drawing goes on with a new wall; the options stay.
    expect(state.buildCommand).toMatchObject({ points: [], style: 'brick' });
    undo();
    expect(state.scene.map.masonry).toEqual([]);
    endBuildCommand(false);
    expect(state.tool).toBe('build-edit');
  });

  it('a click on the first point closes the ring', () => {
    startBuildCommand('wall');
    for (const p of [{ x: 0, y: 0 }, { x: 140, y: 0 }, { x: 140, y: 140 }]) addBuildPoint(p, 8);
    addBuildPoint({ x: 3, y: 2 }, 8);
    expect(state.scene.map.masonry[0]).toMatchObject({ closed: true });
    expect(state.scene.map.masonry[0].points).toHaveLength(3);
  });

  it("a drawn map's area follows what is drawn, left and up too", () => {
    state.scene.map.drawn = true;
    startBuildCommand('wall');
    addBuildPoint({ x: -700, y: -350 }, 8);
    addBuildPoint({ x: 700, y: -350 }, 8);
    finishBuildWall();
    // The wall's thickness (7 px each side) reaches into the next cell; two cells of margin beyond.
    expect(state.scene.map.origin).toEqual({ x: -910, y: -560 });
    expect(state.scene.map.widthPx).toBe(1820);
  });

  it('places a secret door on a wall; its settings change; Delete removes it', () => {
    startBuildCommand('wall');
    addBuildPoint({ x: 0, y: 3500 }, 8);
    addBuildPoint({ x: 350, y: 3500 }, 8);
    finishBuildWall();
    startBuildCommand('door');
    updateBuildCommand({ secret: true });
    expect(placeBuildDoor({ x: 120, y: 3505 }, false, 20)).toBe(true);
    const [d] = state.scene.map.masonryDoors;
    expect(d).toMatchObject({ at: 105, width: 70, secret: true, crack: false });
    expect(sightWalls(state.scene).find((x) => x.id === d.id)?.kind).toBe('secret-door');
    updateBuildDoor(d.id, { crack: true });
    expect(state.scene.map.masonryDoors[0].crack).toBe(true);
    // A door that stops being secret loses its crack.
    updateBuildDoor(d.id, { secret: false });
    expect(state.scene.map.masonryDoors[0]).toMatchObject({ secret: false, crack: false });
    expect(placeBuildDoor({ x: 120, y: 3700 }, false, 20)).toBe(false);
    expect(deleteBuildSelection()).toBe(true);
    expect(state.scene.map.masonryDoors).toEqual([]);
  });

  it('inserts, moves and joins points; splits a wall', () => {
    startBuildCommand('wall');
    addBuildPoint({ x: 0, y: 4000 }, 8);
    addBuildPoint({ x: 280, y: 4000 }, 8);
    finishBuildWall();
    addBuildPoint({ x: 420, y: 4000 }, 8);
    addBuildPoint({ x: 700, y: 4000 }, 8);
    finishBuildWall();
    endBuildCommand(false);
    const [a, b] = state.scene.map.masonry;
    const i = insertBuildPoint({ kind: 'wall', wall: a.id }, { x: 140, y: 4003 });
    expect(i).toBe(1);
    expect(state.scene.map.masonry[0].points[1]).toEqual({ x: 140, y: 4000 });
    // Dragging a's last point onto b's first joins them into one wall.
    checkpoint();
    moveBuildPoint({ kind: 'wall', wall: a.id }, 2, { x: 420, y: 4000 }, true, 8);
    expect(state.scene.map.masonry).toHaveLength(1);
    expect(state.scene.map.masonry[0].points.map((p) => p.x)).toEqual([0, 140, 420, 700]);
    expect(state.scene.map.masonry.some((w) => w.id === b.id)).toBe(false);
    selectBuild({ kind: 'wall', wall: a.id, point: 2, door: null });
    splitBuildWall();
    expect(state.scene.map.masonry.map((w) => w.points.length)).toEqual([3, 2]);
  });
});

describe('cliffs in the build tab (E-34)', () => {
  beforeEach(() => {
    setWorkspace('forge');
    state.scene.map.masonry = [];
    state.scene.map.masonryDoors = [];
    state.scene.map.cliffs = [];
    state.buildSelection = null;
  });

  it('draws a steep cliff that blocks sight one way; flips; scree never blocks', () => {
    startBuildCommand('cliff');
    updateBuildCommand({ cliffKind: 'rock', form: 'edge', steep: true });
    addBuildPoint({ x: 0, y: 5000 }, 8);
    addBuildPoint({ x: 420, y: 5000 }, 8);
    finishBuildWall();
    const [c] = state.scene.map.cliffs;
    expect(c).toMatchObject({ kind: 'rock', form: 'edge', closed: false, steep: true });
    expect(state.buildSelection).toEqual({ kind: 'cliff', wall: c.id, point: null, door: null });
    expect(sightWalls(state.scene).filter((w) => w.id.startsWith(`${c.id}#`)).every((w) => w.kind === 'cliff')).toBe(true);
    flipCliff(c.id);
    expect(state.scene.map.cliffs[0].points[0]).toEqual({ x: 420, y: 5000 });
    updateCliff(c.id, { kind: 'scree' });
    expect(state.scene.map.cliffs[0].steep).toBe(false);
    expect(sightWalls(state.scene).some((w) => w.id.startsWith(`${c.id}#`))).toBe(false);
    undo();
    expect(state.scene.map.cliffs[0].kind).toBe('rock');
  });

  it('a click on its start closes a ring: a pit; flipping makes it a plateau', () => {
    startBuildCommand('cliff');
    updateBuildCommand({ form: 'edge' });
    for (const p of [{ x: 0, y: 6000 }, { x: 280, y: 6000 }, { x: 280, y: 6280 }]) addBuildPoint(p, 8);
    addBuildPoint({ x: 2, y: 6001 }, 8);
    const [c] = state.scene.map.cliffs;
    expect(c).toMatchObject({ closed: true, form: 'ring', inside: 'low' });
    flipCliff(c.id);
    expect(state.scene.map.cliffs[0].inside).toBe('high');
  });

  it('is picked and edited like a wall', () => {
    startBuildCommand('cliff');
    addBuildPoint({ x: 0, y: 7000 }, 8);
    addBuildPoint({ x: 280, y: 7000 }, 8);
    addBuildPoint({ x: 560, y: 7000 }, 8);
    finishBuildWall();
    endBuildCommand(false);
    const id = state.scene.map.cliffs[0].id;
    expect(buildHit({ x: 281, y: 7001 }, 8)).toEqual({ kind: 'cliff', wall: id, point: 1, door: null });
    // On its face (below the upper edge), not only on the edge itself.
    expect(buildHit({ x: 140, y: 7030 }, 8)).toEqual({ kind: 'cliff', wall: id, point: null, door: null });
    selectBuild({ kind: 'cliff', wall: id, point: 1, door: null });
    deleteBuildSelection();
    expect(state.scene.map.cliffs[0].points).toHaveLength(2);
  });
});

describe('drawing with the brush (E-35, DC-107e)', () => {
  beforeEach(() => {
    setWorkspace('forge');
    state.scene.map.masonry = [];
    state.scene.map.masonryDoors = [];
    state.scene.map.cliffs = [];
    state.buildSelection = null;
  });
  const wobbly = (y: number) => Array.from({ length: 80 }, (_, i) => ({ x: i * 5, y: y + Math.sin(i) * 1.5 }));

  it('a stroke becomes a wall of few points at once', () => {
    startBuildCommand('wall');
    addBuildStroke(wobbly(8000), false, 8);
    const [w] = state.scene.map.masonry;
    expect(w.points.length).toBeLessThan(6);
    expect(w.points[0]).toEqual({ x: 0, y: 8000 });
    expect(state.buildCommand?.points).toEqual([]);
  });

  it('a stroke ending at its start is a ring; for a cliff a pit', () => {
    startBuildCommand('cliff');
    const square = [...Array.from({ length: 20 }, (_, i) => ({ x: i * 14, y: 9000 })), ...Array.from({ length: 20 }, (_, i) => ({ x: 280, y: 9000 + i * 14 })), ...Array.from({ length: 20 }, (_, i) => ({ x: 280 - i * 14, y: 9280 })), ...Array.from({ length: 21 }, (_, i) => ({ x: 0, y: 9280 - i * 14 }))];
    addBuildStroke(square, false, 8);
    expect(state.scene.map.cliffs[0]).toMatchObject({ closed: true, form: 'ring' });
  });

  it('its ends snap onto points of other lines', () => {
    startBuildCommand('wall');
    addBuildPoint({ x: 0, y: 10000 }, 8);
    addBuildPoint({ x: 280, y: 10000 }, 8);
    finishBuildWall();
    addBuildStroke([{ x: 283, y: 10003 }, { x: 350, y: 10070 }, { x: 420, y: 10140 }], false, 8);
    expect(state.scene.map.masonry[1].points[0]).toEqual({ x: 280, y: 10000 });
  });

  it('with Shift a straight piece, snapped like clicks', () => {
    startBuildCommand('wall');
    // Grid corners every 70 px: 10990 is one.
    addBuildStroke([{ x: 3, y: 10993 }, { x: 100, y: 11090 }, { x: 207, y: 10993 }], true, 8);
    expect(state.scene.map.masonry[0].points).toEqual([{ x: 0, y: 10990 }, { x: 210, y: 10990 }]);
  });

  it('after clicked points a stroke carries the line on', () => {
    startBuildCommand('wall');
    addBuildPoint({ x: 0, y: 12000 }, 8);
    addBuildStroke(wobbly(12000), false, 8);
    expect(state.scene.map.masonry).toHaveLength(0);
    expect(state.buildCommand!.points.length).toBeGreaterThanOrEqual(2);
  });
});

describe('water in the build tab (E-35, DC-107f)', () => {
  beforeEach(() => {
    setWorkspace('forge');
    state.scene.map.masonry = [];
    state.scene.map.masonryDoors = [];
    state.scene.map.cliffs = [];
    state.scene.map.waters = [];
    state.buildSelection = null;
  });

  it('a river is a line that flows in its drawing direction; flipped it flows back; it blocks no sight', () => {
    const before = sightWalls(state.scene).length;
    startBuildCommand('water');
    updateBuildCommand({ waterKind: 'river', riverWidthFt: 15 });
    addBuildPoint({ x: 0, y: 13000 }, 8);
    addBuildPoint({ x: 420, y: 13000 }, 8);
    finishBuildWall();
    const [w] = state.scene.map.waters;
    expect(w).toMatchObject({ kind: 'river', closed: false, width: 210 });
    expect(sightWalls(state.scene)).toHaveLength(before);
    flipWater(w.id);
    expect(state.scene.map.waters[0].points[0]).toEqual({ x: 420, y: 13000 });
  });

  it('a lake closes by itself and is picked anywhere on it', () => {
    startBuildCommand('water');
    updateBuildCommand({ waterKind: 'lake' });
    for (const p of [{ x: 0, y: 14000 }, { x: 420, y: 14000 }, { x: 420, y: 14420 }]) addBuildPoint(p, 8);
    finishBuildWall();
    const [w] = state.scene.map.waters;
    expect(w).toMatchObject({ kind: 'lake', closed: true });
    endBuildCommand(false);
    expect(buildHit({ x: 300, y: 14100 }, 8)).toEqual({ kind: 'water', wall: w.id, point: null, door: null });
    updateWater(w.id, { kind: 'sea' });
    expect(state.scene.map.waters[0]).toMatchObject({ kind: 'sea', closed: true });
  });

  it('the map switch stops the water moving; undone it moves again', () => {
    setWaterAnimated(false);
    expect(state.scene.map.waterAnimated).toBe(false);
    undo();
    expect(state.scene.map.waterAnimated).toBe(true);
  });
});

describe('windows, fortified walls and the map look (E-35, DC-107g)', () => {
  beforeEach(() => {
    setWorkspace('forge');
    state.scene.map.masonry = [];
    state.scene.map.masonryDoors = [];
    state.buildSelection = null;
  });

  it('draws a fortified wall and puts a window in it, which blocks no sight', () => {
    startBuildCommand('wall');
    updateBuildCommand({ fortified: true });
    addBuildPoint({ x: 0, y: 15000 }, 8);
    addBuildPoint({ x: 350, y: 15000 }, 8);
    finishBuildWall();
    expect(state.scene.map.masonry[0].fortified).toBe(true);
    startBuildCommand('door');
    updateBuildCommand({ window: true, secret: true });
    placeBuildDoor({ x: 120, y: 15005 }, false, 20);
    const [d] = state.scene.map.masonryDoors;
    expect(d).toMatchObject({ window: true, secret: false });
    expect(sightWalls(state.scene).find((w) => w.id === d.id)?.kind).toBe('window');
  });

  it('changes the light and the automatic details as one step each', () => {
    setMapLook({ lightAngle: 135, autoShore: false });
    expect(state.scene.map).toMatchObject({ lightAngle: 135, autoShore: false });
    undo();
    expect(state.scene.map).toMatchObject({ lightAngle: 45, autoShore: true });
  });
});

describe('the floor brush (DC-107b)', () => {
  beforeEach(() => {
    setWorkspace('forge');
    state.scene.map.floors = [];
  });

  it('paints a strip as wide as the brush, merges the same floor, erases with Alt; one step each', () => {
    startBuildCommand('floor');
    updateBuildCommand({ floorStyle: 'marble', brushCells: 2 });
    expect(paintFloorStroke([{ x: 0, y: 16000 }, { x: 350, y: 16000 }], false, false)).toBe(true);
    paintFloorStroke([{ x: 300, y: 16000 }, { x: 600, y: 16000 }], false, false);
    expect(state.scene.map.floors).toHaveLength(1);
    expect(state.scene.map.floors[0].style).toBe('marble');
    paintFloorStroke([{ x: 0, y: 16000 }, { x: 600, y: 16000 }], false, true);
    expect(state.scene.map.floors).toEqual([]);
    undo();
    expect(state.scene.map.floors).toHaveLength(1);
  });

  it('with Shift a straight strip from start to end', () => {
    startBuildCommand('floor');
    updateBuildCommand({ floorStyle: 'gravel', brushCells: 1 });
    paintFloorStroke([{ x: 0, y: 17000 }, { x: 100, y: 17500 }, { x: 420, y: 17000 }], true, false);
    const ys = state.scene.map.floors[0].shape[0].outer.map(([, y]) => y);
    expect(Math.max(...ys)).toBeLessThan(17000 + 40);
  });
});
