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
import { floorField, jitterRing, type FloorStyle, type Jitter } from '../core/build/handDrawn';
import { FLOOR_REACH_CELLS, floorStep } from '../core/build/dirty';
import { buildGraph, doorSpan, masonryOutline, pointAt, type BuildDoor, type Masonry, type MasonryStyle } from '../core/build/masonry';
import type { DmDrawing, Drawing } from '../core/build/playerDrawing';
import type { Decal, PaintedImage } from './pixi/renderer';
import { groundSlot, type BuildTextures } from './build/textures';
import { paintCliffs } from './cliffsPaint';
import { paintWater, paintWaterfalls } from './waterPaint';

/** How each style's outline wavers, by its thickness. */
const WAVER: Record<MasonryStyle, { amplitude: number; scale: number }> = {
  'dungeon-stone': { amplitude: 0.06, scale: 2.2 },
  'cave-rock': { amplitude: 0.28, scale: 1.1 },
  brick: { amplitude: 0.05, scale: 2.5 },
  wood: { amplitude: 0.03, scale: 3 },
};

/** Map cells one texture tile covers: floors, wall surfaces. */
const FLOOR_CELLS = 3;
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
  thickness: number;
  joints: { x: number; y: number; angle: number; kind: 'joint' | 'end' }[];
}

function surfacePattern(g: CanvasRenderingContext2D, source: HTMLCanvasElement, cell: number, cells: number, seed: number): CanvasPattern | null {
  const pattern = g.createPattern(source, 'repeat');
  if (!pattern) return null;
  const k = (cell * cells) / source.width;
  // Each style starts its pattern elsewhere, so neighbouring styles do not line up.
  pattern.setTransform(new DOMMatrix().translate((seed & 255) * 3.1, ((seed >> 8) & 255) * 2.3).scale(k));
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
}

/**
 * What only the walls and where doors are decide – outlines, joints, floors – kept for the last
 * drawings: opening or closing a door repaints, but computes none of it again.
 */
const geometries = new Map<string, Geometry>();
const KEPT_GEOMETRIES = 4;

/** United, wavering outlines and joints per group of touching walls (map px). */
const groupOutlines = new Map<string, { shape: Path2D; joints: PreparedStyle['joints'] }>();

function outlineOf(style: MasonryStyle, group: Masonry[], doors: BuildDoor[]): { shape: Path2D; joints: PreparedStyle['joints'] } {
  const thickness = group.reduce((s, w) => s + w.thickness, 0) / group.length;
  const jitter: Jitter = { step: Math.max(3, thickness / 3), amplitude: thickness * WAVER[style].amplitude, scale: thickness * WAVER[style].scale, seed: styleSeed(style) };
  const shape = new Path2D();
  for (const p of masonryOutline(group, doors))
    for (const ring of [p.outer, ...p.holes]) {
      jitterRing(ring, jitter).forEach(([x, y], i) => (i ? shape.lineTo(x, y) : shape.moveTo(x, y)));
      shape.closePath();
    }
  const joints = buildGraph(group).nodes.flatMap((n) => (n.kind === 'straight' ? [] : [{ x: n.x, y: n.y, angle: n.arms[0] ?? 0, kind: n.kind === 'end' ? ('end' as const) : ('joint' as const) }]));
  return { shape, joints };
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
  const styles: PreparedStyle[] = [...new Set(walls.map((w) => w.style))].map((style) => {
    const mine = walls.filter((w) => w.style === style);
    const shape = new Path2D();
    const joints: PreparedStyle['joints'] = [];
    for (const group of touchingGroups(mine)) {
      const doors = shownDoors(group);
      const key = JSON.stringify([style, group, doors]);
      used.add(key);
      let built = groupOutlines.get(key);
      if (!built) {
        built = outlineOf(style, group, doors);
        groupOutlines.set(key, built);
      }
      shape.addPath(built.shape);
      joints.push(...built.joints);
    }
    const thickness = mine.reduce((s, w) => s + w.thickness, 0) / mine.length;
    return { style, shape, thickness, joints };
  });
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
  const geometry = { styles, field, floorMasks, floorBoxes, step };
  geometries.set(key, geometry);
  if (geometries.size > KEPT_GEOMETRIES) geometries.delete(geometries.keys().next().value!);
  return geometry;
}

export function paintedDrawing(drawing: Drawing | DmDrawing, withGround: boolean, cell: number, tex: BuildTextures): PaintedImage {
  const { x: ox, y: oy } = drawing.origin;
  const width = Math.max(1, Math.ceil(drawing.width));
  const height = Math.max(1, Math.ceil(drawing.height));
  const { styles, field, floorMasks, floorBoxes } = geometryOf(drawing, withGround, cell, drawing.masonry.map(asMasonry));

  // Natural ground after the biome far from walls (E-34); a wall's floor near it.
  const floorSource = (style: FloorStyle) => (style === 'ground' ? tex.surface[groundSlot(drawing.biome)] : tex.surface[`floor-${style}`]);

  const paintFloors = (g: CanvasRenderingContext2D, left: number, top: number, w: number, h: number) => {
    if (!field) return;
    // The first style covers everything, so where soft edges overlap nothing shows through;
    // the others are blended over it – only where they are.
    const [base, ...others] = [...floorMasks.keys()];
    g.fillStyle = surfacePattern(g, floorSource(base), cell, FLOOR_CELLS, styleSeed(base)) ?? '#77705f';
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
      l.fillStyle = surfacePattern(l, floorSource(style), cell, FLOOR_CELLS, styleSeed(style)) ?? '#77705f';
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

  const paintWalls = (g: CanvasRenderingContext2D) => {
    for (const s of styles) {
      const t = s.thickness;
      // A soft shadow towards the lower right (two offset fills: far cheaper than a blur), then
      // the wall, its light edge and a sketched outline.
      for (const [k, alpha] of [[0.32, 0.22], [0.16, 0.3]] as const) {
        g.save();
        g.translate(t * k, t * k * 1.3);
        g.fillStyle = `rgba(0,0,0,${alpha})`;
        g.fill(s.shape, 'nonzero');
        g.restore();
      }
      g.fillStyle = surfacePattern(g, tex.surface[`wall-${s.style}`], cell, WALL_CELLS, styleSeed(s.style)) ?? '#5b5650';
      g.fill(s.shape, 'nonzero');
      // Darker than any floor, so a wall reads as a wall also on a floor of the same stone.
      g.fillStyle = 'rgba(20,16,12,.38)';
      g.fill(s.shape, 'nonzero');
      g.save();
      g.translate(-1, -1);
      g.strokeStyle = 'rgba(255,245,225,.28)';
      g.lineWidth = 1.5;
      g.stroke(s.shape);
      g.restore();
      g.strokeStyle = 'rgba(18,14,10,.8)';
      g.lineWidth = Math.max(1.5, t * 0.12);
      g.stroke(s.shape);
      // Corner stones and pillars for built walls; rock needs none.
      if (s.style === 'cave-rock') continue;
      for (const j of s.joints) {
        const part = j.kind === 'end' ? tex.part['part-pillar'] : tex.part['part-cornerstone'];
        const size = t * (j.kind === 'end' ? 1.35 : 1.25) * (s.style === 'wood' ? 0.85 : 1);
        g.save();
        g.translate(j.x, j.y);
        g.rotate(j.angle);
        g.drawImage(part, -size / 2, -size / 2, size, size);
        g.restore();
      }
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
      // Water lies in the ground (E-35); cliffs over it, waterfalls where rivers fall over them.
      paintWater(g, drawing.waters, cell, tex);
      // Cliffs and slopes lie on the ground, under the walls (E-34).
      paintCliffs(g, drawing.cliffs, drawing.biome, cell, tex);
      paintWaterfalls(g, drawing.waters, drawing.cliffs, cell);
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
