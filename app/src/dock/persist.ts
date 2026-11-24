/**
 * Default layouts, loading saved layouts (validation + migration) and putting floating
 * windows back on a visible screen. Pure functions.
 */
import {
  DOCK, EDGES, LAYOUT_VERSION, emptyLayout, findPanel, floatPanel, insertPanel, normalize,
  type DockLayout, type DockPosition, type DockZone, type Edge, type FloatRect, type FloatingPanel, type Group, type PanelMemory,
} from './model';

/** A workspace's default arrangement: one group per edge, in this order. */
export interface DefaultSpec {
  left?: string[];
  right?: string[];
  bottom?: string[];
  /** Panels that start collapsed (default: all expanded). */
  collapsed?: string[];
  floating?: { id: string; width: number; height: number }[];
  sizes?: Partial<Record<Edge, number>>;
}

/** Where default floating panels go: global coordinates for the i-th one. */
export type PlaceFloating = (index: number, width: number, height: number) => { x: number; y: number; monitorId?: string };

/**
 * The default layout: the spec's edges, the given floating panels, and every other known panel
 * hidden (it can be shown from the "Windows" menu).
 */
export function defaultLayout(spec: DefaultSpec, known: readonly string[], place: PlaceFloating): DockLayout {
  const layout = emptyLayout();
  const isKnown = new Set(known);
  const collapsed = new Set(spec.collapsed ?? []);
  for (const edge of EDGES) {
    const ids = (spec[edge] ?? []).filter((id) => isKnown.has(id));
    if (ids.length > 0) {
      layout.zones[edge].groups.push({ size: spec.sizes?.[edge] ?? DOCK.defaultGroupSize[edge], panels: ids.map((id) => ({ id, expanded: !collapsed.has(id), weight: 1 })) });
    }
  }
  (spec.floating ?? [])
    .filter((f) => isKnown.has(f.id))
    .forEach((f, i) => layout.floating.push({ id: f.id, width: f.width, height: f.height, ...place(i, f.width, f.height) }));
  const placed = new Set([...EDGES.flatMap((e) => spec[e] ?? []), ...(spec.floating ?? []).map((f) => f.id)]);
  layout.hidden = known.filter((id) => !placed.has(id));
  return normalize(layout);
}

/* ---------------------------------------------------------------- loading */

type Migration = (raw: Record<string, unknown>) => Record<string, unknown>;

/**
 * Migrations from version n to n + 1, keyed by n. Add one whenever the saved format changes
 * and bump LAYOUT_VERSION.
 */
export const MIGRATIONS: Record<number, Migration> = {};

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const num = (v: unknown, fallback: number) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);
const isEdge = (v: unknown): v is Edge => v === 'left' || v === 'right' || v === 'bottom';

function readPosition(v: unknown): DockPosition | undefined {
  if (!isObj(v) || !isEdge(v['edge'])) return undefined;
  return { edge: v['edge'], groupIndex: Math.max(0, Math.floor(num(v['groupIndex'], 0))), panelIndex: Math.max(0, Math.floor(num(v['panelIndex'], 0))) };
}

function readRect(v: Record<string, unknown>): FloatRect {
  const r: FloatRect = { x: num(v['x'], 0), y: num(v['y'], 0), width: num(v['width'], 320), height: num(v['height'], 400) };
  if (typeof v['monitorId'] === 'string') r.monitorId = v['monitorId'];
  return r;
}

/** Reads the current format leniently: wrong pieces are dropped, not the whole layout. */
function readLayout(raw: Record<string, unknown>): DockLayout {
  const layout = emptyLayout();
  const zones = isObj(raw['zones']) ? raw['zones'] : {};
  for (const edge of EDGES) {
    const z = zones[edge];
    if (!isObj(z)) continue;
    const groups: Group[] = [];
    for (const g of Array.isArray(z['groups']) ? z['groups'] : []) {
      if (!isObj(g) || !Array.isArray(g['panels'])) continue;
      const panels = g['panels'].filter(isObj).filter((p) => typeof p['id'] === 'string').map((p) => ({ id: p['id'] as string, expanded: p['expanded'] !== false, weight: num(p['weight'], 1) }));
      groups.push({ size: num(g['size'], DOCK.defaultGroupSize[edge]), panels });
    }
    const zone: DockZone = { edge, collapsed: z['collapsed'] === true, groups };
    layout.zones[edge] = zone;
  }
  for (const f of Array.isArray(raw['floating']) ? raw['floating'] : []) {
    if (!isObj(f) || typeof f['id'] !== 'string') continue;
    const fp: FloatingPanel = { id: f['id'], ...readRect(f) };
    const last = readPosition(f['lastDock']);
    if (last) fp.lastDock = last;
    layout.floating.push(fp);
  }
  layout.hidden = (Array.isArray(raw['hidden']) ? raw['hidden'] : []).filter((x): x is string => typeof x === 'string');
  if (isObj(raw['memory'])) {
    const memory: Record<string, PanelMemory> = {};
    for (const [id, m] of Object.entries(raw['memory'])) {
      if (!isObj(m)) continue;
      const dock = readPosition(m['dock']);
      if (m['mode'] === 'dock' && dock) memory[id] = { mode: 'dock', dock, ...(typeof m['size'] === 'number' ? { size: m['size'] } : {}) };
      if (m['mode'] === 'floating' && isObj(m['rect'])) {
        const last = readPosition(m['lastDock']);
        memory[id] = { mode: 'floating', rect: readRect(m['rect']), ...(last ? { lastDock: last } : {}) };
      }
    }
    layout.memory = memory;
  }
  return layout;
}

export interface LoadContext {
  /** Registered panel ids. Unknown ids in the saved layout are dropped. */
  known: readonly string[];
  /** The default layout; used for broken data and to place panels missing from the saved one. */
  defaults: DockLayout;
}

/**
 * Loads a saved layout: checks and migrates the version, drops unknown panel ids, inserts known
 * panels that are missing at their default place, normalizes. Anything unreadable, or a newer
 * version than this app knows, gives the default layout.
 */
export function loadLayout(saved: unknown, ctx: LoadContext): DockLayout {
  let raw: unknown = saved;
  if (typeof raw === 'string') {
    try {
      raw = JSON.parse(raw);
    } catch {
      return ctx.defaults;
    }
  }
  if (!isObj(raw)) return ctx.defaults;
  let version = num(raw['version'], 0);
  if (!Number.isInteger(version) || version < 0 || version > LAYOUT_VERSION) return ctx.defaults;
  let data = raw;
  while (version < LAYOUT_VERSION) {
    const m = MIGRATIONS[version];
    if (!m) return ctx.defaults;
    data = m(data);
    version++;
  }
  const known = new Set(ctx.known);
  let layout = readLayout(data);
  // Unknown ids out.
  for (const edge of EDGES) for (const g of layout.zones[edge].groups) g.panels = g.panels.filter((p) => known.has(p.id));
  layout.floating = layout.floating.filter((f) => known.has(f.id));
  layout.hidden = layout.hidden.filter((id) => known.has(id));
  layout = normalize(layout);
  // Missing ids in, at their default place.
  for (const id of ctx.known) if (!findPanel(layout, id)) layout = placeLikeDefault(layout, id, ctx.defaults);
  return layout;
}

function placeLikeDefault(layout: DockLayout, id: string, defaults: DockLayout): DockLayout {
  const loc = findPanel(defaults, id);
  if (loc?.kind === 'dock') {
    const groups = layout.zones[loc.edge].groups;
    const expanded = defaults.zones[loc.edge].groups[loc.groupIndex]!.panels[loc.panelIndex]!.expanded;
    const size = defaults.zones[loc.edge].groups[loc.groupIndex]!.size;
    if (groups.length === 0) return insertPanel(layout, id, { kind: 'newGroup', edge: loc.edge, groupIndex: 0 }, { size, expanded });
    const gi = Math.min(loc.groupIndex, groups.length - 1);
    return insertPanel(layout, id, { kind: 'intoGroup', edge: loc.edge, groupIndex: gi, panelIndex: Math.min(loc.panelIndex, groups[gi]!.panels.length) }, { expanded });
  }
  if (loc?.kind === 'floating') {
    const { id: _id, lastDock: _l, ...rect } = defaults.floating[loc.index]!;
    return floatPanel(layout, id, rect);
  }
  // Hidden by default (or not in the defaults at all).
  return normalize({ ...layout, hidden: [...layout.hidden, id] });
}

/* ---------------------------------------------------------------- screens */

export interface ScreenInfo {
  id: string;
  /** Work area in global logical pixels. */
  x: number;
  y: number;
  width: number;
  height: number;
}

const MIN_VISIBLE = 40;
const CASCADE = 40;

function visibleOn(f: FloatRect, s: ScreenInfo): boolean {
  const w = Math.min(f.x + f.width, s.x + s.width) - Math.max(f.x, s.x);
  const h = Math.min(f.y + f.height, s.y + s.height) - Math.max(f.y, s.y);
  return w >= MIN_VISIBLE && h >= MIN_VISIBLE;
}

/**
 * Floating windows whose monitor is gone, or that show less than 40 × 40 px on any screen,
 * move to the main window's screen, cascaded by 40 px each, and shrink to fit it.
 */
export function restoreFloating(layout: DockLayout, screens: readonly ScreenInfo[], mainScreen: ScreenInfo): DockLayout {
  const ids = new Set(screens.map((s) => s.id));
  let moved = 0;
  const floating = layout.floating.map((f) => {
    const monitorGone = f.monitorId !== undefined && !ids.has(f.monitorId);
    if (!monitorGone && screens.some((s) => visibleOn(f, s))) return f;
    moved++;
    const width = Math.min(f.width, Math.max(DOCK.minFloat.width, mainScreen.width - 2 * CASCADE));
    const height = Math.min(f.height, Math.max(DOCK.minFloat.height, mainScreen.height - 2 * CASCADE));
    const off = CASCADE * moved;
    return {
      ...f,
      width,
      height,
      x: Math.min(mainScreen.x + off, mainScreen.x + mainScreen.width - width),
      y: Math.min(mainScreen.y + off, mainScreen.y + mainScreen.height - height),
      monitorId: mainScreen.id,
    };
  });
  return moved === 0 ? layout : { ...layout, floating };
}
