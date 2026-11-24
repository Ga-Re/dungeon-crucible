/**
 * Docking geometry: turns a layout and the size of the docking area into rectangles (zones,
 * groups, panels, splitters, collapsed bars), and finds drop targets for a dragged panel.
 * Pure functions. All coordinates are relative to the docking area's top-left corner.
 */
import { DOCK, EDGES, type DockLayout, type DockTarget, type Edge, type Group } from './model';

export interface Point {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface GeometryOptions {
  /** false (default): left and right run the full height and bottom sits between them. */
  bottomSpansFullWidth?: boolean;
  /** Below this the canvas does not shrink: groups shrink, then zones collapse. */
  minCanvas?: { width: number; height: number };
  /** Length of a title tab in a collapsed bar (text width + padding). */
  tabLength?: (id: string) => number;
}

export const GEOMETRY = {
  splitterGrip: 6,
  tabGap: 8,
  edgeStrip: 24,
  groupEdgeStrip: 16,
  edgeIndicator: 4,
  lineIndicator: 3,
  minCanvas: { width: 320, height: 200 },
  defaultTabLength: 96,
} as const;

export interface PanelGeom {
  id: string;
  edge: Edge;
  groupIndex: number;
  panelIndex: number;
  expanded: boolean;
  /** Whole panel (title + content). */
  rect: Rect;
  header: Rect;
  content: Rect;
}

export interface GroupGeom {
  edge: Edge;
  index: number;
  rect: Rect;
  panels: PanelGeom[];
}

export interface TabGeom {
  id: string;
  groupIndex: number;
  panelIndex: number;
  rect: Rect;
}

export interface BarGeom {
  rect: Rect;
  /** The "expand zone" button at the start of the bar. */
  toggle: Rect;
  tabs: TabGeom[];
}

export type SplitterGeom =
  | { kind: 'group'; edge: Edge; groupIndex: number; rect: Rect }
  /** Between two expanded panels `a` < `b` of a group; sizes are their current content sizes. */
  | { kind: 'panel'; edge: Edge; groupIndex: number; a: number; b: number; sizeA: number; sizeB: number; rect: Rect };

export interface ZoneGeom {
  edge: Edge;
  /** Always defined; width/height 0 when the zone is empty. */
  rect: Rect;
  state: 'empty' | 'expanded' | 'collapsed';
  /** Collapsed only because the window is too small (not stored in the layout). */
  autoCollapsed: boolean;
  groups: GroupGeom[];
  bar: BarGeom | null;
}

export interface DockGeometry {
  area: Rect;
  canvas: Rect;
  zones: Record<Edge, ZoneGeom>;
  splitters: SplitterGeom[];
}

/** Panels in left/right stack vertically; in bottom they sit side by side. */
export function stacksVertically(edge: Edge): boolean {
  return edge !== 'bottom';
}

const right = (r: Rect) => r.x + r.width;
const bottom = (r: Rect) => r.y + r.height;
const inside = (r: Rect, p: Point) => p.x >= r.x && p.x < right(r) && p.y >= r.y && p.y < bottom(r);

/**
 * Shrinks sizes proportionally so they sum to at most `budget`, none below `min`.
 * Sizes already at the minimum stay there; the rest share what is left.
 */
export function shrinkToFit(sizes: readonly number[], budget: number, min: number): number[] {
  const sum = sizes.reduce((s, x) => s + x, 0);
  if (sum <= budget) return [...sizes];
  if (sizes.length * min >= budget) return sizes.map(() => min);
  const fixed = sizes.map((s) => s <= min);
  for (;;) {
    const free = budget - fixed.filter(Boolean).length * min;
    const flex = sizes.reduce((s, x, i) => (fixed[i] ? s : s + x), 0);
    const f = free / flex;
    let changed = false;
    sizes.forEach((s, i) => {
      if (!fixed[i] && s * f < min) {
        fixed[i] = true;
        changed = true;
      }
    });
    if (!changed) return sizes.map((s, i) => (fixed[i] ? min : Math.floor(s * f)));
  }
}

/** Splits `total` into integer parts proportional to `weights` (no gaps from rounding). */
function distribute(total: number, weights: readonly number[]): number[] {
  const sum = weights.reduce((s, w) => s + w, 0);
  if (sum <= 0) return weights.map(() => 0);
  let acc = 0;
  let prev = 0;
  return weights.map((w) => {
    acc += w;
    const end = Math.round((total * acc) / sum);
    const part = end - prev;
    prev = end;
    return part;
  });
}

/** Lays out a group's panels as an accordion. */
function layoutPanels(edge: Edge, groupIndex: number, group: Group, r: Rect): { panels: PanelGeom[]; splitters: SplitterGeom[] } {
  const vertical = stacksVertically(edge);
  const T = DOCK.title;
  const length = vertical ? r.height : r.width;
  const headersAlong = group.panels.reduce((s, p) => s + (vertical || !p.expanded ? T : 0), 0);
  const expanded = group.panels.filter((p) => p.expanded);
  const contents = distribute(Math.max(0, length - headersAlong), expanded.map((p) => p.weight));
  const panels: PanelGeom[] = [];
  const splitters: SplitterGeom[] = [];
  let cursor = vertical ? r.y : r.x;
  let k = 0;
  let prevExpanded: { index: number; size: number } | null = null;
  group.panels.forEach((p, i) => {
    const c = p.expanded ? contents[k++]! : 0;
    let rect: Rect;
    let header: Rect;
    let content: Rect;
    if (vertical) {
      rect = { x: r.x, y: cursor, width: r.width, height: T + c };
      header = { x: r.x, y: cursor, width: r.width, height: T };
      content = { x: r.x, y: cursor + T, width: r.width, height: c };
    } else if (p.expanded) {
      rect = { x: cursor, y: r.y, width: c, height: r.height };
      header = { x: cursor, y: r.y, width: c, height: T };
      content = { x: cursor, y: r.y + T, width: c, height: Math.max(0, r.height - T) };
    } else {
      // A collapsed panel in the bottom zone is a narrow strip with its title turned 90°.
      rect = { x: cursor, y: r.y, width: T, height: r.height };
      header = { ...rect };
      content = { x: cursor + T, y: r.y, width: 0, height: 0 };
    }
    if (p.expanded) {
      if (prevExpanded) {
        const g = GEOMETRY.splitterGrip;
        splitters.push({
          kind: 'panel', edge, groupIndex, a: prevExpanded.index, b: i, sizeA: prevExpanded.size, sizeB: c,
          rect: vertical ? { x: r.x, y: cursor - g / 2, width: r.width, height: g } : { x: cursor - g / 2, y: r.y, width: g, height: r.height },
        });
      }
      prevExpanded = { index: i, size: c };
    }
    panels.push({ id: p.id, edge, groupIndex, panelIndex: i, expanded: p.expanded, rect, header, content });
    cursor += vertical ? rect.height : rect.width;
  });
  return { panels, splitters };
}

function layoutBar(edge: Edge, groups: readonly Group[], r: Rect, tabLength: (id: string) => number): BarGeom {
  const B = DOCK.bar;
  const vertical = stacksVertically(edge);
  const toggle: Rect = { x: r.x, y: r.y, width: B, height: B };
  const tabs: TabGeom[] = [];
  let cursor = (vertical ? r.y : r.x) + B + GEOMETRY.tabGap;
  groups.forEach((g, gi) => {
    if (gi > 0) cursor += GEOMETRY.tabGap;
    g.panels.forEach((p, pi) => {
      const len = Math.max(B, Math.round(tabLength(p.id)));
      tabs.push({ id: p.id, groupIndex: gi, panelIndex: pi, rect: vertical ? { x: r.x, y: cursor, width: B, height: len } : { x: cursor, y: r.y, width: len, height: B } });
      cursor += len;
    });
  });
  return { rect: r, toggle, tabs };
}

/** The whole docking geometry for a docking area of `size`. */
export function computeGeometry(layout: DockLayout, size: { width: number; height: number }, opts: GeometryOptions = {}): DockGeometry {
  const W = Math.max(0, size.width);
  const H = Math.max(0, size.height);
  const minCanvas = opts.minCanvas ?? GEOMETRY.minCanvas;
  const spansFull = opts.bottomSpansFullWidth ?? false;
  const tabLength = opts.tabLength ?? (() => GEOMETRY.defaultTabLength);
  const B = DOCK.bar;

  // 1. Which zones are collapsed: by the user, or automatically when the window is too small
  //    (first bottom, then right, then left). Not stored, so enlarging restores the layout.
  const empty = (e: Edge) => layout.zones[e].groups.length === 0;
  const collapsed: Record<Edge, boolean> = { left: false, right: false, bottom: false };
  for (const e of EDGES) collapsed[e] = !empty(e) && layout.zones[e].collapsed;
  const minThickness = (e: Edge) => (empty(e) ? 0 : collapsed[e] ? B : layout.zones[e].groups.length * DOCK.minGroup);
  if (!collapsed.bottom && !empty('bottom') && minThickness('bottom') + minCanvas.height > H) collapsed.bottom = true;
  for (const e of ['right', 'left'] as const) {
    if (minThickness('left') + minThickness('right') + minCanvas.width <= W) break;
    if (!collapsed[e] && !empty(e)) collapsed[e] = true;
  }

  // 2. Group sizes: clamped to [min, 60 % of the window], then shrunk to leave the canvas room.
  const clampSize = (e: Edge, s: number) => Math.max(DOCK.minGroup, Math.min(s, DOCK.maxGroupFraction * (e === 'bottom' ? H : W)));
  const sizes: Record<Edge, number[]> = { left: [], right: [], bottom: [] };
  for (const e of EDGES) if (!collapsed[e]) sizes[e] = layout.zones[e].groups.map((g) => clampSize(e, g.size));
  const barW = (e: Edge) => (collapsed[e] ? B : 0);
  const sideBudget = W - minCanvas.width - barW('left') - barW('right');
  const side = shrinkToFit([...sizes.left, ...sizes.right], sideBudget, DOCK.minGroup);
  sizes.left = side.slice(0, sizes.left.length);
  sizes.right = side.slice(sizes.left.length);
  sizes.bottom = shrinkToFit(sizes.bottom, H - minCanvas.height, DOCK.minGroup);
  for (const e of EDGES) sizes[e] = sizes[e].map(Math.round);

  const thickness = (e: Edge) => (empty(e) ? 0 : collapsed[e] ? B : sizes[e].reduce((s, x) => s + x, 0));
  const TL = thickness('left');
  const TR = thickness('right');
  const TB = thickness('bottom');

  // 3. Zone rectangles and the canvas.
  const sideHeight = spansFull ? Math.max(0, H - TB) : H;
  const rects: Record<Edge, Rect> = {
    left: { x: 0, y: 0, width: TL, height: sideHeight },
    right: { x: Math.max(0, W - TR), y: 0, width: TR, height: sideHeight },
    bottom: spansFull ? { x: 0, y: Math.max(0, H - TB), width: W, height: TB } : { x: TL, y: Math.max(0, H - TB), width: Math.max(0, W - TL - TR), height: TB },
  };
  const canvas: Rect = { x: TL, y: 0, width: Math.max(0, W - TL - TR), height: Math.max(0, H - TB) };

  // 4. Groups, panels, splitters, bars.
  const splitters: SplitterGeom[] = [];
  const zones = {} as Record<Edge, ZoneGeom>;
  const g = GEOMETRY.splitterGrip;
  for (const e of EDGES) {
    const zr = rects[e];
    const zone: ZoneGeom = {
      edge: e,
      rect: zr,
      state: empty(e) ? 'empty' : collapsed[e] ? 'collapsed' : 'expanded',
      autoCollapsed: collapsed[e] && !layout.zones[e].collapsed,
      groups: [],
      bar: null,
    };
    if (zone.state === 'collapsed') zone.bar = layoutBar(e, layout.zones[e].groups, zr, tabLength);
    if (zone.state === 'expanded') {
      let cursor = e === 'left' ? zr.x : e === 'right' ? right(zr) : bottom(zr);
      layout.zones[e].groups.forEach((group, gi) => {
        const s = sizes[e][gi]!;
        let r: Rect;
        if (e === 'left') {
          r = { x: cursor, y: zr.y, width: s, height: zr.height };
          cursor += s;
          splitters.push({ kind: 'group', edge: e, groupIndex: gi, rect: { x: right(r) - g / 2, y: r.y, width: g, height: r.height } });
        } else if (e === 'right') {
          cursor -= s;
          r = { x: cursor, y: zr.y, width: s, height: zr.height };
          splitters.push({ kind: 'group', edge: e, groupIndex: gi, rect: { x: r.x - g / 2, y: r.y, width: g, height: r.height } });
        } else {
          cursor -= s;
          r = { x: zr.x, y: cursor, width: zr.width, height: s };
          splitters.push({ kind: 'group', edge: e, groupIndex: gi, rect: { x: r.x, y: r.y - g / 2, width: r.width, height: g } });
        }
        const laid = layoutPanels(e, gi, group, r);
        splitters.push(...laid.splitters);
        zone.groups.push({ edge: e, index: gi, rect: r, panels: laid.panels });
      });
    }
    zones[e] = zone;
  }
  return { area: { x: 0, y: 0, width: W, height: H }, canvas, zones, splitters };
}

/**
 * Where a flyout from a collapsed zone appears: next to the bar, over the canvas, along the
 * whole bar. `size` is its width (left/right) or height (bottom).
 */
export function flyoutRect(geom: DockGeometry, edge: Edge, size: number): Rect | null {
  const bar = geom.zones[edge].bar;
  if (!bar) return null;
  const r = bar.rect;
  const max = edge === 'bottom' ? Math.max(DOCK.minGroup, r.y) : Math.max(DOCK.minGroup, geom.area.width - r.width);
  const s = Math.round(Math.max(DOCK.minGroup, Math.min(size, max)));
  if (edge === 'left') return { x: right(r), y: r.y, width: s, height: r.height };
  if (edge === 'right') return { x: r.x - s, y: r.y, width: s, height: r.height };
  return { x: r.x, y: r.y - s, width: r.width, height: s };
}

export interface DropResult {
  target: DockTarget;
  /** Where to draw the blue indicator (docking-area coordinates). */
  indicator: Rect;
  /** Which rule matched (priority 1–4 of the spec). */
  rule: 'edge' | 'bar' | 'groupEdge' | 'seam';
}

export interface DropOptions {
  /** Modifier held (Ctrl/⌘): never dock. */
  suppress?: boolean;
}

/**
 * Drop target for a dragged panel at `p` (docking-area coordinates; only the mouse position
 * counts). The dragged panel must already be removed from the layout behind `geom`.
 * Returns null when the panel should float (outside the area, over the canvas, suppressed).
 */
export function computeDropTarget(geom: DockGeometry, p: Point, opts: DropOptions = {}): DropResult | null {
  if (opts.suppress || !inside(geom.area, p)) return null;
  const A = geom.area;
  const S = GEOMETRY.edgeStrip;
  const EI = GEOMETRY.edgeIndicator;
  const L = GEOMETRY.lineIndicator;

  // 1. Strip along the left, right or bottom edge: new outermost group. Skipped for a collapsed
  //    zone: its bar fills that strip and takes the drop (rule 2).
  const edges: { edge: Edge; dist: number }[] = [];
  if (geom.zones.left.state !== 'collapsed' && p.x < A.x + S) edges.push({ edge: 'left', dist: p.x - A.x });
  if (geom.zones.right.state !== 'collapsed' && p.x >= right(A) - S) edges.push({ edge: 'right', dist: right(A) - 1 - p.x });
  if (geom.zones.bottom.state !== 'collapsed' && p.y >= bottom(A) - S) edges.push({ edge: 'bottom', dist: bottom(A) - 1 - p.y });
  if (edges.length > 0) {
    const { edge } = edges.reduce((a, b) => (b.dist < a.dist ? b : a));
    const z = geom.zones[edge].rect;
    const indicator: Rect =
      edge === 'left' ? { x: A.x, y: z.y, width: EI, height: z.height }
        : edge === 'right' ? { x: right(A) - EI, y: z.y, width: EI, height: z.height }
          : { x: z.x, y: bottom(A) - EI, width: z.width, height: EI };
    return { target: { kind: 'newGroup', edge, groupIndex: 0 }, indicator, rule: 'edge' };
  }

  // 2. On a collapsed bar: a new tab next to the nearest title.
  for (const e of EDGES) {
    const bar = geom.zones[e].bar;
    if (!bar || !inside(bar.rect, p)) continue;
    const vertical = stacksVertically(e);
    const along = vertical ? p.y : p.x;
    let best: { pos: number; groupIndex: number; panelIndex: number } | null = null;
    const consider = (pos: number, groupIndex: number, panelIndex: number) => {
      if (!best || Math.abs(pos - along) < Math.abs(best.pos - along)) best = { pos, groupIndex, panelIndex };
    };
    bar.tabs.forEach((t, i) => {
      const start = vertical ? t.rect.y : t.rect.x;
      const end = start + (vertical ? t.rect.height : t.rect.width);
      consider(start, t.groupIndex, t.panelIndex);
      const next = bar.tabs[i + 1];
      if (!next || next.groupIndex !== t.groupIndex) consider(end, t.groupIndex, t.panelIndex + 1);
    });
    if (!best) continue;
    const b = best as { pos: number; groupIndex: number; panelIndex: number };
    const r = bar.rect;
    const indicator: Rect = vertical ? { x: r.x, y: b.pos - L / 2, width: r.width, height: L } : { x: b.pos - L / 2, y: r.y, width: L, height: r.height };
    return { target: { kind: 'intoGroup', edge: e, groupIndex: b.groupIndex, panelIndex: b.panelIndex }, indicator, rule: 'bar' };
  }

  // 3./4. Inside a group: near its inner edge or between groups → new group; else into it.
  const G = GEOMETRY.groupEdgeStrip;
  for (const e of EDGES) {
    for (const grp of geom.zones[e].groups) {
      const r = grp.rect;
      if (!inside(r, p)) continue;
      const k = grp.index;
      const newGroup = (groupIndex: number, indicator: Rect): DropResult => ({ target: { kind: 'newGroup', edge: e, groupIndex }, indicator, rule: 'groupEdge' });
      const vLine = (x: number): Rect => ({ x, y: r.y, width: L, height: r.height });
      const hLine = (y: number): Rect => ({ x: r.x, y, width: r.width, height: L });
      if (e === 'left') {
        if (p.x >= right(r) - G) return newGroup(k + 1, vLine(right(r) - L));
        if (k > 0 && p.x < r.x + G) return newGroup(k, vLine(r.x));
      } else if (e === 'right') {
        if (p.x < r.x + G) return newGroup(k + 1, vLine(r.x));
        if (k > 0 && p.x >= right(r) - G) return newGroup(k, vLine(right(r) - L));
      } else {
        if (p.y < r.y + G) return newGroup(k + 1, hLine(r.y));
        if (k > 0 && p.y >= bottom(r) - G) return newGroup(k, hLine(bottom(r) - L));
      }
      // Seams: before each panel and after the last one.
      const vertical = stacksVertically(e);
      const along = vertical ? p.y : p.x;
      const seams = grp.panels.map((pg) => (vertical ? pg.rect.y : pg.rect.x));
      const last = grp.panels[grp.panels.length - 1];
      seams.push(last ? (vertical ? bottom(last.rect) : right(last.rect)) : vertical ? r.y : r.x);
      let best = 0;
      seams.forEach((s, i) => {
        if (Math.abs(s - along) < Math.abs(seams[best]! - along)) best = i;
      });
      const pos = seams[best]!;
      const indicator = vertical
        ? hLine(Math.max(r.y, Math.min(bottom(r) - L, pos - L / 2)))
        : vLine(Math.max(r.x, Math.min(right(r) - L, pos - L / 2)));
      return { target: { kind: 'intoGroup', edge: e, groupIndex: k, panelIndex: best }, indicator, rule: 'seam' };
    }
  }

  // 5. Over the canvas: float.
  return null;
}
