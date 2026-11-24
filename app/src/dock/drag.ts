/**
 * Dragging a panel: pure functions behind the drag controller in the view.
 *
 * When a drag starts the panel leaves the layout at once (`base`); it is shown as a floating
 * panel that follows the cursor. Drop targets are computed against `base`, so the indexes of a
 * target already refer to the layout without the panel, as `insertPanel` expects.
 */
import type { DropResult, Point } from './geometry';
import { DOCK, findPanel, floatPanel, insertPanel, removePanel, type DockLayout, type FloatRect } from './model';

/** Distance the pointer must move before a press on a title becomes a drag. */
export const DRAG_THRESHOLD = 4;

/** Height of the floating panel when a collapsed (title-only) panel is torn off. */
const COLLAPSED_FLOAT_HEIGHT = 320;

export interface DragSession {
  id: string;
  /** The layout when the drag started (restored on cancel). */
  start: DockLayout;
  /** The layout without the dragged panel. */
  base: DockLayout;
  /** Size of the floating panel while dragging and after a drop outside the docks. */
  size: { width: number; height: number };
  /** Cursor offset inside the floating panel (the point of the title that was grabbed). */
  grab: Point;
  /** Size of the panel's former group (kept for a new group along the same axis). */
  groupSize?: number;
}

export function passedThreshold(from: Point, to: Point): boolean {
  return Math.hypot(to.x - from.x, to.y - from.y) >= DRAG_THRESHOLD;
}

/**
 * Starts dragging `id`. `rect` is the panel's current size on screen, `grab` where the title was
 * pressed relative to the panel's top-left corner.
 */
export function beginDrag(layout: DockLayout, id: string, rect: { width: number; height: number; expanded: boolean }, grab: Point): DragSession {
  const removed = removePanel(layout, id);
  const width = Math.max(DOCK.minFloat.width, Math.round(rect.width));
  const height = Math.max(DOCK.minFloat.height, Math.round(rect.expanded ? rect.height : COLLAPSED_FLOAT_HEIGHT));
  return {
    id,
    start: layout,
    base: removed.layout,
    size: { width, height },
    // The grabbed point stays under the cursor, but always on the title bar.
    grab: { x: Math.max(0, Math.min(width - 1, Math.round(grab.x))), y: Math.max(0, Math.min(DOCK.title - 1, Math.round(grab.y))) },
    ...(removed.groupSize ? { groupSize: removed.groupSize } : {}),
  };
}

/** The floating panel's rectangle (global screen coordinates) for the cursor at `screen`. */
export function dragRect(s: DragSession, screen: Point): FloatRect {
  return { x: Math.round(screen.x - s.grab.x), y: Math.round(screen.y - s.grab.y), width: s.size.width, height: s.size.height };
}

/** What is shown while dragging: the layout without the panel plus the panel floating at the cursor. */
export function previewLayout(s: DragSession, screen: Point): DockLayout {
  return { ...s.base, floating: [...s.base.floating, { id: s.id, ...dragRect(s, screen) }] };
}

/** The layout after releasing the mouse: docked at the drop target, or floating at the cursor. */
export function dropLayout(s: DragSession, drop: DropResult | null, screen: Point): DockLayout {
  if (!drop) return floatPanel(s.start, s.id, dragRect(s, screen));
  const { target } = drop;
  const from = findPanel(s.start, s.id);
  const sameAxis = from?.kind === 'dock' && (from.edge === 'bottom') === (target.edge === 'bottom');
  const size = target.kind === 'newGroup' && sameAxis && s.groupSize ? s.groupSize : undefined;
  return insertPanel(s.start, s.id, target, size ? { size } : {});
}

/** Which edges of a floating window a resize handle moves ('n', 'se', …). */
export type ResizeEdge = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';

/** A floating rect resized from `start` by dragging edge `dir` by (dx, dy); never below the minimum. */
export function resizeRect(start: FloatRect, dir: ResizeEdge, dx: number, dy: number): FloatRect {
  const min = DOCK.minFloat;
  const r = { ...start };
  if (dir.includes('e')) r.width = Math.max(min.width, Math.round(start.width + dx));
  if (dir.includes('s')) r.height = Math.max(min.height, Math.round(start.height + dy));
  if (dir.includes('w')) {
    r.width = Math.max(min.width, Math.round(start.width - dx));
    r.x = start.x + start.width - r.width;
  }
  if (dir.includes('n')) {
    r.height = Math.max(min.height, Math.round(start.height - dy));
    r.y = start.y + start.height - r.height;
  }
  return r;
}
