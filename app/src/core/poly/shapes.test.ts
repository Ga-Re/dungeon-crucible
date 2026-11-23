import fc from "fast-check";
import { describe, expect, test } from "vitest";
import { isInside } from "./fog";
import {
  circleArea,
  ellipseArea,
  ringArea,
  roundedRectArea,
  strokeArea,
} from "./shapes";

const close = (a: number, b: number) => Math.abs(a - b) < 1e-6;

describe("circleArea", () => {
  test("a regular polygon on the circle around the centre", () => {
    const circle = circleArea([100, 50], 20, 32);
    expect(circle.outer).toHaveLength(32);
    expect(circle.holes).toEqual([]);
    for (const [x, y] of circle.outer)
      expect(close(Math.hypot(x - 100, y - 50), 20)).toBe(true);
  });

  test("contains its centre and nothing beyond the radius", () => {
    const circle = circleArea([0, 0], 10);
    expect(isInside([circle], [0, 0])).toBe(true);
    expect(isInside([circle], [9, 0])).toBe(true);
    expect(isInside([circle], [10.5, 0])).toBe(false);
  });
});

describe("ellipseArea (T-247)", () => {
  test("the ellipse inside the box between two opposite corners, in any order", () => {
    const ellipse = ellipseArea([200, 20], [100, 80], 40);
    expect(ellipse.outer).toHaveLength(40);
    expect(ellipse.holes).toEqual([]);
    // Every corner lies on the ellipse around (150, 50) with radii 50 and 30.
    for (const [x, y] of ellipse.outer)
      expect(close(((x - 150) / 50) ** 2 + ((y - 50) / 30) ** 2, 1)).toBe(true);
    expect(isInside([ellipse], [150, 50])).toBe(true);
    expect(isInside([ellipse], [105, 25])).toBe(false);
  });

  test("a square box gives a circle", () => {
    const circle = ellipseArea([0, 0], [20, 20]);
    for (const [x, y] of circle.outer)
      expect(close(Math.hypot(x - 10, y - 10), 10)).toBe(true);
  });
});

describe("roundedRectArea", () => {
  test("a rectangle with its corners cut round, inside the rectangle", () => {
    const area = roundedRectArea([0, 0], [100, 60], 10);
    expect(area.holes).toEqual([]);
    for (const [x, y] of area.outer) {
      expect(x).toBeGreaterThanOrEqual(-1e-9);
      expect(x).toBeLessThanOrEqual(100 + 1e-9);
      expect(y).toBeGreaterThanOrEqual(-1e-9);
      expect(y).toBeLessThanOrEqual(60 + 1e-9);
    }
    // The sides stay straight up to the rounding; the very corner is cut off.
    expect(isInside([area], [50, 1])).toBe(true);
    expect(isInside([area], [1, 30])).toBe(true);
    expect(isInside([area], [1, 1])).toBe(false);
    expect(isInside([area], [99, 59])).toBe(false);
    // A quarter circle per corner: the corner square loses (1 − π/4)·r² each (a little more,
    // as the arcs are chords).
    expect(ringArea(area.outer)).toBeCloseTo(
      6000 - 4 * (1 - Math.PI / 4) * 100,
      -1,
    );
  });

  test("takes the corners in any order and never rounds more than half the shorter side", () => {
    const area = roundedRectArea([100, 60], [0, 0], 500);
    expect(ringArea(area.outer)).toBeLessThan(6000);
    expect(isInside([area], [50, 30])).toBe(true);
    // Rounded by 30 (half of 60): the ends are half circles.
    expect(isInside([area], [3, 30])).toBe(true);
    expect(isInside([area], [3, 5])).toBe(false);
  });

  test("a plain rectangle without rounding", () => {
    expect(roundedRectArea([0, 0], [10, 20], 0).outer).toEqual([
      [0, 0],
      [10, 0],
      [10, 20],
      [0, 20],
    ]);
  });
});

describe("strokeArea", () => {
  test("nothing for an empty stroke or no width", () => {
    expect(strokeArea([], 5)).toBeNull();
    expect(strokeArea([[0, 0]], 0)).toBeNull();
  });

  test("a single point is a dab: a circle", () => {
    const dab = strokeArea([[10, 10]], 5);
    expect(dab && isInside([dab], [10, 13])).toBe(true);
  });

  test("covers the whole stroke, its width and its round ends, nothing more", () => {
    const stroke = strokeArea(
      [
        [0, 0],
        [100, 0],
        [100, 100],
      ],
      10,
    );
    if (!stroke) throw new Error("no stroke");
    for (const point of [
      [0, 0],
      [50, 8],
      [100, 50],
      [92, 100],
      [100, 108],
      [-8, 0],
    ] as const)
      expect(isInside([stroke], [...point])).toBe(true);
    for (const point of [
      [50, 20],
      [50, -20],
      [-20, 0],
      [80, 80],
    ] as const)
      expect(isInside([stroke], [...point])).toBe(false);
  });

  test("a stroke crossing itself is still one area (one command, one undo step)", () => {
    const loop = strokeArea(
      [
        [0, 0],
        [100, 0],
        [100, 100],
        [0, 100],
        [0, 0],
      ],
      10,
    );
    // The middle stays open: a hole, not a second area.
    expect(loop?.holes).toHaveLength(1);
    expect(loop && isInside([loop], [50, 50])).toBe(false);
  });

  test("repeated pointer positions never cost the stroke its end (found in review)", () => {
    for (const points of [
      [
        [0, 0],
        [100, 0],
        [100, 0],
      ],
      [
        [0, 0],
        [50, 0],
        [100, 0],
        [100, 0],
      ],
    ] as [number, number][][]) {
      const stroke = strokeArea(points, 10);
      expect(stroke && isInside([stroke], [100, 0])).toBe(true);
      expect(stroke && isInside([stroke], [50, 0])).toBe(true);
    }
  });

  test("a stroke running back over itself keeps its far end (found by the property test)", () => {
    const stroke = strokeArea(
      [
        [0, 0],
        [0, 2],
        [0, -1],
      ],
      2,
    );
    expect(stroke && isInside([stroke], [0, 3.5])).toBe(true);
  });

  test("survives strokes that made the geometry library fail (found by the property test)", () => {
    const corners: [number, number][] = [
      [135, 171],
      [32, -240],
      [-99, -5],
      [-58, -275],
    ];
    const stroke = strokeArea(corners, 59);
    expect(stroke).not.toBeNull();
    for (const [x, y] of corners)
      expect(stroke && isInside([stroke], [x, y])).toBe(true);
  });

  test("survives a stroke a single union over all parts cannot handle", () => {
    const corners: [number, number][] = [
      [64, 195],
      [-231, -405],
      [0, -57],
      [-155, 226],
      [328, 298],
      [476, 266],
    ];
    const stroke = strokeArea(corners, 54);
    expect(stroke).not.toBeNull();
    for (const [x, y] of corners)
      expect(stroke && isInside([stroke], [x, y])).toBe(true);
  });

  test("a long, smooth stroke (hundreds of pointer events) stays fast", () => {
    const points: [number, number][] = [];
    for (let index = 0; index <= 600; index++) {
      const angle = index / 60;
      points.push([index * 6, 200 * Math.sin(angle)]);
    }
    const started = Date.now();
    const stroke = strokeArea(points, 30);
    // Generous for slow CI runners; ~30 ms is typical (see strokeArea).
    expect(Date.now() - started).toBeLessThan(1000);
    for (const [x, y] of points)
      expect(stroke && isInside([stroke], [x, y])).toBe(true);
  });

  test("a self-crossing stroke keeps its start (T-240: polyclip silently dropped it)", () => {
    // Found by fast-check (seed -443103766): the finest grid lost the first two points.
    const points: [number, number][] = [
      [-176, 0],
      [-144, 12],
      [184, 22],
      [311, -270],
      [-136, -254],
      [347, 422],
      [0, -95],
    ];
    const stroke = strokeArea(points, 7);
    expect(stroke).not.toBeNull();
    for (const [x, y] of points)
      expect(stroke && isInside([stroke], [x, y])).toBe(true);
  });

  test("property: every stroke point lies inside, and points far away do not", () => {
    const point = fc.tuple(
      fc.integer({ min: -500, max: 500 }),
      fc.integer({ min: -500, max: 500 }),
    );
    fc.assert(
      fc.property(
        // Pointer streams repeat positions; doubling random points covers that.
        fc
          .array(fc.tuple(point, fc.boolean()), { minLength: 1, maxLength: 30 })
          .map((entries) =>
            entries.flatMap(([p, twice]) => (twice ? [p, p] : [p])),
          ),
        fc.integer({ min: 2, max: 60 }),
        (points, radius) => {
          const stroke = strokeArea(points, radius);
          if (!stroke) return false;
          for (const [x, y] of points)
            expect(isInside([stroke], [x, y])).toBe(true);
          expect(isInside([stroke], [2000, 2000])).toBe(false);
          return true;
        },
      ),
      { numRuns: 100 },
    );
    // ~3 s normally; coverage instrumentation makes polygon unions about three times slower.
  }, 30_000);
});

describe("ringArea", () => {
  test("the same area in either winding order; nothing for a line", () => {
    const square: [number, number][] = [
      [0, 0],
      [2, 0],
      [2, 2],
      [0, 2],
    ];
    expect(ringArea(square)).toBe(4);
    expect(ringArea([...square].reverse())).toBe(4);
    expect(
      ringArea([
        [0, 0],
        [5, 5],
        [10, 10],
      ]),
    ).toBe(0);
  });
});
