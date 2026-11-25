import { describe, expect, it } from 'vitest';
import { rectPolygon } from '../core/fogModel';
import { areaBounds, areaContains, vertexAt } from '../core/areas';
import { commitView, deleteArea, drawAreaPart, finishAreaCommand, moveAreaCorner, setTool, setWorkspace, startAreaCommand, state, undo, updateAreaCommand } from './store';

/** The store starts with the sample crypt (browser mode). */
describe('"create area" command (DC-013)', () => {
  it('draws parts (added, cut out), saves on OK as one undoable step, in the map', () => {
    setWorkspace('forge');
    const before = state.scene.zones.length;
    startAreaCommand();
    expect(state.tool).toBe('area');
    drawAreaPart(rectPolygon(0, 0, 100, 100));
    drawAreaPart(rectPolygon(100, 0, 200, 100));
    updateAreaCommand({ op: 'subtract' });
    drawAreaPart(rectPolygon(40, 40, 60, 60));
    // No name yet: OK is refused.
    expect(finishAreaCommand()).toBe(false);
    updateAreaCommand({ name: ' Collapsed vault ', secret: true, biome: 'asche' });
    expect(finishAreaCommand()).toBe(true);

    const area = state.scene.zones.at(-1)!;
    expect(state.scene.zones).toHaveLength(before + 1);
    expect(area).toMatchObject({ name: 'Collapsed vault', secret: true, biome: 'asche' });
    expect(area.id).toMatch(/^area-/);
    expect(areaContains(area.shape, { x: 150, y: 50 })).toBe(true);
    expect(areaContains(area.shape, { x: 50, y: 50 })).toBe(false);
    expect(state.areaCommand).toBeNull();
    expect(state.tool).toBe('select');
    commitView();
    expect(state.mapDoc!.zones.some((z) => z.id === area.id)).toBe(true);

    undo();
    expect(state.scene.zones).toHaveLength(before);
  });

  it('another tool or workspace ends the command; the Orchestrator cannot start it', () => {
    setWorkspace('forge');
    startAreaCommand();
    setTool('wall');
    expect(state.areaCommand).toBeNull();
    startAreaCommand();
    setWorkspace('play');
    expect(state.areaCommand).toBeNull();
    startAreaCommand();
    expect(state.areaCommand).toBeNull();
  });

  it('edits an area: name, a part added, a corner moved; one undoable step, same id', () => {
    setWorkspace('forge');
    const hall = state.scene.zones.find((z) => z.id === 'hall')!;
    const id = hall.id;
    const before = JSON.stringify(hall);
    const b = areaBounds(hall.shape);
    startAreaCommand(id);
    expect(state.areaCommand).toMatchObject({ areaId: id, name: hall.name });
    updateAreaCommand({ name: 'Great hall' });
    drawAreaPart(rectPolygon(b.x + b.w, b.y, b.x + b.w + 70, b.y + 70));
    const corner = vertexAt(state.areaCommand!.shape, { x: b.x, y: b.y }, 1)!;
    moveAreaCorner(corner, { x: b.x - 70, y: b.y - 70 }, true);
    expect(finishAreaCommand()).toBe(true);

    const edited = state.scene.zones.find((z) => z.id === id)!;
    expect(edited.name).toBe('Great hall');
    expect(areaContains(edited.shape, { x: b.x + b.w + 35, y: b.y + 35 })).toBe(true);
    expect(areaBounds(edited.shape).x).toBe(b.x - 70);
    expect(state.scene.zones.filter((z) => z.id === id)).toHaveLength(1);

    undo();
    expect(JSON.stringify(state.scene.zones.find((z) => z.id === id))).toBe(before);
  });

  it('deletes an area, undoably', () => {
    setWorkspace('forge');
    const n = state.scene.zones.length;
    startAreaCommand('storage');
    deleteArea('storage');
    expect(state.scene.zones.some((z) => z.id === 'storage')).toBe(false);
    expect(state.areaCommand).toBeNull();
    expect(state.scene.zones).toHaveLength(n - 1);
    undo();
    expect(state.scene.zones.some((z) => z.id === 'storage')).toBe(true);
  });
});
