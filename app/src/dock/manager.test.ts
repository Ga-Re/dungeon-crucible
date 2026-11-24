import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DockManager, SAVE_DELAY_MS, type StorageLike } from './manager';
import { findPanel } from './model';

class MemoryStorage implements StorageLike {
  data = new Map<string, string>();
  writes = 0;
  getItem(k: string) {
    return this.data.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.writes++;
    this.data.set(k, v);
  }
}

function setup() {
  const storage = new MemoryStorage();
  const dock = new DockManager<string>(storage);
  for (const id of ['map', 'browser', 'fog', 'log', 'dice']) dock.registerPanel({ id, title: id.toUpperCase(), create: () => id });
  return { storage, dock };
}

const WS_A = { key: 'dc.dock.a', defaults: { left: ['browser', 'fog'], bottom: ['log'] }, exclude: ['map'] };
const WS_B = { key: 'dc.dock.b', defaults: { right: ['dice'] }, exclude: ['map'] };

describe('DockManager', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('builds the default layout of a workspace; other panels start hidden, the canvas is excluded', () => {
    const { dock } = setup();
    dock.useWorkspace(WS_A);
    const l = dock.getLayout();
    expect(l.zones.left.groups[0]!.panels.map((p) => p.id)).toEqual(['browser', 'fog']);
    expect(l.hidden).toEqual(['dice']);
    expect(findPanel(l, 'map')).toBeNull();
  });

  it('saves 500 ms after the last change, once', () => {
    const { dock, storage } = setup();
    dock.useWorkspace(WS_A);
    dock.hide('fog');
    vi.advanceTimersByTime(SAVE_DELAY_MS - 100);
    dock.hide('log');
    vi.advanceTimersByTime(SAVE_DELAY_MS - 100);
    expect(storage.writes).toBe(0);
    vi.advanceTimersByTime(100);
    expect(storage.writes).toBe(1);
    expect(JSON.parse(storage.getItem('dc.dock.a')!).hidden).toEqual(['dice', 'fog', 'log']);
  });

  it('keeps a layout per workspace and restores it when switching back', () => {
    const { dock } = setup();
    dock.useWorkspace(WS_A);
    dock.setZoneCollapsed('left', true);
    dock.useWorkspace(WS_B);
    expect(dock.getLayout().zones.right.groups[0]!.panels[0]!.id).toBe('dice');
    dock.useWorkspace(WS_A);
    expect(dock.getLayout().zones.left.collapsed).toBe(true);
  });

  it('focus shows, expands and un-collapses; toggle hides and shows', () => {
    const { dock } = setup();
    dock.useWorkspace(WS_A);
    dock.setZoneCollapsed('left', true);
    dock.setLayout({ ...dock.getLayout(), zones: { ...dock.getLayout().zones, left: { ...dock.getLayout().zones.left, groups: [{ size: 280, panels: [{ id: 'browser', expanded: true, weight: 1 }, { id: 'fog', expanded: false, weight: 1 }] }] } } });
    dock.focus('fog');
    expect(dock.getLayout().zones.left.collapsed).toBe(false);
    expect(dock.getLayout().zones.left.groups[0]!.panels[1]!.expanded).toBe(true);
    dock.focus('dice');
    expect(dock.isVisible('dice')).toBe(true);
    dock.toggle('dice');
    expect(dock.isVisible('dice')).toBe(false);
    dock.toggle('dice');
    expect(dock.isVisible('dice')).toBe(true);
    dock.focus('map');
    expect(findPanel(dock.getLayout(), 'map')).toBeNull();
  });

  it('places a panel registered later at its default edge', () => {
    const { dock } = setup();
    dock.useWorkspace(WS_A);
    dock.registerPanel({ id: 'notes', title: 'Notes', create: () => 'notes', defaultEdge: 'bottom' });
    expect(findPanel(dock.getLayout(), 'notes')).toEqual({ kind: 'dock', edge: 'bottom', groupIndex: 0, panelIndex: 1 });
  });

  it('reset restores the defaults; listeners hear every change', () => {
    const { dock } = setup();
    dock.useWorkspace(WS_A);
    const seen: number[] = [];
    const off = dock.on('layoutChanged', (l) => seen.push(l.hidden.length));
    dock.hide('browser');
    dock.resetLayout();
    off();
    dock.hide('fog');
    expect(seen).toEqual([2, 1]);
    expect(dock.title('fog')).toBe('FOG');
  });

  it('places floating windows on the screens: lost ones come back, all remember their monitor', () => {
    const { dock, storage } = setup();
    const main = { id: 'm', x: 0, y: 0, width: 1440, height: 900 };
    const tv = { id: 'tv', x: 1440, y: 0, width: 1920, height: 1080 };
    dock.setScreens({ screens: [main, tv], main });
    dock.useWorkspace(WS_A);
    dock.float('dice', { x: 2000, y: 200, width: 300, height: 300 });
    expect(dock.getLayout().floating[0]).toMatchObject({ id: 'dice', x: 2000, monitorId: 'tv' });
    vi.advanceTimersByTime(SAVE_DELAY_MS);
    // Restart without the TV: the window comes back to the main screen.
    const again = new DockManager<string>(storage);
    for (const id of ['map', 'browser', 'fog', 'log', 'dice']) again.registerPanel({ id, title: id, create: () => id });
    again.setScreens({ screens: [main], main });
    again.useWorkspace(WS_A);
    expect(again.getLayout().floating[0]).toMatchObject({ id: 'dice', x: 40, y: 40, monitorId: 'm' });
    vi.advanceTimersByTime(SAVE_DELAY_MS);
    expect(JSON.parse(storage.getItem('dc.dock.a')!).floating[0]).toMatchObject({ x: 40, monitorId: 'm' });
    // The TV is unplugged while running.
    dock.setScreens({ screens: [main], main });
    expect(dock.getLayout().floating[0]).toMatchObject({ x: 40, y: 40, monitorId: 'm' });
  });
});
