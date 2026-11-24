/**
 * Docking view: draws the layout from `computeGeometry` with absolutely positioned elements.
 * Panel contents are rendered once into persistent hosts (PanelPool) and moved into the
 * visible slots after each render, so they keep their state.
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { computeGeometry, stacksVertically, type DockGeometry, type PanelGeom, type Rect, type SplitterGeom } from './geometry';
import type { DockManager } from './manager';
import { DOCK, hidePanel, resizeGroup, setPanelWeights, setZoneCollapsed, splitWeights, toggleExpanded, type DockLayout, type Edge, type FloatingPanel } from './model';
import { PanelPool } from './panelPool';
import './dock.css';

export interface DockLabels {
  collapse: string;
  expand: string;
  close: string;
  collapseZone: string;
  expandZone: string;
}

export interface DockHostProps {
  manager: DockManager<ReactNode>;
  /** The central work area (never covered except by flyouts and floating panels). */
  canvas: ReactNode;
  labels: DockLabels;
  /** Overrides the registered title (e.g. translated). */
  titleOf?: (id: string) => string;
  bottomSpansFullWidth?: boolean;
}

const px = (r: Rect): CSSProperties => ({ left: r.x, top: r.y, width: r.width, height: r.height });
const rel = (r: Rect, origin: Rect): CSSProperties => ({ left: r.x - origin.x, top: r.y - origin.y, width: r.width, height: r.height });

/** Approximate tab length in a collapsed bar: 11 px uppercase text + padding. */
const tabLength = (title: string) => Math.round(title.length * 7.2 + 20);

const COLLAPSE_ZONE_GLYPH: Record<Edge, string> = { left: '«', right: '»', bottom: '⌄' };
const EXPAND_ZONE_GLYPH: Record<Edge, string> = { left: '»', right: '«', bottom: '⌃' };

export function DockHost({ manager, canvas, labels, titleOf, bottomSpansFullWidth = false }: DockHostProps) {
  const layout = useSyncExternalStore(manager.subscribe, manager.getLayout);
  const title = (id: string) => titleOf?.(id) ?? manager.title(id);
  const rootRef = useRef<HTMLDivElement>(null);
  const parkingRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [pool] = useState(() => new PanelPool());
  const slots = useRef(new Map<string, HTMLElement>());

  useLayoutEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const measure = () => setSize({ width: el.clientWidth, height: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const geom = useMemo(
    () => computeGeometry(layout, size, { bottomSpansFullWidth, tabLength: (id) => tabLength(title(id)) }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [layout, size, bottomSpansFullWidth, titleOf],
  );

  // Panels are mounted the first time they are shown and stay mounted afterwards.
  const shown = visiblePanelIds(geom, layout);
  const mounted = useRef(new Set<string>());
  for (const id of shown) mounted.current.add(id);
  for (const id of [...mounted.current]) if (!manager.panel(id)) mounted.current.delete(id);

  useLayoutEffect(() => {
    pool.setParking(parkingRef.current);
    for (const id of mounted.current) {
      const slot = slots.current.get(id);
      if (slot && slot.isConnected) pool.attach(id, slot);
      else pool.park(id);
    }
  });

  const slotRef = (id: string) => (el: HTMLElement | null) => {
    if (el) slots.current.set(id, el);
    else slots.current.delete(id);
  };

  const commit = (l: DockLayout) => manager.setLayout(l);

  // Nothing is mounted before the area has a size: panels (e.g. the map) size themselves on mount.
  if (size.width === 0 || size.height === 0) return <div className="dock-root" ref={rootRef} />;

  return (
    <div className="dock-root" ref={rootRef}>
      <div className="dock-canvas" style={px(geom.canvas)}>{canvas}</div>

      {(['left', 'right', 'bottom'] as const).map((edge) => {
        const zone = geom.zones[edge];
        if (zone.state === 'collapsed' && zone.bar) {
          const bar = zone.bar;
          return (
            <div key={edge} className={`dock-bar edge-${edge}`} style={px(bar.rect)}>
              <button
                type="button"
                className="dock-icon-btn dock-bar-toggle"
                style={rel(bar.toggle, bar.rect)}
                title={labels.expandZone}
                aria-label={labels.expandZone}
                disabled={zone.autoCollapsed}
                onClick={() => commit(setZoneCollapsed(layout, edge, false))}
              >
                {EXPAND_ZONE_GLYPH[edge]}
              </button>
              {bar.tabs.map((tab) => (
                <button key={tab.id} type="button" className="dock-tab" style={rel(tab.rect, bar.rect)}>
                  <span>{title(tab.id)}</span>
                </button>
              ))}
            </div>
          );
        }
        return zone.groups.map((group) => (
          <div key={`${edge}-${group.index}`} className={`dock-group edge-${edge}`} style={px(group.rect)}>
            {group.panels.map((p) => (
              <DockPanel
                key={p.id}
                panel={p}
                origin={group.rect}
                title={title(p.id)}
                labels={labels}
                zoneToggle={group.index === 0 && p.panelIndex === 0 ? { glyph: COLLAPSE_ZONE_GLYPH[edge], onClick: () => commit(setZoneCollapsed(layout, edge, true)) } : null}
                onToggle={() => commit(toggleExpanded(layout, p.id))}
                slotRef={slotRef(p.id)}
              />
            ))}
          </div>
        ));
      })}

      {geom.splitters.map((s) => (
        <Splitter key={splitterKey(s)} splitter={s} geom={geom} manager={manager} />
      ))}

      {layout.floating.map((f) => (
        <FloatingOverlay key={f.id} panel={f} rootRef={rootRef} title={title(f.id)} labels={labels} onClose={() => commit(hidePanel(layout, f.id))} slotRef={slotRef(f.id)} />
      ))}

      <div className="dock-parking" ref={parkingRef} aria-hidden="true" />
      {[...mounted.current].map((id) => createPortal(manager.panel(id)!.create() as ReactNode, pool.host(id), id))}
    </div>
  );
}

function visiblePanelIds(geom: DockGeometry, layout: DockLayout): string[] {
  const ids: string[] = [];
  for (const edge of ['left', 'right', 'bottom'] as const) for (const g of geom.zones[edge].groups) for (const p of g.panels) if (p.expanded) ids.push(p.id);
  for (const f of layout.floating) ids.push(f.id);
  return ids;
}

function splitterKey(s: SplitterGeom): string {
  return s.kind === 'group' ? `g-${s.edge}-${s.groupIndex}` : `p-${s.edge}-${s.groupIndex}-${s.a}-${s.b}`;
}

/* ---------------------------------------------------------------- panel */

interface DockPanelProps {
  panel: PanelGeom;
  origin: Rect;
  title: string;
  labels: DockLabels;
  zoneToggle: { glyph: string; onClick: () => void } | null;
  onToggle: () => void;
  slotRef: (el: HTMLElement | null) => void;
}

function DockPanel({ panel, origin, title, labels, zoneToggle, onToggle, slotRef }: DockPanelProps) {
  const vertical = stacksVertically(panel.edge);
  const strip = !vertical && !panel.expanded;
  const contentId = `dock-content-${panel.id}`;
  return (
    <section className={`dock-panel ${panel.expanded ? 'expanded' : 'collapsed'} ${strip ? 'strip' : ''}`} style={rel(panel.rect, origin)} aria-label={title}>
      <div className="dock-title" style={rel(panel.header, panel.rect)} onDoubleClick={(e) => !(e.target as HTMLElement).closest('button') && onToggle()}>
        {zoneToggle && panel.edge === 'left' && (
          <button type="button" className="dock-icon-btn" title={labels.collapseZone} aria-label={labels.collapseZone} onClick={zoneToggle.onClick}>
            {zoneToggle.glyph}
          </button>
        )}
        <span className="dock-title-text">{title}</span>
        <button type="button" className="dock-icon-btn" title={panel.expanded ? labels.collapse : labels.expand} aria-label={`${panel.expanded ? labels.collapse : labels.expand}: ${title}`} aria-expanded={panel.expanded} aria-controls={contentId} onClick={onToggle}>
          {panel.expanded ? '－' : '＋'}
        </button>
        {zoneToggle && panel.edge !== 'left' && (
          <button type="button" className="dock-icon-btn" title={labels.collapseZone} aria-label={labels.collapseZone} onClick={zoneToggle.onClick}>
            {zoneToggle.glyph}
          </button>
        )}
      </div>
      {panel.expanded && <div id={contentId} className="dock-content" style={rel(panel.content, panel.rect)} ref={slotRef} />}
    </section>
  );
}

/* ---------------------------------------------------------------- splitters */

function Splitter({ splitter, geom, manager }: { splitter: SplitterGeom; geom: DockGeometry; manager: DockManager<ReactNode> }) {
  const [active, setActive] = useState(false);
  const horizontalLine = splitter.kind === 'group' ? splitter.edge === 'bottom' : stacksVertically(splitter.edge);
  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const el = e.currentTarget;
    el.setPointerCapture(e.pointerId);
    const start = { x: e.clientX, y: e.clientY };
    const startLayout = manager.getLayout();
    setActive(true);
    const move = (ev: PointerEvent) => {
      const dx = ev.clientX - start.x;
      const dy = ev.clientY - start.y;
      if (splitter.kind === 'group') {
        const { edge, groupIndex } = splitter;
        const startSize = geom.zones[edge].groups[groupIndex]!.rect[edge === 'bottom' ? 'height' : 'width'];
        const delta = edge === 'left' ? dx : edge === 'right' ? -dx : -dy;
        const max = DOCK.maxGroupFraction * (edge === 'bottom' ? geom.area.height : geom.area.width);
        manager.setLayout(resizeGroup(startLayout, edge, groupIndex, startSize + delta, max));
      } else {
        const { edge, groupIndex, a, b, sizeA, sizeB } = splitter;
        const g = startLayout.zones[edge].groups[groupIndex]!;
        const w = splitWeights(g.panels[a]!.weight, g.panels[b]!.weight, sizeA, sizeB, stacksVertically(edge) ? dy : dx);
        manager.setLayout(setPanelWeights(startLayout, edge, groupIndex, a, b, w));
      }
    };
    const up = () => {
      setActive(false);
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
  };
  return (
    <div
      className={`dock-splitter ${horizontalLine ? 'ns' : 'ew'} ${active ? 'active' : ''}`}
      style={px(splitter.rect)}
      role="separator"
      aria-orientation={horizontalLine ? 'horizontal' : 'vertical'}
      onPointerDown={onPointerDown}
    />
  );
}

/* ---------------------------------------------------------------- floating (overlay for now) */

/**
 * Floating panels are real windows from step 4 on. Until then they are drawn over the main
 * window at their stored global position, converted to docking-area coordinates.
 */
function FloatingOverlay({ panel, rootRef, title, labels, onClose, slotRef }: { panel: FloatingPanel; rootRef: React.RefObject<HTMLDivElement | null>; title: string; labels: DockLabels; onClose: () => void; slotRef: (el: HTMLElement | null) => void }) {
  const [origin, setOrigin] = useState({ x: 0, y: 0 });
  useEffect(() => {
    const r = rootRef.current?.getBoundingClientRect();
    if (r) setOrigin(areaScreenOrigin(r));
  }, [rootRef]);
  const rect: Rect = { x: panel.x - origin.x, y: panel.y - origin.y, width: panel.width, height: panel.height };
  return (
    <section className="dock-floating" style={px(rect)} aria-label={title}>
      <div className="dock-title" style={{ left: 0, top: 0, right: 0, height: DOCK.title }}>
        <span className="dock-title-text">{title}</span>
        <button type="button" className="dock-icon-btn" title={labels.close} aria-label={`${labels.close}: ${title}`} onClick={onClose}>
          ×
        </button>
      </div>
      <div className="dock-content" style={{ left: 0, top: DOCK.title, right: 0, bottom: 0 }} ref={slotRef} />
    </section>
  );
}

/** Global screen position of the docking area's top-left corner (logical pixels). */
export function areaScreenOrigin(areaClientRect: DOMRect): { x: number; y: number } {
  const chromeX = Math.max(0, (window.outerWidth - window.innerWidth) / 2);
  const chromeY = Math.max(0, window.outerHeight - window.innerHeight - chromeX);
  return { x: window.screenX + chromeX + areaClientRect.left, y: window.screenY + chromeY + areaClientRect.top };
}
