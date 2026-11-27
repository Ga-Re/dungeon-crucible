/**
 * Cliff contours from the step raster (E-46, Teil B §11.1): marching squares between support
 * points at the threshold k + 0.5 of a step change k | k+1. A step is a hard change, so a contour
 * runs half way between a high and a low point – a drop of two steps gives both contours on one
 * line, to be merged into one higher cliff. Every contour has the higher ground on its left
 * (y grows downwards), so its band can always lie on the right, the lower side. Saddles follow
 * the cell's centre. Coordinates are support points. Pure.
 */

export interface Pt {
  x: number;
  y: number;
}

export interface Contour {
  points: Pt[];
  closed: boolean;
}

/** Edges of a cell clockwise from its top left corner: corner i to corner i + 1. */
const CORNERS: readonly Pt[] = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }];

const key = (p: Pt) => `${p.x.toFixed(4)},${p.y.toFixed(4)}`;

/**
 * The contours of step change `k | k+1` over the support points `area` (inclusive): closed rings
 * where the change lies inside, open lines where it leaves the area.
 */
export function stepContours(step: (x: number, y: number) => number, area: { x0: number; y0: number; x1: number; y1: number }, k: number): Contour[] {
  const t = k + 0.5;
  const segments: [Pt, Pt][] = [];
  for (let y = area.y0; y < area.y1; y++)
    for (let x = area.x0; x < area.x1; x++) {
      const v = CORNERS.map((c) => step(x + c.x, y + c.y));
      const high = v.map((s) => s > t);
      const crossings: { edge: number; at: Pt; entering: boolean }[] = [];
      for (let i = 0; i < 4; i++) {
        const j = (i + 1) % 4;
        if (high[i] === high[j]) continue;
        crossings.push({ edge: i, at: { x: x + (CORNERS[i]!.x + CORNERS[j]!.x) / 2, y: y + (CORNERS[i]!.y + CORNERS[j]!.y) / 2 }, entering: !high[i] });
      }
      if (crossings.length === 2) {
        const enter = crossings.find((c) => c.entering)!;
        const leave = crossings.find((c) => !c.entering)!;
        segments.push([enter.at, leave.at]);
      } else if (crossings.length === 4) {
        // A saddle: the centre decides which corners are cut off.
        const centreHigh = v.reduce((a, b) => a + b, 0) / 4 > t;
        const pairs = high[1] !== centreHigh ? [[0, 1], [2, 3]] : [[1, 2], [3, 0]];
        for (const [a, b] of pairs) {
          const ca = crossings[a!]!;
          const cb = crossings[b!]!;
          segments.push(ca.entering ? [ca.at, cb.at] : [cb.at, ca.at]);
        }
      }
    }
  return stitch(segments);
}

/** Joins oriented segments end to start into lines and rings. */
function stitch(segments: [Pt, Pt][]): Contour[] {
  const byStart = new Map<string, number>();
  const ends = new Set<string>();
  segments.forEach(([a, b], i) => {
    byStart.set(key(a), i);
    ends.add(key(b));
  });
  const used = new Uint8Array(segments.length);
  const out: Contour[] = [];
  const walk = (first: number) => {
    const points = [segments[first]![0]];
    let i: number | undefined = first;
    while (i !== undefined && !used[i]) {
      used[i] = 1;
      const end = segments[i]![1];
      points.push(end);
      i = byStart.get(key(end));
    }
    const closed = points.length > 2 && key(points[0]!) === key(points[points.length - 1]!);
    if (closed) points.pop();
    out.push({ points, closed });
  };
  // Open lines first, from where no segment ends; then the rings.
  segments.forEach(([a], i) => {
    if (!used[i] && !ends.has(key(a))) walk(i);
  });
  segments.forEach((_, i) => {
    if (!used[i]) walk(i);
  });
  return out;
}

/** Chaikin corner cutting: an open line keeps its ends, a ring stays closed. */
export function chaikin(points: readonly Pt[], closed: boolean, iterations: number): Pt[] {
  let pts = [...points];
  for (let n = 0; n < iterations && pts.length > 2; n++) {
    const out: Pt[] = closed ? [] : [pts[0]!];
    const count = closed ? pts.length : pts.length - 1;
    for (let i = 0; i < count; i++) {
      const a = pts[i]!;
      const b = pts[(i + 1) % pts.length]!;
      out.push({ x: a.x * 0.75 + b.x * 0.25, y: a.y * 0.75 + b.y * 0.25 }, { x: a.x * 0.25 + b.x * 0.75, y: a.y * 0.25 + b.y * 0.75 });
    }
    if (!closed) {
      out.splice(1, 1);
      out.splice(out.length - 1, 1);
      out.push(pts[pts.length - 1]!);
    }
    pts = out;
  }
  return pts;
}
