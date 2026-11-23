// How the fog looks on this device (T-136a, T-136b): kept in the webview's storage like the
// theme, so no file format changes. The DM window and the player window share that storage,
// so the player window follows a change through the `storage` event.

import { LIVING_EDGE_MAX, type LivingFog } from "../render/pixi/renderer";
import type { FogEffect } from "../core/poly/types";

const SOFT_EDGES_KEY = "dm.fog.softEdges";
const FADE_KEY = "dm.fog.fadeSeconds";
const QUALITY_KEY = "dm.fog.quality";
const EDGE_KEY = "dm.fog.edge";
const MOTION_KEY = "dm.fog.motion";
const SPEED_KEY = "dm.fog.speed";
const COVER_FROM_KEY = "dm.fog.coverFrom";
const KEYS = [
  SOFT_EDGES_KEY,
  FADE_KEY,
  QUALITY_KEY,
  EDGE_KEY,
  MOTION_KEY,
  SPEED_KEY,
  COVER_FROM_KEY,
];

/**
 * Width of the soft fog edge as a share of a grid cell, from the hard edge inwards: soft, while
 * a revealed one-cell corridor or door stays open in its middle.
 */
export const SOFT_EDGE_CELLS = 0.25;

/** The fade duration's range in seconds (DM decision): 0 switches at once. */
export const FADE_MAX_SECONDS = 3;
export const FADE_STEP_SECONDS = 0.05;
const DEFAULT_FADE_SECONDS = 0.65;

/** How much the living fog (T-245) does on this device; "off" is the still fog of before. */
export const FOG_QUALITIES = ["high", "medium", "off"] as const;
export type FogQuality = (typeof FOG_QUALITIES)[number];

/** The living fog's sliders (ADR-0019): range, step and default. */
export const FOG_EDGE = {
  max: LIVING_EDGE_MAX,
  step: 0.1,
  default: 1.2,
} as const;
export const FOG_MOTION = { max: 3, step: 0.1, default: 1 } as const;
/** The drift with "reduce motion" on in the system and nothing chosen here. */
const REDUCED_MOTION = 0.2;

/** The fog's look on this device. */
export interface FogLook {
  readonly softEdges: boolean;
  /** How long a fog change fades, 0 … 3 s. */
  readonly fadeSeconds: number;
  readonly quality: FogQuality;
  /** Edge wobble of the living fog, 0 … 2.5. */
  readonly edge: number;
  /** Drift speed of the living fog, 0 … 3. */
  readonly motion: number;
  /** How fast a fog change spreads, in grid cells per second; `Infinity` is "Sofort" (T-246). */
  readonly speed: number;
  /** Where "Alles verdecken" starts when no fog is left (T-249). */
  readonly coverFrom: CoverFrom;
}

/** Where hiding everything starts on a fully revealed map (DM decision, 2026-11-22). */
export const COVER_FROM = ["middle", "random"] as const;
export type CoverFrom = (typeof COVER_FROM)[number];

/** The start of "Alles verdecken" on this device: the map's middle unless chosen. */
export function readCoverFrom(storage: Storage | undefined): CoverFrom {
  const value = readItem(storage, COVER_FROM_KEY);
  return COVER_FROM.find((each) => each === value) ?? "middle";
}

export function saveCoverFrom(
  storage: Storage | undefined,
  coverFrom: CoverFrom,
): void {
  saveItem(storage, COVER_FROM_KEY, coverFrom);
}

/**
 * The spread's speeds in grid cells per second (DM decisions, 2026-11-22): 0.5 … 40 in roughly
 * even ratios, 5 by default; the slider's step after the last is "Sofort".
 */
const SPEEDS = [
  0.5, 0.6, 0.7, 0.8, 1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10, 12, 15, 20, 25,
  30, 40,
] as const;

export const FOG_SPEED = {
  min: SPEEDS[0],
  max: SPEEDS[20],
  default: 5,
  /** The slider's last step, "Sofort". */
  steps: SPEEDS.length,
} as const;

/** Soft edges on unless switched off on this device (DM request: no hard edges). */
export function readSoftEdges(storage: Storage | undefined): boolean {
  try {
    return storage?.getItem(SOFT_EDGES_KEY) !== "off";
  } catch {
    return true;
  }
}

/** Remembers the choice on this device; a storage that refuses it is ignored. */
export function saveSoftEdges(storage: Storage | undefined, on: boolean): void {
  try {
    storage?.setItem(SOFT_EDGES_KEY, on ? "on" : "off");
  } catch {
    // Not persisted; the choice still applies until the window closes.
  }
}

/** A duration within 0 … 3 s on the slider's steps; anything else is the default. */
function fadeSecondsOf(value: string | null): number {
  if (value === null || value.trim() === "") return DEFAULT_FADE_SECONDS;
  const seconds = Number(value);
  if (!Number.isFinite(seconds)) return DEFAULT_FADE_SECONDS;
  const clamped = Math.min(FADE_MAX_SECONDS, Math.max(0, seconds));
  // Two decimals: 1.25, not 1.2500000000000002.
  return Number(
    (Math.round(clamped / FADE_STEP_SECONDS) * FADE_STEP_SECONDS).toFixed(2),
  );
}

/** The fade duration on this device in seconds (0.65 s unless chosen). */
export function readFadeSeconds(storage: Storage | undefined): number {
  try {
    return fadeSecondsOf(storage?.getItem(FADE_KEY) ?? null);
  } catch {
    return DEFAULT_FADE_SECONDS;
  }
}

/** Remembers the fade duration on this device; a storage that refuses it is ignored. */
export function saveFadeSeconds(
  storage: Storage | undefined,
  seconds: number,
): void {
  try {
    storage?.setItem(FADE_KEY, String(fadeSecondsOf(String(seconds))));
  } catch {
    // Not persisted; the duration still applies until the window closes.
  }
}

/** The quality chosen on this device; "medium" unless chosen (DM decision, 2026-11-22). */
export function readFogQuality(storage: Storage | undefined): FogQuality {
  const value = readItem(storage, QUALITY_KEY);
  return FOG_QUALITIES.find((each) => each === value) ?? "medium";
}

export function saveFogQuality(
  storage: Storage | undefined,
  quality: FogQuality,
): void {
  saveItem(storage, QUALITY_KEY, quality);
}

/** A slider value within 0 … `max` on its steps, or `fallback` for anything else. */
function sliderValue(
  value: string | null,
  range: { readonly max: number; readonly step: number },
  fallback: number,
): number {
  if (value === null || value.trim() === "") return fallback;
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  const clamped = Math.min(range.max, Math.max(0, number));
  return Number((Math.round(clamped / range.step) * range.step).toFixed(2));
}

/** The edge wobble on this device (1.2 unless chosen). */
export function readFogEdge(storage: Storage | undefined): number {
  return sliderValue(readItem(storage, EDGE_KEY), FOG_EDGE, FOG_EDGE.default);
}

export function saveFogEdge(storage: Storage | undefined, edge: number): void {
  saveItem(
    storage,
    EDGE_KEY,
    String(sliderValue(String(edge), FOG_EDGE, FOG_EDGE.default)),
  );
}

/** The drift speed on this device: 1 unless chosen, low when the system asks for less motion. */
export function readFogMotion(
  storage: Storage | undefined,
  reducedMotion = prefersReducedMotion(),
): number {
  return sliderValue(
    readItem(storage, MOTION_KEY),
    FOG_MOTION,
    reducedMotion ? REDUCED_MOTION : FOG_MOTION.default,
  );
}

export function saveFogMotion(
  storage: Storage | undefined,
  motion: number,
): void {
  saveItem(
    storage,
    MOTION_KEY,
    String(sliderValue(String(motion), FOG_MOTION, FOG_MOTION.default)),
  );
}

function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

function readItem(storage: Storage | undefined, key: string): string | null {
  try {
    return storage?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

function saveItem(
  storage: Storage | undefined,
  key: string,
  value: string,
): void {
  try {
    storage?.setItem(key, value);
  } catch {
    // Not persisted; the choice still applies until the window closes.
  }
}

/** The spread's speed for a slider position 0 … `FOG_SPEED.steps` (the last is "Sofort"). */
export function speedOfStep(step: number): number {
  if (step >= FOG_SPEED.steps) return Infinity;
  return SPEEDS[Math.max(0, Math.round(step))] ?? FOG_SPEED.default;
}

/** The slider position nearest to `speed` (by ratio). */
export function stepOfSpeed(speed: number): number {
  if (!Number.isFinite(speed)) return FOG_SPEED.steps;
  let best = 0;
  SPEEDS.forEach((each, step) => {
    const nearer =
      Math.abs(Math.log(each / speed)) <
      Math.abs(Math.log((SPEEDS[best] ?? each) / speed));
    if (nearer) best = step;
  });
  return best;
}

/** The spread's speed on this device: 5 cells per second unless chosen. */
export function readFogSpeed(storage: Storage | undefined): number {
  const value = readItem(storage, SPEED_KEY);
  if (value === "instant") return Infinity;
  if (value === null || value.trim() === "") return FOG_SPEED.default;
  const speed = Number(value);
  if (!Number.isFinite(speed) || speed <= 0) return FOG_SPEED.default;
  return Math.min(FOG_SPEED.max, Math.max(FOG_SPEED.min, speed));
}

export function saveFogSpeed(
  storage: Storage | undefined,
  speed: number,
): void {
  saveItem(
    storage,
    SPEED_KEY,
    Number.isFinite(speed) ? String(speed) : "instant",
  );
}

/**
 * The spread for the map at `mapPath` with `cellSizePx` cells, as the renderer takes it
 * (T-246): seeded by the map's path, so a map's ragged fronts look the same in the DM window
 * and on the TV, every time.
 */
export function fogSpeed(
  look: FogLook,
  cellSizePx: number,
  mapPath: string,
): {
  readonly cellsPerSecond: number;
  readonly cellSizePx: number;
  readonly seed: number;
} {
  return { cellsPerSecond: look.speed, cellSizePx, seed: seedOf(mapPath) };
}

/** FNV-1a of `text`: a stable number for a map's path. */
function seedOf(text: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index++) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash | 0;
}

/** All settings at once. */
export function readFogLook(storage: Storage | undefined): FogLook {
  return {
    softEdges: readSoftEdges(storage),
    fadeSeconds: readFadeSeconds(storage),
    quality: readFogQuality(storage),
    edge: readFogEdge(storage),
    motion: readFogMotion(storage),
    speed: readFogSpeed(storage),
    coverFrom: readCoverFrom(storage),
  };
}

/** The living fog for a map with `cellSizePx` cells, or none with the quality "off". */
export function livingFog(
  look: FogLook,
  cellSizePx: number,
  /** The fog's biome as played (T-168); none: Bodennebel. */
  effect: FogEffect | null = null,
): LivingFog | undefined {
  if (look.quality === "off") return undefined;
  return {
    quality: look.quality,
    cellSizePx,
    edge: look.edge,
    motion: look.motion,
    ...(effect && { biome: effect.biome, strength: effect.strength }),
  };
}

/** The soft edge in map pixels for a map with `cellSizePx` cells; 0 draws hard edges. */
export function softEdgeWidth(cellSizePx: number, on: boolean): number {
  return on ? cellSizePx * SOFT_EDGE_CELLS : 0;
}

/**
 * Calls `listener` with the new look when another window of this app changes it (the browser
 * fires `storage` only in the other windows). Returns a function that stops listening.
 */
export function onFogLookChange(
  storage: Storage | undefined,
  listener: (look: FogLook) => void,
): () => void {
  const onStorage = (event: StorageEvent) => {
    if (event.key !== null && KEYS.includes(event.key))
      listener(readFogLook(storage));
  };
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener("storage", onStorage);
  };
}
