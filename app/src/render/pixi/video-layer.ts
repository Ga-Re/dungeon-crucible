import type { Camera, Size } from "./camera";

/**
 * The CSS transform that places a map-sized element (origin top left) exactly where the canvas
 * draws the map with `camera` – the same pivot, scale and rotation as the PixiJS world.
 */
export function cssTransform(camera: Camera, view: Size): string {
  const angle = (camera.rotation * Math.PI) / 180;
  const cos = Math.cos(angle) * camera.zoom;
  const sin = Math.sin(angle) * camera.zoom;
  // screen = R·zoom·(map − centre) + view/2
  const e = view.width / 2 - (cos * camera.centerX - sin * camera.centerY);
  const f = view.height / 2 - (sin * camera.centerX + cos * camera.centerY);
  return `matrix(${String(cos)}, ${String(sin)}, ${String(-sin)}, ${String(cos)}, ${String(e)}, ${String(f)})`;
}

/**
 * Decides when the video map may be visible (ADR-0010: fail closed). The video lies under the
 * canvas, so wherever the canvas has not drawn fog, the raw map shows. It is therefore visible
 * only after a frame was drawn while the fog is known, and hidden again from a new video, a
 * resize or a lost WebGL context until the next such frame – and for good after teardown or
 * when the stream changes its aspect ratio.
 */
export function createVideoGate() {
  let fogKnown = false;
  let drawnSafely = false;
  let contextLost = false;
  let destroyed = false;
  let misaligned = false;
  return {
    // `setFog(null)` (the DM view: no fog) also counts as known. The player view must therefore
    // always pass an array – `PlayerApp` does, starting with "everything covered".
    fogSet() {
      fogKnown = true;
    },
    newVideo() {
      drawnSafely = false;
      misaligned = false;
    },
    /**
     * The stream's frames changed size. Same aspect ratio: still stretched onto the map, so
     * fog and video stay aligned. Another aspect ratio: the fog can no longer match – the video
     * stays hidden until a new video is set.
     */
    videoResized(sameAspect: boolean) {
      if (!sameAspect) {
        misaligned = true;
        drawnSafely = false;
      }
    },
    resized() {
      drawnSafely = false;
    },
    contextLost() {
      contextLost = true;
      drawnSafely = false;
    },
    contextRestored() {
      contextLost = false;
    },
    /** A draw failed: what is on screen is unknown, so the video hides until a good frame. */
    renderFailed() {
      drawnSafely = false;
    },
    drawn() {
      drawnSafely = fogKnown && !contextLost && !destroyed && !misaligned;
    },
    destroyed() {
      destroyed = true;
      drawnSafely = false;
    },
    visible: () => drawnSafely,
  };
}

/** Whether two sizes have the same aspect ratio (within rounding of whole pixels). */
export function sameAspect(
  a: { width: number; height: number },
  b: { width: number; height: number },
): boolean {
  if (a.height === 0 || b.height === 0) return false;
  const ratio = a.width / a.height / (b.width / b.height);
  // 0.1 %: browsers report the display size (1080 rows, not the codec's padded 1088), so only
  // rounding remains; any more would let fog and map drift apart (1 % ≈ 21 px on a 4K map).
  return Math.abs(ratio - 1) < 0.001;
}
