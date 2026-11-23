import { fitCamera, zoomAt, type Camera, type Size } from "../render/pixi/camera";
import type { TokenShape } from "../render/pixi/renderer";

// The renderer benchmark scene (T-105d, ARCHITECTURE §11): a 4K map as a video, realistic fog
// with soft edges and holes, 20 tokens and a camera that keeps moving – what the TV shows during
// play, at the budget's worst case. Pure data and maths: the benchmark page in the desktop app
// draws it with the real renderer; the tests here check its shape.

/** The map: 4K, as an animated map of the DM's library would be. */
export const BENCH_MAP: Size = { width: 3840, height: 2160 };

/** Grid cells in map pixels (a 4K map with 1-inch cells at 140 px). */
export const BENCH_CELL = 140;

type Ring = [number, number][];
/** An area of fog revealed, in map pixels: outline and holes (as a scene's fog has them). */
// A type, not an interface: it then fits the schema's (open) polygon type as it is.
export type BenchArea = {
  readonly outer: Ring;
  readonly holes: Ring[];
};

const rect = (x: number, y: number, width: number, height: number): Ring => [
  [x, y],
  [x + width, y],
  [x + width, y + height],
  [x, y + height],
];

/** A rough circle (a brush stroke's end or a light's reach), `corners` points around. */
const circle = (cx: number, cy: number, radius: number, corners = 24): Ring =>
  Array.from({ length: corners }, (_, index): [number, number] => {
    const angle = (index / corners) * 2 * Math.PI;
    return [cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius];
  });

/**
 * Revealed fog as play leaves it: rooms and corridors, round areas a brush revealed, and holes
 * hidden again inside (secret doors, an unexplored niche).
 */
export function benchFog(): BenchArea[] {
  return [
    { outer: rect(140, 140, 1120, 840), holes: [rect(700, 420, 280, 280)] },
    { outer: rect(1260, 420, 980, 280), holes: [] },
    { outer: rect(2240, 140, 1400, 1260), holes: [circle(2940, 770, 210)] },
    { outer: rect(560, 980, 280, 840), holes: [] },
    { outer: circle(980, 1680, 420, 32), holes: [] },
    { outer: circle(1820, 1540, 300, 32), holes: [] },
    { outer: circle(3220, 1820, 240, 32), holes: [] },
  ];
}

/** How soft the fog's edge is, in map pixels (the DM's "weiche Kanten"). */
export const BENCH_SOFT_EDGE = 40;

/** 20 tokens of mixed sizes spread over the revealed rooms (initials, one ring each). */
export function benchTokens(): TokenShape[] {
  const names = [
    "Aria",
    "Bran",
    "Cora",
    "Dain",
    "Goblin 1",
    "Goblin 2",
    "Goblin 3",
    "Goblin 4",
    "Goblin 5",
    "Goblin 6",
    "Oger",
    "Wolf 1",
    "Wolf 2",
    "Wolf 3",
    "Ratte",
    "Spinne",
    "Kultist 1",
    "Kultist 2",
    "Drache",
    "Golem",
  ];
  return names.map((name, index) => {
    const large = name === "Oger" || name === "Golem";
    const huge = name === "Drache";
    const cells = huge ? 3 : large ? 2 : 1;
    // Rows of tokens across the rooms, each on its own cells.
    const col = 2 + ((index * 3) % 24);
    const row = 2 + Math.floor((index * 3) / 24) * 4;
    return {
      id: `bench-${String(index)}`,
      name,
      x: col * BENCH_CELL,
      y: row * BENCH_CELL,
      width: cells * BENCH_CELL,
      height: cells * BENCH_CELL,
      ...(index === 0 && { active: true }),
    };
  });
}

/** How long one camera cycle takes, in milliseconds. */
export const BENCH_CYCLE_MS = 20_000;

/**
 * The camera at `ms` into the benchmark, for a view of `view` CSS pixels: the whole map fitted,
 * then zoomed in up to 2.5× on a point that wanders across the map and back – the camera never
 * stands still, so every frame draws.
 */
export function benchCamera(ms: number, view: Size): Camera {
  const fitted = fitCamera(BENCH_MAP, view, 0);
  const phase = (ms % BENCH_CYCLE_MS) / BENCH_CYCLE_MS;
  const wave = (1 - Math.cos(phase * 2 * Math.PI)) / 2;
  const zoom = 1 + 1.5 * wave;
  const anchor = {
    x: view.width * (0.25 + 0.5 * phase),
    y: view.height * (0.35 + 0.3 * Math.sin(phase * 2 * Math.PI)),
  };
  return zoomAt(fitted, zoom, anchor, view);
}
