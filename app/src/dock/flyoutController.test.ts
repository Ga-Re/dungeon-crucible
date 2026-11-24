import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FLYOUT, FlyoutController } from './flyoutController';

describe('FlyoutController', () => {
  let f: FlyoutController;
  beforeEach(() => {
    vi.useFakeTimers();
    f = new FlyoutController();
  });
  afterEach(() => {
    f.dispose();
    vi.useRealTimers();
  });

  it('opens after 200 ms on a tab; leaving earlier cancels', () => {
    f.enterTab('left', 'a');
    vi.advanceTimersByTime(FLYOUT.openDelay - 1);
    expect(f.state).toBeNull();
    f.leaveTab();
    vi.advanceTimersByTime(500);
    expect(f.state).toBeNull();
    f.enterTab('left', 'a');
    vi.advanceTimersByTime(FLYOUT.openDelay);
    expect(f.state).toEqual({ edge: 'left', id: 'a', pinned: false });
  });

  it('switches to another tab at once while open', () => {
    f.setOverBar(true);
    f.enterTab('left', 'a');
    vi.advanceTimersByTime(FLYOUT.openDelay);
    f.leaveTab();
    f.enterTab('left', 'b');
    expect(f.state?.id).toBe('b');
  });

  it('closes 400 ms after leaving bar and flyout; coming back cancels', () => {
    f.setOverBar(true);
    f.enterTab('left', 'a');
    vi.advanceTimersByTime(FLYOUT.openDelay);
    f.leaveTab();
    f.setOverBar(false);
    f.setOverFlyout(true);
    vi.advanceTimersByTime(1000);
    expect(f.state?.id).toBe('a');
    f.setOverFlyout(false);
    vi.advanceTimersByTime(FLYOUT.closeDelay - 1);
    f.setOverBar(true);
    vi.advanceTimersByTime(1000);
    expect(f.state?.id).toBe('a');
    f.setOverBar(false);
    vi.advanceTimersByTime(FLYOUT.closeDelay);
    expect(f.state).toBeNull();
  });

  it('stays open while an input has the focus or a press from inside is held', () => {
    f.enterTab('left', 'a');
    vi.advanceTimersByTime(FLYOUT.openDelay);
    f.setOverFlyout(true);
    f.hold('focus', true);
    f.hold('pointer', true);
    f.setOverBar(false);
    f.setOverFlyout(false);
    vi.advanceTimersByTime(2000);
    expect(f.state).not.toBeNull();
    f.hold('focus', false);
    vi.advanceTimersByTime(2000);
    expect(f.state).not.toBeNull();
    f.hold('pointer', false);
    vi.advanceTimersByTime(FLYOUT.closeDelay);
    expect(f.state).toBeNull();
  });

  it('a click opens at once and pins; only close() closes it', () => {
    f.click('bottom', 'log');
    expect(f.state).toEqual({ edge: 'bottom', id: 'log', pinned: true });
    f.setOverBar(false);
    vi.advanceTimersByTime(5000);
    expect(f.state?.id).toBe('log');
    f.close();
    expect(f.state).toBeNull();
  });

  it('fast back and forth over the bar: no flicker, nothing left hanging', () => {
    const seen: (string | null)[] = [];
    f.subscribe(() => seen.push(f.state?.id ?? null));
    for (let i = 0; i < 10; i++) {
      f.enterTab('left', i % 2 ? 'a' : 'b');
      vi.advanceTimersByTime(50);
      f.leaveTab();
    }
    f.setOverBar(false);
    vi.advanceTimersByTime(2000);
    expect(seen).toEqual([]);
    expect(f.state).toBeNull();
  });

  it('keyboard: a focused tab keeps it open; leaving the bar with the focus closes it', () => {
    f.hold('tab', true);
    f.enterTab('right', 'a');
    vi.advanceTimersByTime(FLYOUT.openDelay + 2000);
    expect(f.state?.id).toBe('a');
    f.enterTab('right', 'b');
    expect(f.state?.id).toBe('b');
    f.hold('tab', false);
    vi.advanceTimersByTime(FLYOUT.closeDelay);
    expect(f.state).toBeNull();
  });

  it('notifies listeners on every change', () => {
    const seen: (string | null)[] = [];
    f.subscribe(() => seen.push(f.state?.id ?? null));
    f.click('left', 'a');
    f.enterTab('left', 'b');
    f.close();
    expect(seen).toEqual(['a', 'b', null]);
  });
});
