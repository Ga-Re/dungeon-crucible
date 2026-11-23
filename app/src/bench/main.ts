// Renderer benchmark, ported from Dungeon-Manager (T-105d, ARCHITECTURE §11): the real renderer
// draws the benchmark scene – a 4K video map, soft fog with holes, 20 tokens, a camera that never
// stands still – in the table window on the TV, while the DM window is open. Developer tool: its
// text is English on purpose.
//
// Dungeon Crucible addition: the fog is drawn as living fog at the device's default quality
// (Mittel) unless VITE_BENCH_QUALITY says "off" (Dungeon-Manager's still soft fog) or "high".
//
// What is measured: the intervals between animation frames (requestAnimationFrame cadence), not
// GPU completion; and the video's dropped frames.
import { convertFileSrc } from '@tauri-apps/api/core';
import { createRenderer, type FogOptions } from '../render/pixi/renderer';
import type { Size } from '../render/pixi/camera';
import { createMapVideo } from '../render/mapImages';
import { BENCH_CELL, BENCH_SOFT_EDGE, benchCamera, benchFog, benchTokens } from './bench-scene';
import { MAX_MISSED_PERCENT, TARGET_FPS, summarize, verdict, type FrameStats } from './frame-stats';

const WARM_UP_MS = 5_000;
const MEASURE_MS = Number(import.meta.env.VITE_BENCH_SECONDS ?? '30') * 1000;
const REFRESH_SAMPLE_MS = 2_000;
const STABLE_MS = 1_500;
/** Absolute path of the 4K video map inside the open campaign folder (asset protocol scope). */
const VIDEO_PATH: string = import.meta.env.VITE_BENCH_VIDEO ?? '';
const QUALITY = (import.meta.env.VITE_BENCH_QUALITY ?? 'medium') as 'off' | 'medium' | 'high';
const TARGET_BACKING = { width: 3840, height: 2160 };
const MISSED_LISTED = 50;

const report = document.querySelector<HTMLPreElement>('#report');
const stage = document.querySelector<HTMLDivElement>('#stage');
const say = (text: string) => {
  if (report) report.textContent = text;
};

const viewSize = (): Size => ({ width: window.innerWidth, height: window.innerHeight });
const describeWindow = () => `${window.innerWidth}×${window.innerHeight}@${window.devicePixelRatio}`;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Waits until the table window is visible and its size has settled on the TV. */
async function waitForStableWindow() {
  let last = '';
  let stableSince = performance.now();
  for (;;) {
    const current = describeWindow();
    if (current !== last) {
      last = current;
      stableSince = performance.now();
    }
    if (document.visibilityState === 'visible' && performance.now() - stableSince > STABLE_MS) return;
    await sleep(100);
  }
}

function recordFrames(ms: number, onFrame: (elapsed: number) => void = () => undefined): Promise<{ intervals: number[]; at: number[] }> {
  return new Promise((resolve) => {
    const intervals: number[] = [];
    const at: number[] = [];
    let start: number | null = null;
    let last: number | null = null;
    const step = (now: number) => {
      start ??= now;
      if (last !== null) {
        intervals.push(now - last);
        at.push(now - start);
      }
      last = now;
      onFrame(now - start);
      if (now - start < ms) requestAnimationFrame(step);
      else resolve({ intervals, at });
    };
    requestAnimationFrame(step);
  });
}

const median = (values: readonly number[]) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)] ?? 16.7;

function describeGpu(canvas: HTMLCanvasElement): string {
  const gl = canvas.getContext('webgl2') ?? canvas.getContext('webgl');
  if (!gl) return 'unknown';
  const debug = gl.getExtension('WEBGL_debug_renderer_info');
  return String(gl.getParameter(debug ? debug.UNMASKED_RENDERER_WEBGL : gl.RENDERER));
}

interface BenchReport {
  readonly date: string;
  readonly userAgent: string;
  readonly gpu: string;
  readonly window: string;
  readonly canvas: string;
  readonly refreshHz: number;
  readonly measureSeconds: number;
  readonly fog: string;
  readonly video: string;
  readonly frames: FrameStats;
  readonly missedAtMs: readonly number[];
  readonly droppedVideoFrames: number | null;
  readonly warnings: readonly string[];
  readonly verdict: string;
}

async function main() {
  if (!stage) throw new Error('#stage is missing in bench.html');
  say('Waiting for the table window to settle on the TV …');
  await waitForStableWindow();
  say("Measuring the display's refresh rate …");
  const refreshMs = median((await recordFrames(REFRESH_SAMPLE_MS)).intervals);
  const refreshHz = 1000 / refreshMs;

  const canvas = document.createElement('canvas');
  stage.appendChild(canvas);
  const renderer = await createRenderer({ canvas, size: viewSize(), resolution: window.devicePixelRatio });
  const onResize = () => renderer.resize(viewSize());
  window.addEventListener('resize', onResize);
  const fog: FogOptions =
    QUALITY === 'off'
      ? { opacity: 1, softEdge: BENCH_SOFT_EDGE }
      : { opacity: 1, living: { quality: QUALITY, cellSizePx: BENCH_CELL, edge: 1.2, motion: 1, biome: 'nebel', strength: 1 } };
  // Fog first, then the video (ADR-0010: never a map without its fog).
  renderer.setFog(benchFog(), fog);
  renderer.setTokens(benchTokens());
  let video: HTMLVideoElement | null = null;
  let videoNote: string;
  try {
    if (!VIDEO_PATH) throw new Error('VITE_BENCH_VIDEO is not set');
    video = await createMapVideo(convertFileSrc(VIDEO_PATH));
    canvas.before(video);
    renderer.setVideo(video);
    videoNote = `${video.videoWidth}×${video.videoHeight} (${VIDEO_PATH})`;
  } catch (error) {
    videoNote = `none – ${VIDEO_PATH || '(no path)'} could not be played (${String(error)}); see README "Renderer benchmark"`;
  }

  const moveCamera = (elapsed: number) => renderer.setCamera(benchCamera(elapsed, viewSize()));
  say(`Warming up (${WARM_UP_MS / 1000} s) …`);
  await recordFrames(WARM_UP_MS, moveCamera);
  say(`Measuring (${MEASURE_MS / 1000} s) – don't touch the windows …`);
  const windowBefore = describeWindow();
  const before = video?.getVideoPlaybackQuality().droppedVideoFrames ?? null;
  const { intervals, at } = await recordFrames(MEASURE_MS, (elapsed) => moveCamera(WARM_UP_MS + elapsed));
  const after = video?.getVideoPlaybackQuality().droppedVideoFrames ?? null;
  const windowAfter = describeWindow();

  // A frame later than 1.5 refresh intervals missed at least one refresh.
  const threshold = refreshMs * 1.5;
  const frames = summarize(intervals, threshold);
  const warnings: string[] = [];
  if (windowAfter !== windowBefore) warnings.push(`The window changed during the measurement (${windowBefore} → ${windowAfter}).`);
  if (canvas.width !== TARGET_BACKING.width || canvas.height !== TARGET_BACKING.height)
    warnings.push(`The picture is ${canvas.width}×${canvas.height}, not 3840×2160: the budget is for 4K.`);
  if (!video) warnings.push('No video map: only fog, tokens and camera were measured.');
  const result: BenchReport = {
    date: new Date().toISOString(),
    userAgent: navigator.userAgent,
    gpu: describeGpu(canvas),
    window: windowAfter,
    canvas: `${canvas.width}×${canvas.height}`,
    refreshHz,
    measureSeconds: MEASURE_MS / 1000,
    fog: QUALITY === 'off' ? 'soft edges (still)' : `living fog, quality ${QUALITY}`,
    video: videoNote,
    frames,
    missedAtMs: at.filter((_, i) => (intervals[i] ?? 0) > threshold).slice(0, MISSED_LISTED).map((ms) => Math.round(ms)),
    droppedVideoFrames: before === null || after === null ? null : after - before,
    warnings,
    verdict: verdict(frames, refreshHz),
  };
  video?.pause();
  window.removeEventListener('resize', onResize);
  say(
    [
      `Budget: ${TARGET_FPS} FPS, at most ${MAX_MISSED_PERCENT} % missed refreshes`,
      `Verdict: ${result.verdict}`,
      ...warnings.map((w) => `Warning: ${w}`),
      `Display: ${refreshHz.toFixed(1)} Hz, window ${result.window}, picture ${result.canvas}`,
      `GPU: ${result.gpu}`,
      `Fog: ${result.fog}`,
      `Video map: ${result.video}`,
      `Frames: ${frames.frames} in ${result.measureSeconds} s, ${frames.averageFps.toFixed(1)} FPS average`,
      `Intervals ms: p50 ${frames.p50.toFixed(1)}, p95 ${frames.p95.toFixed(1)}, p99 ${frames.p99.toFixed(1)}, max ${frames.max.toFixed(1)}`,
      `Missed refreshes: ${frames.missed} (${frames.missedPercent.toFixed(2)} %)`,
      `Dropped video frames: ${result.droppedVideoFrames === null ? '–' : result.droppedVideoFrames}`,
      'Saved by the dev server in app/bench-results/.',
    ].join('\n'),
  );
  await fetch('/__bench/results', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(result) }).catch(() => undefined);
}

main().catch((error: unknown) => say(`The benchmark failed: ${String(error)}`));
