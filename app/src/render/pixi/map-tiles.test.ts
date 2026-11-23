import { describe, expect, test } from "vitest";
import { mapTiles } from "./map-tiles";

describe("mapTiles (T-127)", () => {
  test("a map that fits is one tile", () => {
    expect(mapTiles(4000, 3000, 8192)).toEqual([
      { x: 0, y: 0, width: 4000, height: 3000 },
    ]);
  });

  test("a larger map is cut into tiles that fit and cover it exactly", () => {
    const tiles = mapTiles(20000, 9000, 8192);
    expect(tiles).toHaveLength(6);
    for (const tile of tiles) {
      expect(tile.width).toBeLessThanOrEqual(8192);
      expect(tile.height).toBeLessThanOrEqual(8192);
    }
    const area = tiles.reduce((sum, tile) => sum + tile.width * tile.height, 0);
    expect(area).toBe(20000 * 9000);
    expect(tiles.at(-1)).toEqual({
      x: 16384,
      y: 8192,
      width: 3616,
      height: 808,
    });
  });
});
