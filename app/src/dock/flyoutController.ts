/**
 * Flyout controller: which panel of a collapsed zone is shown as a flyout, and the hover
 * timers. No DOM; the view reports pointer, focus and key events.
 *
 * - Pointer (or keyboard focus) on a tab: opens after 200 ms; leaving the tab earlier cancels.
 *   With a flyout open, another tab switches at once.
 * - Leaving bar and flyout: closes after 400 ms; coming back cancels.
 * - Click on a tab: opens at once and pins; a pinned flyout closes only by `close()`
 *   (click outside, Esc, pin button, drag).
 * - Holds keep it open: an input inside has the focus, a press that began inside is held, a
 *   tab of the bar has the keyboard focus.
 */
import type { Edge } from './model';

export const FLYOUT = {
  openDelay: 200,
  closeDelay: 400,
  animation: 120,
} as const;

export interface FlyoutState {
  edge: Edge;
  id: string;
  pinned: boolean;
}

/** What keeps a flyout open: focus in an input inside, a press from inside, a focused tab. */
export type FlyoutHold = 'focus' | 'pointer' | 'tab';

type Timer = ReturnType<typeof setTimeout>;

export class FlyoutController {
  private current: FlyoutState | null = null;
  private readonly listeners = new Set<() => void>();
  private openTimer: Timer | null = null;
  private closeTimer: Timer | null = null;
  private overBar = false;
  private overFlyout = false;
  private readonly holds = new Set<FlyoutHold>();

  get state(): FlyoutState | null {
    return this.current;
  }

  /** For `useSyncExternalStore`. */
  readonly getState = (): FlyoutState | null => this.current;

  readonly subscribe = (cb: () => void): (() => void) => {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  };

  /** Pointer entered (or keyboard focus reached) the tab of panel `id`. */
  enterTab(edge: Edge, id: string): void {
    this.cancelOpen();
    this.cancelClose();
    if (this.current) {
      if (this.current.id !== id) this.set({ edge, id, pinned: this.current.pinned });
      return;
    }
    this.openTimer = setTimeout(() => {
      this.openTimer = null;
      this.set({ edge, id, pinned: false });
    }, FLYOUT.openDelay);
  }

  /** Pointer (or focus) left a tab: a pending open is cancelled. */
  leaveTab(): void {
    this.cancelOpen();
  }

  /** Pointer over a collapsed bar (anywhere on it) or not. */
  setOverBar(over: boolean): void {
    this.overBar = over;
    if (!over) this.cancelOpen();
    this.update();
  }

  setOverFlyout(over: boolean): void {
    this.overFlyout = over;
    this.update();
  }

  hold(reason: FlyoutHold, on: boolean): void {
    if (on) this.holds.add(reason);
    else this.holds.delete(reason);
    this.update();
  }

  /** Click on a tab: open at once and stay open. */
  click(edge: Edge, id: string): void {
    this.cancelOpen();
    this.cancelClose();
    this.set({ edge, id, pinned: true });
  }

  /** Closes at once (Esc, click outside, pin, drag, the panel left the bar). */
  close(): void {
    this.cancelOpen();
    this.cancelClose();
    this.holds.clear();
    this.overFlyout = false;
    this.set(null);
  }

  dispose(): void {
    this.cancelOpen();
    this.cancelClose();
    this.listeners.clear();
  }

  private update(): void {
    const stays = !this.current || this.current.pinned || this.overBar || this.overFlyout || this.holds.size > 0;
    if (stays) {
      this.cancelClose();
      return;
    }
    if (this.closeTimer) return;
    this.closeTimer = setTimeout(() => {
      this.closeTimer = null;
      this.set(null);
    }, FLYOUT.closeDelay);
  }

  private set(next: FlyoutState | null): void {
    const prev = this.current;
    if (prev === next || (prev && next && prev.edge === next.edge && prev.id === next.id && prev.pinned === next.pinned)) return;
    this.current = next;
    if (!next) this.overFlyout = false;
    for (const cb of this.listeners) cb();
    this.update();
  }

  private cancelOpen(): void {
    if (this.openTimer) clearTimeout(this.openTimer);
    this.openTimer = null;
  }

  private cancelClose(): void {
    if (this.closeTimer) clearTimeout(this.closeTimer);
    this.closeTimer = null;
  }
}
