import { afterEach, describe, expect, it } from 'vitest';
import { LAYOUT_VERSION, findPanel, floatPanel, hidePanel, setZoneCollapsed, toggleExpanded, type DockLayout } from './model';
import { MIGRATIONS, defaultLayout, loadLayout, restoreFloating, type DefaultSpec, type ScreenInfo } from './persist';

const KNOWN = ['browser', 'properties', 'fog', 'initiative', 'preview', 'table', 'dice', 'log', 'encounter'];
const PLAY: DefaultSpec = {
  left: ['browser', 'fog'],
  right: ['initiative', 'table'],
  bottom: ['dice', 'log'],
  floating: [{ id: 'preview', width: 360, height: 260 }],
};
const place = (i: number) => ({ x: 900 + 40 * i, y: 100, monitorId: '1' });
const defaults = () => defaultLayout(PLAY, KNOWN, place);

describe('defaultLayout', () => {
  it('builds one group per edge, floating panels, and hides the rest', () => {
    const d = defaults();
    expect(d.version).toBe(LAYOUT_VERSION);
    expect(d.zones.left.groups[0]!.panels.map((p) => [p.id, p.expanded])).toEqual([['browser', true], ['fog', true]]);
    expect(d.zones.right.groups[0]!.panels.map((p) => p.id)).toEqual(['initiative', 'table']);
    expect(d.zones.bottom.groups[0]!.panels.map((p) => p.id)).toEqual(['dice', 'log']);
    expect(d.floating).toEqual([{ id: 'preview', x: 900, y: 100, width: 360, height: 260, monitorId: '1' }]);
    expect(d.hidden).toEqual(['properties', 'encounter']);
  });

  it('ignores unknown ids and can start panels collapsed', () => {
    const d = defaultLayout({ left: ['browser', 'nope', 'fog'], collapsed: ['fog'] }, ['browser', 'fog'], place);
    expect(d.zones.left.groups[0]!.panels).toEqual([
      { id: 'browser', expanded: true, weight: 1 },
      { id: 'fog', expanded: false, weight: 1 },
    ]);
  });
});

describe('loadLayout', () => {
  afterEach(() => {
    for (const k of Object.keys(MIGRATIONS)) delete MIGRATIONS[Number(k)];
  });

  const ctx = () => ({ known: KNOWN, defaults: defaults() });

  it('round-trips through JSON unchanged', () => {
    let l: DockLayout = defaults();
    l = toggleExpanded(l, 'fog');
    l = setZoneCollapsed(l, 'right', true);
    l = floatPanel(l, 'dice', { x: -1500, y: 200, width: 400, height: 300, monitorId: '7' });
    l = hidePanel(l, 'preview');
    expect(loadLayout(JSON.stringify(l), ctx())).toEqual(l);
  });

  it('gives the defaults for broken data or a newer version', () => {
    const d = defaults();
    expect(loadLayout('{not json', ctx())).toEqual(d);
    expect(loadLayout(null, ctx())).toEqual(d);
    expect(loadLayout([], ctx())).toEqual(d);
    expect(loadLayout({ ...d, version: LAYOUT_VERSION + 1 }, ctx())).toEqual(d);
    expect(loadLayout({ ...d, version: 'x' }, ctx())).toEqual(d);
    // Version 0 without a migration.
    expect(loadLayout({ zones: {} }, ctx())).toEqual(d);
  });

  it('runs migrations from older versions', () => {
    // Pretend version 0 stored the zones under another name.
    MIGRATIONS[LAYOUT_VERSION - 1] = (raw) => ({ ...raw, zones: raw['dock'], version: LAYOUT_VERSION });
    const old = { version: LAYOUT_VERSION - 1, dock: { left: { collapsed: false, groups: [{ size: 300, panels: [{ id: 'log', expanded: true, weight: 1 }] }] } } };
    const l = loadLayout(old, ctx());
    // "log" comes from the migrated data; browser and fog were missing and go to their default place.
    expect(l.zones.left.groups[0]!.size).toBe(300);
    expect(l.zones.left.groups[0]!.panels.map((p) => p.id)).toEqual(['browser', 'fog', 'log']);
    expect(findPanel(l, 'dice')).toEqual({ kind: 'dock', edge: 'bottom', groupIndex: 0, panelIndex: 0 });
  });

  it('drops unknown panels and broken pieces, keeps the rest', () => {
    const saved = {
      version: LAYOUT_VERSION,
      zones: {
        left: { collapsed: false, groups: [{ size: 250, panels: [{ id: 'gone' }, { id: 'browser', expanded: false, weight: 2 }, { nope: 1 }, 'x'] }] },
        right: 'garbage',
        bottom: { collapsed: true, groups: [{ size: 180, panels: [{ id: 'gone2' }] }] },
      },
      floating: [{ id: 'old', x: 0, y: 0, width: 300, height: 300 }, { id: 'table', x: 'a', y: 5, width: 300, height: 300, lastDock: { edge: 'top' } }],
      hidden: ['gone3', 4],
    };
    const l = loadLayout(saved, ctx());
    expect(l.zones.left.groups[0]!.panels[0]).toEqual({ id: 'browser', expanded: false, weight: 2 });
    expect(l.zones.left.groups[0]!.size).toBe(250);
    // Bottom only had unknown panels: empty again, so not collapsed.
    expect(l.zones.bottom.collapsed).toBe(false);
    expect(l.floating.find((f) => f.id === 'table')).toEqual({ id: 'table', x: 0, y: 5, width: 300, height: 300 });
    expect(JSON.stringify(l)).not.toMatch(/gone|old/);
  });

  it('inserts panels missing from the saved layout at their default place', () => {
    const saved = { version: LAYOUT_VERSION, zones: { left: { collapsed: false, groups: [{ size: 260, panels: [{ id: 'browser', expanded: true, weight: 1 }] }] } }, floating: [], hidden: [] };
    const l = loadLayout(saved, ctx());
    // fog: second in the default left group.
    expect(findPanel(l, 'fog')).toEqual({ kind: 'dock', edge: 'left', groupIndex: 0, panelIndex: 1 });
    // initiative, table: right zone was empty → new group there with the default size.
    expect(l.zones.right.groups).toHaveLength(1);
    expect(l.zones.right.groups[0]!.panels.map((p) => p.id)).toEqual(['initiative', 'table']);
    expect(findPanel(l, 'preview')).toMatchObject({ kind: 'floating' });
    expect(l.floating[0]).toMatchObject({ x: 900, y: 100, width: 360, height: 260 });
    expect(l.hidden).toEqual(['properties', 'encounter']);
  });
});

describe('restoreFloating', () => {
  const main: ScreenInfo = { id: '1', x: 0, y: 0, width: 1920, height: 1080 };
  const tv: ScreenInfo = { id: '2', x: 1920, y: 0, width: 3840, height: 2160 };
  const withFloating = (...f: DockLayout['floating']) => ({ ...defaults(), floating: f });

  it('keeps visible windows where they are', () => {
    const l = withFloating({ id: 'dice', x: 2500, y: 300, width: 400, height: 300, monitorId: '2' });
    expect(restoreFloating(l, [main, tv], main)).toBe(l);
  });

  it('brings back windows from a removed monitor or off-screen, cascaded by 40 px', () => {
    const l = withFloating(
      { id: 'dice', x: 2500, y: 300, width: 400, height: 300, monitorId: '2' },
      { id: 'log', x: 1900, y: 1060, width: 400, height: 300 },
      { id: 'fog', x: 100, y: 100, width: 300, height: 300, monitorId: '1' },
    );
    const r = restoreFloating(l, [main], main);
    expect(r.floating[0]).toMatchObject({ id: 'dice', x: 40, y: 40, monitorId: '1' });
    // Only 20 × 20 px visible on the main screen.
    expect(r.floating[1]).toMatchObject({ id: 'log', x: 80, y: 80, monitorId: '1' });
    expect(r.floating[2]).toBe(l.floating[2]);
  });

  it('shrinks windows that are bigger than the main screen', () => {
    const l = withFloating({ id: 'dice', x: 5000, y: 0, width: 3000, height: 2000, monitorId: '9' });
    const r = restoreFloating(l, [main], main);
    expect(r.floating[0]).toMatchObject({ x: 40, y: 40, width: 1840, height: 1000 });
  });
});
