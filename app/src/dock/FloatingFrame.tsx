/**
 * The frame of a floating panel: title (drag to move or dock, double-click to dock again),
 * × (closes = hides), and 6 px resize handles on every edge and corner. Used inside native
 * windows (filling them) and, without a native window, as an overlay over the main window.
 */
import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react';
import { resizeRect, type ResizeEdge } from './drag';
import { DOCK, type FloatRect } from './model';

export interface FloatingFrameLabels {
  close: string;
}

export interface FloatingFrameProps {
  id: string;
  rect: FloatRect;
  title: string;
  labels: FloatingFrameLabels;
  className: string;
  style?: CSSProperties;
  onPress: (e: ReactPointerEvent<HTMLElement>) => void;
  onRedock: () => void;
  onClose: () => void;
  onResize: (rect: FloatRect) => void;
  slotRef: (el: HTMLElement | null) => void;
}

const HANDLES: ResizeEdge[] = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'];

export function FloatingFrame({ id, rect, title, labels, className, style, onPress, onRedock, onClose, onResize, slotRef }: FloatingFrameProps) {
  const startResize = (dir: ResizeEdge) => (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const el = e.currentTarget;
    const start = { ...rect };
    const from = { x: e.screenX, y: e.screenY };
    try {
      el.setPointerCapture(e.pointerId);
    } catch {
      /* synthetic or finished pointer */
    }
    const move = (ev: PointerEvent) => onResize(resizeRect(start, dir, ev.screenX - from.x, ev.screenY - from.y));
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
    <section className={`dock-floating ${className}`} style={style} aria-label={title} data-floating={id}>
      <div
        className="dock-title"
        style={{ left: 0, top: 0, right: 0, height: DOCK.title }}
        onPointerDown={onPress}
        onDoubleClick={(e) => !(e.target as HTMLElement).closest('button') && onRedock()}
      >
        <span className="dock-title-text">{title}</span>
        <button type="button" className="dock-icon-btn" title={labels.close} aria-label={`${labels.close}: ${title}`} onClick={onClose}>
          ×
        </button>
      </div>
      <div className="dock-content" style={{ left: 0, top: DOCK.title, right: 0, bottom: 0 }} ref={slotRef} />
      {HANDLES.map((dir) => (
        <div key={dir} className={`dock-resize ${dir}`} onPointerDown={startResize(dir)} aria-hidden="true" />
      ))}
    </section>
  );
}
