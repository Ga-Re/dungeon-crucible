/**
 * Native windows for floating panels. The DM window opens them itself with
 * `window.open('about:blank', 'dc-float:…')` (same renderer process, same JS realm), so a
 * panel's DOM can move into them unchanged; the main process only shapes the windows:
 * frameless, child of the DM window, no taskbar entry, shown without taking the focus.
 */
import { BrowserWindow, type HandlerDetails, type WindowOpenHandlerResponse } from 'electron';
import type { FloatBounds } from '../src/platform/desktop-api';

export const FLOAT_PREFIX = 'dc-float:';
const MIN = { width: 160, height: 120 };
/** Bounds changes by the system (e.g. moving with the parent) are reported after this pause. */
const REPORT_DELAY_MS = 150;

export interface FloatingEvents {
  moved(name: string, bounds: FloatBounds): void;
  closed(name: string): void;
}

export class FloatingWindows {
  private readonly windows = new Map<string, BrowserWindow>();
  /** Bounds that arrived before the window was registered (applied when it is). */
  private readonly pending = new Map<string, FloatBounds>();

  constructor(private readonly events: FloatingEvents) {}

  /** `setWindowOpenHandler` answer for the DM window: only blank `dc-float:` popups are allowed. */
  openHandler(parent: BrowserWindow, details: HandlerDetails): WindowOpenHandlerResponse | null {
    if (!details.frameName.startsWith(FLOAT_PREFIX) || details.url !== 'about:blank') return null;
    return {
      action: 'allow',
      overrideBrowserWindowOptions: {
        parent,
        frame: false,
        show: false,
        skipTaskbar: true,
        resizable: true,
        minimizable: false,
        maximizable: false,
        fullscreenable: false,
        // A press on the title of an inactive window starts a drag at once (macOS).
        acceptFirstMouse: true,
        minWidth: MIN.width,
        minHeight: MIN.height,
        backgroundColor: '#2b2f38',
        hasShadow: true,
      },
    };
  }

  /** Called from `did-create-window` of the DM window. */
  adopt(win: BrowserWindow, frameName: string): void {
    if (!frameName.startsWith(FLOAT_PREFIX)) return;
    const name = frameName;
    this.windows.set(name, win);
    win.setMenuBarVisibility(false);
    let timer: NodeJS.Timeout | null = null;
    const report = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        if (!win.isDestroyed()) this.events.moved(name, win.getBounds());
      }, REPORT_DELAY_MS);
    };
    win.on('move', report);
    win.on('resize', report);
    const early = this.pending.get(name);
    this.pending.delete(name);
    if (early) this.setBounds(name, early);
    win.on('closed', () => {
      if (timer) clearTimeout(timer);
      this.windows.delete(name);
      this.events.closed(name);
    });
  }

  /** Moves/resizes a floating window; the first call shows it without activating it. */
  setBounds(name: string, b: FloatBounds): void {
    const win = this.windows.get(name);
    if (!win) {
      if (name.startsWith(FLOAT_PREFIX)) this.pending.set(name, b);
      return;
    }
    if (win.isDestroyed()) return;
    const bounds = {
      x: Math.round(b.x),
      y: Math.round(b.y),
      width: Math.max(MIN.width, Math.round(b.width)),
      height: Math.max(MIN.height, Math.round(b.height)),
    };
    win.setBounds(bounds);
    if (b.opacity !== undefined && win.getOpacity() !== b.opacity) win.setOpacity(b.opacity);
    if (!win.isVisible()) win.showInactive();
  }
}
