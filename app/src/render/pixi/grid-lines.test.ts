import { describe, expect, test } from "vitest";
import { MAX_GRID_LINES, gridLinePositions } from "./renderer";

// Grid lines (T-106b): where they lie on the map, from the sidecar's calibration.

describe("grid line positions", () => {
  test("start at the offset moved back by whole cells and cover the map", () => {
    expect(gridLinePositions(300, 100, 0)).toEqual([0, 100, 200, 300]);
    expect(gridLinePositions(300, 100, 30)).toEqual([30, 130, 230]);
    // An offset beyond a cell or negative still lines up with the cells.
    expect(gridLinePositions(300, 100, 230)).toEqual([30, 130, 230]);
    expect(gridLinePositions(300, 100, -70)).toEqual([30, 130, 230]);
  });

  test("are none without a usable cell size or map", () => {
    expect(gridLinePositions(300, 0, 0)).toEqual([]);
    expect(gridLinePositions(300, -5, 0)).toEqual([]);
    expect(gridLinePositions(0, 100, 0)).toEqual([]);
  });

  test("are none when there would be too many to draw (a tiny cell size)", () => {
    expect(gridLinePositions(10_000, 10_000 / MAX_GRID_LINES, 0)).toHaveLength(
      MAX_GRID_LINES + 1,
    );
    expect(gridLinePositions(10_000, 1, 0)).toEqual([]);
  });
});
