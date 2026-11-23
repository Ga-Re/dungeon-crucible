import { describe, expect, test } from "vitest";
import {
  BENCH_CYCLE_MS,
  BENCH_MAP,
  benchCamera,
  benchFog,
  benchTokens,
} from "./bench-scene";

// The benchmark scene (T-105d): what ARCHITECTURE §11 budgets for.

describe("bench scene", () => {
  test("20 tokens on the 4K map, none overlapping another", () => {
    const tokens = benchTokens();
    expect(tokens).toHaveLength(20);
    for (const token of tokens) {
      expect(token.x + token.width).toBeLessThanOrEqual(BENCH_MAP.width);
      expect(token.y + token.height).toBeLessThanOrEqual(BENCH_MAP.height);
    }
    for (const a of tokens)
      for (const b of tokens) {
        if (a === b) continue;
        const apart =
          a.x + a.width <= b.x ||
          b.x + b.width <= a.x ||
          a.y + a.height <= b.y ||
          b.y + b.height <= a.y;
        expect(apart).toBe(true);
      }
  });

  test("fog with several areas, holes and round shapes, all on the map", () => {
    const fog = benchFog();
    expect(fog.length).toBeGreaterThanOrEqual(5);
    expect(fog.some((area) => area.holes.length > 0)).toBe(true);
    for (const area of fog)
      for (const [x, y] of area.outer) {
        expect(x).toBeGreaterThanOrEqual(0);
        expect(y).toBeGreaterThanOrEqual(0);
        expect(x).toBeLessThanOrEqual(BENCH_MAP.width);
        expect(y).toBeLessThanOrEqual(BENCH_MAP.height);
      }
  });

  test("the camera keeps moving and comes back after a cycle", () => {
    const view = { width: 1920, height: 1080 };
    const start = benchCamera(0, view);
    const later = benchCamera(BENCH_CYCLE_MS / 4, view);
    expect(later).not.toEqual(start);
    expect(later.zoom).toBeGreaterThan(start.zoom);
    // No jump at the loop's seam: just before the cycle ends it is where it starts.
    const seam = benchCamera(BENCH_CYCLE_MS - 16, view);
    expect(seam.zoom).toBeCloseTo(start.zoom, 2);
    expect(Math.abs(seam.centerX - start.centerX)).toBeLessThan(5);
    expect(Math.abs(seam.centerY - start.centerY)).toBeLessThan(5);
  });
});
