/**
 * Draws a map's drawn walls (E-33) into a canvas the renderer shows like a map image: with the
 * ground for a drawn map (it is its picture), without it over a picture map. Built the same way
 * for the DM window and the TV, each from its own drawing (`dmDrawing`, `playerDrawing`).
 * A first, flat look: textures and the hand-drawn look follow (DC-107a).
 */
import { doorSpan, masonryOutline, pointAt, type Masonry, type MasonryStyle } from '../core/build/masonry';
import type { DmDrawing, Drawing } from '../core/build/playerDrawing';
import type { Polygon } from '../core/poly/types';

const STYLE_FILL: Record<MasonryStyle, string> = {
  'dungeon-stone': '#5b5650',
  'cave-rock': '#4a443c',
  brick: '#6e4a3a',
  wood: '#6b4f2e',
};
/** One ground for now; rock outside and floors after the nearest wall follow with the textures. */
const GROUND = '#77705f';

function trace(g: CanvasRenderingContext2D, polygons: readonly Polygon[], ox: number, oy: number): void {
  g.beginPath();
  for (const p of polygons)
    for (const ring of [p.outer, ...p.holes]) {
      ring.forEach(([x, y], i) => (i ? g.lineTo(x - ox, y - oy) : g.moveTo(x - ox, y - oy)));
      g.closePath();
    }
}

const asMasonry = (w: Drawing['masonry'][number]): Masonry => ({ ...w, points: w.points.map((p) => ({ ...p })) });

/** The span of a door on its wall, as two points. */
function doorEnds(wall: Masonry, d: { at: number; width: number }) {
  const span = doorSpan(wall, { id: '', wall: wall.id, at: d.at, width: d.width, secret: false, crack: false });
  return [pointAt(wall.points, wall.closed, span.from), pointAt(wall.points, wall.closed, span.to)] as const;
}

export function drawnMapImage(drawing: Drawing | DmDrawing, withGround: boolean): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(drawing.width));
  c.height = Math.max(1, Math.ceil(drawing.height));
  const g = c.getContext('2d');
  if (!g) throw new Error('No 2D canvas for the drawn map.');
  const { x: ox, y: oy } = drawing.origin;
  if (withGround) {
    g.fillStyle = GROUND;
    g.fillRect(0, 0, c.width, c.height);
  }
  const walls = drawing.masonry.map(asMasonry);
  const byId = new Map(walls.map((w) => [w.id, w]));
  // Each style on its own, cut open where doors are shown; unfound secret doors were never sent.
  const doorsOn = (id: string) => drawing.doors.filter((d) => d.wall === id).map((d, i) => ({ id: `d${i}`, wall: id, at: d.at, width: d.width, secret: false, crack: false }));
  for (const style of new Set(walls.map((w) => w.style))) {
    const mine = walls.filter((w) => w.style === style);
    const shape = masonryOutline(mine, mine.flatMap((w) => doorsOn(w.id)));
    g.fillStyle = STYLE_FILL[style];
    trace(g, shape, ox, oy);
    g.fill('evenodd');
    g.strokeStyle = 'rgba(0,0,0,.55)';
    g.lineWidth = 2;
    g.stroke();
  }
  for (const d of drawing.doors) {
    const wall = byId.get(d.wall);
    if (!wall) continue;
    const [a, b] = doorEnds(wall, d);
    const secret = 'secret' in d && d.secret;
    g.strokeStyle = secret ? '#a77bf3' : '#c99a5b';
    g.lineWidth = wall.thickness * (d.open ? 0.3 : 0.7);
    g.setLineDash(secret ? [6, 4] : []);
    g.beginPath();
    if (d.open) {
      // An open door stands at a right angle to its wall, hinged at one end.
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      const nx = -(b.y - a.y) / len;
      const ny = (b.x - a.x) / len;
      g.moveTo(a.x - ox, a.y - oy);
      g.lineTo(a.x - ox + nx * len, a.y - oy + ny * len);
    } else {
      g.moveTo(a.x - ox, a.y - oy);
      g.lineTo(b.x - ox, b.y - oy);
    }
    g.stroke();
    g.setLineDash([]);
  }
  // A faint crack where the DM lets players notice an unfound secret door.
  for (const k of drawing.cracks) {
    const wall = byId.get(k.wall);
    if (!wall) continue;
    const [a, b] = doorEnds(wall, k);
    g.strokeStyle = 'rgba(15,12,10,.7)';
    g.lineWidth = 1.5;
    g.beginPath();
    g.moveTo(a.x - ox, a.y - oy);
    g.lineTo(b.x - ox, b.y - oy);
    g.stroke();
  }
  return c;
}
