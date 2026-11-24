/**
 * Docking layout model: a serializable description of where every panel is. The UI is always
 * derived from it; interactions produce a new layout (functions here never mutate their input).
 * Pure TypeScript, no DOM, no React.
 */

export type Edge = 'left' | 'right' | 'bottom';
export const EDGES: readonly Edge[] = ['left', 'right', 'bottom'];

export interface PanelRef {
  id: string;
  expanded: boolean;
  /** Relative share of the group's content space (> 0). */
  weight: number;
}

export interface Group {
  /** Width (left/right) or height (bottom) in px. */
  size: number;
  panels: PanelRef[];
}

export interface DockZone {
  edge: Edge;
  collapsed: boolean;
  /** Index 0 = outermost, at the window edge. */
  groups: Group[];
}

export interface DockPosition {
  edge: Edge;
  groupIndex: number;
  panelIndex: number;
}

export interface FloatRect {
  /** Global screen coordinates in logical pixels. */
  x: number;
  y: number;
  width: number;
  height: number;
  monitorId?: string;
}

export interface FloatingPanel extends FloatRect {
  id: string;
  /** Where it was docked last, for "dock again". */
  lastDock?: DockPosition;
}

/** Where a panel was before it was hidden, so showing it again restores it there. */
export type PanelMemory = { mode: 'dock'; dock: DockPosition; size?: number } | { mode: 'floating'; rect: FloatRect; lastDock?: DockPosition };

export interface DockLayout {
  version: number;
  zones: Record<Edge, DockZone>;
  floating: FloatingPanel[];
  /** Closed panels (shown again via the "Windows" menu). */
  hidden: string[];
  /** Last place of hidden panels (addition to the spec's model; optional). */
  memory?: Record<string, PanelMemory>;
}

export const LAYOUT_VERSION = 1;

export const DOCK = {
  /** Panel title bar height. */
  title: 24,
  /** Thickness of a collapsed zone's bar. */
  bar: 24,
  minGroup: 160,
  /** Largest group as a share of the window (width for left/right, height for bottom). */
  maxGroupFraction: 0.6,
  minContent: 60,
  minFloat: { width: 160, height: 120 },
  defaultGroupSize: { left: 280, right: 300, bottom: 200 } as Record<Edge, number>,
} as const;

/* ---------------------------------------------------------------- basics */

export function emptyLayout(): DockLayout {
  return {
    version: LAYOUT_VERSION,
    zones: { left: emptyZone('left'), right: emptyZone('right'), bottom: emptyZone('bottom') },
    floating: [],
    hidden: [],
  };
}

function emptyZone(edge: Edge): DockZone {
  return { edge, collapsed: false, groups: [] };
}

function clone(layout: DockLayout): DockLayout {
  return structuredClone(layout);
}

export type PanelLocation =
  | ({ kind: 'dock' } & DockPosition)
  | { kind: 'floating'; index: number }
  | { kind: 'hidden'; index: number };

export function findPanel(layout: DockLayout, id: string): PanelLocation | null {
  for (const edge of EDGES) {
    const groups = layout.zones[edge].groups;
    for (let g = 0; g < groups.length; g++) {
      const p = groups[g]!.panels.findIndex((x) => x.id === id);
      if (p >= 0) return { kind: 'dock', edge, groupIndex: g, panelIndex: p };
    }
  }
  const f = layout.floating.findIndex((x) => x.id === id);
  if (f >= 0) return { kind: 'floating', index: f };
  const h = layout.hidden.indexOf(id);
  if (h >= 0) return { kind: 'hidden', index: h };
  return null;
}

/** Every panel id in the layout, in order: zones, floating, hidden. */
export function allPanelIds(layout: DockLayout): string[] {
  const ids: string[] = [];
  for (const edge of EDGES) for (const g of layout.zones[edge].groups) for (const p of g.panels) ids.push(p.id);
  for (const f of layout.floating) ids.push(f.id);
  ids.push(...layout.hidden);
  return ids;
}

export function getPanelRef(layout: DockLayout, pos: DockPosition): PanelRef | undefined {
  return layout.zones[pos.edge].groups[pos.groupIndex]?.panels[pos.panelIndex];
}

/* ---------------------------------------------------------------- normalize */

const finitePositive = (n: unknown, fallback: number): number => (typeof n === 'number' && Number.isFinite(n) && n > 0 ? n : fallback);
const finite = (n: unknown, fallback: number): number => (typeof n === 'number' && Number.isFinite(n) ? n : fallback);

/**
 * Restores the invariants:
 * - every panel id occurs exactly once (first occurrence wins: zones, floating, hidden);
 * - empty groups are removed; a zone without groups is not collapsed;
 * - weights > 0 (the others are left alone, they share the space automatically);
 * - group and floating sizes are at least the minimum.
 */
export function normalize(layout: DockLayout): DockLayout {
  const seen = new Set<string>();
  const take = (id: string) => {
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  };
  const out = emptyLayout();
  for (const edge of EDGES) {
    const zone = layout.zones[edge];
    const groups: Group[] = [];
    for (const g of zone?.groups ?? []) {
      const panels = g.panels.filter((p) => take(p.id)).map((p) => ({ id: p.id, expanded: !!p.expanded, weight: finitePositive(p.weight, 1) }));
      if (panels.length > 0) groups.push({ size: Math.max(DOCK.minGroup, finitePositive(g.size, DOCK.defaultGroupSize[edge])), panels });
    }
    out.zones[edge] = { edge, collapsed: groups.length > 0 && !!zone?.collapsed, groups };
  }
  out.floating = layout.floating
    .filter((f) => take(f.id))
    .map((f) => {
      const n: FloatingPanel = {
        id: f.id,
        x: finite(f.x, 0),
        y: finite(f.y, 0),
        width: Math.max(DOCK.minFloat.width, finitePositive(f.width, 320)),
        height: Math.max(DOCK.minFloat.height, finitePositive(f.height, 400)),
      };
      if (f.monitorId !== undefined) n.monitorId = f.monitorId;
      if (f.lastDock) n.lastDock = { ...f.lastDock };
      return n;
    });
  out.hidden = layout.hidden.filter(take);
  // Memory is only kept for hidden panels.
  if (layout.memory) {
    const memory: Record<string, PanelMemory> = {};
    for (const id of out.hidden) if (layout.memory[id]) memory[id] = structuredClone(layout.memory[id]);
    if (Object.keys(memory).length > 0) out.memory = memory;
  }
  return out;
}

/* ---------------------------------------------------------------- remove / insert */

export interface Removed {
  layout: DockLayout;
  /** Where the panel was; null if it was not in the layout. */
  from: PanelLocation | null;
  /** The removed docked panel's ref and group size (for re-inserting or the floating window). */
  ref?: PanelRef;
  groupSize?: number;
  floating?: FloatingPanel;
}

/** Removes a panel from wherever it is. The other weights stay as they are. */
export function removePanel(layout: DockLayout, id: string): Removed {
  const from = findPanel(layout, id);
  if (!from) return { layout, from: null };
  const next = clone(layout);
  const result: Removed = { layout: next, from };
  if (from.kind === 'dock') {
    const group = next.zones[from.edge].groups[from.groupIndex]!;
    result.ref = group.panels.splice(from.panelIndex, 1)[0];
    result.groupSize = group.size;
  } else if (from.kind === 'floating') {
    result.floating = next.floating.splice(from.index, 1)[0];
  } else {
    next.hidden.splice(from.index, 1);
  }
  result.layout = normalize(next);
  return result;
}

/** Where to put a panel in the docking zones. Indexes refer to the layout *without* the panel. */
export type DockTarget =
  | { kind: 'newGroup'; edge: Edge; groupIndex: number }
  | { kind: 'intoGroup'; edge: Edge; groupIndex: number; panelIndex: number };

export interface InsertOptions {
  /** Size of a new group; default per edge. */
  size?: number;
  expanded?: boolean;
  weight?: number;
}

function averageWeight(group: Group | undefined): number {
  if (!group || group.panels.length === 0) return 1;
  return group.panels.reduce((s, p) => s + p.weight, 0) / group.panels.length;
}

/**
 * Docks a panel at `target` (moving it if it is already somewhere). It arrives expanded with
 * the group's average weight (or 1).
 */
export function insertPanel(layout: DockLayout, id: string, target: DockTarget, opts: InsertOptions = {}): DockLayout {
  const next = clone(removePanel(layout, id).layout);
  const zone = next.zones[target.edge];
  const expanded = opts.expanded ?? true;
  if (target.kind === 'newGroup') {
    const at = clampIndex(target.groupIndex, zone.groups.length);
    zone.groups.splice(at, 0, { size: opts.size ?? DOCK.defaultGroupSize[target.edge], panels: [{ id, expanded, weight: opts.weight ?? 1 }] });
  } else {
    const group = zone.groups[target.groupIndex];
    if (!group) {
      zone.groups.push({ size: opts.size ?? DOCK.defaultGroupSize[target.edge], panels: [{ id, expanded, weight: opts.weight ?? 1 }] });
    } else {
      const weight = opts.weight ?? averageWeight(group);
      group.panels.splice(clampIndex(target.panelIndex, group.panels.length), 0, { id, expanded, weight });
    }
  }
  return normalize(next);
}

function clampIndex(i: number, length: number): number {
  return Math.max(0, Math.min(length, Math.floor(i)));
}

/** Makes a panel float at `rect`, remembering its dock position if it was docked. */
export function floatPanel(layout: DockLayout, id: string, rect: FloatRect): DockLayout {
  const removed = removePanel(layout, id);
  const next = clone(removed.layout);
  const f: FloatingPanel = { id, ...rect };
  if (removed.from?.kind === 'dock') f.lastDock = { edge: removed.from.edge, groupIndex: removed.from.groupIndex, panelIndex: removed.from.panelIndex };
  else if (removed.floating?.lastDock) f.lastDock = removed.floating.lastDock;
  else if (removed.from?.kind === 'hidden') {
    const m = layout.memory?.[id];
    if (m?.mode === 'dock') f.lastDock = m.dock;
    else if (m?.lastDock) f.lastDock = m.lastDock;
  }
  next.floating.push(f);
  return normalize(next);
}

/** Moves or resizes a floating panel. */
export function moveFloating(layout: DockLayout, id: string, rect: Partial<FloatRect>): DockLayout {
  const next = clone(layout);
  const f = next.floating.find((x) => x.id === id);
  if (!f) return layout;
  Object.assign(f, rect);
  return normalize(next);
}

/** Closes a panel; it keeps its state and remembers where it was. */
export function hidePanel(layout: DockLayout, id: string): DockLayout {
  const removed = removePanel(layout, id);
  if (!removed.from || removed.from.kind === 'hidden') return layout;
  const next = clone(removed.layout);
  next.hidden.push(id);
  const memory = { ...(next.memory ?? {}) };
  if (removed.from.kind === 'dock') {
    const { edge, groupIndex, panelIndex } = removed.from;
    memory[id] = { mode: 'dock', dock: { edge, groupIndex, panelIndex }, ...(removed.groupSize ? { size: removed.groupSize } : {}) };
  } else if (removed.floating) {
    const { id: _id, lastDock, ...rect } = removed.floating;
    memory[id] = { mode: 'floating', rect, ...(lastDock ? { lastDock } : {}) };
  }
  next.memory = memory;
  return normalize(next);
}

/** Shows a hidden panel at its last place; `fallback` is used when nothing is remembered. */
export function showPanel(layout: DockLayout, id: string, fallback: DockTarget): DockLayout {
  const loc = findPanel(layout, id);
  if (loc && loc.kind !== 'hidden') return layout;
  const m = layout.memory?.[id];
  // floatPanel takes lastDock from the memory.
  if (m?.mode === 'floating') return floatPanel(layout, id, m.rect);
  if (m?.mode === 'dock') return insertPanel(layout, id, redockTarget(layout, m.dock, id), m.size ? { size: m.size } : {});
  return insertPanel(layout, id, fallback);
}

/**
 * Target for "dock again" (double-click on a floating title): the last dock position if its
 * group still exists, otherwise the first group on the left (or a new one there).
 */
export function redockTarget(layout: DockLayout, last: DockPosition | undefined, movingId?: string): DockTarget {
  const base = movingId ? removePanel(layout, movingId).layout : layout;
  if (last) {
    const group = base.zones[last.edge].groups[last.groupIndex];
    if (group) return { kind: 'intoGroup', edge: last.edge, groupIndex: last.groupIndex, panelIndex: Math.min(last.panelIndex, group.panels.length) };
  }
  const left = base.zones.left.groups[0];
  return left ? { kind: 'intoGroup', edge: 'left', groupIndex: 0, panelIndex: left.panels.length } : { kind: 'newGroup', edge: 'left', groupIndex: 0 };
}

/* ---------------------------------------------------------------- small edits */

export function setExpanded(layout: DockLayout, id: string, expanded: boolean): DockLayout {
  const loc = findPanel(layout, id);
  if (loc?.kind !== 'dock') return layout;
  const next = clone(layout);
  next.zones[loc.edge].groups[loc.groupIndex]!.panels[loc.panelIndex]!.expanded = expanded;
  return next;
}

export function toggleExpanded(layout: DockLayout, id: string): DockLayout {
  const loc = findPanel(layout, id);
  if (loc?.kind !== 'dock') return layout;
  return setExpanded(layout, id, !getPanelRef(layout, loc)!.expanded);
}

export function setZoneCollapsed(layout: DockLayout, edge: Edge, collapsed: boolean): DockLayout {
  const next = clone(layout);
  next.zones[edge].collapsed = collapsed && next.zones[edge].groups.length > 0;
  return next;
}

/** Sets a group's width/height, clamped to [minGroup, max]. */
export function resizeGroup(layout: DockLayout, edge: Edge, groupIndex: number, size: number, max = Number.POSITIVE_INFINITY): DockLayout {
  const group = layout.zones[edge].groups[groupIndex];
  if (!group) return layout;
  const next = clone(layout);
  next.zones[edge].groups[groupIndex]!.size = Math.round(Math.max(DOCK.minGroup, Math.min(max, size)));
  return next;
}

/**
 * Splitter between two expanded panels: moves `delta` px of content from B to A (negative:
 * from A to B). Only these two weights change; their sum stays the same, so the rest of the
 * group is unaffected. Each keeps at least `min` px (unless it already had less).
 */
export function splitWeights(weightA: number, weightB: number, sizeA: number, sizeB: number, delta: number, min: number = DOCK.minContent): [number, number] {
  const total = sizeA + sizeB;
  const sum = weightA + weightB;
  if (total <= 0 || sum <= 0) return [weightA, weightB];
  const lo = Math.min(min, sizeA);
  const hi = total - Math.min(min, sizeB);
  const newA = Math.max(lo, Math.min(hi, sizeA + delta));
  const a = (sum * newA) / total;
  const eps = sum * 1e-6;
  return [Math.max(eps, a), Math.max(eps, sum - a)];
}

/** Applies `splitWeights` to two panels of a group. */
export function setPanelWeights(layout: DockLayout, edge: Edge, groupIndex: number, a: number, b: number, weights: [number, number]): DockLayout {
  const group = layout.zones[edge].groups[groupIndex];
  if (!group?.panels[a] || !group.panels[b]) return layout;
  const next = clone(layout);
  const g = next.zones[edge].groups[groupIndex]!;
  g.panels[a]!.weight = weights[0];
  g.panels[b]!.weight = weights[1];
  return normalize(next);
}
