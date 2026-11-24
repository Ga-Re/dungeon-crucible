import { describe, expect, it } from 'vitest';
import { computeDropTarget, computeGeometry, flyoutRect, shrinkToFit, type DockGeometry } from './geometry';
import { DOCK, emptyLayout, type DockLayout } from './model';

const ref = (id: string, expanded = true, weight = 1) => ({ id, expanded, weight });
const AREA = { width: 1200, height: 800 };

/** left: one group [a b c(collapsed)] of 280 px. */
function leftOnly(): DockLayout {
  const l = emptyLayout();
  l.zones.left.groups = [{ size: 280, panels: [ref('a'), ref('b'), ref('c', false)] }];
  return l;
}

describe('computeGeometry', () => {
  it('lays out a left group as an accordion and shrinks the canvas', () => {
    const g = computeGeometry(leftOnly(), AREA);
    expect(g.zones.left.rect).toEqual({ x: 0, y: 0, width: 280, height: 800 });
    expect(g.canvas).toEqual({ x: 280, y: 0, width: 920, height: 800 });
    const [a, b, c] = g.zones.left.groups[0]!.panels;
    // 800 - 3 title bars = 728 content, split 1:1.
    expect(a!.rect).toEqual({ x: 0, y: 0, width: 280, height: 24 + 364 });
    expect(a!.content).toEqual({ x: 0, y: 24, width: 280, height: 364 });
    expect(b!.rect.y).toBe(388);
    // Collapsed panels follow their predecessor directly.
    expect(c!.rect).toEqual({ x: 0, y: 776, width: 280, height: 24 });
    expect(g.zones.right.state).toBe('empty');
    expect(g.zones.right.rect.width).toBe(0);
  });

  it('distributes content by weight; one open panel fills it; none open sits compact at the start', () => {
    const l = leftOnly();
    l.zones.left.groups[0]!.panels = [ref('a', true, 3), ref('b', true, 1), ref('c', false)];
    const [a, b] = computeGeometry(l, AREA).zones.left.groups[0]!.panels;
    expect(a!.content.height).toBe(546);
    expect(b!.content.height).toBe(182);

    l.zones.left.groups[0]!.panels = [ref('a', false), ref('b', true), ref('c', false)];
    const one = computeGeometry(l, AREA).zones.left.groups[0]!.panels;
    expect(one.map((p) => [p.rect.y, p.rect.height])).toEqual([[0, 24], [24, 752], [776, 24]]);

    l.zones.left.groups[0]!.panels = [ref('a', false), ref('b', false), ref('c', false)];
    const none = computeGeometry(l, AREA).zones.left.groups[0]!.panels;
    expect(none.map((p) => p.rect.y)).toEqual([0, 24, 48]);
  });

  it('puts splitters between expanded neighbours (also across collapsed ones) and at the group edge', () => {
    const l = leftOnly();
    l.zones.left.groups[0]!.panels = [ref('a'), ref('c', false), ref('b')];
    const g = computeGeometry(l, AREA);
    const panelSplits = g.splitters.filter((s) => s.kind === 'panel');
    expect(panelSplits).toHaveLength(1);
    expect(panelSplits[0]).toMatchObject({ a: 0, b: 2, sizeA: 364, sizeB: 364 });
    const groupSplits = g.splitters.filter((s) => s.kind === 'group');
    expect(groupSplits).toEqual([{ kind: 'group', edge: 'left', groupIndex: 0, rect: { x: 277, y: 0, width: 6, height: 800 } }]);
  });

  it('orders groups from the outside in: right from the right edge, bottom from the bottom', () => {
    const l = emptyLayout();
    l.zones.right.groups = [{ size: 300, panels: [ref('a')] }, { size: 200, panels: [ref('b')] }];
    l.zones.bottom.groups = [{ size: 200, panels: [ref('c'), ref('d', false), ref('e')] }];
    l.zones.left.groups = [{ size: 250, panels: [ref('f')] }];
    const g = computeGeometry(l, AREA);
    expect(g.zones.right.groups.map((x) => x.rect.x)).toEqual([900, 700]);
    // Bottom sits between left and right by default.
    expect(g.zones.bottom.rect).toEqual({ x: 250, y: 600, width: 450, height: 200 });
    expect(g.canvas).toEqual({ x: 250, y: 0, width: 450, height: 600 });
    // Bottom panels side by side; a collapsed one is a 24 px strip; titles on top.
    const [c, d, e] = g.zones.bottom.groups[0]!.panels;
    expect(c!.rect).toEqual({ x: 250, y: 600, width: 213, height: 200 });
    expect(c!.header).toEqual({ x: 250, y: 600, width: 213, height: 24 });
    expect(d!.rect).toEqual({ x: 463, y: 600, width: 24, height: 200 });
    expect(e!.rect.x).toBe(487);
    expect(e!.rect.width).toBe(213);

    const full = computeGeometry(l, AREA, { bottomSpansFullWidth: true });
    expect(full.zones.bottom.rect).toEqual({ x: 0, y: 600, width: 1200, height: 200 });
    expect(full.zones.left.rect.height).toBe(600);
  });

  it('turns a collapsed zone into a 24 px bar with all titles, grouped', () => {
    const l = leftOnly();
    l.zones.left.groups.push({ size: 200, panels: [ref('d')] });
    l.zones.left.collapsed = true;
    const g = computeGeometry(l, AREA, { tabLength: () => 80 });
    expect(g.zones.left.state).toBe('collapsed');
    expect(g.canvas.x).toBe(24);
    const bar = g.zones.left.bar!;
    expect(bar.toggle).toEqual({ x: 0, y: 0, width: 24, height: 24 });
    expect(bar.tabs.map((t) => [t.id, t.rect.y])).toEqual([['a', 32], ['b', 112], ['c', 192], ['d', 280]]);
  });

  it('shrinks groups, then collapses bottom, right, left when the window gets too small', () => {
    const l = emptyLayout();
    l.zones.left.groups = [{ size: 280, panels: [ref('a')] }];
    l.zones.right.groups = [{ size: 300, panels: [ref('b')] }];
    l.zones.bottom.groups = [{ size: 200, panels: [ref('c')] }];
    const shrunk = computeGeometry(l, { width: 700, height: 500 });
    expect(shrunk.zones.left.rect.width + shrunk.zones.right.rect.width).toBeLessThanOrEqual(380);
    expect(shrunk.zones.left.rect.width).toBeGreaterThanOrEqual(DOCK.minGroup);
    expect(shrunk.canvas.width).toBeGreaterThanOrEqual(320);

    const noRight = computeGeometry(l, { width: 600, height: 500 });
    expect(noRight.zones.right).toMatchObject({ state: 'collapsed', autoCollapsed: true });
    expect(noRight.zones.left.state).toBe('expanded');

    const tiny = computeGeometry(l, { width: 400, height: 300 });
    expect([tiny.zones.bottom.state, tiny.zones.right.state, tiny.zones.left.state]).toEqual(['collapsed', 'collapsed', 'collapsed']);
    // The stored layout is untouched, so a bigger window restores it.
    expect(l.zones.right.collapsed).toBe(false);
    expect(computeGeometry(l, AREA).zones.right.state).toBe('expanded');
  });

  it('caps groups at 60 % of the window', () => {
    const l = emptyLayout();
    l.zones.left.groups = [{ size: 5000, panels: [ref('a')] }];
    expect(computeGeometry(l, AREA).zones.left.rect.width).toBe(720);
  });
});

describe('shrinkToFit', () => {
  it('shrinks proportionally down to the minimum', () => {
    expect(shrinkToFit([100, 200], 400, 50)).toEqual([100, 200]);
    expect(shrinkToFit([200, 400], 300, 50)).toEqual([100, 200]);
    expect(shrinkToFit([60, 600], 300, 50)).toEqual([50, 250]);
    expect(shrinkToFit([300, 300], 80, 50)).toEqual([50, 50]);
  });
});

describe('flyoutRect', () => {
  it('opens next to the bar over the canvas', () => {
    const l = leftOnly();
    l.zones.left.collapsed = true;
    l.zones.bottom.groups = [{ size: 200, panels: [ref('x')] }];
    l.zones.bottom.collapsed = true;
    const g = computeGeometry(l, AREA);
    expect(flyoutRect(g, 'left', 280)).toEqual({ x: 24, y: 0, width: 280, height: 800 });
    expect(flyoutRect(g, 'bottom', 200)).toEqual({ x: 24, y: 576, width: 1176, height: 200 });
    expect(flyoutRect(g, 'right', 200)).toBeNull();
  });
});

describe('computeDropTarget', () => {
  const geom = (l: DockLayout): DockGeometry => computeGeometry(l, AREA, { tabLength: () => 80 });

  it('priority 1: edge strip → new outermost group, bar along the whole edge', () => {
    const g = geom(leftOnly());
    expect(computeDropTarget(g, { x: 10, y: 400 })).toEqual({
      target: { kind: 'newGroup', edge: 'left', groupIndex: 0 }, rule: 'edge', indicator: { x: 0, y: 0, width: 4, height: 800 },
    });
    expect(computeDropTarget(g, { x: 1190, y: 300 })).toMatchObject({ target: { kind: 'newGroup', edge: 'right', groupIndex: 0 }, indicator: { x: 1196, width: 4 } });
    // Bottom edge, also over a group: the strip wins. Indicator spans the bottom zone (between left and right).
    expect(computeDropTarget(g, { x: 100, y: 790 })).toMatchObject({ target: { kind: 'newGroup', edge: 'bottom', groupIndex: 0 }, indicator: { x: 280, y: 796, width: 920, height: 4 } });
    // Corner: the nearer edge.
    expect(computeDropTarget(g, { x: 2, y: 790 })!.target).toMatchObject({ edge: 'left' });
  });

  it('priority 2: on a collapsed bar → a tab next to the nearest title', () => {
    const l = leftOnly();
    l.zones.left.groups.push({ size: 200, panels: [ref('d')] });
    l.zones.left.collapsed = true;
    const g = geom(l);
    // Tabs: a 32–112, b 112–192, c 192–272 | gap | d 280–360.
    expect(computeDropTarget(g, { x: 10, y: 120 })).toEqual({
      target: { kind: 'intoGroup', edge: 'left', groupIndex: 0, panelIndex: 1 }, rule: 'bar', indicator: { x: 0, y: 110.5, width: 24, height: 3 },
    });
    expect(computeDropTarget(g, { x: 10, y: 274 })!.target).toEqual({ kind: 'intoGroup', edge: 'left', groupIndex: 0, panelIndex: 3 });
    expect(computeDropTarget(g, { x: 10, y: 279 })!.target).toEqual({ kind: 'intoGroup', edge: 'left', groupIndex: 1, panelIndex: 0 });
    expect(computeDropTarget(g, { x: 10, y: 700 })!.target).toEqual({ kind: 'intoGroup', edge: 'left', groupIndex: 1, panelIndex: 1 });
  });

  it('priority 3: inner edge of a group or between groups → new group there', () => {
    const g = geom(leftOnly());
    expect(computeDropTarget(g, { x: 270, y: 400 })).toEqual({
      target: { kind: 'newGroup', edge: 'left', groupIndex: 1 }, rule: 'groupEdge', indicator: { x: 277, y: 0, width: 3, height: 800 },
    });
    const l = emptyLayout();
    l.zones.right.groups = [{ size: 300, panels: [ref('a')] }, { size: 200, panels: [ref('b')] }];
    const r = geom(l);
    // Right groups: g0 900–1200, g1 700–900. Both sides of their border mean "between".
    expect(computeDropTarget(r, { x: 905, y: 300 })!.target).toEqual({ kind: 'newGroup', edge: 'right', groupIndex: 1 });
    expect(computeDropTarget(r, { x: 895, y: 300 })!.target).toEqual({ kind: 'newGroup', edge: 'right', groupIndex: 1 });
    expect(computeDropTarget(r, { x: 705, y: 300 })!.target).toEqual({ kind: 'newGroup', edge: 'right', groupIndex: 2 });
  });

  it('priority 4: inside a group → into it at the nearest seam, line across the group', () => {
    const g = geom(leftOnly());
    // Seams at 0 (before a), 388 (before b), 776 (before c), 800 (after c).
    expect(computeDropTarget(g, { x: 100, y: 5 })!.target).toEqual({ kind: 'intoGroup', edge: 'left', groupIndex: 0, panelIndex: 0 });
    expect(computeDropTarget(g, { x: 100, y: 380 })).toEqual({
      target: { kind: 'intoGroup', edge: 'left', groupIndex: 0, panelIndex: 1 }, rule: 'seam', indicator: { x: 0, y: 386.5, width: 280, height: 3 },
    });
    expect(computeDropTarget(g, { x: 100, y: 600 })!.target).toMatchObject({ panelIndex: 2 });
    // Bottom zone: seams are vertical lines.
    const l = emptyLayout();
    l.zones.bottom.groups = [{ size: 200, panels: [ref('a'), ref('b')] }];
    const b = geom(l);
    expect(computeDropTarget(b, { x: 610, y: 700 })).toEqual({
      target: { kind: 'intoGroup', edge: 'bottom', groupIndex: 0, panelIndex: 1 }, rule: 'seam', indicator: { x: 598.5, y: 600, width: 3, height: 200 },
    });
  });

  it('priority 5 and the rest: canvas, outside the window, modifier → float', () => {
    const g = geom(leftOnly());
    expect(computeDropTarget(g, { x: 600, y: 400 })).toBeNull();
    expect(computeDropTarget(g, { x: -5, y: 400 })).toBeNull();
    expect(computeDropTarget(g, { x: 1200, y: 400 })).toBeNull();
    expect(computeDropTarget(g, { x: 10, y: 400 }, { suppress: true })).toBeNull();
  });

  it('an empty zone stays a drop target via its edge strip', () => {
    const g = geom(emptyLayout());
    expect(computeDropTarget(g, { x: 1195, y: 10 })!.target).toEqual({ kind: 'newGroup', edge: 'right', groupIndex: 0 });
  });
});

describe('right and bottom zones', () => {
  /** left 280 [a]; right g0 300 [r1 r2], g1 200 [r3]; bottom g0 200 [b1 b2(collapsed) b3], g1 160 [b4]. */
  function all(): DockLayout {
    const l = emptyLayout();
    l.zones.left.groups = [{ size: 280, panels: [ref('a')] }];
    l.zones.right.groups = [{ size: 300, panels: [ref('r1'), ref('r2')] }, { size: 200, panels: [ref('r3')] }];
    l.zones.bottom.groups = [{ size: 200, panels: [ref('b1'), ref('b2', false), ref('b3')] }, { size: 160, panels: [ref('b4')] }];
    return l;
  }
  const AREA2 = { width: 1600, height: 900 };

  it('bottom sits between left and right; groups go from the outside in', () => {
    const g = computeGeometry(all(), AREA2);
    expect(g.zones.left.rect).toEqual({ x: 0, y: 0, width: 280, height: 900 });
    expect(g.zones.right.rect).toEqual({ x: 1100, y: 0, width: 500, height: 900 });
    expect(g.zones.bottom.rect).toEqual({ x: 280, y: 540, width: 820, height: 360 });
    expect(g.canvas).toEqual({ x: 280, y: 0, width: 820, height: 540 });
    expect(g.zones.right.groups.map((x) => x.rect.x)).toEqual([1300, 1100]);
    expect(g.zones.bottom.groups.map((x) => [x.rect.y, x.rect.height])).toEqual([[700, 200], [540, 160]]);
  });

  it('panels in a bottom row sit side by side; a collapsed one is a 24 px strip', () => {
    const g = computeGeometry(all(), AREA2);
    const [b1, b2, b3] = g.zones.bottom.groups[0]!.panels;
    // 820 wide - one 24 px strip = 796 for two open panels.
    expect(b1!.rect).toEqual({ x: 280, y: 700, width: 398, height: 200 });
    expect(b1!.header).toEqual({ x: 280, y: 700, width: 398, height: 24 });
    expect(b2!.rect).toEqual({ x: 678, y: 700, width: 24, height: 200 });
    expect(b3!.rect).toEqual({ x: 702, y: 700, width: 398, height: 200 });
  });

  it('splitters: between bottom rows and to the canvas run horizontally; between bottom panels vertically', () => {
    const g = computeGeometry(all(), AREA2);
    const bottomGroups = g.splitters.filter((s) => s.kind === 'group' && s.edge === 'bottom');
    expect(bottomGroups.map((s) => s.rect)).toEqual([
      { x: 280, y: 697, width: 820, height: 6 },
      { x: 280, y: 537, width: 820, height: 6 },
    ]);
    // Between b1 and b3 (across the collapsed b2).
    const panel = g.splitters.find((s) => s.kind === 'panel' && s.edge === 'bottom')!;
    expect(panel).toMatchObject({ a: 0, b: 2 });
    expect(panel.rect.height).toBe(200);
    const rightGroups = g.splitters.filter((s) => s.kind === 'group' && s.edge === 'right');
    expect(rightGroups.map((s) => s.rect.x)).toEqual([1297, 1097]);
  });

  it('bottomSpansFullWidth: bottom runs under left and right, which get shorter', () => {
    const g = computeGeometry(all(), AREA2, { bottomSpansFullWidth: true });
    expect(g.zones.bottom.rect).toEqual({ x: 0, y: 540, width: 1600, height: 360 });
    expect(g.zones.left.rect).toEqual({ x: 0, y: 0, width: 280, height: 540 });
    expect(g.zones.right.rect).toEqual({ x: 1100, y: 0, width: 500, height: 540 });
    expect(g.canvas).toEqual({ x: 280, y: 0, width: 820, height: 540 });
    // The edge bars follow the zones.
    expect(computeDropTarget(g, { x: 800, y: 895 })!.indicator).toEqual({ x: 0, y: 896, width: 1600, height: 4 });
    expect(computeDropTarget(g, { x: 5, y: 300 })!.indicator).toEqual({ x: 0, y: 0, width: 4, height: 540 });
  });

  it('drop targets in the bottom zone: between rows and at the inner (top) edge → new row', () => {
    const g = computeGeometry(all(), AREA2);
    // Top edge of the inner row (g1, 540–700) → new innermost row.
    expect(computeDropTarget(g, { x: 600, y: 545 })).toEqual({
      target: { kind: 'newGroup', edge: 'bottom', groupIndex: 2 }, rule: 'groupEdge', indicator: { x: 280, y: 540, width: 820, height: 3 },
    });
    // Around the border between g0 and g1 (y = 700).
    expect(computeDropTarget(g, { x: 600, y: 705 })!.target).toEqual({ kind: 'newGroup', edge: 'bottom', groupIndex: 1 });
    expect(computeDropTarget(g, { x: 600, y: 695 })!.target).toEqual({ kind: 'newGroup', edge: 'bottom', groupIndex: 1 });
    // Inside a row: before b3 (x = 702).
    expect(computeDropTarget(g, { x: 710, y: 800 })).toMatchObject({ target: { kind: 'intoGroup', edge: 'bottom', groupIndex: 0, panelIndex: 2 }, rule: 'seam' });
  });

  it('drop targets in the right zone: the inner edge is the left side', () => {
    const g = computeGeometry(all(), AREA2);
    expect(computeDropTarget(g, { x: 1105, y: 300 })).toEqual({
      target: { kind: 'newGroup', edge: 'right', groupIndex: 2 }, rule: 'groupEdge', indicator: { x: 1100, y: 0, width: 3, height: 900 },
    });
    // Seam between r1 and r2 (both 450 high: r2 starts at 450).
    expect(computeDropTarget(g, { x: 1450, y: 440 })).toMatchObject({ target: { kind: 'intoGroup', edge: 'right', groupIndex: 0, panelIndex: 1 }, indicator: { x: 1300, width: 300, height: 3 } });
  });

  it('collapsed bottom: a 24 px horizontal bar between left and right, tabs side by side', () => {
    const l = all();
    l.zones.bottom.collapsed = true;
    const g = computeGeometry(l, AREA2, { tabLength: () => 80 });
    const bar = g.zones.bottom.bar!;
    expect(bar.rect).toEqual({ x: 280, y: 876, width: 820, height: 24 });
    expect(g.canvas.height).toBe(876);
    expect(bar.tabs.every((t) => t.rect.y === 876 && t.rect.height === 24 && t.rect.width === 80)).toBe(true);
    expect(bar.tabs.map((t) => t.id)).toEqual(['b1', 'b2', 'b3', 'b4']);
    expect(computeDropTarget(g, { x: bar.tabs[1]!.rect.x + 5, y: 885 })!.target).toEqual({ kind: 'intoGroup', edge: 'bottom', groupIndex: 0, panelIndex: 1 });
  });
});
