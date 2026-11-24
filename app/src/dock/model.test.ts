import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  DOCK, EDGES, allPanelIds, emptyLayout, findPanel, floatPanel, hidePanel, insertPanel, moveFloating, normalize, redockTarget, removePanel,
  resizeGroup, setPanelWeights, setZoneCollapsed, showPanel, splitWeights, toggleExpanded, type DockLayout, type DockTarget, type Edge,
} from './model';

const ref = (id: string, expanded = true, weight = 1) => ({ id, expanded, weight });

/** left: [a b c(collapsed)] [d]; right: [e]; bottom: empty. */
function sample(): DockLayout {
  const l = emptyLayout();
  l.zones.left.groups = [
    { size: 280, panels: [ref('a'), ref('b', true, 2), ref('c', false)] },
    { size: 200, panels: [ref('d')] },
  ];
  l.zones.right.groups = [{ size: 300, panels: [ref('e')] }];
  return l;
}

function checkInvariants(l: DockLayout) {
  const ids = allPanelIds(l);
  expect(new Set(ids).size).toBe(ids.length);
  for (const e of EDGES) {
    const z = l.zones[e];
    for (const g of z.groups) {
      expect(g.panels.length).toBeGreaterThan(0);
      expect(g.size).toBeGreaterThanOrEqual(DOCK.minGroup);
      for (const p of g.panels) expect(p.weight).toBeGreaterThan(0);
    }
    if (z.groups.length === 0) expect(z.collapsed).toBe(false);
  }
}

describe('normalize', () => {
  it('removes duplicates (first wins), empty groups, and un-collapses empty zones', () => {
    const l = emptyLayout();
    l.zones.left.groups = [{ size: 280, panels: [ref('a'), ref('b')] }, { size: 200, panels: [] }];
    l.zones.right = { edge: 'right', collapsed: false, groups: [{ size: 300, panels: [ref('a')] }] };
    l.zones.bottom.collapsed = true;
    l.floating = [{ id: 'b', x: 0, y: 0, width: 300, height: 300 }];
    l.hidden = ['c', 'c'];
    const n = normalize(l);
    expect(n.zones.left.groups).toHaveLength(1);
    expect(n.zones.left.groups[0]!.panels.map((p) => p.id)).toEqual(['a', 'b']);
    expect(n.zones.right.groups).toHaveLength(0);
    expect(n.zones.bottom.collapsed).toBe(false);
    expect(n.floating).toHaveLength(0);
    expect(n.hidden).toEqual(['c']);
    checkInvariants(n);
  });

  it('repairs weights and sizes but leaves valid weights alone', () => {
    const l = emptyLayout();
    l.zones.left.groups = [{ size: 20, panels: [ref('a', true, 0), ref('b', true, Number.NaN), ref('c', true, 3)] }];
    l.floating = [{ id: 'f', x: 10, y: 10, width: 50, height: 10 }];
    const n = normalize(l);
    expect(n.zones.left.groups[0]!.panels.map((p) => p.weight)).toEqual([1, 1, 3]);
    expect(n.zones.left.groups[0]!.size).toBe(DOCK.minGroup);
    expect(n.floating[0]).toMatchObject({ width: DOCK.minFloat.width, height: DOCK.minFloat.height });
  });

  it('does not change its input', () => {
    const l = sample();
    const before = structuredClone(l);
    normalize(l);
    expect(l).toEqual(before);
  });
});

describe('removePanel', () => {
  it('keeps the other weights as they are', () => {
    const r = removePanel(sample(), 'a');
    expect(r.from).toEqual({ kind: 'dock', edge: 'left', groupIndex: 0, panelIndex: 0 });
    expect(r.ref).toEqual(ref('a'));
    expect(r.groupSize).toBe(280);
    expect(r.layout.zones.left.groups[0]!.panels).toEqual([ref('b', true, 2), ref('c', false)]);
  });

  it('removes the group with its last panel, and empties the zone with its last group', () => {
    let l = removePanel(sample(), 'd').layout;
    expect(l.zones.left.groups).toHaveLength(1);
    l = setZoneCollapsed(l, 'right', true);
    l = removePanel(l, 'e').layout;
    expect(l.zones.right.groups).toHaveLength(0);
    expect(l.zones.right.collapsed).toBe(false);
  });

  it('returns the layout unchanged for unknown ids', () => {
    const l = sample();
    expect(removePanel(l, 'zz')).toEqual({ layout: l, from: null });
  });
});

describe('insertPanel', () => {
  it('adds a new group at the given index (0 = outermost)', () => {
    const l = insertPanel(sample(), 'x', { kind: 'newGroup', edge: 'left', groupIndex: 0 }, { size: 250 });
    expect(l.zones.left.groups.map((g) => g.panels.map((p) => p.id))).toEqual([['x'], ['a', 'b', 'c'], ['d']]);
    expect(l.zones.left.groups[0]!.size).toBe(250);
    const between = insertPanel(sample(), 'x', { kind: 'newGroup', edge: 'left', groupIndex: 1 });
    expect(between.zones.left.groups.map((g) => g.panels[0]!.id)).toEqual(['a', 'x', 'd']);
    expect(between.zones.left.groups[1]!.size).toBe(DOCK.defaultGroupSize.left);
  });

  it('inserts into a group expanded, with the average weight', () => {
    const l = insertPanel(sample(), 'x', { kind: 'intoGroup', edge: 'left', groupIndex: 0, panelIndex: 1 });
    const panels = l.zones.left.groups[0]!.panels;
    expect(panels.map((p) => p.id)).toEqual(['a', 'x', 'b', 'c']);
    expect(panels[1]).toEqual({ id: 'x', expanded: true, weight: (1 + 2 + 1) / 3 });
  });

  it('moves a panel that is already docked (indexes refer to the layout without it)', () => {
    const l = insertPanel(sample(), 'a', { kind: 'intoGroup', edge: 'left', groupIndex: 0, panelIndex: 2 });
    expect(l.zones.left.groups[0]!.panels.map((p) => p.id)).toEqual(['b', 'c', 'a']);
    checkInvariants(l);
  });

  it('dropping a panel on its own place changes nothing visible', () => {
    const l = sample();
    const r = removePanel(l, 'b');
    const back = insertPanel(r.layout, 'b', { kind: 'intoGroup', edge: 'left', groupIndex: 0, panelIndex: 1 }, { weight: r.ref!.weight });
    expect(back).toEqual(normalize(l));
  });

  it('clamps indexes and creates a group when the target group is gone', () => {
    const l = insertPanel(sample(), 'x', { kind: 'intoGroup', edge: 'left', groupIndex: 0, panelIndex: 99 });
    expect(l.zones.left.groups[0]!.panels.at(-1)!.id).toBe('x');
    const g = insertPanel(sample(), 'x', { kind: 'intoGroup', edge: 'bottom', groupIndex: 3, panelIndex: 0 });
    expect(g.zones.bottom.groups).toEqual([{ size: DOCK.defaultGroupSize.bottom, panels: [ref('x')] }]);
  });

  it('takes a floating or hidden panel out of there', () => {
    let l = floatPanel(sample(), 'a', { x: 5, y: 5, width: 300, height: 300 });
    l = insertPanel(l, 'a', { kind: 'newGroup', edge: 'bottom', groupIndex: 0 });
    expect(l.floating).toHaveLength(0);
    expect(findPanel(l, 'a')).toMatchObject({ kind: 'dock', edge: 'bottom' });
  });
});

describe('floating, hiding, showing', () => {
  it('remembers the dock position when floating, and docks back there', () => {
    const l = floatPanel(sample(), 'b', { x: 100, y: 50, width: 320, height: 400, monitorId: '2' });
    expect(l.floating).toEqual([{ id: 'b', x: 100, y: 50, width: 320, height: 400, monitorId: '2', lastDock: { edge: 'left', groupIndex: 0, panelIndex: 1 } }]);
    const target = redockTarget(l, l.floating[0]!.lastDock, 'b');
    expect(target).toEqual({ kind: 'intoGroup', edge: 'left', groupIndex: 0, panelIndex: 1 });
    expect(insertPanel(l, 'b', target).zones.left.groups[0]!.panels.map((p) => p.id)).toEqual(['a', 'b', 'c']);
  });

  it('docks to the first left group when the last position is gone', () => {
    const l = sample();
    expect(redockTarget(l, { edge: 'bottom', groupIndex: 2, panelIndex: 0 })).toEqual({ kind: 'intoGroup', edge: 'left', groupIndex: 0, panelIndex: 3 });
    expect(redockTarget(emptyLayout(), undefined)).toEqual({ kind: 'newGroup', edge: 'left', groupIndex: 0 });
  });

  it('keeps lastDock when a floating panel is moved, hidden and shown again', () => {
    let l = floatPanel(sample(), 'e', { x: 0, y: 0, width: 300, height: 300 });
    l = moveFloating(l, 'e', { x: 700, y: 80 });
    l = hidePanel(l, 'e');
    expect(l.hidden).toEqual(['e']);
    expect(l.floating).toHaveLength(0);
    l = showPanel(l, 'e', { kind: 'newGroup', edge: 'left', groupIndex: 0 });
    expect(l.floating).toEqual([{ id: 'e', x: 700, y: 80, width: 300, height: 300, lastDock: { edge: 'right', groupIndex: 0, panelIndex: 0 } }]);
    expect(l.memory).toBeUndefined();
  });

  it('shows a hidden docked panel at its last place, or at the fallback', () => {
    let l = hidePanel(sample(), 'd');
    expect(l.zones.left.groups).toHaveLength(1);
    l = showPanel(l, 'd', { kind: 'newGroup', edge: 'right', groupIndex: 0 });
    // Group 1 no longer existed: first left group.
    expect(findPanel(l, 'd')).toEqual({ kind: 'dock', edge: 'left', groupIndex: 0, panelIndex: 3 });
    let m = hidePanel(sample(), 'b');
    m = showPanel(m, 'b', { kind: 'newGroup', edge: 'right', groupIndex: 0 });
    expect(findPanel(m, 'b')).toEqual({ kind: 'dock', edge: 'left', groupIndex: 0, panelIndex: 1 });
    const fresh = showPanel({ ...emptyLayout(), hidden: ['n'] }, 'n', { kind: 'newGroup', edge: 'bottom', groupIndex: 0 });
    expect(findPanel(fresh, 'n')).toMatchObject({ kind: 'dock', edge: 'bottom' });
  });
});

describe('small edits', () => {
  it('toggles panels and collapses zones (never an empty one)', () => {
    expect(toggleExpanded(sample(), 'c').zones.left.groups[0]!.panels[2]!.expanded).toBe(true);
    expect(setZoneCollapsed(sample(), 'left', true).zones.left.collapsed).toBe(true);
    expect(setZoneCollapsed(sample(), 'bottom', true).zones.bottom.collapsed).toBe(false);
  });

  it('clamps group sizes', () => {
    expect(resizeGroup(sample(), 'left', 0, 50).zones.left.groups[0]!.size).toBe(DOCK.minGroup);
    expect(resizeGroup(sample(), 'left', 0, 900, 600).zones.left.groups[0]!.size).toBe(600);
  });

  it('splitter moves space between two panels only, keeping their weight sum', () => {
    const [a, b] = splitWeights(1, 2, 100, 200, 50);
    expect(a + b).toBeCloseTo(3);
    expect(a / (a + b)).toBeCloseTo(150 / 300);
    // At least 60 px each.
    expect(splitWeights(1, 1, 150, 150, -500)[0] / 2).toBeCloseTo(60 / 300);
    expect(splitWeights(1, 1, 150, 150, 500)[1] / 2).toBeCloseTo(60 / 300);
    const l = setPanelWeights(sample(), 'left', 0, 0, 1, [2.5, 0.5]);
    expect(l.zones.left.groups[0]!.panels.map((p) => p.weight)).toEqual([2.5, 0.5, 1]);
  });
});

describe('invariants under random operations', () => {
  const ids = ['a', 'b', 'c', 'd', 'e', 'f'];
  const edge = fc.constantFrom<Edge>('left', 'right', 'bottom');
  const target: fc.Arbitrary<DockTarget> = fc.oneof(
    fc.record({ kind: fc.constant('newGroup' as const), edge, groupIndex: fc.integer({ min: -1, max: 4 }) }),
    fc.record({ kind: fc.constant('intoGroup' as const), edge, groupIndex: fc.integer({ min: 0, max: 4 }), panelIndex: fc.integer({ min: -1, max: 6 }) }),
  );
  const id = fc.constantFrom(...ids);
  const op = fc.oneof(
    fc.record({ t: fc.constant('insert' as const), id, target }),
    fc.record({ t: fc.constant('remove' as const), id }),
    fc.record({ t: fc.constant('float' as const), id }),
    fc.record({ t: fc.constant('hide' as const), id }),
    fc.record({ t: fc.constant('show' as const), id, target }),
    fc.record({ t: fc.constant('toggle' as const), id }),
    fc.record({ t: fc.constant('collapse' as const), edge, on: fc.boolean() }),
  );

  it('keep ids unique, groups non-empty, weights positive, and lose no panel', () => {
    fc.assert(
      fc.property(fc.array(op, { maxLength: 40 }), (ops) => {
        let l = normalize({ ...emptyLayout(), hidden: [...ids] });
        for (const o of ops) {
          const before = new Set(allPanelIds(l));
          if (o.t === 'insert') l = insertPanel(l, o.id, o.target);
          else if (o.t === 'remove') l = removePanel(l, o.id).layout;
          else if (o.t === 'float') l = floatPanel(l, o.id, { x: 1, y: 2, width: 300, height: 200 });
          else if (o.t === 'hide') l = hidePanel(l, o.id);
          else if (o.t === 'show') l = showPanel(l, o.id, o.target);
          else if (o.t === 'toggle') l = toggleExpanded(l, o.id);
          else l = setZoneCollapsed(l, o.edge, o.on);
          checkInvariants(l);
          const after = new Set(allPanelIds(l));
          // Only "remove" may lose a panel; every other op keeps the set (insert/float/show may add).
          if (o.t !== 'remove') for (const x of before) expect(after.has(x)).toBe(true);
        }
      }),
      { numRuns: 300 },
    );
  });
});
