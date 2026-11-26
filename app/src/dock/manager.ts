/**
 * The docking API (spec §8): panel registry, the current layout as a small external store,
 * and throttled persistence. No React, no DOM except the storage passed in.
 */
import {
  emptyLayout, findPanel, floatPanel, getPanelRef, hidePanel, insertPanel, normalize, setExpanded, setZoneCollapsed, showPanel,
  type DockLayout, type DockTarget, type Edge, type FloatRect,
} from './model';
import { defaultLayout, loadLayout, placeOnScreens, type DefaultSpec, type PlaceFloating, type ScreenSetup } from './persist';

export interface PanelDefinition<C = unknown> {
  id: string;
  title: string | (() => string);
  /** The panel's content (a React node in this app). Created once, then moved, never re-created. */
  create: () => C;
  defaultEdge?: Edge;
  defaultExpanded?: boolean;
  minSize?: { w: number; h: number };
}

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface WorkspaceConfig {
  /** Storage key for this workspace's layout. */
  key: string;
  defaults: DefaultSpec;
  /** Registered panels that do not take part here (e.g. the workspace's canvas). */
  exclude?: readonly string[];
  /** Where default floating panels go. */
  place?: PlaceFloating;
}

type LayoutListener = (layout: DockLayout) => void;

export const SAVE_DELAY_MS = 500;

export class DockManager<C = unknown> {
  private readonly panels = new Map<string, PanelDefinition<C>>();
  private layout: DockLayout = emptyLayout();
  private readonly listeners = new Set<LayoutListener>();
  private config: WorkspaceConfig | null = null;
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private screens: ScreenSetup | null = null;

  constructor(private readonly storage: StorageLike | null = null) {}

  /* ---------- registry */

  registerPanel(def: PanelDefinition<C>): void {
    this.panels.set(def.id, def);
    if (this.config && this.known().includes(def.id) && !findPanel(this.layout, def.id)) {
      this.commit(showPanel({ ...this.layout, hidden: [...this.layout.hidden, def.id] }, def.id, this.fallbackTarget(def.id)));
    }
  }

  panel(id: string): PanelDefinition<C> | undefined {
    return this.panels.get(id);
  }

  title(id: string): string {
    const t = this.panels.get(id)?.title;
    return typeof t === 'function' ? t() : (t ?? id);
  }

  /** Registered panels that take part in the current workspace. */
  known(): string[] {
    const exclude = new Set(this.config?.exclude ?? []);
    return [...this.panels.keys()].filter((id) => !exclude.has(id));
  }

  /* ---------- workspace + persistence */

  /** Switches to a workspace: saves the current layout, loads (or builds) the new one. */
  useWorkspace(config: WorkspaceConfig): void {
    if (this.config?.key === config.key) return;
    this.flush();
    this.config = config;
    let saved: string | null = null;
    try {
      saved = this.storage?.getItem(config.key) ?? null;
    } catch {
      saved = null;
    }
    const loaded = loadLayout(saved, { known: this.known(), defaults: this.defaults() });
    this.layout = placeOnScreens(loaded, this.screens);
    this.emit();
    // Windows brought back from a missing monitor: remember their new place.
    if (this.layout !== loaded) this.scheduleSave();
  }

  /** The storage key of the active workspace's layout, if any. */
  workspaceKey(): string | null {
    return this.config?.key ?? null;
  }

  /**
   * Changes which panels the active workspace leaves out (its canvas and those the user does not
   * want there, DC-120): left-out panels leave its layout; panels offered again come back – at their
   * default place if the workspace has one for them, else hidden.
   */
  setExcluded(exclude: readonly string[]): void {
    if (!this.config) return;
    this.config = { ...this.config, exclude };
    this.commit(loadLayout(JSON.stringify(this.layout), { known: this.known(), defaults: this.defaults() }));
  }

  private defaults(): DockLayout {
    const c = this.config;
    if (!c) return this.layout;
    const spec = { ...c.defaults };
    // Panels with defaultExpanded: false start collapsed.
    spec.collapsed = [...(spec.collapsed ?? []), ...[...this.panels.values()].filter((p) => p.defaultExpanded === false).map((p) => p.id)];
    return defaultLayout(spec, this.known(), c.place ?? ((i) => ({ x: 120 + 40 * i, y: 120 + 40 * i })));
  }

  /** Saves now (call on quit / page hide). */
  flush(): void {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    if (!this.config || !this.storage) return;
    try {
      this.storage.setItem(this.config.key, JSON.stringify(this.layout));
    } catch {
      /* storage full or unavailable */
    }
  }

  private scheduleSave(): void {
    if (!this.storage || !this.config) return;
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => this.flush(), SAVE_DELAY_MS);
  }

  /* ---------- store */

  getLayout = (): DockLayout => this.layout;

  setLayout(layout: DockLayout): void {
    this.commit(layout);
  }

  subscribe = (cb: () => void): (() => void) => {
    const l: LayoutListener = () => cb();
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  };

  on(event: 'layoutChanged', cb: LayoutListener): () => void {
    void event;
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  /**
   * The screens (desktop app). Floating windows on a monitor that is gone, or with less than
   * 40 × 40 px visible, move to the main window's screen; every floating window remembers its
   * monitor. Call again when the displays change.
   */
  setScreens(setup: ScreenSetup | null): void {
    this.screens = setup;
    const placed = placeOnScreens(this.layout, setup);
    if (placed !== this.layout) this.commit(placed);
  }

  private commit(layout: DockLayout): void {
    if (layout === this.layout) return;
    this.layout = placeOnScreens(normalize(layout), this.screens);
    this.emit();
    this.scheduleSave();
  }

  private emit(): void {
    for (const l of [...this.listeners]) l(this.layout);
  }

  /* ---------- commands */

  isVisible(id: string): boolean {
    const loc = findPanel(this.layout, id);
    return !!loc && loc.kind !== 'hidden';
  }

  show(id: string): void {
    if (!this.known().includes(id)) return;
    const l = findPanel(this.layout, id) ? this.layout : { ...this.layout, hidden: [...this.layout.hidden, id] };
    this.commit(showPanel(l, id, this.fallbackTarget(id)));
  }

  hide(id: string): void {
    this.commit(hidePanel(this.layout, id));
  }

  toggle(id: string): void {
    if (this.isVisible(id)) this.hide(id);
    else this.show(id);
  }

  /** Makes a panel visible: shows it, expands it, and expands its zone. */
  focus(id: string): void {
    this.show(id);
    const loc = findPanel(this.layout, id);
    if (loc?.kind !== 'dock') return;
    let l = this.layout;
    if (!getPanelRef(l, loc)?.expanded) l = setExpanded(l, id, true);
    if (l.zones[loc.edge].collapsed) l = setZoneCollapsed(l, loc.edge, false);
    this.commit(l);
  }

  dockTo(id: string, edge: Edge, groupIndex?: number, panelIndex?: number): void {
    const target: DockTarget =
      groupIndex === undefined ? { kind: 'newGroup', edge, groupIndex: 0 } : { kind: 'intoGroup', edge, groupIndex, panelIndex: panelIndex ?? Number.MAX_SAFE_INTEGER };
    this.commit(insertPanel(this.layout, id, target));
  }

  float(id: string, rect?: FloatRect): void {
    this.commit(floatPanel(this.layout, id, rect ?? { x: 160, y: 160, width: 320, height: 400 }));
  }

  setZoneCollapsed(edge: Edge, collapsed: boolean): void {
    this.commit(setZoneCollapsed(this.layout, edge, collapsed));
  }

  resetLayout(): void {
    this.commit(this.defaults());
  }

  /** Default place for a panel that has none: the end of the first group on its default edge. */
  private fallbackTarget(id: string): DockTarget {
    const def = this.panels.get(id);
    const d = findPanel(this.defaults(), id);
    const edge: Edge = d?.kind === 'dock' ? d.edge : (def?.defaultEdge ?? 'left');
    const group = this.layout.zones[edge].groups[0];
    return group ? { kind: 'intoGroup', edge, groupIndex: 0, panelIndex: group.panels.length } : { kind: 'newGroup', edge, groupIndex: 0 };
  }
}
