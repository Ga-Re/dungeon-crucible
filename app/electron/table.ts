/**
 * The table window: borderless and fullscreen on the chosen display, no controls, black
 * until it receives valid frames. Electron works in logical desktop coordinates on every
 * platform, so no physical/logical conversion is needed (unlike the former Tauri port).
 */
import { BrowserWindow, screen, type Display } from 'electron';
import type { MonitorInfo, ScreenArea, ScreenSetupInfo } from '../src/platform/desktop-api';

/** Displays in a stable order: the primary (the DM's) first. */
export function orderedDisplays(): Display[] {
  const primary = screen.getPrimaryDisplay();
  return [primary, ...screen.getAllDisplays().filter((d) => d.id !== primary.id)];
}

export function listDisplays(): MonitorInfo[] {
  return orderedDisplays().map((d, index) => ({
    index,
    name: d.label || `Display ${index + 1}`,
    x: d.bounds.x,
    y: d.bounds.y,
    width: Math.round(d.size.width * d.scaleFactor),
    height: Math.round(d.size.height * d.scaleFactor),
    scaleFactor: d.scaleFactor,
  }));
}

function area(d: Display): ScreenArea {
  return { id: String(d.id), ...d.workArea };
}

/** Work areas of all displays and the one `win` is on (for placing floating panel windows). */
export function screenSetup(win: BrowserWindow | null): ScreenSetupInfo {
  const main = win && !win.isDestroyed() ? screen.getDisplayMatching(win.getBounds()) : screen.getPrimaryDisplay();
  return { screens: orderedDisplays().map(area), main: area(main) };
}

export interface TableWindowOptions {
  preload: string;
  url: () => string;
  onReady: () => void;
  onClosed: () => void;
}

export class TableWindow {
  private win: BrowserWindow | null = null;

  constructor(private readonly opts: TableWindowOptions) {}

  /** Opens the window fullscreen on display `index`, or moves it there. Keeps focus with the DM. */
  open(index: number, title: string): void {
    const display = orderedDisplays()[index];
    if (!display) throw new Error(`Unknown display ${index}`);
    let win = this.win;
    if (!win || win.isDestroyed()) {
      win = this.create(display, title);
    } else {
      // Only move while windowed.
      setFullscreen(win, false);
      win.setBounds(display.bounds);
    }
    setFullscreen(win, true);
    win.showInactive();
  }

  close(): void {
    if (this.win && !this.win.isDestroyed()) this.win.close();
    this.win = null;
  }

  send(channel: string, payload: unknown): void {
    if (this.win && !this.win.isDestroyed()) this.win.webContents.send(channel, payload);
  }

  private create(display: Display, title: string): BrowserWindow {
    const win = new BrowserWindow({
      ...display.bounds,
      title,
      frame: false,
      show: false,
      backgroundColor: '#000000',
      // Created hidden so it never flashes on the DM's screen.
      webPreferences: {
        preload: this.opts.preload,
        contextIsolation: true,
        sandbox: true,
        nodeIntegration: false,
        // Keep drawing at full rate while another window has focus.
        backgroundThrottling: false,
      },
    });
    win.setMenuBarVisibility(false);
    win.webContents.on('did-finish-load', () => this.opts.onReady());
    win.on('closed', () => {
      if (this.win === win) this.win = null;
      this.opts.onClosed();
    });
    void win.loadURL(this.opts.url());
    this.win = win;
    return win;
  }
}

/**
 * macOS: "simple" fullscreen avoids a separate Space and its animation (during which further
 * window commands are ignored). Elsewhere regular fullscreen is immediate.
 */
function setFullscreen(win: BrowserWindow, on: boolean): void {
  if (process.platform === 'darwin') win.setSimpleFullScreen(on);
  else win.setFullScreen(on);
}
