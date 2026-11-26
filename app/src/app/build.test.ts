import { beforeEach, describe, expect, it } from 'vitest';
import { addBuildPoint, buildHit, deleteBuildSelection, flipCliff, updateCliff, endBuildCommand, finishBuildWall, insertBuildPoint, moveBuildPoint, placeBuildDoor, selectBuild, splitBuildWall, startBuildCommand, updateBuildCommand, updateBuildDoor } from './build';
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
    selectBuild({ kind: 'cliff', wall: id, point: 1, door: null });
    deleteBuildSelection();
    expect(state.scene.map.cliffs[0].points).toHaveLength(2);
  });
});
