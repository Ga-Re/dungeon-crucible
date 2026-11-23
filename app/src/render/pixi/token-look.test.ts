import { describe, expect, test } from "vitest";
import {
  TOKEN_COLORS,
  labelResolution,
  tokenColor,
  tokenInitials,
} from "./token-look";

// Placeholder tokens (T-107a): a disc in a colour of its own, with initials.

describe("token look", () => {
  test("initials: first letters of two words, a number kept whole", () => {
    expect(tokenInitials("Goblin")).toBe("G");
    expect(tokenInitials("Goblin 12")).toBe("G12");
    expect(tokenInitials("aria von  stein")).toBe("AV");
    expect(tokenInitials("  ")).toBe("");
    expect(tokenInitials(undefined)).toBe("");
  });

  test("colours: from the palette, the same for the same id", () => {
    expect(TOKEN_COLORS).toContain(tokenColor("token-goblin"));
    expect(tokenColor("token-goblin")).toBe(tokenColor("token-goblin"));
    const many = new Set(
      Array.from({ length: 40 }, (_, index) =>
        tokenColor(`t-${String(index)}`),
      ),
    );
    expect(many.size).toBeGreaterThan(4);
  });

  test("white initials are readable on every colour (WCAG AA, 4.5:1)", () => {
    const channel = (value: number) => {
      const c = value / 255;
      return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    };
    const luminance = (hex: string) => {
      const [r, g, b] = [1, 3, 5].map((at) =>
        channel(Number.parseInt(hex.slice(at, at + 2), 16)),
      ) as [number, number, number];
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    for (const colour of TOKEN_COLORS)
      expect(1.05 / (luminance(colour) + 0.05)).toBeGreaterThanOrEqual(4.5);
  });
});

describe("labelResolution (T-107b)", () => {
  test("rasterises labels for the zoom, in doublings from 1 to 8", () => {
    expect(labelResolution(0.25, 1)).toBe(1);
    expect(labelResolution(1, 1)).toBe(1);
    expect(labelResolution(1.2, 1)).toBe(2);
    expect(labelResolution(1, 2)).toBe(2);
    expect(labelResolution(3, 1)).toBe(4);
    expect(labelResolution(40, 2)).toBe(8);
  });
});
