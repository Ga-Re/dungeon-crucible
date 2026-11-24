import { describe, expect, it } from 'vitest';
import { beginDrag, dragRect, dropLayout, passedThreshold, previewLayout } from './drag';
import { computeDropTarget, computeGeometry } from './geometry';
import { emptyLayout, findPanel, insertPanel, type DockLayout } from './model';

function layout(): DockLayout {
  let l = emptyLayout();
  l = insertPanel(l, 'a', { kind: 'newGroup', edge: 'left', groupIndex: 0 }, { size: 250 });
  l = insertPanel(l, 'b', { kind: 'intoGroup', edge: 'left', groupIndex: 0, panelIndex: 1 });
  l = insertPanel(l, 'c', { kind: 'newGroup', edge: 'right', groupIndex: 0 }, { size: 300 });
  return l;
}

const AREA = { width: 1200, height: 800 };

describe('drag', () => {
  it('starts only after 4 px', () => {
    expect(passedThreshold({ x: 10, y: 10 }, { x: 13, y: 10 })).toBe(false);
    expect(passedThreshold({ x: 10, y: 10 }, { x: 14, y: 10 })).toBe(true);
    expect(passedThreshold({ x: 10, y: 10 }, { x: 13, y: 13 })).toBe(true);
  });

  it('removes the panel at once and shows it floating under the cursor', () => {
    const s = beginDrag(layout(), 'b', { width: 250, height: 400, expanded: true }, { x: 30, y: 10 });
    expect(findPanel(s.base, 'b')).toBeNull();
    expect(s.base.zones.left.groups[0]!.panels.map((p) => p.id)).toEqual(['a']);
    const preview = previewLayout(s, { x: 500, y: 300 });
    expect(preview.floating).toEqual([{ id: 'b', x: 470, y: 290, width: 250, height: 400 }]);
    expect(preview.zones).toBe(s.base.zones);
  });

  it('keeps the grab point on the title and applies the minimum float size', () => {
    const s = beginDrag(layout(), 'a', { width: 100, height: 24, expanded: false }, { x: 400, y: 80 });
    expect(s.size).toEqual({ width: 160, height: 320 });
    expect(s.grab).toEqual({ x: 159, y: 23 });
    expect(dragRect(s, { x: 1000, y: 500 })).toMatchObject({ x: 841, y: 477 });
  });

  it('drops into a group at the seam under the cursor (indexes without the panel)', () => {
    const s = beginDrag(layout(), 'a', { width: 250, height: 400, expanded: true }, { x: 10, y: 10 });
    const geom = computeGeometry(s.base, AREA);
    // Only "b" is left in the left group; below its middle → after it.
    const drop = computeDropTarget(geom, { x: 120, y: 700 });
    expect(drop?.rule).toBe('seam');
    const l = dropLayout(s, drop, { x: 0, y: 0 });
    expect(l.zones.left.groups[0]!.panels.map((p) => p.id)).toEqual(['b', 'a']);
  });

  it('a new group along the same axis keeps the old group size; across axes the default', () => {
    const s = beginDrag(layout(), 'b', { width: 250, height: 400, expanded: true }, { x: 10, y: 10 });
    const geom = computeGeometry(s.base, AREA);
    const right = computeDropTarget(geom, { x: AREA.width - 5, y: 300 });
    expect(right?.rule).toBe('edge');
    const l = dropLayout(s, right, { x: 0, y: 0 });
    expect(l.zones.right.groups[0]).toMatchObject({ size: 250, panels: [{ id: 'b' }] });
    expect(l.zones.right.groups[1]!.panels[0]!.id).toBe('c');

    const bottom = computeDropTarget(geom, { x: 600, y: AREA.height - 5 });
    const lb = dropLayout(s, bottom, { x: 0, y: 0 });
    expect(lb.zones.bottom.groups[0]!.size).toBe(200);
  });

  it('floats at the cursor when there is no target, remembering the dock position', () => {
    const s = beginDrag(layout(), 'b', { width: 250, height: 400, expanded: true }, { x: 30, y: 10 });
    const geom = computeGeometry(s.base, AREA);
    expect(computeDropTarget(geom, { x: 600, y: 300 })).toBeNull();
    expect(computeDropTarget(geom, { x: 120, y: 300 }, { suppress: true })).toBeNull();
    const l = dropLayout(s, null, { x: 900, y: 400 });
    expect(l.floating).toEqual([{ id: 'b', x: 870, y: 390, width: 250, height: 400, lastDock: { edge: 'left', groupIndex: 0, panelIndex: 1 } }]);
  });

  it('a floating panel can be docked again', () => {
    let l = layout();
    const s0 = beginDrag(l, 'c', { width: 300, height: 600, expanded: true }, { x: 10, y: 10 });
    l = dropLayout(s0, null, { x: 100, y: 100 });
    expect(l.zones.right.groups).toHaveLength(0);
    const s = beginDrag(l, 'c', { width: 300, height: 600 , expanded: true }, { x: 10, y: 10 });
    expect(s.base.floating).toHaveLength(0);
    const geom = computeGeometry(s.base, AREA);
    const l2 = dropLayout(s, computeDropTarget(geom, { x: 5, y: 300 }), { x: 0, y: 0 });
    expect(l2.floating).toHaveLength(0);
    expect(l2.zones.left.groups[0]!.panels[0]!.id).toBe('c');
  });
});
