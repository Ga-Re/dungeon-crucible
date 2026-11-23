import { describe, expect, it } from "vitest";
import {
  coarseSpreadOrder,
  DURATION_SHARES,
  ORDER_SIDE,
  raggedWeights,
  sampleOrder,
  spreadAtSpeed,
  spreadMix,
  spreadOrder,
  spreadTiming,
} from "./fog-spread";

const FOG = 255;
const OPEN = 0;

/** A mask of `width`×`height` texels, fogged except where `open(x, y)`. */
function mask(
  width: number,
  height: number,
  open: (x: number, y: number) => boolean,
) {
  const alpha = new Uint8Array(width * height);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++)
      alpha[y * width + x] = open(x, y) ? OPEN : FOG;
  return alpha;
}

const at = (order: Uint8Array, width: number, x: number, y: number) =>
  order[y * width + x] ?? Number.NaN;

describe("spreadOrder", () => {
  it("spreads a reveal from the revealed area it touches", () => {
    // Columns 0–3 were revealed; the reveal adds columns 4–15.
    const from = mask(16, 8, (x) => x < 4);
    const to = mask(16, 8, () => true);
    const order = spreadOrder(16, 8, from, to);
    expect(at(order, 16, 4, 4)).toBe(0);
    expect(at(order, 16, 15, 4)).toBe(255);
    for (let x = 4; x < 15; x++)
      expect(at(order, 16, x, 4)).toBeLessThan(at(order, 16, x + 1, 4));
  });

  it("clears an isolated reveal from its middle outward", () => {
    const from = mask(17, 17, () => false);
    const to = mask(17, 17, (x, y) => x >= 2 && x <= 14 && y >= 2 && y <= 14);
    const order = spreadOrder(17, 17, from, to);
    expect(at(order, 17, 8, 8)).toBe(0);
    expect(at(order, 17, 2, 8)).toBe(255);
    expect(at(order, 17, 5, 8)).toBeLessThan(at(order, 17, 3, 8));
    // Fog that stays is not part of the spread.
    expect(at(order, 17, 0, 0)).toBe(0);
  });

  it("spreads a hide from the fog side", () => {
    // Columns 0–1 are fogged; the hide covers columns 2–9 as well.
    const from = mask(16, 8, (x) => x >= 2);
    const to = mask(16, 8, (x) => x >= 10);
    const order = spreadOrder(16, 8, from, to);
    expect(at(order, 16, 2, 4)).toBe(0);
    expect(at(order, 16, 9, 4)).toBe(255);
    for (let x = 2; x < 9; x++)
      expect(at(order, 16, x, 4)).toBeLessThan(at(order, 16, x + 1, 4));
  });

  it("closes a hide with no fog next to it from its middle outward (T-249)", () => {
    const from = mask(17, 17, () => true);
    const to = mask(
      17,
      17,
      (x, y) => !(x >= 4 && x <= 12 && y >= 4 && y <= 12),
    );
    const order = spreadOrder(17, 17, from, to);
    expect(at(order, 17, 8, 8)).toBe(0);
    expect(at(order, 17, 4, 8)).toBe(255);
  });

  it("follows the shape around corners, not straight through the fog", () => {
    // An L: revealed foot at the bottom left; the reveal adds the leg going up and over.
    const from = mask(12, 12, (x, y) => x < 3 && y >= 9);
    const to = mask(12, 12, (x, y) => (x < 3 && y >= 0) || (y < 3 && x < 12));
    const order = spreadOrder(12, 12, from, to);
    // The top right end is farther along the L than the corner.
    expect(at(order, 12, 11, 1)).toBeGreaterThan(at(order, 12, 1, 1));
    expect(at(order, 12, 1, 1)).toBeGreaterThan(at(order, 12, 1, 8));
  });

  it("never spreads from one change into a neighbouring opposite one", () => {
    // Fog | hide (2–5) | reveal (6–17) | open, as a change during a running spread can make.
    const from = mask(20, 6, (x) => (x >= 2 && x <= 5) || x >= 18);
    const to = mask(20, 6, (x) => x >= 6);
    const order = spreadOrder(20, 6, from, to);
    for (let x = 2; x < 5; x++)
      expect(at(order, 20, x, 3)).toBeLessThan(at(order, 20, x + 1, 3));
    for (let x = 17; x > 6; x--)
      expect(at(order, 20, x, 3)).toBeLessThan(at(order, 20, x - 1, 3));
  });

  it("clears and hides the whole map from its middle", () => {
    const fogged = mask(17, 17, () => false);
    const open = mask(17, 17, () => true);
    const reveal = spreadOrder(17, 17, fogged, open);
    expect(at(reveal, 17, 8, 8)).toBe(0);
    expect(at(reveal, 17, 0, 8)).toBe(255);
    // Nothing fogged to come from: the hide grows from the map's middle too (T-249).
    const hide = spreadOrder(17, 17, open, fogged);
    expect(at(hide, 17, 8, 8)).toBe(0);
    expect(at(hide, 17, 0, 8)).toBe(255);
  });

  it("turns a change without length over at once", () => {
    const from = mask(9, 9, () => false);
    expect(
      at(
        spreadOrder(
          9,
          9,
          from,
          mask(9, 9, (x, y) => x === 4 && y === 4),
        ),
        9,
        4,
        4,
      ),
    ).toBe(0);
    const line = spreadOrder(
      9,
      9,
      from,
      mask(9, 9, (_, y) => y === 4),
    );
    for (let x = 0; x < 9; x++) expect(at(line, 9, x, 4)).toBe(0);
  });

  it("gives unchanged texels next to a change its order, so filtering keeps the front", () => {
    const from = mask(16, 8, (x) => x < 4);
    const to = mask(16, 8, (x) => x < 12);
    const order = spreadOrder(16, 8, from, to);
    // The fog right after the reveal's far end carries the far end's order.
    expect(at(order, 16, 12, 4)).toBe(at(order, 16, 11, 4));
  });

  it("times each separate change on its own, so all finish together", () => {
    const from = mask(30, 9, () => false);
    // A small and a large isolated reveal.
    const to = mask(
      30,
      9,
      (x, y) =>
        (x >= 1 && x <= 5 && y >= 1 && y <= 5) ||
        (x >= 10 && x <= 28 && y >= 0),
    );
    const order = spreadOrder(30, 9, from, to);
    expect(at(order, 30, 1, 3)).toBe(255);
    expect(at(order, 30, 10, 4)).toBe(255);
  });
});

describe("spreadMix", () => {
  const from = Uint8Array.from([255, 255, 0, 100]);
  const to = Uint8Array.from([255, 0, 255, 100]);

  it("starts at the old fog and ends at the new one", () => {
    const order = Uint8Array.from([0, 128, 255, 0]);
    expect([...spreadMix(from, to, order, 0)]).toEqual([...from]);
    expect([...spreadMix(from, to, order, 1)]).toEqual([...to]);
  });

  it("changes early texels first", () => {
    const order = Uint8Array.from([0, 0, 255, 0]);
    const half = spreadMix(from, to, order, 0.5);
    // Texel 1 (early) is revealed by now; texel 2 (late) has not started to hide.
    expect(half[1]).toBe(0);
    expect(half[2]).toBe(0);
  });

  it("keeps fog that is fog before and after at every moment", () => {
    for (const t of [0, 0.1, 0.33, 0.5, 0.77, 0.99, 1])
      for (const step of [0, 77, 255])
        expect(
          spreadMix(from, to, Uint8Array.from([step, 0, 0, 0]), t)[0],
        ).toBe(255);
  });
});

describe("coarseSpreadOrder", () => {
  it("works on a grid at most ORDER_SIDE long, spreading the same way", () => {
    const width = 4 * ORDER_SIDE;
    const height = 8;
    // Revealed on the left quarter; the reveal opens the rest.
    const from = mask(width, height, (x) => x < ORDER_SIDE);
    const to = mask(width, height, () => true);
    const order = coarseSpreadOrder(
      { width, height, data: from },
      { width, height, data: to },
    );
    expect(order.width).toBe(ORDER_SIDE);
    expect(order.height).toBe(2);
    const fine = sampleOrder(order, width, height);
    expect(fine).toHaveLength(width * height);
    expect(at(fine, width, ORDER_SIDE + 10, 4)).toBeLessThan(
      at(fine, width, width - 10, 4),
    );
  });

  it("keeps small masks as they are", () => {
    const from = mask(10, 10, () => false);
    const to = mask(10, 10, (x, y) => x > 2 && x < 8 && y > 2 && y < 8);
    const order = coarseSpreadOrder(
      { width: 10, height: 10, data: from },
      { width: 10, height: 10, data: to },
    );
    expect([...order.data]).toEqual([...spreadOrder(10, 10, from, to)]);
    expect([...sampleOrder(order, 10, 10)]).toEqual([...order.data]);
  });
});

describe("spreading at a speed (T-246)", () => {
  it("times every change against the longest one, so a small one finishes first", () => {
    const from = mask(30, 9, () => false);
    const to = mask(
      30,
      9,
      (x, y) =>
        (x >= 1 && x <= 5 && y >= 1 && y <= 5) ||
        (x >= 10 && x <= 28 && y >= 0),
    );
    const order = spreadOrder(30, 9, from, to, { atSpeed: true });
    // Both clear from their middle; the large one's edge opens last, the small one's edge (its
    // last texel) when half of the time has passed.
    expect(at(order, 30, 10, 4)).toBe(255);
    expect(at(order, 30, 1, 3)).toBeLessThanOrEqual(128);
  });

  it("measures the longest change in texels", () => {
    // A reveal 12 texels long from the revealed columns 0–3.
    const from = mask(16, 8, (x) => x < 4);
    const to = mask(16, 8, () => true);
    const { longest } = spreadTiming(16, 8, from, to, { atSpeed: true });
    expect(longest).toBeCloseTo(11, 0);
  });

  it("keeps the directions of T-167 with a ragged front", () => {
    const weights = raggedWeights(24, 24, 0.5, 7);
    const options = { atSpeed: true, weights };
    // An adjacent reveal starts at the revealed side and ends at the far side.
    const adjacent = spreadOrder(
      24,
      24,
      mask(24, 24, (x) => x < 4),
      mask(24, 24, () => true),
      options,
    );
    expect(at(adjacent, 24, 4, 12)).toBeLessThan(at(adjacent, 24, 23, 12));
    // An isolated reveal clears from its middle.
    const isolated = spreadOrder(
      24,
      24,
      mask(24, 24, () => false),
      mask(24, 24, (x, y) => x >= 4 && x <= 20 && y >= 4 && y <= 20),
      options,
    );
    expect(at(isolated, 24, 12, 12)).toBeLessThan(at(isolated, 24, 4, 12));
    // A hide comes in from the fog side.
    const hide = spreadOrder(
      24,
      24,
      mask(24, 24, (x) => x >= 4),
      mask(24, 24, () => false),
      options,
    );
    expect(at(hide, 24, 4, 12)).toBeLessThan(at(hide, 24, 23, 12));
  });

  it("makes the front ragged: one column turns over at different times", () => {
    const from = mask(40, 40, (x) => x < 2);
    const to = mask(40, 40, () => true);
    const even = spreadOrder(40, 40, from, to, { atSpeed: true });
    const ragged = spreadOrder(40, 40, from, to, {
      atSpeed: true,
      weights: raggedWeights(40, 40, 0.5, 3),
    });
    const column = (order: Uint8Array) =>
      new Set(Array.from({ length: 40 }, (_, y) => at(order, 40, 20, y))).size;
    expect(column(even)).toBe(1);
    expect(column(ragged)).toBeGreaterThan(5);
  });

  it("measures a ragged change by the path its front travels, so the speed holds", () => {
    const from = mask(64, 16, (x) => x < 1);
    const to = mask(64, 16, () => true);
    const plain = spreadTiming(64, 16, from, to, { atSpeed: true }).longest;
    const ragged = spreadTiming(64, 16, from, to, {
      atSpeed: true,
      weights: raggedWeights(64, 16, 0.5, 9),
    }).longest;
    // The front's path is at least as long as the straight way, and not wildly longer.
    expect(ragged).toBeGreaterThanOrEqual(plain - 0.5);
    expect(ragged).toBeLessThan(plain * 1.5);
  });

  it("gives the same weights for the same map, and others for another", () => {
    const a = raggedWeights(32, 32, 0.25, 11);
    expect([...raggedWeights(32, 32, 0.25, 11)]).toEqual([...a]);
    expect([...raggedWeights(32, 32, 0.25, 12)]).not.toEqual([...a]);
    expect(Math.min(...a)).toBeGreaterThanOrEqual(1);
    expect(Math.max(...a)).toBeLessThanOrEqual(12);
  });

  it("is ragged and at speed on the coarse grid, with the length in mask texels", () => {
    const width = 2 * ORDER_SIDE;
    const from = mask(width, 8, (x) => x < 16);
    const to = mask(width, 8, () => true);
    const order = coarseSpreadOrder(
      { width, height: 8, data: from },
      { width, height: 8, data: to },
      { cellsPerTexel: 0.1, seed: 5 },
    );
    expect(order.width).toBe(ORDER_SIDE);
    expect(order.longest).toBeGreaterThan(width / 2);
  });
});

describe("spreadAtSpeed", () => {
  it("takes longer for a longer change and a slower speed", () => {
    // 10 cells of 100 px at 5 cells/s: 2 s of travel, then 0.5 s for the last spot.
    const timing = spreadAtSpeed(1000, 100, 5, 500);
    expect(timing.duration).toBe(2500);
    expect(timing.shares.spread).toBeCloseTo(0.8);
    expect(timing.shares.front).toBeCloseTo(0.2);
    expect(spreadAtSpeed(2000, 100, 5, 500).duration).toBe(4500);
    expect(spreadAtSpeed(1000, 100, 10, 500).duration).toBe(1500);
  });

  it("turns everything over together at Sofort, and not at all with no transition", () => {
    const instant = spreadAtSpeed(1000, 100, Infinity, 650);
    expect(instant.duration).toBe(650);
    expect(instant.shares.spread).toBe(0);
    expect(spreadAtSpeed(1000, 100, Infinity, 0).duration).toBe(0);
    // A finite speed without a transition still travels, each spot switching at once.
    expect(spreadAtSpeed(1000, 100, 5, 0).duration).toBeCloseTo(2001);
  });

  it("mixes as the shares say: the last spot turns over in the last share", () => {
    const { shares } = spreadAtSpeed(1000, 100, 5, 500);
    const from = Uint8Array.from([255, 255]);
    const to = Uint8Array.from([0, 0]);
    const order = Uint8Array.from([0, 255]);
    const early = spreadMix(from, to, order, 0.5, shares);
    // The first spot is done after its 500 ms; the last has not started yet.
    expect([...early]).toEqual([0, 255]);
    expect([...spreadMix(from, to, order, 1, shares)]).toEqual([0, 0]);
    // The fixed duration's split is the default.
    expect([...spreadMix(from, to, order, 0.5)]).toEqual([
      ...spreadMix(from, to, order, 0.5, DURATION_SHARES),
    ]);
  });
});

describe("spreading from a chosen point (T-249)", () => {
  it("covers an isolated hide from the point given by its share of the changed texels", () => {
    const open = mask(20, 20, () => true);
    const fogged = mask(20, 20, () => false);
    // Share 0: the first changed texel in reading order, the top left corner.
    const order = spreadOrder(20, 20, open, fogged, { originShare: 0 });
    expect(at(order, 20, 0, 0)).toBe(0);
    expect(at(order, 20, 19, 19)).toBe(255);
    // Another share, another start.
    const other = spreadOrder(20, 20, open, fogged, { originShare: 0.999 });
    expect(at(other, 20, 19, 19)).toBe(0);
    expect(at(other, 20, 0, 0)).toBe(255);
  });

  it("ignores the point unless the whole map ends fogged", () => {
    const open = mask(20, 20, () => true);
    // A sliver stays revealed: an isolated hide again, from its middle.
    const almost = mask(20, 20, (x, y) => x === 19 && y === 0);
    const order = spreadOrder(20, 20, open, almost, { originShare: 0 });
    expect(at(order, 20, 0, 0)).not.toBe(0);
  });

  it("still comes in from the fog a hide touches", () => {
    const from = mask(16, 8, (x) => x >= 2);
    const to = mask(16, 8, (x) => x >= 10);
    const order = spreadOrder(16, 8, from, to, { originShare: 0.9 });
    expect(at(order, 16, 2, 4)).toBe(0);
    expect(at(order, 16, 9, 4)).toBe(255);
  });
});
