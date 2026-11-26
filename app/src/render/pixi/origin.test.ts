import { describe, expect, it } from "vitest";
import { shiftGrid, shiftLighting, shiftPolygons, ZERO } from "./origin";

const square = { outer: [[-100, -50], [0, -50], [0, 50], [-100, 50]] as [number, number][], holes: [[[-60, -10], [-40, -10], [-40, 10]]] as [number, number][][] };

describe("map space for a map with an origin (E-33)", () => {
  it("moves polygons and their holes by the origin", () => {
    expect(shiftPolygons([square], { x: -100, y: -50 })).toEqual([
      { outer: [[0, 0], [100, 0], [100, 100], [0, 100]], holes: [[[40, 40], [60, 40], [60, 60]]] },
    ]);
  });

  it("leaves everything as it is at 0, 0", () => {
    const polygons = [square];
    expect(shiftPolygons(polygons, ZERO)).toBe(polygons);
    expect(shiftGrid({ cellSizePx: 70, offsetXPx: 5, offsetYPx: 6 }, ZERO)).toEqual({ cellSizePx: 70, offsetXPx: 5, offsetYPx: 6 });
  });

  it("moves glows with their areas, and the grid's offset", () => {
    const lit = shiftLighting({ darkness: 0.4, softEdge: 3, lit: [square], glows: [{ x: -20, y: 0, brightPx: 10, dimPx: 20, color: "#fff", area: [square] }] }, { x: -100, y: -50 })!;
    expect(lit.glows[0]).toMatchObject({ x: 80, y: 50 });
    expect(lit.glows[0].area[0].outer[0]).toEqual([0, 0]);
    expect(lit.lit[0].outer[0]).toEqual([0, 0]);
    expect(shiftGrid({ cellSizePx: 70, offsetXPx: 0, offsetYPx: 0 }, { x: -140, y: -70 })).toMatchObject({ offsetXPx: 140, offsetYPx: 70 });
  });
});
