import { describe, expect, it } from 'vitest';
import { bandFoot, bandWidth, cliffBand } from './band';

/** The band a cliff shows on its lower side (Teil B §11.2). */
describe('band width', () => {
  it('grows with the drop: 10 ft → 0.45 cell, 20 ft → 0.9, never over 2.5 cells', () => {
    expect(bandWidth(10, 70)).toBeCloseTo(0.45 * 70);
    expect(bandWidth(20, 70)).toBeCloseTo(0.9 * 70);
    expect(bandWidth(100, 70)).toBeCloseTo(2.5 * 70);
  });
});

describe('the band mesh', () => {
  const line = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 200, y: 0 }];

  it('lies on the right of the contour (the lower side), its top on the contour', () => {
    const b = cliffBand(line, false, 30, { textureLength: 50, lightAngle: 45 });
    // Pairs: top (on the line) and bottom (offset to the right, here +y).
    expect(b.positions.length).toBe(line.length * 2 * 2);
    expect([b.positions[0], b.positions[1]]).toEqual([0, 0]);
    expect(b.positions[2]).toBeCloseTo(0);
    expect(b.positions[3]).toBeCloseTo(30);
    expect(b.indices.length).toBe((line.length - 1) * 6);
  });

  it('textures along its length (u) and from top to foot (v)', () => {
    const b = cliffBand(line, false, 30, { textureLength: 50, lightAngle: 45 });
    expect([b.uvs[0], b.uvs[1], b.uvs[2], b.uvs[3]]).toEqual([0, 0, 0, 1]);
    expect(b.uvs[8]).toBeCloseTo(4);
  });

  it('a ring repeats its first point, so the texture runs on across the seam', () => {
    const ring = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }];
    const b = cliffBand(ring, true, 20, { textureLength: 100, lightAngle: 45 });
    expect(b.positions.length).toBe((ring.length + 1) * 4);
    expect(b.uvs[ring.length * 4]).toBeCloseTo(4);
  });

  it('a sharp inner turn throws out no spike: every foot lies within the width of the line', () => {
    const line = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 0, y: 5 }];
    const b = cliffBand(line, false, 20, { textureLength: 50, lightAngle: 45 });
    const toSegment = (p: { x: number; y: number }, a: { x: number; y: number }, c: { x: number; y: number }) => {
      const t = Math.max(0, Math.min(1, ((p.x - a.x) * (c.x - a.x) + (p.y - a.y) * (c.y - a.y)) / ((c.x - a.x) ** 2 + (c.y - a.y) ** 2)));
      return Math.hypot(p.x - (a.x + t * (c.x - a.x)), p.y - (a.y + t * (c.y - a.y)));
    };
    for (let k = 0; k < b.at.length; k++) {
      const foot = { x: b.positions[k * 4 + 2]!, y: b.positions[k * 4 + 3]! };
      expect(Math.min(toSegment(foot, line[0]!, line[1]!), toSegment(foot, line[1]!, line[2]!))).toBeLessThanOrEqual(20 + 1e-4);
    }
  });

  it('its width may change along the contour, read at the world position (protrusions and niches)', () => {
    const b = cliffBand(line, false, 30, { textureLength: 50, lightAngle: 45, widthFactor: (p) => (p.x < 50 ? 1 : 1.5) });
    expect(b.positions[3]).toBeCloseTo(30);
    expect(b.positions[7]).toBeCloseTo(45);
    expect(b.positions[11]).toBeCloseTo(45);
  });

  it('an open line runs out to a point at its ends over `taper` px (a cliff ending in a slope); a ring never', () => {
    const long = Array.from({ length: 11 }, (_, i) => ({ x: i * 20, y: 0 }));
    const b = cliffBand(long, false, 30, { textureLength: 50, lightAngle: 45, taper: 60 });
    const foot = (i: number) => b.positions[i * 4 + 3]!;
    expect(foot(0)).toBeCloseTo(0);
    expect(foot(10)).toBeCloseTo(0);
    expect(foot(1)).toBeGreaterThan(0);
    expect(foot(1)).toBeLessThan(foot(2));
    expect(foot(5)).toBeCloseTo(30);
    const ring = cliffBand([{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }], true, 20, { textureLength: 100, lightAngle: 45, taper: 60 });
    expect(Math.hypot(ring.positions[2]! - ring.positions[0]!, ring.positions[3]! - ring.positions[1]!)).toBeGreaterThan(19);
  });

  it('at an outer corner its foot runs round the corner at its width (Teil B §11.5 „Ecke außen“), no spike', () => {
    // Right, then up: the lower side (right) is outside the turn.
    const b = cliffBand([{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: -100 }], false, 20, { textureLength: 50, lightAngle: 45 });
    const corner = [...b.at].map((src, k) => (src === 1 ? k : -1)).filter((k) => k >= 0);
    expect(corner.length).toBeGreaterThanOrEqual(3);
    for (const k of corner) {
      expect([b.positions[k * 4], b.positions[k * 4 + 1]]).toEqual([100, 0]);
      expect(Math.hypot(b.positions[k * 4 + 2]! - 100, b.positions[k * 4 + 3]!)).toBeCloseTo(20);
    }
    expect(b.indices.length).toBe((b.at.length - 1) * 6);
    // An inner corner keeps one foot point, mitred.
    const inner = cliffBand([{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }], false, 20, { textureLength: 50, lightAngle: 45 });
    expect([...inner.at]).toEqual([0, 1, 2]);
  });

  it('round an outer corner the texture runs on by the arc at half its width, not fanned from one column', () => {
    const b = cliffBand([{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: -100 }], false, 20, { textureLength: 50, lightAngle: 45 });
    const u = (k: number) => b.uvs[k * 4]!;
    const corner = [...b.at].map((src, k) => (src === 1 ? k : -1)).filter((k) => k >= 0);
    // A quarter turn at 10 px from the top: about 15.7 px of arc.
    expect((u(corner.at(-1)!) - u(corner[0]!)) * 50).toBeCloseTo((Math.PI / 2) * 10, 1);
    expect(u(corner[0]!)).toBeCloseTo(2);
    // The rest of the line is shifted alike, so the texture runs on without a jump.
    expect(u(b.at.length - 1) * 50).toBeCloseTo(200 + (Math.PI / 2) * 10, 1);
    // Another band beside it (the overhang) can measure the arc by the face's width, so both stay in step.
    const lip = cliffBand([{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: -100 }], false, 4, { textureLength: 50, lightAngle: 45, arcWidth: () => 20 });
    expect(lip.uvs[(lip.at.length - 1) * 4]!).toBeCloseTo(u(b.at.length - 1));
  });

  it('a wide band may take its foot from a calmer line: the top stays on the line, the foot wiggles less', () => {
    // A wavy line: wiggles of 6 px every 20 px.
    const wavy = Array.from({ length: 41 }, (_, i) => ({ x: i * 10, y: (i % 4 < 2 ? 0 : 6) }));
    const plain = cliffBand(wavy, false, 120, { textureLength: 200, lightAngle: 45 });
    const calm = cliffBand(wavy, false, 120, { textureLength: 200, lightAngle: 45, footSmooth: 40 });
    const tops = (b: typeof plain) => [...b.at].map((src, k) => [b.positions[k * 4]!, b.positions[k * 4 + 1]!, src] as const);
    // The top is the line itself.
    for (const [x, y, src] of tops(calm)) expect([x, y]).toEqual([wavy[src]!.x, wavy[src]!.y]);
    // Away from the ends, the feet lie about the width below the line and wander far less.
    const feetY = (b: typeof plain) => [...b.at].map((_, k) => b.positions[k * 4 + 3]!).slice(8, -8);
    const spread = (ys: number[]) => Math.max(...ys) - Math.min(...ys);
    expect(spread(feetY(calm))).toBeLessThan(spread(feetY(plain)) / 3);
    for (const y of feetY(calm)) expect(y).toBeGreaterThan(110);
  });

  it('a calmer foot leaves the ends where they are: lines of other drops meet without a gap, run-outs end in a point', () => {
    // A wavy open line that ends without running out (another drop goes on there).
    const wavy = Array.from({ length: 41 }, (_, i) => ({ x: i * 10, y: i % 4 < 2 ? 0 : 6 }));
    const calm = cliffBand(wavy, false, 120, { textureLength: 200, lightAngle: 45, runOut: [false, false], footSmooth: 40 });
    const foot = (b: typeof calm, k: number) => [b.positions[k * 4 + 2]!, b.positions[k * 4 + 3]!];
    const last = (b: typeof calm) => b.at.length - 1;
    // The end feet hang from the ends themselves, the width away (before, the smoothed ends slid
    // inwards and left a gap of most of a cell at 40 ft where lines of other drops meet).
    for (const [k, top] of [[0, wavy[0]!], [last(calm), wavy[wavy.length - 1]!]] as const) {
      const [fx, fy] = foot(calm, k);
      expect(Math.hypot(fx! - top.x, fy! - top.y)).toBeCloseTo(120, 0);
    }
    // Lying straight on, not along the line: the first foot right below the first point.
    expect(Math.abs(foot(calm, 0)[0]! - wavy[0]!.x)).toBeLessThan(12);
    // Running out, the foot meets the top at the end.
    const tip = cliffBand(wavy, false, 120, { textureLength: 200, lightAngle: 45, taper: 60, footSmooth: 40 });
    expect(foot(tip, 0)[0]).toBeCloseTo(wavy[0]!.x, 6);
    expect(foot(tip, 0)[1]).toBeCloseTo(wavy[0]!.y, 6);
  });

  it('with a calmer foot the texture still runs round an outer corner as the overhang beside it does', () => {
    // Densely sampled, as cliff lines are: smoothed, the corner spreads over many small turns.
    const corner = [...Array.from({ length: 20 }, (_, i) => ({ x: i * 5, y: 0 })), ...Array.from({ length: 21 }, (_, i) => ({ x: 100, y: -i * 5 }))];
    const face = cliffBand(corner, false, 120, { textureLength: 50, lightAngle: 45, footSmooth: 30 });
    const lip = cliffBand(corner, false, 4, { textureLength: 50, lightAngle: 45, arcWidth: () => 120 });
    const end = (b: typeof face) => b.uvs[(b.at.length - 1) * 4]!;
    expect(end(face)).toBeCloseTo(end(lip), 6);
    expect(end(face) * 50).toBeCloseTo(200 + (Math.PI / 2) * 60, 0);
  });

  it('its foot never runs backwards: at inner corners the feet merge, no loops for the hems at the foot', () => {
    // A narrow notch into the lower side: the mitred feet of its inner corners cross.
    const notch = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 105, y: 8 }, { x: 110, y: 0 }, { x: 200, y: 0 }];
    const b = cliffBand(notch, false, 30, { textureLength: 50, lightAngle: 45 });
    // The band's own feet merge instead of crossing.
    const raw = Array.from({ length: b.at.length }, (_, k) => b.positions[k * 4 + 2]!);
    for (let k = 1; k < raw.length; k++) expect(raw[k]).toBeGreaterThanOrEqual(raw[k - 1]!);
    const foot = bandFoot(b, false);
    for (let k = 1; k < foot.length; k++) expect(foot[k]!.x).toBeGreaterThanOrEqual(foot[k - 1]!.x);
    expect(foot[0]).toEqual({ x: 0, y: 30 });
    expect(foot[foot.length - 1]).toEqual({ x: 200, y: 30 });
    // Nor any sharp inner kink: half-transparent strips along it would overlap there and show a darker wedge.
    for (let k = 1; k + 1 < foot.length; k++) {
      const [p, q, r] = [foot[k - 1]!, foot[k]!, foot[k + 1]!];
      const turn = Math.atan2((q.x - p.x) * (r.y - q.y) - (q.y - p.y) * (r.x - q.x), (q.x - p.x) * (r.x - q.x) + (q.y - p.y) * (r.y - q.y));
      expect(turn).toBeLessThan((50 * Math.PI) / 180 + 1e-9);
    }
  });

  it('runs out only at the ends named (where a slope ends the cliff)', () => {
    const long = Array.from({ length: 11 }, (_, i) => ({ x: i * 20, y: 0 }));
    const b = cliffBand(long, false, 30, { textureLength: 50, lightAngle: 45, taper: 60, runOut: [false, true] });
    expect(b.positions[3]).toBeCloseTo(30);
    expect(b.positions[10 * 4 + 3]).toBeCloseTo(0);
  });

  it('a ring stays closed at its seam when feet merge there, and its foot keeps at least three points', () => {
    // A notch into the lower side right at the ring's seam (its first point).
    const ring = [{ x: 105, y: 8 }, { x: 110, y: 0 }, { x: 200, y: 0 }, { x: 200, y: -200 }, { x: 0, y: -200 }, { x: 0, y: 0 }, { x: 100, y: 0 }];
    const b = cliffBand(ring, true, 20, { textureLength: 50, lightAngle: 45 });
    const last = b.at.length - 1;
    expect([b.positions[last * 4 + 2], b.positions[last * 4 + 3]]).toEqual([b.positions[2], b.positions[3]]);
    // A small pit (its lower side inside): the foot stays a ring, not a strip across it.
    const pit = [{ x: 0, y: 0 }, { x: 0, y: 100 }, { x: 100, y: 100 }, { x: 100, y: 0 }];
    expect(bandFoot(cliffBand(pit, true, 30, { textureLength: 50, lightAngle: 45 }), true).length).toBeGreaterThanOrEqual(3);
  });

  it('a face turned to the light is brighter than one turned away', () => {
    // Light falls towards the lower right (45°): a face looking up-left (towards the light's source) is lit.
    const facingLight = cliffBand([{ x: 100, y: 0 }, { x: 0, y: 0 }], false, 20, { textureLength: 50, lightAngle: 45 });
    const away = cliffBand([{ x: 0, y: 0 }, { x: 100, y: 0 }], false, 20, { textureLength: 50, lightAngle: 45 });
    expect(facingLight.shade[0]).toBeGreaterThan(away.shade[0]!);
  });
});
