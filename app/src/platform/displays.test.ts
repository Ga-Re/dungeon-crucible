import { PhysicalPosition, PhysicalSize } from '@tauri-apps/api/dpi';
import type { Monitor } from '@tauri-apps/api/window';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createTauriDisplayService, detectPlatformFamily } from './displays';

const fake = vi.hoisted(() => {
  const calls: string[] = [];
  const state = { existing: null as unknown, created: [] as unknown[], monitors: [] as unknown[] };
  const record = (call: string) => {
    calls.push(call);
    return Promise.resolve();
  };
  const pos = (v: { constructor: { name: string }; x: number; y: number }) => `${v.constructor.name}:${v.x},${v.y}`;
  class FakeWindow {
    constructor(readonly options: Record<string, unknown> = {}) {}
    setFullscreen = (on: boolean) => record(`fullscreen:${on}`);
    setSimpleFullscreen = (on: boolean) => record(`simpleFullscreen:${on}`);
    setPosition = (v: { constructor: { name: string }; x: number; y: number }) => record(`position:${pos(v)}`);
    show = () => record('show');
    setFocus = () => record('focus');
    close = () => record('close');
    once = (event: string, handler: (e: { payload: string }) => void) => {
      if (event === 'tauri://created') handler({ payload: '' });
      return Promise.resolve(() => undefined);
    };
  }
  return { calls, state, FakeWindow };
});

vi.mock('@tauri-apps/api/webviewWindow', () => ({
  WebviewWindow: class extends fake.FakeWindow {
    static getByLabel = () => Promise.resolve(fake.state.existing);
    constructor(_label: string, options: Record<string, unknown>) {
      super(options);
      fake.state.created.push(this);
    }
  },
}));
vi.mock('@tauri-apps/api/window', () => ({ availableMonitors: () => Promise.resolve(fake.state.monitors) }));

function monitor(name: string, x: number, width: number, scaleFactor: number): Monitor {
  return { name, size: new PhysicalSize(width, 900 * scaleFactor), position: new PhysicalPosition(x, 0), scaleFactor, workArea: { position: new PhysicalPosition(x, 0), size: new PhysicalSize(width, 900) } } as Monitor;
}

beforeEach(() => {
  fake.calls.length = 0;
  fake.state.created.length = 0;
  fake.state.existing = null;
  fake.state.monitors.length = 0;
  // Retina MacBook (2560 physical wide at 2×) left, 4K TV (1×) right of it.
  fake.state.monitors.push(monitor('Built-in Retina', 0, 2560, 2), monitor('TV', 2560, 3840, 1));
});

describe('display service', () => {
  it('detects macOS from the user agent', () => {
    expect(detectPlatformFamily('Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit')).toBe('macos');
    expect(detectPlatformFamily('Mozilla/5.0 (Windows NT 10.0; Win64; x64)')).toBe('other');
  });

  it('macOS: creates the window hidden, uses the logical origin and simple fullscreen', async () => {
    const s = createTauriDisplayService('macos');
    const list = await s.listDisplays();
    expect(list.map((d) => d.name)).toEqual(['Built-in Retina', 'TV']);
    await s.openTableView(1, 'Table');
    expect(fake.state.created).toHaveLength(1);
    expect((fake.state.created[0] as { options: Record<string, unknown> }).options).toMatchObject({ visible: false, decorations: false, url: 'table.html' });
    expect(fake.calls).toEqual(['simpleFullscreen:false', 'position:LogicalPosition:2560,0', 'simpleFullscreen:true', 'show', 'focus']);
  });

  it('Windows: uses physical coordinates and regular fullscreen, and reuses an open window', async () => {
    fake.state.existing = new fake.FakeWindow();
    const s = createTauriDisplayService('other');
    await s.listDisplays();
    await s.openTableView(1, 'Table');
    expect(fake.state.created).toHaveLength(0);
    expect(fake.calls).toEqual(['fullscreen:false', 'position:PhysicalPosition:2560,0', 'fullscreen:true', 'show', 'focus']);
  });

  it('rejects an unknown display', async () => {
    const s = createTauriDisplayService('other');
    await s.listDisplays();
    await expect(s.openTableView(5, 'Table')).rejects.toThrow('Unknown display 5');
  });
});
