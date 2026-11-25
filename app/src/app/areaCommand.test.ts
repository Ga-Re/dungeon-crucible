import { describe, expect, it } from 'vitest';
import { rectPolygon } from '../core/fogModel';
import { areaContains } from '../core/areas';
import { commitView, drawAreaPart, finishAreaCommand, setTool, setWorkspace, startAreaCommand, state, undo, updateAreaCommand } from './store';

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
});
