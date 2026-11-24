/**
 * Native windows for floating panels. The DM window opens them itself with
 * `window.open('about:blank', 'dc-float:…')` (same renderer process, same JS realm), so a
 * panel's DOM can move into them unchanged; the main process only shapes the windows:
 * frameless, owned by the DM window, no taskbar entry, shown without taking the focus.
 *
 * macOS: a child window (`parent`) belongs to the Space of its parent's display; with
 * "Displays have separate Spaces" (the default) it is invisible on any other display. So on
 * macOS the windows have no parent, and what the parent relation would give is done here:
 * above the DM window while the app is active (not above other apps when it is not), hidden
 * while the DM window is minimized, shown in its fullscreen Space, not in the Window menu.
 */
import { app, BrowserWindow, type HandlerDetails, type WindowOpenHandlerResponse } from 'electron';
import type { FloatBounds } from '../src/platform/desktop-api';

export const FLOAT_PREFIX = 'dc-float:';
const MIN = { width: 160, height: 120 };
/** Bounds changes by the system are reported after this pause. */
const REPORT_DELAY_MS = 150;
const MAC = process.platform === 'darwin';

export interface FloatingEvents {
  moved(name: string, bounds: FloatBounds): void;
  closed(name: string): void;
}

export class FloatingWindows {
  private readonly windows = new Map<string, BrowserWindow>();
  /** Bounds that arrived before the window was registered (applied when it is). */
  private readonly pending = new Map<string, FloatBounds>();
  /** The DM window is minimized or hidden: floating windows stay hidden too. */
  private mainHidden = false;
  private appActive = true;
  private mainFullScreen = false;

  constructor(private readonly events: FloatingEvents) {
    if (MAC) {
      app.on('did-become-active', () => {
        this.appActive = true;
        this.applyLevel();
      });
      app.on('did-resign-active', () => {
        this.appActive = false;
        this.applyLevel();
      });
    }
  }

  /** The DM window: floating windows follow it (minimize/restore, fullscreen, close). */
  attachMain(main: BrowserWindow): void {
    const hide = () => {
      this.mainHidden = true;
      for (const w of this.all()) w.hide();
    };
    const show = () => {
      if (!this.mainHidden) return;
      this.mainHidden = false;
      for (const w of this.all()) w.showInactive();
    };
    main.on('minimize', hide);
    main.on('hide', hide);
    main.on('restore', show);
    main.on('show', show);
    main.on('enter-full-screen', () => {
      this.mainFullScreen = true;
      for (const w of this.all()) this.applySpaces(w);
    });
    main.on('leave-full-screen', () => {
      this.mainFullScreen = false;
      for (const w of this.all()) this.applySpaces(w);
    });
    main.on('closed', () => {
      for (const w of this.all()) w.close();
    });
  }

  /** `setWindowOpenHandler` answer for the DM window: only blank `dc-float:` popups are allowed. */
  openHandler(parent: BrowserWindow, details: HandlerDetails): WindowOpenHandlerResponse | null {
    if (!details.frameName.startsWith(FLOAT_PREFIX) || details.url !== 'about:blank') return null;
    return {
      action: 'allow',
      overrideBrowserWindowOptions: {
        ...(MAC ? {} : { parent }),
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
    if (MAC) {
      win.excludedFromShownWindowsMenu = true;
      this.applyLevel(win);
      if (this.mainFullScreen) this.applySpaces(win);
    }
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
    // Show first, then move: it was created at these bounds already, so nothing jumps.
    if (!win.isVisible() && !this.mainHidden) win.showInactive();
    const cur = win.getBounds();
    if (cur.x !== bounds.x || cur.y !== bounds.y || cur.width !== bounds.width || cur.height !== bounds.height) win.setBounds(bounds);
    if (b.opacity !== undefined && win.getOpacity() !== b.opacity) win.setOpacity(b.opacity);
  }

  private all(): BrowserWindow[] {
    return [...this.windows.values()].filter((w) => !w.isDestroyed());
  }

  /** macOS: above the DM window while the app is active, an ordinary window otherwise. */
  private applyLevel(only?: BrowserWindow): void {
    if (!MAC) return;
    for (const w of only ? [only] : this.all()) w.setAlwaysOnTop(this.appActive, 'floating');
  }

  /** macOS: a DM window in fullscreen has its own Space; the floating windows join it. */
  private applySpaces(w: BrowserWindow): void {
    if (!MAC) return;
    // Without skipTransformProcessType Electron briefly changes the process type, which takes
    // the focus from the DM window (and would cancel a drag).
    w.setVisibleOnAllWorkspaces(this.mainFullScreen, { visibleOnFullScreen: this.mainFullScreen, skipTransformProcessType: true });
  }
}
