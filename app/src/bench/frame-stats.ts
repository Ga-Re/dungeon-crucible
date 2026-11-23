// Frame statistics of the renderer benchmark (T-105d; from the T-007 spike): frame intervals in,
// percentiles, missed refreshes and the budget's verdict out (ARCHITECTURE §11).

/** Summary of recorded frame intervals in milliseconds. */
export interface FrameStats {
  readonly frames: number;
  readonly p50: number;
  readonly p95: number;
  readonly p99: number;
  readonly max: number;
  readonly averageFps: number;
  /** Frames whose interval exceeded `missedThresholdMs`, i.e. at least one display refresh was missed. */
  readonly missed: number;
  readonly missedPercent: number;
}

/** Nearest-rank percentile of an ascending list; `rank` in (0, 100]. */
export function percentile(sorted: readonly number[], rank: number): number {
  if (sorted.length === 0) return Number.NaN;
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil((rank / 100) * sorted.length) - 1),
  );
  return sorted[index] ?? Number.NaN;
}

/**
 * Summarises frame intervals (ms between consecutive frames).
 * @param missedThresholdMs an interval above this counts as a missed refresh; use 1.5× the display's refresh interval
 */
export function summarize(
  intervals: readonly number[],
  missedThresholdMs: number,
): FrameStats {
  const sorted = [...intervals].sort((a, b) => a - b);
  const total = intervals.reduce((sum, value) => sum + value, 0);
  const missed = intervals.filter((value) => value > missedThresholdMs).length;
  return {
    frames: intervals.length,
    p50: percentile(sorted, 50),
    p95: percentile(sorted, 95),
    p99: percentile(sorted, 99),
    max: sorted.at(-1) ?? Number.NaN,
    averageFps: total > 0 ? (intervals.length * 1000) / total : Number.NaN,
    missed,
    missedPercent:
      intervals.length > 0 ? (missed / intervals.length) * 100 : Number.NaN,
  };
}

/** Budget: 60 FPS (ARCHITECTURE §11). */
export const TARGET_FPS = 60;
/** At most this share of frames may miss a refresh for the budget to count as met. */
export const MAX_MISSED_PERCENT = 1;

export type Verdict = "met" | "not met" | "display below 60 Hz";

/**
 * Budget verdict. Frame intervals jitter around the refresh interval (and WebKit coarsens
 * timers), so a p95 of exactly ≤ 16.7 ms is unreachable even when every refresh is hit;
 * the budget is judged by the share of missed refreshes instead.
 */
export function verdict(stats: FrameStats, refreshHz: number): Verdict {
  if (refreshHz < TARGET_FPS - 2) return "display below 60 Hz";
  return stats.missedPercent <= MAX_MISSED_PERCENT ? "met" : "not met";
}
