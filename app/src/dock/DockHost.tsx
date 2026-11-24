/**
 * Docking view: draws the layout from `computeGeometry` with absolutely positioned elements.
 * Panel contents are rendered once into persistent hosts (PanelPool) and moved into the
 * visible slots after each render, so they keep their state. Floating panels get native
 * windows when a `floating` backend is given (desktop app), otherwise they are overlays.
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { beginDrag, dropLayout, passedThreshold, previewLayout, type DragSession } from './drag';
import { computeDropTarget, computeGeometry, flyoutRect, stacksVertically, type DockGeometry, type DropResult, type PanelGeom, type Point, type Rect, type SplitterGeom } from './geometry';
import type { DockManager } from './manager';
import { FloatingFrame, type FloatingFrameProps } from './FloatingFrame';
import { Flyout, flyoutDomId } from './Flyout';
import { FLYOUT, FlyoutController, type FlyoutState } from './flyoutController';
import { DOCK, hidePanel, insertPanel, moveFloating, redockTarget, resizeGroup, setPanelWeights, setZoneCollapsed, splitWeights, toggleExpanded, type DockLayout, type Edge, type FloatingPanel } from './model';
import { NativeWindowPool, type FloatingBackend, type FloatWindow } from './nativeWindows';
import { PanelPool } from './panelPool';
import './dock.css';

export interface DockLabels {
  collapse: string;
  expand: string;
  close: string;
  collapseZone: string;
  expandZone: string;
  /** Pin button of a flyout: docks the zone again. */
  pin: string;
  /** Splitters (screen readers). */
  resize: string;
}

export interface DockHostProps {
  manager: DockManager<ReactNode>;
  /** The central work area (never covered except by flyouts and floating panels). */
  canvas: ReactNode;
  labels: DockLabels;
  /** Overrides the registered title (e.g. translated). */
  titleOf?: (id: string) => string;
  bottomSpansFullWidth?: boolean;
  /** Native windows for floating panels; without it they are drawn over the main window. */
  floating?: FloatingBackend | null;
}

/** Opacity of a floating window while it is dragged, so drop indicators show through. */
const DRAG_OPACITY = 0.7;

const px = (r: Rect): CSSProperties => ({ left: r.x, top: r.y, width: r.width, height: r.height });
const rel = (r: Rect, origin: Rect): CSSProperties => ({ left: r.x - origin.x, top: r.y - origin.y, width: r.width, height: r.height });

/** Approximate tab length in a collapsed bar: 11 px uppercase text + padding. */
const tabLength = (title: string) => Math.round(title.length * 7.2 + 20);

const COLLAPSE_ZONE_GLYPH: Record<Edge, string> = { left: '«', right: '»', bottom: '⌄' };
const EXPAND_ZONE_GLYPH: Record<Edge, string> = { left: '»', right: '«', bottom: '⌃' };

/** A drag in progress: the cursor in screen and docking-area coordinates. */
interface DragState {
  session: DragSession;
  screen: Point;
  client: Point;
  suppress: boolean;
}

/** What the title of a panel reports when it is pressed (size on screen, for the floating panel). */
interface PressInfo {
  width: number;
  height: number;
  expanded: boolean;
}

export function DockHost({ manager, canvas, labels, titleOf, bottomSpansFullWidth = false, floating = null }: DockHostProps) {
  const stored = useSyncExternalStore(manager.subscribe, manager.getLayout);
  const [drag, setDrag] = useState<DragState | null>(null);
  // While dragging, the panel is out of the layout and floats under the cursor.
  const layout = drag ? drag.session.base : stored;
  const view = useMemo(() => (drag ? previewLayout(drag.session, drag.screen) : stored), [drag, stored]);
  const title = (id: string) => titleOf?.(id) ?? manager.title(id);
  const rootRef = useRef<HTMLDivElement>(null);
  const parkingRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [pool] = useState(() => new PanelPool());
  const [flyout] = useState(() => new FlyoutController());
  useEffect(() => () => flyout.dispose(), [flyout]);
  const fly = useSyncExternalStore(flyout.subscribe, flyout.getState);
  const slots = useRef(new Map<string, HTMLElement>());
  const dragRef = useRef<DragState | null>(null);
  dragRef.current = drag;

  // Native floating windows: closing one first takes the panel's DOM back into this document.
  const windows = useMemo(
    () => (floating ? new NativeWindowPool(floating, (id, doc) => pool.host(id).ownerDocument === doc && pool.park(id)) : null),
    [floating, pool],
  );
  useEffect(() => {
    if (!floating || !windows) return;
    const offMoved = floating.onMoved((name, b) => {
      const id = windows.movedBySystem(name);
      if (!id || dragRef.current) return;
      const l = manager.getLayout();
      const f = l.floating.find((x) => x.id === id);
      if (f && (f.x !== b.x || f.y !== b.y || f.width !== b.width || f.height !== b.height)) manager.setLayout(moveFloating(l, id, b));
    });
    const offClosed = floating.onClosed((name) => {
      const id = windows.closedBySystem(name);
      if (id && manager.getLayout().floating.some((f) => f.id === id)) manager.setLayout(hidePanel(manager.getLayout(), id));
    });
    const closeAll = () => windows.closeAll();
    window.addEventListener('pagehide', closeAll);
    return () => {
      offMoved();
      offClosed();
      window.removeEventListener('pagehide', closeAll);
    };
  }, [floating, windows, manager]);

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

  // The flyout belongs to a tab of a collapsed bar; when its panel leaves the bar (docked,
  // dragged, zone expanded), it closes. Closing fades it out unless the panel went elsewhere.
  const flyValid = !!fly && inBar(geom, fly);
  useLayoutEffect(() => {
    if (fly && !flyValid) flyout.close();
  }, [fly, flyValid, flyout]);
  const [leaving, setLeaving] = useState<FlyoutState | null>(null);
  const lastFly = useRef<FlyoutState | null>(null);
  useLayoutEffect(() => {
    const prev = lastFly.current;
    lastFly.current = fly;
    if (fly) {
      setLeaving(null);
      return;
    }
    if (!prev || dragRef.current || !inBar(geom, prev) || prefersReducedMotion()) return;
    setLeaving(prev);
    const t = setTimeout(() => setLeaving(null), FLYOUT.animation);
    return () => clearTimeout(t);
    // Only a change of the flyout starts or stops the fade-out.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fly]);
  const flyShown = flyValid ? fly : leaving && inBar(geom, leaving) ? leaving : null;

  // A tab activated from the keyboard (Enter/Space) moves the focus into its flyout.
  const focusFlyout = useRef(false);
  useEffect(() => {
    if (!fly || !focusFlyout.current) return;
    focusFlyout.current = false;
    document.getElementById(flyoutDomId(fly.id))?.focus();
  }, [fly]);

  // Esc and any press outside the bars and the flyout close it at once.
  useEffect(() => {
    if (!fly) return;
    const onDown = (e: PointerEvent) => {
      if (!(e.target instanceof Element && e.target.closest('.dock-bar, .dock-flyout'))) flyout.close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || dragRef.current) return;
      // Keyboard users go back to the tab they came from.
      const back = document.activeElement?.closest('.dock-flyout') ? fly.id : null;
      flyout.close();
      if (back) document.querySelector<HTMLElement>(`.dock-tab[data-panel="${CSS.escape(back)}"]`)?.focus();
    };
    document.addEventListener('pointerdown', onDown, true);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown, true);
      window.removeEventListener('keydown', onKey);
    };
  }, [fly, flyout]);

  // Panels are mounted the first time they are shown and stay mounted afterwards.
  const shown = visiblePanelIds(geom, view);
  if (flyShown) shown.push(flyShown.id);
  const mounted = useRef(new Set<string>());
  for (const id of shown) mounted.current.add(id);
  for (const id of [...mounted.current]) if (!manager.panel(id)) mounted.current.delete(id);
  // Each panel's content element is created once: re-rendering the docking view (e.g. on every
  // pointer move while dragging) must not re-render the panels.
  const contents = useRef(new Map<string, ReactNode>());
  const contentOf = (id: string): ReactNode => {
    if (!contents.current.has(id)) contents.current.set(id, manager.panel(id)!.create() as ReactNode);
    return contents.current.get(id);
  };

  useLayoutEffect(() => {
    pool.setParking(parkingRef.current);
    for (const id of mounted.current) {
      const slot = slots.current.get(id);
      if (slot && slot.isConnected) pool.attach(id, slot);
      else pool.park(id);
    }
  });

  const slotRef = (id: string) => (el: HTMLElement | null) => {
    if (!el) {
      slots.current.delete(id);
      return;
    }
    slots.current.set(id, el);
    // Slots in native windows appear without a render of this component.
    if (mounted.current.has(id)) pool.attach(id, el);
  };

  // Changes always start from the manager's current layout, not the one of the last render, so
  // several changes in a row (or between renders) do not overwrite each other.
  const update = (change: (l: DockLayout) => DockLayout) => manager.setLayout(change(manager.getLayout()));

  // Drop target under the cursor (only the mouse position counts).
  const dropFor = (d: DragState): DropResult | null => computeDropTarget(geom, d.client, { suppress: d.suppress });
  const dropForRef = useRef(dropFor);
  dropForRef.current = dropFor;
  const drop = drag ? dropFor(drag) : null;

  // Desktop position of the docking area's top-left corner: exact from the platform when it
  // can tell (refreshed on every press), estimated from the window otherwise.
  const screenOffset = useRef<Point | null>(null);
  const areaOrigin = (): Point => {
    if (screenOffset.current) return screenOffset.current;
    const r = rootRef.current?.getBoundingClientRect();
    return r ? areaScreenOrigin(r) : { x: 0, y: 0 };
  };
  const refreshOrigin = () => {
    if (!floating) return;
    void floating.contentOrigin().then((o) => {
      const r = rootRef.current?.getBoundingClientRect();
      if (r) screenOffset.current = { x: o.x + r.left, y: o.y + r.top };
    });
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(refreshOrigin, [floating]);

  /**
   * Press on a title: after 4 px it becomes a drag. Esc, losing the window focus or a cancelled
   * pointer abort it and leave the layout as it was; Ctrl/⌘ suppresses docking.
   */
  const press = (e: ReactPointerEvent<HTMLElement>, id: string, info: PressInfo) => {
    if (e.button !== 0 || drag || (e.target as HTMLElement).closest('button')) return;
    const root = rootRef.current;
    const panelEl = e.currentTarget.closest<HTMLElement>('.dock-panel, .dock-floating, .dock-flyout');
    if (!root || !panelEl) return;
    const box = panelEl.getBoundingClientRect();
    const grab = { x: e.clientX - box.left, y: e.clientY - box.top };
    const pointerId = e.pointerId;
    // A press in a floating window: its events arrive there, and the window moves with them,
    // so only screen coordinates are stable.
    const win = e.currentTarget.ownerDocument.defaultView ?? window;
    const inMain = win === window;
    const at = (ev: { clientX: number; clientY: number; screenX: number; screenY: number }): Point => (inMain ? { x: ev.clientX, y: ev.clientY } : { x: ev.screenX, y: ev.screenY });
    const from = at(e);
    const captureEl: Element = inMain ? root : e.currentTarget;
    let session: DragSession | null = null;
    let last: DragState | null = null;
    refreshOrigin();

    const stateFrom = (ev: { clientX: number; clientY: number; screenX: number; screenY: number }, suppress: boolean): DragState => {
      const o = areaOrigin();
      if (inMain) {
        const r = root.getBoundingClientRect();
        const client = { x: ev.clientX - r.left, y: ev.clientY - r.top };
        return { session: session!, client, screen: { x: client.x + o.x, y: client.y + o.y }, suppress };
      }
      const screen = { x: ev.screenX, y: ev.screenY };
      return { session: session!, screen, client: { x: screen.x - o.x, y: screen.y - o.y }, suppress };
    };
    const onMove = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return;
      if (!session) {
        if (!passedThreshold(from, at(ev))) return;
        session = beginDrag(manager.getLayout(), id, info, grab);
        flyout.close();
        try {
          captureEl.setPointerCapture(pointerId);
        } catch {
          /* pointer already gone */
        }
      }
      last = stateFrom(ev, ev.ctrlKey || ev.metaKey);
      setDrag(last);
    };
    const onUp = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return;
      cleanup();
      if (!session) return;
      const end = stateFrom(ev, ev.ctrlKey || ev.metaKey);
      manager.setLayout(dropLayout(session, dropForRef.current(end), end.screen));
      setDrag(null);
    };
    const cancel = () => {
      cleanup();
      setDrag(null);
    };
    const onKey = (ev: KeyboardEvent) => {
      if (!session) return;
      if (ev.key === 'Escape') {
        ev.preventDefault();
        cancel();
      } else if (last && (ev.key === 'Control' || ev.key === 'Meta')) {
        last = { ...last, suppress: ev.ctrlKey || ev.metaKey };
        setDrag(last);
      }
    };
    const onCancel = (ev: PointerEvent) => ev.pointerId === pointerId && cancel();
    const cleanup = () => {
      win.removeEventListener('pointermove', onMove);
      win.removeEventListener('pointerup', onUp);
      win.removeEventListener('pointercancel', onCancel);
      win.removeEventListener('keydown', onKey, true);
      win.removeEventListener('keyup', onKey, true);
      win.removeEventListener('blur', cancel);
    };
    win.addEventListener('pointermove', onMove);
    win.addEventListener('pointerup', onUp);
    win.addEventListener('pointercancel', onCancel);
    win.addEventListener('keydown', onKey, true);
    win.addEventListener('keyup', onKey, true);
    win.addEventListener('blur', cancel);
  };

  // Nothing is mounted before the area has a size: panels (e.g. the map) size themselves on mount.
  if (size.width === 0 || size.height === 0) return <div className="dock-root" ref={rootRef} />;

  const origin = areaOrigin();
  return (
    <div className={`dock-root ${drag ? 'dragging' : ''}`} ref={rootRef}>
      <div className="dock-canvas" style={px(geom.canvas)}>{canvas}</div>

      {(['left', 'right', 'bottom'] as const).map((edge) => {
        const zone = geom.zones[edge];
        if (zone.state === 'collapsed' && zone.bar) {
          const bar = zone.bar;
          return (
            <div key={edge} className={`dock-bar edge-${edge}`} style={px(bar.rect)} onPointerEnter={() => flyout.setOverBar(true)} onPointerLeave={() => flyout.setOverBar(false)}>
              <button
                type="button"
                className="dock-icon-btn dock-bar-toggle"
                style={rel(bar.toggle, bar.rect)}
                title={labels.expandZone}
                aria-label={labels.expandZone}
                disabled={zone.autoCollapsed}
                onClick={() => update((l) => setZoneCollapsed(l, edge, false))}
              >
                {EXPAND_ZONE_GLYPH[edge]}
              </button>
              {bar.tabs.map((tab) => {
                const open = flyShown?.edge === edge && flyShown.id === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    className={`dock-tab edge-${edge} ${open ? 'active' : ''}`}
                    style={rel(tab.rect, bar.rect)}
                    aria-expanded={open}
                    aria-controls={open ? flyoutDomId(tab.id) : undefined}
                    onPointerEnter={() => flyout.enterTab(edge, tab.id)}
                    onPointerLeave={() => flyout.leaveTab()}
                    onFocus={(e) => {
                      // Keyboard focus acts like hovering; focus from a mouse click does not hold it open.
                      if (!e.currentTarget.matches(':focus-visible')) return;
                      flyout.hold('tab', true);
                      flyout.enterTab(edge, tab.id);
                    }}
                    onBlur={() => {
                      flyout.leaveTab();
                      flyout.hold('tab', false);
                    }}
                    data-panel={tab.id}
                    onClick={(e) => {
                      // detail 0: activated by keyboard, not by a mouse click.
                      if (e.detail === 0) focusFlyout.current = true;
                      flyout.click(edge, tab.id);
                    }}
                  >
                    <span>{title(tab.id)}</span>
                  </button>
                );
              })}
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
                zoneToggle={group.index === 0 && p.panelIndex === 0 ? { glyph: COLLAPSE_ZONE_GLYPH[edge], onClick: () => update((l) => setZoneCollapsed(l, edge, true)) } : null}
                onToggle={() => update((l) => toggleExpanded(l, p.id))}
                onPress={(e) => press(e, p.id, { width: p.rect.width, height: p.rect.height, expanded: p.expanded })}
                slotRef={slotRef(p.id)}
              />
            ))}
          </div>
        ));
      })}

      {geom.splitters.map((s) => (
        <Splitter key={splitterKey(s)} splitter={s} geom={geom} manager={manager} label={labels.resize} />
      ))}

      {view.floating.map((f) => {
        const dragging = drag?.session.id === f.id;
        const frame: FrameProps = {
          id: f.id,
          rect: f,
          title: title(f.id),
          labels,
          onClose: () => update((l) => hidePanel(l, f.id)),
          onRedock: () => update((l) => insertPanel(l, f.id, redockTarget(l, l.floating.find((x) => x.id === f.id)?.lastDock, f.id))),
          onResize: (r) => update((l) => moveFloating(l, f.id, r)),
          onPress: (e) => press(e, f.id, { width: f.width, height: f.height, expanded: true }),
          slotRef: slotRef(f.id),
        };
        return windows ? (
          <NativeFloating key={f.id} windows={windows} panel={f} dragging={dragging} frame={frame} />
        ) : (
          <FloatingFrame key={f.id} {...frame} className={`overlay ${dragging ? 'dragging' : ''}`} style={px({ x: f.x - origin.x, y: f.y - origin.y, width: f.width, height: f.height })} />
        );
      })}

      {flyShown && (() => {
        const { edge, id } = flyShown;
        const tab = geom.zones[edge].bar!.tabs.find((t) => t.id === id)!;
        const group = layout.zones[edge].groups[tab.groupIndex]!;
        const rect = flyoutRect(geom, edge, group.size)!;
        const max = DOCK.maxGroupFraction * (edge === 'bottom' ? geom.area.height : geom.area.width);
        return (
          <Flyout
            key={`${edge}-${id}`}
            edge={edge}
            id={id}
            rect={rect}
            title={title(id)}
            pinLabel={labels.pin}
            canPin={!geom.zones[edge].autoCollapsed}
            leaving={flyShown !== fly}
            controller={flyout}
            onPress={(e) => press(e, id, { width: rect.width, height: rect.height, expanded: true })}
            onPin={() => {
              flyout.close();
              update((l) => setZoneCollapsed(l, edge, false));
            }}
            onResize={(s) => update((l) => resizeGroup(l, edge, tab.groupIndex, s, max))}
            slotRef={slotRef(id)}
          />
        );
      })()}

      {drop && (
        <div className="dock-indicators" aria-hidden="true">
          <div className={`dock-indicator rule-${drop.rule}`} style={px(drop.indicator)} />
        </div>
      )}

      <div className="dock-parking" ref={parkingRef} aria-hidden="true" />
      {[...mounted.current].map((id) => createPortal(contentOf(id), pool.host(id), id))}
    </div>
  );
}

function visiblePanelIds(geom: DockGeometry, layout: DockLayout): string[] {
  const ids: string[] = [];
  for (const edge of ['left', 'right', 'bottom'] as const) for (const g of geom.zones[edge].groups) for (const p of g.panels) if (p.expanded) ids.push(p.id);
  for (const f of layout.floating) ids.push(f.id);
  return ids;
}

function inBar(geom: DockGeometry, f: FlyoutState): boolean {
  return !!geom.zones[f.edge].bar?.tabs.some((t) => t.id === f.id);
}

function prefersReducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
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
  onPress: (e: ReactPointerEvent<HTMLElement>) => void;
  slotRef: (el: HTMLElement | null) => void;
}

function DockPanel({ panel, origin, title, labels, zoneToggle, onToggle, onPress, slotRef }: DockPanelProps) {
  const vertical = stacksVertically(panel.edge);
  const strip = !vertical && !panel.expanded;
  const contentId = `dock-content-${panel.id}`;
  return (
    <section className={`dock-panel ${panel.expanded ? 'expanded' : 'collapsed'} ${strip ? 'strip' : ''}`} style={rel(panel.rect, origin)} aria-label={title}>
      <div className="dock-title" style={rel(panel.header, panel.rect)} onPointerDown={onPress} onDoubleClick={(e) => !(e.target as HTMLElement).closest('button') && onToggle()}>
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

/** Arrow keys move a focused splitter by this much (with Shift: `KEY_STEP_LARGE`). */
const KEY_STEP = 10;
const KEY_STEP_LARGE = 50;

function Splitter({ splitter, geom, manager, label }: { splitter: SplitterGeom; geom: DockGeometry; manager: DockManager<ReactNode>; label: string }) {
  const [active, setActive] = useState(false);
  const horizontalLine = splitter.kind === 'group' ? splitter.edge === 'bottom' : stacksVertically(splitter.edge);

  /** The layout after moving this splitter by (dx, dy) from where it is in `base`. */
  const moved = (base: DockLayout, dx: number, dy: number): DockLayout => {
    if (splitter.kind === 'group') {
      const { edge, groupIndex } = splitter;
      const startSize = geom.zones[edge].groups[groupIndex]!.rect[edge === 'bottom' ? 'height' : 'width'];
      const delta = edge === 'left' ? dx : edge === 'right' ? -dx : -dy;
      const max = DOCK.maxGroupFraction * (edge === 'bottom' ? geom.area.height : geom.area.width);
      return resizeGroup(base, edge, groupIndex, startSize + delta, max);
    }
    const { edge, groupIndex, a, b, sizeA, sizeB } = splitter;
    const g = base.zones[edge].groups[groupIndex]!;
    const w = splitWeights(g.panels[a]!.weight, g.panels[b]!.weight, sizeA, sizeB, stacksVertically(edge) ? dy : dx);
    return setPanelWeights(base, edge, groupIndex, a, b, w);
  };

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const el = e.currentTarget;
    el.setPointerCapture(e.pointerId);
    const start = { x: e.clientX, y: e.clientY };
    const startLayout = manager.getLayout();
    setActive(true);
    const move = (ev: PointerEvent) => manager.setLayout(moved(startLayout, ev.clientX - start.x, ev.clientY - start.y));
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

  // Keyboard: the arrows across the line move it.
  const onKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    const step = e.shiftKey ? KEY_STEP_LARGE : KEY_STEP;
    const d = horizontalLine
      ? e.key === 'ArrowUp' ? { dx: 0, dy: -step } : e.key === 'ArrowDown' ? { dx: 0, dy: step } : null
      : e.key === 'ArrowLeft' ? { dx: -step, dy: 0 } : e.key === 'ArrowRight' ? { dx: step, dy: 0 } : null;
    if (!d) return;
    e.preventDefault();
    manager.setLayout(moved(manager.getLayout(), d.dx, d.dy));
  };

  const value =
    splitter.kind === 'group'
      ? { now: Math.round(geom.zones[splitter.edge].groups[splitter.groupIndex]!.rect[splitter.edge === 'bottom' ? 'height' : 'width']), min: DOCK.minGroup, max: Math.round(DOCK.maxGroupFraction * (splitter.edge === 'bottom' ? geom.area.height : geom.area.width)) }
      : { now: Math.round(splitter.sizeA), min: DOCK.minContent, max: Math.round(splitter.sizeA + splitter.sizeB - DOCK.minContent) };
  return (
    <div
      className={`dock-splitter ${horizontalLine ? 'ns' : 'ew'} ${active ? 'active' : ''}`}
      style={px(splitter.rect)}
      role="separator"
      tabIndex={0}
      aria-label={label}
      aria-orientation={horizontalLine ? 'horizontal' : 'vertical'}
      aria-valuenow={value.now}
      aria-valuemin={value.min}
      aria-valuemax={value.max}
      onPointerDown={onPointerDown}
      onKeyDown={onKeyDown}
    />
  );
}

/* ---------------------------------------------------------------- floating */

type FrameProps = Omit<FloatingFrameProps, 'className' | 'style'>;

/**
 * A floating panel in its own native window. The window is taken from the pool on mount and
 * released on unmount; React renders the frame into it through a portal.
 */
function NativeFloating({ windows, panel, dragging, frame }: { windows: NativeWindowPool; panel: FloatingPanel; dragging: boolean; frame: FrameProps }) {
  const [fw, setFw] = useState<FloatWindow | null>(null);
  useLayoutEffect(() => {
    setFw(windows.acquire(panel.id, panel, frame.title));
    return () => windows.release(panel.id);
    // Only the panel decides which window; bounds and title follow below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [windows, panel.id]);
  const { x, y, width, height } = panel;
  useLayoutEffect(() => {
    if (fw) windows.setBounds(panel.id, { x, y, width, height }, dragging ? DRAG_OPACITY : 1);
  }, [fw, windows, panel.id, x, y, width, height, dragging]);
  useEffect(() => {
    if (fw) fw.doc.title = frame.title;
  }, [fw, frame.title]);
  return fw ? createPortal(<FloatingFrame {...frame} className="native" />, fw.doc.body) : null;
}

/** Global screen position of the docking area's top-left corner (logical pixels). */
export function areaScreenOrigin(areaClientRect: DOMRect): { x: number; y: number } {
  const chromeX = Math.max(0, (window.outerWidth - window.innerWidth) / 2);
  const chromeY = Math.max(0, window.outerHeight - window.innerHeight - chromeX);
  return { x: window.screenX + chromeX + areaClientRect.left, y: window.screenY + chromeY + areaClientRect.top };
}
