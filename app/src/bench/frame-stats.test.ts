import { describe, expect, test } from "vitest";
import { percentile, summarize, verdict } from "./frame-stats";

describe("percentile", () => {
  test("uses the nearest rank", () => {
    const sorted = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    expect(percentile(sorted, 50)).toBe(5);
    expect(percentile(sorted, 95)).toBe(10);
    expect(percentile(sorted, 10)).toBe(1);
  });

  test("is NaN for no data", () => {
    expect(percentile([], 50)).toBeNaN();
  });
});

describe("summarize", () => {
  test("reports percentiles, fps and missed refreshes", () => {
    const intervals = [...Array<number>(98).fill(16.7), 33.4, 50];

    const stats = summarize(intervals, 25);

    expect(stats).toMatchObject({
      frames: 100,
      p50: 16.7,
      p95: 16.7,
      p99: 33.4,
      max: 50,
      missed: 2,
      missedPercent: 2,
    });
    expect(stats.averageFps).toBeCloseTo(100_000 / (98 * 16.7 + 83.4));
  });
});

describe("verdict", () => {
  // WebKit-style jitter on a perfect 60 Hz run: p95 is above 16.7 ms, yet no refresh is missed.
  const perfect = summarize(
    Array.from({ length: 600 }, (_, index) => (index % 2 === 0 ? 16 : 17.4)),
    25,
  );

  test("a jittery but complete 60 Hz run meets the budget", () => {
    expect(perfect.p95).toBeGreaterThan(16.7);
    expect(verdict(perfect, 60)).toBe("met");
  });

  test("more than 1 % missed refreshes does not", () => {
    const stuttering = summarize(
      [...Array<number>(97).fill(16.7), 33, 33, 33],
      25,
    );
    expect(verdict(stuttering, 60)).toBe("not met");
  });

  test("a display running below 60 Hz cannot be judged", () => {
    expect(verdict(perfect, 30)).toBe("display below 60 Hz");
  });
});
