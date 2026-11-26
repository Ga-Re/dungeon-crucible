/**
 * Paints a map's drawn walls (E-33) as a map picture: floors after the nearest wall, walls with
 * their texture, wavering outline, shadow and light edge, corner stones and pillars at joints and
 * ends, doors and – where the DM switched it on – the crack of an unfound secret door. With the
 * ground for a drawn map (it is its picture), without it over a picture map. The same for the DM
 * window and the TV, each from its own drawing (`dmDrawing`, `playerDrawing`).
 *
 * It is a `PaintedImage`: the renderer has each GPU tile painted on its own, so a drawn map of
 * any size never exists as one canvas. Everything is painted in map coordinates, so tiles meet.
 */
import { floorField, jitterRing, noise2, type FloorStyle, type Jitter } from '../core/build/handDrawn';
import { hashNoise, lineStrips, wearPaths } from '../core/build/variance';
import { FLOOR_REACH_CELLS, floorStep } from '../core/build/dirty';
import { buildGraph, doorSpan, masonryOutline, pointAt, type BuildDoor, type Masonry, type MasonryStyle } from '../core/build/masonry';
import type { DmDrawing, Drawing } from '../core/build/playerDrawing';
import type { Decal, PaintedImage } from './pixi/renderer';
import { floorSlot, groundSlot, type BuildTextures, type SurfaceSlot } from './build/textures';
import { surfaceSheet } from './build/variantSheet';
import { paintCliffs } from './cliffsPaint';
import { smoothLine } from '../core/build/water';
import type { Point } from '../core/geometry';
import { paintWater, paintWaterfalls } from './waterPaint';
import { paintShore, paintWallFeet, paintWornDoors } from './detailsPaint';

/** How each style's outline wavers, by its thickness. */
const WAVER: Record<MasonryStyle, { amplitude: number; scale: number }> = {
  'dungeon-stone': { amplitude: 0.06, scale: 2.2 },
  'cave-rock': { amplitude: 0.28, scale: 1.1 },
  brick: { amplitude: 0.05, scale: 2.5 },
  wood: { amplitude: 0.03, scale: 3 },
};

/** Map cells one texture tile covers: floors, wall surfaces. */
/** How far a painted floor's edge fades out, in cells (DC-107b). */
const FLOOR_FEATHER = 0.22;
const WALL_CELLS = 1;

const asMasonry = (w: Drawing['masonry'][number]): Masonry => ({ ...w, points: w.points.map((p) => ({ ...p })) });

function styleSeed(style: string): number {
  let h = 7;
  for (const ch of style) h = (h * 31 + ch.charCodeAt(0)) | 0;
  return h;
}

interface PreparedStyle {
  style: MasonryStyle;
  shape: Path2D;
  /** The outline's rings (with their waver), for the side faces of the 2.5D look. */
  rings: [number, number][][];
  thickness: number;
  joints: { x: number; y: number; angle: number; kind: 'joint' | 'end' }[];
  /** How high it stands (map px, E-35). */
  height: number;
  /** The lines of its fortified walls: battlements on them, towers at their joints. */
  fortified: { points: { x: number; y: number }[]; closed: boolean }[];
  /** The lowest point on the map: groups further down are painted later (over those behind). */
  bottom: number;
  /** Middles of the doors and windows in it: no tower stands in a gate. */
  openings: { x: number; y: number }[];
  /** The group's walls: their spines carry the texture along the line (DC-119b). */
  walls: Masonry[];
}

/** How high a wall stands by its style, in cells; a fortified wall is higher (E-35). */
const STYLE_HEIGHT: Record<MasonryStyle, number> = { 'dungeon-stone': 0.45, 'cave-rock': 0.35, brick: 0.45, wood: 0.3 };
const FORTIFIED_HEIGHT = 1.6;

/** How high a wall stands by its style and fortification, when it has no height of its own. */
export function defaultWallHeight(w: Pick<Masonry, 'style' | 'fortified'>, cell: number): number {
  return STYLE_HEIGHT[w.style] * cell * (w.fortified ? FORTIFIED_HEIGHT : 1);
}

function heightOf(w: Masonry, cell: number): number {
  return w.height ?? defaultWallHeight(w, cell);
}

function surfacePattern(g: CanvasRenderingContext2D, source: HTMLCanvasElement, cell: number, cells: number, seed: number): CanvasPattern | null {
  const pattern = g.createPattern(source, 'repeat');
  if (!pattern) return null;
  const k = (cell * cells) / source.width;
  // Each style starts its pattern elsewhere, so neighbouring styles do not line up.
  pattern.setTransform(new DOMMatrix().translate((seed & 255) * 3.1, ((seed >> 8) & 255) * 2.3).scale(k));
  return pattern;
}

/**
 * Fill for floors and natural ground (DC-119a): the composed variant sheet, repeating only
 * every SHEET_CELLS cells and aligned to the map's cells; `shift` moves it by whole cells, so
 * two patches of the same material do not line up.
 */
function sheetPattern(g: CanvasRenderingContext2D, slot: SurfaceSlot, tex: BuildTextures, cell: number, seed: number, shift: number): CanvasPattern | null {
  const pattern = g.createPattern(surfaceSheet(slot, tex, cell, seed), 'repeat');
  pattern?.setTransform(new DOMMatrix().translate((shift & 15) * cell, ((shift >> 4) & 15) * cell));
  return pattern;
}

interface Geometry {
  styles: PreparedStyle[];
  field: ReturnType<typeof floorField> | null;
  /** Per floor style: where it is nearest, softened once at sample size (drawn smoothly scaled up). */
  floorMasks: Map<FloorStyle, HTMLCanvasElement>;
  /** Where each floor style is, in map px (with its soft edge): tiles elsewhere skip it. */
  floorBoxes: Map<FloorStyle, { x: number; y: number; w: number; h: number }>;
  step: number;
  /** Near walls (map px): painted floors end sharp there, under the wall (DC-107b). */
  wallZone: Path2D;
  /** The worn ways between doors (DC-119a), map px. */
  wear: Point[][];
}

/**
 * What only the walls and where doors are decide – outlines, joints, floors – kept for the last
 * drawings: opening or closing a door repaints, but computes none of it again.
 */
const geometries = new Map<string, Geometry>();
const KEPT_GEOMETRIES = 4;

/** United, wavering outlines and joints per group of touching walls (map px). */
const groupOutlines = new Map<string, { shape: Path2D; rings: [number, number][][]; joints: PreparedStyle['joints'] }>();

function outlineOf(style: MasonryStyle, group: Masonry[], doors: BuildDoor[]): { shape: Path2D; rings: [number, number][][]; joints: PreparedStyle['joints'] } {
  const thickness = group.reduce((s, w) => s + w.thickness, 0) / group.length;
  // The waver differs per group (DC-119b): two straight walls never ripple alike.
  const jitter: Jitter = { step: Math.max(3, thickness / 3), amplitude: thickness * WAVER[style].amplitude, scale: thickness * WAVER[style].scale, seed: styleSeed(style) + group.reduce((a, w) => a + w.seed, 0) };
  const shape = new Path2D();
  const rings: [number, number][][] = [];
  for (const p of masonryOutline(group, doors))
    for (const ring of [p.outer, ...p.holes]) {
      const wavy = jitterRing(ring, jitter);
      rings.push(wavy);
      wavy.forEach(([x, y], i) => (i ? shape.lineTo(x, y) : shape.moveTo(x, y)));
      shape.closePath();
    }
  const joints = buildGraph(group).nodes.flatMap((n) => (n.kind === 'straight' ? [] : [{ x: n.x, y: n.y, angle: n.arms[0] ?? 0, kind: n.kind === 'end' ? ('end' as const) : ('joint' as const) }]));
  return { shape, rings, joints };
}

/** Walls whose areas (with their thickness) overlap, gathered into groups. */
function touchingGroups(walls: Masonry[]): Masonry[][] {
  const box = walls.map((w) => {
    const xs = w.points.map((p) => p.x);
    const ys = w.points.map((p) => p.y);
    const t = w.thickness;
    return [Math.min(...xs) - t, Math.min(...ys) - t, Math.max(...xs) + t, Math.max(...ys) + t];
  });
  const parent = walls.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  for (let i = 0; i < walls.length; i++)
    for (let j = i + 1; j < walls.length; j++) {
      const a = box[i];
      const b = box[j];
      if (a[0] <= b[2] && b[0] <= a[2] && a[1] <= b[3] && b[1] <= a[3]) parent[find(i)] = find(j);
    }
  const groups = new Map<number, Masonry[]>();
  walls.forEach((w, i) => (groups.get(find(i)) ?? groups.set(find(i), []).get(find(i))!).push(w));
  return [...groups.values()];
}

function geometryOf(drawing: Drawing | DmDrawing, withGround: boolean, cell: number, walls: Masonry[]): Geometry {
  const key = JSON.stringify([drawing.origin, drawing.width, drawing.height, drawing.masonry, drawing.doors.map((d) => [d.wall, d.at, d.width]), withGround, cell]);
  const hit = geometries.get(key);
  if (hit) return hit;
  const { x: ox, y: oy } = drawing.origin;
  const width = Math.max(1, Math.ceil(drawing.width));
  const height = Math.max(1, Math.ceil(drawing.height));

  // Walls, one style at a time: united, cut open where doors are shown (unfound secret doors were never sent).
  const shownDoors = (ws: Masonry[]) => ws.flatMap((w) => drawing.doors.filter((d) => d.wall === w.id).map((d, i) => ({ id: `d${i}`, wall: w.id, at: d.at, width: d.width, secret: false, crack: false })));
  // Walls that touch are united together; groups that did not change are taken as they were.
  const used = new Set<string>();
  // Each group of touching walls of a style stands at its own height (E-35).
  const styles: PreparedStyle[] = [...new Set(walls.map((w) => w.style))].flatMap((style) =>
    touchingGroups(walls.filter((w) => w.style === style)).map((group) => {
      const doors = shownDoors(group);
      const key = JSON.stringify([style, group, doors]);
      used.add(key);
      let built = groupOutlines.get(key);
      if (!built) {
        built = outlineOf(style, group, doors);
        groupOutlines.set(key, built);
      }
      const thickness = group.reduce((s, w) => s + w.thickness, 0) / group.length;
      const height = Math.max(...group.map((w) => heightOf(w, cell)));
      const fortified = group.filter((w) => w.fortified).map((w) => ({ points: w.points, closed: w.closed }));
      const bottom = Math.max(...group.flatMap((w) => w.points.map((p) => p.y)));
      const openings = doors.map((d) => {
        const wall = group.find((w) => w.id === d.wall)!;
        return pointAt(wall.points, wall.closed, d.at);
      });
      return { style, shape: built.shape, rings: built.rings, thickness, joints: built.joints, height, fortified, bottom, openings, walls: group };
    }),
  ).sort((a, b) => a.bottom - b.bottom);
  // Groups no drawing uses any more go.
  if (groupOutlines.size > used.size * 2 + 64) for (const k of groupOutlines.keys()) if (!used.has(k)) groupOutlines.delete(k);

  // Floors after the nearest wall: a small mask per style, softened at its own size.
  const step = floorStep({ width, height }, cell);
  const field = withGround ? floorField(walls, { x: ox, y: oy, w: width, h: height }, step, FLOOR_REACH_CELLS * cell) : null;
  const floorMasks = new Map<FloorStyle, HTMLCanvasElement>();
  if (field)
    for (const style of new Set(field.styles)) {
      const raw = document.createElement('canvas');
      raw.width = field.cols;
      raw.height = field.rows;
      const r = raw.getContext('2d')!;
      const img = r.createImageData(field.cols, field.rows);
      field.styles.forEach((s, i) => {
        if (s === style) img.data[i * 4 + 3] = 255;
      });
      r.putImageData(img, 0, 0);
      const soft = document.createElement('canvas');
      soft.width = field.cols;
      soft.height = field.rows;
      const g = soft.getContext('2d')!;
      g.filter = 'blur(1px)';
      g.drawImage(raw, 0, 0);
      floorMasks.set(style, soft);
    }
  const floorBoxes = new Map<FloorStyle, { x: number; y: number; w: number; h: number }>();
  if (field) {
    const box = new Map<FloorStyle, [number, number, number, number]>();
    field.styles.forEach((s, i) => {
      const c = i % field.cols;
      const r = Math.floor(i / field.cols);
      const b = box.get(s);
      if (!b) box.set(s, [c, r, c, r]);
      else box.set(s, [Math.min(b[0], c), Math.min(b[1], r), Math.max(b[2], c), Math.max(b[3], r)]);
    });
    // Two samples of room for the softened edge.
    for (const [s, [c0, r0, c1, r1]] of box) floorBoxes.set(s, { x: ox + (c0 - 2) * step, y: oy + (r0 - 2) * step, w: (c1 - c0 + 5) * step, h: (r1 - r0 + 5) * step });
  }
  // Where painted floors end sharp: the walls widened by a soft edge's reach.
  const wallZone = new Path2D();
  for (const p of masonryOutline(walls.map((w) => ({ ...w, thickness: w.thickness + cell * FLOOR_FEATHER * 2 })), []))
    for (const ring of [p.outer, ...p.holes]) {
      ring.forEach(([x, y], i) => (i ? wallZone.lineTo(x, y) : wallZone.moveTo(x, y)));
      wallZone.closePath();
    }
  // The worn ways between the doors' midpoints (DC-119a); windows wear nothing.
  const wallsById = new Map(walls.map((w) => [w.id, w]));
  const doorMids = drawing.doors.flatMap((d) => {
    const wall = wallsById.get(d.wall);
    if (!wall || ('window' in d && d.window)) return [];
    const span = doorSpan(wall, { id: '', wall: wall.id, at: d.at, width: d.width, secret: false, crack: false });
    const a = pointAt(wall.points, wall.closed, span.from);
    const b = pointAt(wall.points, wall.closed, span.to);
    return [{ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }];
  });
  const wear = wearPaths(walls, doorMids, { x: ox, y: oy, w: width, h: height }, cell);
  const geometry = { styles, field, floorMasks, floorBoxes, step, wallZone, wear };
  geometries.set(key, geometry);
  if (geometries.size > KEPT_GEOMETRIES) geometries.delete(geometries.keys().next().value!);
  return geometry;
}

/** The worn ways between doors (DC-119a): a soft, darker trail ground into the floor. */
function paintWearPaths(g: CanvasRenderingContext2D, wear: Point[][], cell: number): void {
  if (!wear.length) return;
  g.save();
  g.globalCompositeOperation = 'multiply';
  g.lineCap = 'round';
  g.lineJoin = 'round';
  for (const path of wear) {
    // A light wander across the walking direction: no dead-straight trails.
    const line = smoothLine(path, false, 2).map((p, i, all) => {
      const a = all[Math.max(0, i - 1)];
      const b = all[Math.min(all.length - 1, i + 1)];
      const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
      const w = noise2(p.x / (cell * 2.6), p.y / (cell * 2.6), 23) * cell * 0.3;
      return { x: p.x + (-(b.y - a.y) / len) * w, y: p.y + ((b.x - a.x) / len) * w };
    });
    g.beginPath();
    line.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y)));
    g.strokeStyle = 'rgba(82,66,46,0.16)';
    g.lineWidth = cell * 0.6;
    g.stroke();
    g.strokeStyle = 'rgba(74,58,40,0.18)';
    g.lineWidth = cell * 0.26;
    g.stroke();
  }
  g.restore();
}

export function paintedDrawing(drawing: Drawing | DmDrawing, withGround: boolean, cell: number, tex: BuildTextures): PaintedImage {
  const { x: ox, y: oy } = drawing.origin;
  const width = Math.max(1, Math.ceil(drawing.width));
  const height = Math.max(1, Math.ceil(drawing.height));
  const { styles, field, floorMasks, floorBoxes, wallZone, wear } = geometryOf(drawing, withGround, cell, drawing.masonry.map(asMasonry));
  const patches = drawing.floors.map((f) => {
    const shape = new Path2D();
    for (const p of f.shape)
      for (const ring of [p.outer, ...p.holes]) {
        ring.forEach(([x, y], i) => (i ? shape.lineTo(x, y) : shape.moveTo(x, y)));
        shape.closePath();
      }
    const xs = f.shape.flatMap((p) => p.outer.map(([x]) => x));
    const ys = f.shape.flatMap((p) => p.outer.map(([, y]) => y));
    return { style: f.style, seed: f.seed, shape, box: { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) } };
  });

  /**
   * Painted floors over the automatic ones: their edge fades out softly, but near walls it ends
   * sharp – there the wall covers it, so a floor painted up to a wall meets it cleanly.
   */
  const paintPatches = (g: CanvasRenderingContext2D, left: number, top: number, w: number, h: number) => {
    const feather = cell * FLOOR_FEATHER;
    for (const p of patches) {
      if (p.box.x - feather > left + w || p.box.y - feather > top + h || p.box.x + p.box.w + feather < left || p.box.y + p.box.h + feather < top) continue;
      const fill = sheetPattern(g, floorSlot(p.style), tex, cell, styleSeed(p.style), p.seed) ?? '#77705f';
      // Soft: the floor masked by its blurred shape.
      const layer = document.createElement('canvas');
      layer.width = w;
      layer.height = h;
      const l = layer.getContext('2d')!;
      l.setTransform(1, 0, 0, 1, -left, -top);
      l.fillStyle = '#fff';
      l.filter = `blur(${Math.max(1, Math.round(feather / 2))}px)`;
      l.fill(p.shape, 'evenodd');
      l.filter = 'none';
      l.globalCompositeOperation = 'source-in';
      l.fillStyle = sheetPattern(l, floorSlot(p.style), tex, cell, styleSeed(p.style), p.seed) ?? '#77705f';
      l.fillRect(left, top, w, h);
      g.drawImage(layer, left, top);
      // Sharp near walls.
      g.save();
      g.clip(p.shape, 'evenodd');
      g.clip(wallZone, 'nonzero');
      g.fillStyle = fill;
      g.fillRect(left, top, w, h);
      g.restore();
    }
  };

  // Where natural ground lies (not a wall's floor): plants grow at the foot of walls there (E-35).
  const onGround = (p: { x: number; y: number }) => {
    if (!field) return false;
    const c = Math.floor((p.x - ox) / field.step);
    const r = Math.floor((p.y - oy) / field.step);
    return c >= 0 && r >= 0 && c < field.cols && r < field.rows && field.styles[r * field.cols + c] === 'ground';
  };
  // Worn ground in front of doors (not windows).
  const wallsById = new Map(drawing.masonry.map((m) => [m.id, asMasonry(m)]));
  const wornDoors = drawing.doors.flatMap((d) => {
    const wall = wallsById.get(d.wall);
    if (!wall || ('window' in d && d.window)) return [];
    const span = doorSpan(wall, { id: '', wall: wall.id, at: d.at, width: d.width, secret: false, crack: false });
    return [{ a: pointAt(wall.points, wall.closed, span.from), b: pointAt(wall.points, wall.closed, span.to) }];
  });

  // Natural ground after the biome far from walls (E-34); a wall's floor near it.
  const floorSlotOf = (style: FloorStyle): SurfaceSlot => (style === 'ground' ? groundSlot(drawing.biome) : `floor-${style}`);

  const paintFloors = (g: CanvasRenderingContext2D, left: number, top: number, w: number, h: number) => {
    if (!field) return;
    // The first style covers everything, so where soft edges overlap nothing shows through;
    // the others are blended over it – only where they are.
    const [base, ...others] = [...floorMasks.keys()];
    g.fillStyle = sheetPattern(g, floorSlotOf(base), tex, cell, styleSeed(base), 0) ?? '#77705f';
    g.fillRect(left, top, w, h);
    let layer: CanvasRenderingContext2D | null = null;
    for (const style of others) {
      const box = floorBoxes.get(style)!;
      const x0 = Math.max(left, box.x);
      const y0 = Math.max(top, box.y);
      const x1 = Math.min(left + w, box.x + box.w);
      const y1 = Math.min(top + h, box.y + box.h);
      if (x1 <= x0 || y1 <= y0) continue;
      if (!layer) {
        const c = document.createElement('canvas');
        c.width = w;
        c.height = h;
        layer = c.getContext('2d')!;
      }
      const l = layer;
      l.globalCompositeOperation = 'source-over';
      l.setTransform(1, 0, 0, 1, -left, -top);
      l.clearRect(x0, y0, x1 - x0, y1 - y0);
      l.fillStyle = sheetPattern(l, floorSlotOf(style), tex, cell, styleSeed(style), 0) ?? '#77705f';
      l.fillRect(x0, y0, x1 - x0, y1 - y0);
      // Keep it only where this style is nearest; scaled up smoothly, its softened edge blends.
      l.globalCompositeOperation = 'destination-in';
      l.imageSmoothingEnabled = true;
      l.imageSmoothingQuality = 'high';
      l.save();
      l.beginPath();
      l.rect(x0, y0, x1 - x0, y1 - y0);
      l.clip();
      l.drawImage(floorMasks.get(style)!, ox, oy, field.cols * field.step, field.rows * field.step);
      l.restore();
      g.drawImage(l.canvas, x0 - left, y0 - top, x1 - x0, y1 - y0, x0, y0, x1 - x0, y1 - y0);
    }
  };

  // The light (E-35): where it falls towards; walls cast their shadows that way.
  const la = ((drawing.lightAngle ?? 45) * Math.PI) / 180;
  const light = { x: Math.cos(la), y: Math.sin(la) };
  // The side faces seen in the 2.5D look face down the map: lit when the light comes from below.
  const sideLit = Math.max(0, -light.y);

  /**
   * Lays a texture along a line (DC-119b): slices of the picture, each turned to the line's
   * direction, their source window moving with the walked distance – courses of stone bend with
   * the wall instead of running straight through the map.
   */
  const paintAlong = (g: CanvasRenderingContext2D, src: HTMLCanvasElement, points: readonly Point[], closed: boolean, across: number, seed: number) => {
    const step = Math.max(6, cell * 0.45);
    const perPx = src.width / (cell * WALL_CELLS);
    const sh = Math.min(src.height, Math.max(8, across * perPx));
    const sy = Math.floor(hashNoise(seed, 3, 17) * (src.height - sh));
    const w = step * 1.7;
    const sw = w * perPx;
    for (const p of lineStrips(points, closed, step)) {
      let sx = ((p.u + seed * 53) * perPx) % src.width;
      if (sx < 0) sx += src.width;
      g.save();
      g.translate(p.x, p.y);
      g.rotate(p.angle);
      if (sx + sw <= src.width) g.drawImage(src, sx, sy, sw, sh, -w / 2, -across / 2, w, across);
      else {
        const first = (src.width - sx) / perPx;
        g.drawImage(src, sx, sy, src.width - sx, sh, -w / 2, -across / 2, first, across);
        g.drawImage(src, 0, sy, sw - (src.width - sx), sh, -w / 2 + first, -across / 2, w - first, across);
      }
      g.restore();
    }
  };

  const lengthOf = (points: readonly Point[], closed: boolean): number => {
    const pts = closed ? [...points, points[0]] : points;
    let len = 0;
    for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
    return len;
  };

  /** Cracks and missing stones on a decayed wall's top (DC-119b). */
  const paintWallDecay = (g: CanvasRenderingContext2D, w: Masonry) => {
    const decay = w.decay ?? 0;
    const len = lengthOf(w.points, w.closed);
    g.save();
    g.lineCap = 'round';
    g.strokeStyle = 'rgba(10,8,6,.5)';
    g.lineWidth = 1.2;
    for (let i = 0, n = Math.ceil((len / cell) * decay * 0.8); i < n; i++) {
      const at = pointAt(w.points, w.closed, hashNoise(i, 11, w.seed) * len);
      let a = hashNoise(i, 12, w.seed) * Math.PI * 2;
      g.beginPath();
      g.moveTo(at.x, at.y);
      let x = at.x;
      let y = at.y;
      for (let k = 0; k < 4; k++) {
        a += (hashNoise(i * 7 + k, 13, w.seed) - 0.5) * 1.6;
        x += Math.cos(a) * w.thickness * 0.5;
        y += Math.sin(a) * w.thickness * 0.5;
        g.lineTo(x, y);
      }
      g.stroke();
    }
    // Bites out of the edge: dark gaps where stones are gone.
    g.fillStyle = 'rgba(12,10,8,.55)';
    for (let i = 0, n = Math.ceil((len / cell) * decay * 0.7); i < n; i++) {
      const at = pointAt(w.points, w.closed, hashNoise(i, 14, w.seed) * len);
      const side = hashNoise(i, 15, w.seed) > 0.5 ? 1 : -1;
      const next = pointAt(w.points, w.closed, Math.min(len, hashNoise(i, 14, w.seed) * len + 1));
      const nx = -(next.y - at.y);
      const ny = next.x - at.x;
      const nl = Math.hypot(nx, ny) || 1;
      const r = w.thickness * (0.14 + hashNoise(i, 16, w.seed) * 0.16);
      g.beginPath();
      g.arc(at.x + (nx / nl) * side * (w.thickness / 2), at.y + (ny / nl) * side * (w.thickness / 2), r, 0, Math.PI * 2);
      g.fill();
    }
    g.restore();
  };

  /** Fallen stones on the ground beside a decayed wall (DC-119b). */
  const paintWallScree = (g: CanvasRenderingContext2D, w: Masonry) => {
    const decay = w.decay ?? 0;
    const len = lengthOf(w.points, w.closed);
    g.save();
    g.strokeStyle = 'rgba(20,16,12,.5)';
    g.lineWidth = 1;
    for (let i = 0, n = Math.ceil((len / cell) * decay * 1.6); i < n; i++) {
      const u = hashNoise(i, 21, w.seed) * len;
      const at = pointAt(w.points, w.closed, u);
      const next = pointAt(w.points, w.closed, Math.min(len, u + 1));
      const nx = -(next.y - at.y);
      const ny = next.x - at.x;
      const nl = Math.hypot(nx, ny) || 1;
      const side = hashNoise(i, 22, w.seed) > 0.5 ? 1 : -1;
      const d = w.thickness * (0.8 + hashNoise(i, 23, w.seed) * 1.4);
      const r = cell * (0.035 + hashNoise(i, 24, w.seed) * 0.05);
      g.fillStyle = hashNoise(i, 25, w.seed) > 0.5 ? '#8a8276' : '#79716a';
      g.beginPath();
      g.ellipse(at.x + (nx / nl) * side * d, at.y + (ny / nl) * side * d, r, r * 0.8, hashNoise(i, 26, w.seed) * 3, 0, Math.PI * 2);
      g.fill();
      g.stroke();
    }
    g.restore();
  };

  const paintWalls = (g: CanvasRenderingContext2D) => {
    // Shadows first, all of them: no shadow lies on a wall painted before it.
    for (const s of styles) {
      for (const [k, alpha] of [[1, 0.14], [0.55, 0.2]] as const) {
        g.save();
        g.translate(light.x * (s.height * k + s.thickness * 0.3), light.y * (s.height * k + s.thickness * 0.3));
        g.fillStyle = `rgba(0,0,0,${alpha})`;
        g.fill(s.shape, 'nonzero');
        g.restore();
      }
    }
    for (const s of styles) {
      const t = s.thickness;
      const up = s.height;
      const pattern = surfacePattern(g, tex.surface[`wall-${s.style}`], cell, WALL_CELLS, styleSeed(s.style)) ?? '#5b5650';
      // Fallen stones lie on the ground, under the wall's body.
      for (const w of s.walls) if (w.decay) paintWallScree(g, w);
      // The foot: a dark line grounds the wall on the floor (DC-119b).
      g.strokeStyle = 'rgba(0,0,0,.2)';
      g.lineWidth = Math.max(2, t * 0.22);
      g.stroke(s.shape);
      // The side face: each outline edge swept up to the top.
      const side = new Path2D();
      for (const ring of s.rings)
        ring.forEach(([x, y], i) => {
          const [nx, ny] = ring[(i + 1) % ring.length];
          side.moveTo(x, y);
          side.lineTo(nx, ny);
          side.lineTo(nx, ny - up);
          side.lineTo(x, y - up);
          side.closePath();
        });
      g.fillStyle = pattern;
      g.fill(side, 'nonzero');
      g.fillStyle = `rgba(14,11,8,${0.58 - sideLit * 0.3})`;
      g.fill(side, 'nonzero');
      // The top, raised by the wall's height.
      g.save();
      g.translate(0, -up);
      g.fillStyle = pattern;
      g.fill(s.shape, 'nonzero');
      // The texture follows each wall's line (DC-119b): courses bend with it; variants per wall.
      const variants = tex.variants[`wall-${s.style}`] ?? [tex.surface[`wall-${s.style}`]];
      g.save();
      g.clip(s.shape, 'nonzero');
      for (const w of s.walls) paintAlong(g, variants[Math.floor(hashNoise(w.seed, 1, 7) * variants.length)], w.points, w.closed, Math.max(w.thickness * 1.9, t), w.seed);
      g.restore();
      g.fillStyle = 'rgba(20,16,12,.24)';
      g.fill(s.shape, 'nonzero');
      // A light edge on the side the light comes from, then the outline.
      g.save();
      g.translate(-light.x * 1.2, -light.y * 1.2);
      g.strokeStyle = 'rgba(255,245,225,.32)';
      g.lineWidth = 1.5;
      g.stroke(s.shape);
      g.restore();
      g.strokeStyle = 'rgba(18,14,10,.8)';
      g.lineWidth = Math.max(1.5, t * 0.12);
      g.stroke(s.shape);
      // Corner stones and pillars for built walls; rock needs none.
      if (s.style !== 'cave-rock')
        for (const j of s.joints) {
          const part = j.kind === 'end' ? tex.part['part-pillar'] : tex.part['part-cornerstone'];
          const size = t * (j.kind === 'end' ? 1.35 : 1.25) * (s.style === 'wood' ? 0.85 : 1);
          g.save();
          g.translate(j.x, j.y);
          g.rotate(j.angle);
          g.drawImage(part, -size / 2, -size / 2, size, size);
          g.restore();
        }
      // What has fallen into decay (DC-119b): cracks and missing stones on the top.
      for (const w of s.walls) if (w.decay) paintWallDecay(g, w);
      // Battlements along fortified walls.
      for (const f of s.fortified) paintBattlements(g, f.points, f.closed, t, pattern, s.openings, cell);
      g.restore();
      // Towers where fortified walls meet or end, and along long stretches.
      if (s.fortified.length) for (const at of towerPlaces(s.fortified, s.joints, cell, s.openings)) paintTower(g, at, t * 1.6, up * 1.35, pattern, sideLit);
    }
  };

  return {
    width,
    height,
    paint(g, left, top, w, h) {
      g.save();
      // From here on in map coordinates.
      g.translate(-left - ox, -top - oy);
      paintFloors(g, left + ox, top + oy, w, h);
      paintPatches(g, left + ox, top + oy, w, h);
      if (drawing.autoGrowth !== false) paintWearPaths(g, wear, cell);
      paintWornDoors(g, wornDoors, cell);
      // Water lies in the ground (E-35); cliffs over it, waterfalls where rivers fall over them.
      paintWater(g, drawing.waters, cell, tex);
      if (drawing.autoShore !== false) paintShore(g, drawing.waters, cell, tex, drawing.biome);
      // Cliffs and slopes lie on the ground, under the walls (E-34).
      paintCliffs(g, drawing.cliffs, drawing.biome, cell, tex, drawing.lightAngle ?? 45);
      paintWaterfalls(g, drawing.waters, drawing.cliffs, cell);
      if (drawing.autoGrowth !== false) paintWallFeet(g, drawing.masonry, cell, tex, drawing.biome, onGround);
      paintWalls(g);
      g.restore();
    },
  };
}

/* ---------- Doors and cracks: pictures of their own over the walls ---------- */

const decalPictures = new Map<string, HTMLCanvasElement>();

/** A small picture, made once per look. */
function picture(key: string, w: number, h: number, draw: (g: CanvasRenderingContext2D) => void): HTMLCanvasElement {
  const hit = decalPictures.get(key);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(w));
  c.height = Math.max(1, Math.ceil(h));
  draw(c.getContext('2d')!);
  decalPictures.set(key, c);
  return c;
}

/** A window from above: a dark frame, light glass, a mullion in the middle (E-35). */
function windowPicture(): HTMLCanvasElement {
  return picture('window', 96, 32, (g) => {
    g.fillStyle = '#2b2219';
    g.fillRect(0, 0, 96, 32);
    const glass = g.createLinearGradient(0, 6, 0, 26);
    glass.addColorStop(0, 'rgba(206,230,242,.95)');
    glass.addColorStop(1, 'rgba(140,182,206,.95)');
    g.fillStyle = glass;
    g.fillRect(6, 9, 84, 14);
    g.fillStyle = '#2b2219';
    g.fillRect(45, 6, 6, 20);
  });
}

/** The DM's mark of a secret door: a dashed frame (never sent to the TV). */
function secretMark(): HTMLCanvasElement {
  return picture('secret', 64, 32, (g) => {
    g.strokeStyle = '#a77bf3';
    g.lineWidth = 3;
    g.setLineDash([8, 5]);
    g.strokeRect(2, 2, 60, 28);
  });
}

/** A faint, jagged crack across a wall: visible, but only to those who look. */
function crack(len: number, thickness: number): HTMLCanvasElement {
  const w = Math.round(len);
  const h = Math.round(thickness);
  return picture(`crack:${w}:${h}`, w, h, (g) => {
    const n = Math.max(4, Math.round(len / (thickness * 0.5)));
    const zig = thickness * 0.18;
    const pts = Array.from({ length: n + 1 }, (_, i) => [(w * i) / n, h / 2 + (i === 0 || i === n ? 0 : i % 2 ? zig : -zig)] as const);
    for (const [color, lw, d] of [['rgba(255,240,220,.18)', 1, -0.8], ['rgba(10,8,6,.75)', 1.6, 0]] as const) {
      g.strokeStyle = color;
      g.lineWidth = lw;
      g.beginPath();
      pts.forEach(([x, y], i) => (i ? g.lineTo(x + d, y + d) : g.moveTo(x + d, y + d)));
      g.stroke();
    }
  });
}

/** Doors (open ones stand at a right angle, hinged at one end), cracks and the DM's secret marks. */
export function drawingDecals(drawing: Drawing | DmDrawing, tex: BuildTextures): Decal[] {
  const byId = new Map(drawing.masonry.map((w) => [w.id, asMasonry(w)]));
  const spanOf = (wall: Masonry, at: number, width: number) => {
    const span = doorSpan(wall, { id: '', wall: wall.id, at, width, secret: false, crack: false });
    const a = pointAt(wall.points, wall.closed, span.from);
    const b = pointAt(wall.points, wall.closed, span.to);
    return { a, b, len: Math.hypot(b.x - a.x, b.y - a.y), angle: Math.atan2(b.y - a.y, b.x - a.x) };
  };
  const out: Decal[] = [];
  for (const d of drawing.doors) {
    const wall = byId.get(d.wall);
    if (!wall) continue;
    const { a, b, len, angle } = spanOf(wall, d.at, d.width);
    if (len <= 0) continue;
    if ('window' in d && d.window) {
      // A window: a frame with light glass, across the wall's whole thickness.
      out.push({ image: windowPicture(), x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, width: len, height: wall.thickness * 1.05, rotation: angle });
      continue;
    }
    const leaf = wall.thickness * 0.55;
    const turn = d.open ? angle + Math.PI / 2 : angle;
    out.push({ image: tex.part['part-door'], x: a.x + (Math.cos(turn) * len) / 2, y: a.y + (Math.sin(turn) * len) / 2, width: len, height: leaf, rotation: turn });
    if ('secret' in d && d.secret) out.push({ image: secretMark(), x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, width: len, height: wall.thickness * 1.2, rotation: angle });
  }
  for (const k of drawing.cracks) {
    const wall = byId.get(k.wall);
    if (!wall) continue;
    const { a, b, len, angle } = spanOf(wall, k.at, k.width);
    if (len > 0) out.push({ image: crack(len, wall.thickness), x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, width: len, height: wall.thickness, rotation: angle });
  }
  return out;
}

/** The drawing scaled by `k` (a small preview paints it at its own size, never as a full-size picture). */
function scaled<D extends Drawing | DmDrawing>(d: D, k: number): D {
  return {
    ...d,
    origin: { x: d.origin.x * k, y: d.origin.y * k },
    width: d.width * k,
    height: d.height * k,
    masonry: d.masonry.map((w) => ({ ...w, thickness: w.thickness * k, points: w.points.map((p) => ({ x: p.x * k, y: p.y * k })) })),
    doors: d.doors.map((x) => ({ ...x, at: x.at * k, width: x.width * k })),
    cracks: d.cracks.map((x) => ({ ...x, at: x.at * k, width: x.width * k })),
    cliffs: d.cliffs.map((c) => ({ ...c, width: c.width * k, points: c.points.map((p) => ({ x: p.x * k, y: p.y * k })) })),
    waters: d.waters.map((w) => ({ ...w, width: w.width * k, points: w.points.map((p) => ({ x: p.x * k, y: p.y * k })) })),
    floors: d.floors.map((f) => ({ ...f, shape: f.shape.map((p) => ({ outer: p.outer.map(([x, y]) => [x * k, y * k] as [number, number]), holes: p.holes.map((h) => h.map(([x, y]) => [x * k, y * k] as [number, number])) })) })),
  };
}

/** A preview of a drawn map, at most `side` px on its longer side (the catalog's cards). */
export function drawingPreview(drawing: Drawing | DmDrawing, cell: number, tex: BuildTextures, side: number): HTMLCanvasElement {
  const k = Math.min(1, side / Math.max(drawing.width, drawing.height, 1));
  const small = scaled(drawing, k);
  const picture = paintedDrawing(small, true, cell * k, tex);
  const c = document.createElement('canvas');
  c.width = picture.width;
  c.height = picture.height;
  picture.paint(c.getContext('2d')!, 0, 0, c.width, c.height);
  // Doors on top, as the map shows them.
  const g = c.getContext('2d')!;
  g.translate(-small.origin.x, -small.origin.y);
  for (const d of drawingDecals(small, tex)) {
    g.save();
    g.translate(d.x, d.y);
    g.rotate(d.rotation);
    g.drawImage(d.image, -d.width / 2, -d.height / 2, d.width, d.height);
    g.restore();
  }
  return c;
}

/* ---------- Fortified walls (E-35) ---------- */

/** Merlons along a wall's top: small blocks with gaps (the caller has raised the context). */
function paintBattlements(g: CanvasRenderingContext2D, points: readonly { x: number; y: number }[], closed: boolean, t: number, pattern: CanvasPattern | string, openings: readonly { x: number; y: number }[], cell: number): void {
  const size = t * 0.55;
  const gap = t * 1.15;
  const pts = closed ? [...points, points[0]] : points;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    const angle = Math.atan2(b.y - a.y, b.x - a.x);
    for (let s = gap / 2; s < len; s += gap) {
      const x = a.x + ((b.x - a.x) * s) / len;
      const y = a.y + ((b.y - a.y) * s) / len;
      // None over a gate or window.
      if (openings.some((q) => Math.hypot(q.x - x, q.y - y) < cell * 0.8)) continue;
      g.save();
      g.translate(x, y);
      g.rotate(angle);
      g.fillStyle = pattern;
      g.fillRect(-size / 2, -size / 2, size, size);
      g.fillStyle = 'rgba(255,245,225,.18)';
      g.fillRect(-size / 2, -size / 2, size, size);
      g.strokeStyle = 'rgba(18,14,10,.85)';
      g.lineWidth = 1.2;
      g.strokeRect(-size / 2, -size / 2, size, size);
      g.restore();
    }
  }
}

/** Where towers stand: at the joints and ends of fortified walls, and every six cells along them. */
function towerPlaces(lines: readonly { points: readonly { x: number; y: number }[]; closed: boolean }[], joints: PreparedStyle['joints'], cell: number, openings: readonly { x: number; y: number }[] = []): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  // Not next to another tower, and never in a gate or window.
  const near = (p: { x: number; y: number }) => out.some((q) => Math.hypot(q.x - p.x, q.y - p.y) < cell * 2) || openings.some((q) => Math.hypot(q.x - p.x, q.y - p.y) < cell * 1.5);
  const onFortified = (p: { x: number; y: number }) => lines.some((l) => l.points.some((q) => Math.hypot(q.x - p.x, q.y - p.y) < 1));
  for (const j of joints) if (onFortified(j) && !near(j)) out.push({ x: j.x, y: j.y });
  for (const l of lines) {
    const pts = l.closed ? [...l.points, l.points[0]] : l.points;
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1];
      const b = pts[i];
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      const n = Math.floor(len / (cell * 6));
      for (let k = 1; k <= n; k++) {
        const p = { x: a.x + ((b.x - a.x) * k) / (n + 1), y: a.y + ((b.y - a.y) * k) / (n + 1) };
        if (!near(p)) out.push(p);
      }
    }
  }
  return out;
}

/** A round tower: its side as a band up to its top, the top with a ring of merlons. */
function paintTower(g: CanvasRenderingContext2D, at: { x: number; y: number }, r: number, up: number, pattern: CanvasPattern | string, sideLit: number): void {
  g.save();
  g.translate(at.x, at.y);
  // The side: the base circle swept up.
  const side = new Path2D();
  side.arc(0, 0, r, 0, Math.PI);
  side.lineTo(-r, -up);
  side.arc(0, -up, r, Math.PI, 0, true);
  side.closePath();
  g.fillStyle = pattern;
  g.fill(side);
  g.fillStyle = `rgba(14,11,8,${0.55 - sideLit * 0.3})`;
  g.fill(side);
  g.strokeStyle = 'rgba(18,14,10,.85)';
  g.lineWidth = 1.5;
  g.stroke(side);
  // The top.
  g.beginPath();
  g.arc(0, -up, r, 0, Math.PI * 2);
  g.fillStyle = pattern;
  g.fill();
  g.fillStyle = 'rgba(20,16,12,.18)';
  g.fill();
  g.stroke();
  // Merlons round its rim.
  const n = Math.max(6, Math.round((r * Math.PI * 2) / (r * 0.7)));
  for (let k = 0; k < n; k += 2) {
    const a = (k / n) * Math.PI * 2;
    g.save();
    g.translate(Math.cos(a) * r * 0.82, -up + Math.sin(a) * r * 0.82);
    g.rotate(a);
    g.fillStyle = pattern;
    g.fillRect(-r * 0.16, -r * 0.2, r * 0.32, r * 0.4);
    g.strokeRect(-r * 0.16, -r * 0.2, r * 0.32, r * 0.4);
    g.restore();
  }
  g.restore();
}
