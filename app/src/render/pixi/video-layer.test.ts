import { describe, expect, test } from "vitest";
import { screenToMap, type Camera } from "./camera";
import { createVideoGate, cssTransform, sameAspect } from "./video-layer";

const view = { width: 800, height: 400 };

/** Applies a CSS `matrix(a, b, c, d, e, f)` to a point, as the browser does. */
function applyMatrix(css: string, x: number, y: number) {
  const values =
    /matrix\(([^)]+)\)/.exec(css)?.[1]?.split(",").map(Number) ?? [];
  const [a = 0, b = 0, c = 0, d = 0, e = 0, f = 0] = values;
  return { x: a * x + c * y + e, y: b * x + d * y + f };
}

describe("cssTransform", () => {
  test("puts every map point where the canvas draws it, in all rotations", () => {
    for (const rotation of [0, 90, 180, 270] as const) {
      const camera: Camera = {
        centerX: 300,
        centerY: 200,
        zoom: 1.5,
        rotation,
      };
      const css = cssTransform(camera, view);
      for (const screen of [
        { x: 0, y: 0 },
        { x: 800, y: 400 },
        { x: 123, y: 321 },
      ]) {
        const map = screenToMap(camera, view, screen);
        const placed = applyMatrix(css, map.x, map.y);
        expect(placed.x).toBeCloseTo(screen.x, 6);
        expect(placed.y).toBeCloseTo(screen.y, 6);
      }
    }
  });
});

describe("video gate (fail closed, ADR-0010)", () => {
  test("hidden until a frame was drawn with the fog known", () => {
    const gate = createVideoGate();
    expect(gate.visible()).toBe(false);
    gate.drawn();
    expect(gate.visible()).toBe(false);
    gate.fogSet();
    expect(gate.visible()).toBe(false);
    gate.drawn();
    expect(gate.visible()).toBe(true);
  });

  test("hidden again on resize, a new video and context loss until the next draw", () => {
    const gate = createVideoGate();
    gate.fogSet();
    gate.drawn();
    gate.resized();
    expect(gate.visible()).toBe(false);
    gate.drawn();
    expect(gate.visible()).toBe(true);
    gate.newVideo();
    expect(gate.visible()).toBe(false);
    gate.drawn();
    gate.contextLost();
    gate.drawn();
    expect(gate.visible()).toBe(false);
    gate.contextRestored();
    expect(gate.visible()).toBe(false);
    gate.drawn();
    expect(gate.visible()).toBe(true);
    gate.destroyed();
    gate.drawn();
    expect(gate.visible()).toBe(false);
  });

  test("a failed draw hides the video until a draw succeeds", () => {
    const gate = createVideoGate();
    gate.fogSet();
    gate.drawn();
    gate.renderFailed();
    expect(gate.visible()).toBe(false);
    gate.drawn();
    expect(gate.visible()).toBe(true);
  });

  test("a stream changing its aspect ratio stays hidden until a new video", () => {
    const gate = createVideoGate();
    gate.fogSet();
    gate.drawn();
    gate.videoResized(true);
    expect(gate.visible()).toBe(true);
    gate.videoResized(false);
    expect(gate.visible()).toBe(false);
    gate.drawn();
    expect(gate.visible()).toBe(false);
    gate.newVideo();
    gate.drawn();
    expect(gate.visible()).toBe(true);
  });
});

test("sameAspect allows pixel rounding, nothing more", () => {
  expect(
    sameAspect({ width: 3840, height: 2160 }, { width: 1920, height: 1080 }),
  ).toBe(true);
  expect(
    sameAspect({ width: 1280, height: 720 }, { width: 1281, height: 720 }),
  ).toBe(true);
  // 8 rows more (a codec's padding) already shifts the map by ~0.7 %: not the same.
  expect(
    sameAspect({ width: 1920, height: 1080 }, { width: 1920, height: 1088 }),
  ).toBe(false);
  expect(
    sameAspect({ width: 1920, height: 1080 }, { width: 1080, height: 1080 }),
  ).toBe(false);
  expect(sameAspect({ width: 1, height: 0 }, { width: 1, height: 1 })).toBe(
    false,
  );
});
