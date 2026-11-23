import { describe, expect, it, vi } from "vitest";
import { memoryStorage } from "./memory-storage.test-data";
import {
  FOG_SPEED,
  readCoverFrom,
  saveCoverFrom,
  fogSpeed,
  livingFog,
  readFogSpeed,
  saveFogSpeed,
  speedOfStep,
  stepOfSpeed,
  onFogLookChange,
  readFogEdge,
  readFogLook,
  readFogMotion,
  readFogQuality,
  saveFogEdge,
  saveFogMotion,
  saveFogQuality,
  readFadeSeconds,
  readSoftEdges,
  saveFadeSeconds,
  saveSoftEdges,
  softEdgeWidth,
} from "./fog-settings";

describe("fog settings", () => {
  it("has soft edges on by default and remembers the choice per device", () => {
    const storage = memoryStorage();
    expect(readSoftEdges(storage)).toBe(true);
    saveSoftEdges(storage, false);
    expect(readSoftEdges(storage)).toBe(false);
    saveSoftEdges(storage, true);
    expect(readSoftEdges(storage)).toBe(true);
  });

  it("falls back to on for unknown values or unavailable storage", () => {
    expect(readSoftEdges(memoryStorage({ "dm.fog.softEdges": "maybe" }))).toBe(
      true,
    );
    expect(readSoftEdges(undefined)).toBe(true);
    const failing = memoryStorage();
    failing.getItem = () => {
      throw new Error("denied");
    };
    failing.setItem = () => {
      throw new Error("denied");
    };
    expect(readSoftEdges(failing)).toBe(true);
    expect(() => {
      saveSoftEdges(failing, false);
    }).not.toThrow();
  });

  it("makes the edge a share of a grid cell, or none when off", () => {
    expect(softEdgeWidth(100, true)).toBe(25);
    expect(softEdgeWidth(100, false)).toBe(0);
  });

  it("keeps the fade duration within 0 to 3 s on the slider's steps", () => {
    const storage = memoryStorage();
    expect(readFadeSeconds(storage)).toBe(0.65);
    saveFadeSeconds(storage, 0);
    expect(readFadeSeconds(storage)).toBe(0);
    saveFadeSeconds(storage, 1.234);
    expect(readFadeSeconds(storage)).toBe(1.25);
    expect(storage.getItem("dm.fog.fadeSeconds")).toBe("1.25");
    saveFadeSeconds(storage, 9);
    expect(readFadeSeconds(storage)).toBe(3);
    expect(readFadeSeconds(memoryStorage({ "dm.fog.fadeSeconds": "x" }))).toBe(
      0.65,
    );
    expect(readFadeSeconds(memoryStorage({ "dm.fog.fadeSeconds": "-2" }))).toBe(
      0,
    );
  });

  it("hears a change made in the other window", () => {
    const storage = memoryStorage();
    const listener = vi.fn();
    const stop = onFogLookChange(storage, listener);
    storage.setItem("dm.fog.softEdges", "off");
    window.dispatchEvent(
      new StorageEvent("storage", { key: "dm.fog.softEdges", newValue: "off" }),
    );
    storage.setItem("dm.fog.fadeSeconds", "2");
    window.dispatchEvent(
      new StorageEvent("storage", { key: "dm.fog.fadeSeconds", newValue: "2" }),
    );
    window.dispatchEvent(
      new StorageEvent("storage", { key: "dm.theme", newValue: "light" }),
    );
    const living = {
      quality: "medium",
      edge: 1.2,
      motion: 1,
      speed: 5,
      coverFrom: "middle",
    };
    expect(listener.mock.calls).toEqual([
      [{ softEdges: false, fadeSeconds: 0.65, ...living }],
      [{ softEdges: false, fadeSeconds: 2, ...living }],
    ]);
    stop();
    window.dispatchEvent(
      new StorageEvent("storage", { key: "dm.fog.softEdges", newValue: "on" }),
    );
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("has the living fog at medium by default and remembers the quality per device", () => {
    const storage = memoryStorage();
    expect(readFogQuality(storage)).toBe("medium");
    saveFogQuality(storage, "high");
    expect(readFogQuality(storage)).toBe("high");
    saveFogQuality(storage, "off");
    expect(readFogQuality(storage)).toBe("off");
    expect(readFogQuality(memoryStorage({ "dm.fog.quality": "ultra" }))).toBe(
      "medium",
    );
    expect(readFogQuality(undefined)).toBe("medium");
  });

  it("keeps edge wobble and movement on their sliders' range and steps", () => {
    const storage = memoryStorage();
    expect(readFogEdge(storage)).toBe(1.2);
    expect(readFogMotion(storage, false)).toBe(1);
    saveFogEdge(storage, 1.73);
    expect(readFogEdge(storage)).toBe(1.7);
    saveFogEdge(storage, 9);
    expect(readFogEdge(storage)).toBe(2.5);
    saveFogMotion(storage, -1);
    expect(readFogMotion(storage)).toBe(0);
    expect(readFogEdge(memoryStorage({ "dm.fog.edge": "x" }))).toBe(1.2);
  });

  it("starts with little movement when the system asks for reduced motion", () => {
    expect(readFogMotion(memoryStorage(), true)).toBe(0.2);
    // A choice made here wins.
    expect(readFogMotion(memoryStorage({ "dm.fog.motion": "2" }), true)).toBe(
      2,
    );
  });

  it("gives the renderer living fog in the map's cells, or none when off", () => {
    const look = readFogLook(memoryStorage({ "dm.fog.motion": "1" }));
    expect(livingFog(look, 70)).toEqual({
      quality: "medium",
      cellSizePx: 70,
      edge: 1.2,
      motion: 1,
    });
    expect(livingFog({ ...look, quality: "off" }, 70)).toBeUndefined();
  });

  it("spreads at 5 cells per second by default and remembers the speed, also Sofort (T-246)", () => {
    const storage = memoryStorage();
    expect(readFogSpeed(storage)).toBe(5);
    saveFogSpeed(storage, 12);
    expect(readFogSpeed(storage)).toBe(12);
    saveFogSpeed(storage, Infinity);
    expect(storage.getItem("dm.fog.speed")).toBe("instant");
    expect(readFogSpeed(storage)).toBe(Infinity);
    expect(readFogSpeed(memoryStorage({ "dm.fog.speed": "0" }))).toBe(5);
    expect(readFogSpeed(memoryStorage({ "dm.fog.speed": "999" }))).toBe(40);
    const speed = fogSpeed(readFogLook(memoryStorage()), 70, "maps/a.png");
    expect(speed).toMatchObject({ cellsPerSecond: 5, cellSizePx: 70 });
    // The same map gives the same seed (its fronts look alike), another map another one.
    expect(fogSpeed(readFogLook(memoryStorage()), 70, "maps/a.png").seed).toBe(
      speed.seed,
    );
    expect(
      fogSpeed(readFogLook(memoryStorage()), 70, "maps/b.png").seed,
    ).not.toBe(speed.seed);
  });

  it("maps the speed slider logarithmically, with Sofort as its last step", () => {
    expect(speedOfStep(0)).toBe(FOG_SPEED.min);
    expect(speedOfStep(FOG_SPEED.steps - 1)).toBe(FOG_SPEED.max);
    expect(speedOfStep(FOG_SPEED.steps)).toBe(Infinity);
    expect(stepOfSpeed(Infinity)).toBe(FOG_SPEED.steps);
    // The default is a step of its own.
    expect(speedOfStep(stepOfSpeed(FOG_SPEED.default))).toBe(5);
    expect(stepOfSpeed(4.4)).toBe(stepOfSpeed(4));
    for (let step = 0; step < FOG_SPEED.steps; step++)
      expect(speedOfStep(step + 1)).toBeGreaterThan(speedOfStep(step));
  });

  it("starts covering everything at the map's middle unless chosen otherwise (T-249)", () => {
    const storage = memoryStorage();
    expect(readCoverFrom(storage)).toBe("middle");
    saveCoverFrom(storage, "random");
    expect(readCoverFrom(storage)).toBe("random");
    expect(readCoverFrom(memoryStorage({ "dm.fog.coverFrom": "edge" }))).toBe(
      "middle",
    );
  });
});
