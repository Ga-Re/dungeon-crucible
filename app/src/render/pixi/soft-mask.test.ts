import { describe, expect, it } from "vitest";
import { softFogAlpha, type Mask } from "./soft-mask";

/** A mask from rows of "#" (revealed) and "." (hidden). */
function maskOf(rows: readonly string[]): Mask {
  const height = rows.length;
  const width = rows[0]?.length ?? 0;
  const data = new Uint8Array(width * height);
  rows.forEach((row, y) => {
    for (let x = 0; x < width; x++)
      data[y * width + x] = row[x] === "#" ? 255 : 0;
  });
  return { width, height, data };
}

/** A square revealed room of `size` texels in the middle of a `total`-texel mask. */
function room(total: number, size: number): Mask {
  const start = Math.floor((total - size) / 2);
  const rows = Array.from({ length: total }, (_, y) =>
    Array.from({ length: total }, (_, x) =>
      x >= start && x < start + size && y >= start && y < start + size
        ? "#"
        : ".",
    ).join(""),
  );
  return maskOf(rows);
}

/** A reproducible pseudo-random mask (blobs and noise), so the property is tried widely. */
function randomMask(width: number, height: number, seed: number): Mask {
  let state = seed;
  const next = () => {
    state = (state * 1103515245 + 12345) % 2 ** 31;
    return state / 2 ** 31;
  };
  const data = new Uint8Array(width * height);
  for (let blob = 0; blob < 6; blob++) {
    const cx = next() * width;
    const cy = next() * height;
    const radius = 2 + next() * 10;
    for (let y = 0; y < height; y++)
      for (let x = 0; x < width; x++)
        if ((x - cx) ** 2 + (y - cy) ** 2 < radius ** 2)
          data[y * width + x] = 255;
  }
  for (let index = 0; index < data.length; index++)
    if (next() < 0.03) data[index] = 255 - (data[index] ?? 0);
  return { width, height, data };
}

describe("softFogAlpha", () => {
  it("keeps every hidden texel and its direct neighbours fully fogged (fail-closed)", () => {
    for (let seed = 1; seed <= 20; seed++) {
      const mask = randomMask(48, 40, seed);
      for (const radius of [1, 2, 4, 7]) {
        const alpha = softFogAlpha(mask, radius);
        for (let y = 0; y < mask.height; y++)
          for (let x = 0; x < mask.width; x++) {
            // Any hidden texel within one texel – the reach of linear filtering on screen.
            let nearHidden = false;
            for (let dy = -1; dy <= 1; dy++)
              for (let dx = -1; dx <= 1; dx++) {
                const nx = Math.min(mask.width - 1, Math.max(0, x + dx));
                const ny = Math.min(mask.height - 1, Math.max(0, y + dy));
                if (mask.data[ny * mask.width + nx] === 0) nearHidden = true;
              }
            if (nearHidden) expect(alpha[y * mask.width + x]).toBe(255);
          }
      }
    }
  });

  it("clears the fog well inside a revealed room and softens towards its walls", () => {
    const alpha = softFogAlpha(room(40, 30), 4);
    const at = (x: number, y: number) => alpha[y * 40 + x] ?? -1;
    // The room spans 5..34; its centre is clear.
    expect(at(20, 20)).toBe(0);
    // From the wall inwards the fog thins out step by step.
    const row = [5, 6, 7, 8, 9, 10, 11, 12, 13, 14].map((x) => at(x, 20));
    expect(row[0]).toBe(255);
    expect(row.at(-1)).toBe(0);
    for (let index = 1; index < row.length; index++)
      expect(row[index]).toBeLessThanOrEqual(row[index - 1] ?? 0);
    expect(row.some((value) => value > 0 && value < 255)).toBe(true);
  });

  it("keeps a one-cell corridor open at the default edge width", () => {
    // A 100 px cell is 25 texels on a 4096 px map; the default edge is 0.25 cells ≈ 6 texels.
    const alpha = softFogAlpha(room(60, 25), 6);
    const row = Array.from(
      { length: 25 },
      (_, x) => alpha[30 * 60 + 17 + x] ?? 255,
    );
    expect(row[12]).toBe(0);
    // More than half of the corridor shows the map at least half.
    expect(row.filter((value) => value < 128).length).toBeGreaterThan(12);
  });

  it("fogs a revealed area narrower than its soft edge completely", () => {
    const alpha = softFogAlpha(room(20, 2), 4);
    expect([...alpha].every((value) => value === 255)).toBe(true);
  });

  it("treats the mask's border as continuing outward, so a map edge stays open", () => {
    const alpha = softFogAlpha(maskOf(Array(12).fill("#".repeat(12))), 3);
    expect([...alpha].every((value) => value === 0)).toBe(true);
  });
});
