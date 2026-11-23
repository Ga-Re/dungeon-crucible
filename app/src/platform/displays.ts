/**
 * Displays and the table window via the Tauri window API.
 * Ported from Dungeon-Manager (`apps/desktop/src/platform/tauri-displays.ts`), where it is
 * proven on macOS with a Retina display plus a 4K TV and on Windows.
 */
import { availableMonitors, type Monitor } from '@tauri-apps/api/window';
import { WebviewWindow } from '@tauri-apps/api/webviewWindow';

export const TABLE_LABEL = 'table';

/** A physical display the table view can be shown on. */
export interface Display {
  /** Index within the most recent `listDisplays()` result. */
  readonly index: number;
  readonly name: string;
  /** Resolution in physical pixels. */
  readonly width: number;
  readonly height: number;
  readonly x: number;
  readonly y: number;
  readonly scaleFactor: number;
}

/** Operating system family; window placement differs on macOS. */
export type PlatformFamily = 'macos' | 'other';

/** Detects the platform from the webview's user agent (WKWebView on macOS). */
export function detectPlatformFamily(userAgent: string): PlatformFamily {
  return userAgent.includes('Macintosh') ? 'macos' : 'other';
}

export interface DisplayService {
  /** Lists the connected displays; call again after plugging in a display. */
  listDisplays(): Promise<readonly Display[]>;
  /** Opens the table window fullscreen on display `index`, or moves it there if already open. */
  openTableView(index: number, title: string): Promise<void>;
  closeTableView(): Promise<void>;
}

export function createTauriDisplayService(platform: PlatformFamily, tablePage = 'table.html'): DisplayService {
  let monitors: Monitor[] = [];

  return {
    async listDisplays() {
      monitors = await availableMonitors();
      return monitors.map((m, index) => ({
        index,
        name: m.name ?? `Display ${index + 1}`,
        width: m.size.width,
        height: m.size.height,
        x: m.position.x,
        y: m.position.y,
        scaleFactor: m.scaleFactor,
      }));
    },

    async openTableView(index, title) {
      if (monitors.length === 0) monitors = await availableMonitors();
      const monitor = monitors[index];
      if (!monitor) throw new Error(`Unknown display ${index}`);
      const window = (await WebviewWindow.getByLabel(TABLE_LABEL)) ?? (await createHiddenTableWindow(title, tablePage));
      // Leave fullscreen first: windows are only moved between displays while windowed.
      await setFullscreen(window, platform, false);
      await window.setPosition(originOf(monitor, platform));
      await setFullscreen(window, platform, true);
      await window.show();
      await window.setFocus();
    },

    async closeTableView() {
      const window = await WebviewWindow.getByLabel(TABLE_LABEL);
      await window?.close();
    },
  };
}

/**
 * The monitor's top-left corner in the units `setPosition` expects. On macOS the reported
 * physical position is the logical origin scaled by *that* monitor's factor, while
 * `setPosition` converts physical values with the *window's* factor – so mixed Retina/TV
 * setups need the logical origin. Elsewhere physical desktop coordinates are exact.
 */
function originOf(monitor: Monitor, platform: PlatformFamily) {
  return platform === 'macos' ? monitor.position.toLogical(monitor.scaleFactor) : monitor.position;
}

/**
 * macOS: "simple" fullscreen avoids a separate Space and its animation, during which
 * further window commands are ignored. Elsewhere regular fullscreen is immediate.
 */
function setFullscreen(window: WebviewWindow, platform: PlatformFamily, on: boolean): Promise<void> {
  return platform === 'macos' ? window.setSimpleFullscreen(on) : window.setFullscreen(on);
}

/** Created hidden so it does not flash on the DM's screen before it is moved. */
function createHiddenTableWindow(title: string, url: string): Promise<WebviewWindow> {
  const window = new WebviewWindow(TABLE_LABEL, {
    url,
    title,
    decorations: false,
    visible: false,
    // No drag & drop: its file-path events would go on the global event bus.
    dragDropEnabled: false,
  });
  return new Promise((resolve, reject) => {
    void window.once('tauri://created', () => resolve(window));
    void window.once<string>('tauri://error', (event) => reject(new Error(event.payload)));
  });
}
