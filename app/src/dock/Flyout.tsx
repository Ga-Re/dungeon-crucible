/**
 * A panel of a collapsed zone shown over the canvas, next to the bar. The pin button docks the
 * zone again; the free edge resizes it (which sets the size of the panel's group); dragging the
 * title tears the panel off like any other title.
 */
import { useEffect, useRef, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react';
import type { FlyoutController } from './flyoutController';
import type { Rect } from './geometry';
import { DOCK, type Edge } from './model';

export interface FlyoutProps {
  edge: Edge;
  id: string;
  rect: Rect;
  title: string;
  pinLabel: string;
  /** The zone is collapsed only because the window is too small: pinning cannot help. */
  canPin: boolean;
  leaving: boolean;
  controller: FlyoutController;
  onPress: (e: ReactPointerEvent<HTMLElement>) => void;
  onPin: () => void;
  /** Called while the free edge is dragged, with the new thickness. */
  onResize: (size: number) => void;
  slotRef: ((el: HTMLElement | null) => void) | undefined;
}

const px = (r: Rect): CSSProperties => ({ left: r.x, top: r.y, width: r.width, height: r.height });

const isInput = (el: EventTarget | null): boolean =>
  el instanceof Element && !!el.closest('input, textarea, select, [contenteditable=""], [contenteditable="true"]');

export function flyoutDomId(id: string): string {
  return `dock-flyout-${id}`;
}

export function Flyout({ edge, id, rect, title, pinLabel, canPin, leaving, controller, onPress, onPin, onResize, slotRef }: FlyoutProps) {
  const ref = useRef<HTMLElement>(null);

  // Native listeners: the panel's content is inside the flyout in the DOM but rendered through
  // a portal elsewhere in the React tree, so React's enter/leave, focus and capture events
  // would treat it as outside.
  useEffect(() => {
    const el = ref.current;
    if (!el || leaving) return;
    const win = el.ownerDocument.defaultView ?? window;
    const enter = () => controller.setOverFlyout(true);
    const leave = () => controller.setOverFlyout(false);
    // A press that begins inside keeps the flyout open until the button is released anywhere.
    const release = () => {
      controller.hold('pointer', false);
      win.removeEventListener('pointerup', release, true);
      win.removeEventListener('pointercancel', release, true);
    };
    const down = () => {
      controller.hold('pointer', true);
      win.addEventListener('pointerup', release, true);
      win.addEventListener('pointercancel', release, true);
    };
    const focusIn = (e: FocusEvent) => {
      if (isInput(e.target)) controller.hold('focus', true);
    };
    const focusOut = (e: FocusEvent) => {
      const next = e.relatedTarget;
      if (!(next instanceof Node && el.contains(next) && isInput(next))) controller.hold('focus', false);
    };
    el.addEventListener('pointerenter', enter);
    el.addEventListener('pointerleave', leave);
    el.addEventListener('pointerdown', down, true);
    el.addEventListener('focusin', focusIn);
    el.addEventListener('focusout', focusOut);
    if (el.matches(':hover')) enter();
    return () => {
      el.removeEventListener('pointerenter', enter);
      el.removeEventListener('pointerleave', leave);
      el.removeEventListener('pointerdown', down, true);
      el.removeEventListener('focusin', focusIn);
      el.removeEventListener('focusout', focusOut);
      win.removeEventListener('pointerup', release, true);
      win.removeEventListener('pointercancel', release, true);
    };
  }, [controller, leaving]);

  const startResize = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const el = e.currentTarget;
    el.setPointerCapture(e.pointerId);
    const start = edge === 'bottom' ? rect.height : rect.width;
    const from = { x: e.clientX, y: e.clientY };
    const move = (ev: PointerEvent) => {
      const delta = edge === 'left' ? ev.clientX - from.x : edge === 'right' ? from.x - ev.clientX : from.y - ev.clientY;
      onResize(start + delta);
    };
    const up = () => {
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
  };

  return (
    <section
      id={flyoutDomId(id)}
      className={`dock-flyout edge-${edge} ${leaving ? 'leaving' : ''}`}
      style={px(rect)}
      aria-label={title}
      ref={ref}
      tabIndex={-1}
    >
      <div className="dock-title" style={{ left: 0, top: 0, right: 0, height: DOCK.title }} onPointerDown={onPress}>
        <span className="dock-title-text">{title}</span>
        <button type="button" className="dock-icon-btn dock-pin" title={pinLabel} aria-label={pinLabel} disabled={!canPin} onClick={onPin}>
          📌
        </button>
      </div>
      <div className="dock-content" style={{ left: 0, top: DOCK.title, right: 0, bottom: 0 }} ref={slotRef} />
      <div className={`dock-flyout-grip ${edge === 'bottom' ? 'ns' : 'ew'}`} onPointerDown={startResize} aria-hidden="true" />
    </section>
  );
}
