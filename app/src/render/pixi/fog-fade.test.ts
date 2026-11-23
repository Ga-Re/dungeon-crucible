import { describe, expect, it } from "vitest";
import { easeOut, fadeProgress } from "./fog-fade";

describe("fog fades", () => {
  it("eases out: fast at first, settling at the end", () => {
    expect(easeOut(0)).toBe(0);
    expect(easeOut(1)).toBe(1);
    expect(easeOut(0.5)).toBeGreaterThan(0.5);
    expect(easeOut(-1)).toBe(0);
    expect(easeOut(2)).toBe(1);
  });

  it("runs from 0 to 1 over the duration", () => {
    expect(fadeProgress(1000, 500, 1000)).toBe(0);
    expect(fadeProgress(1000, 500, 1250)).toBe(0.5);
    expect(fadeProgress(1000, 500, 1600)).toBe(1);
    // A zero duration is over at once.
    expect(fadeProgress(1000, 0, 1000)).toBe(1);
  });
});
