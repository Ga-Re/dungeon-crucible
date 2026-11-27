/**
 * Keeps a renderer's map in step with a map URL – image texture or video under the canvas – or
 * with a drawn map's area (E-33; painted again with the new pipeline, E-52).
 */
import type { Renderer } from './pixi/renderer';
import { createMapVideo, loadMapImage } from './mapImages';

/** How a picture map is cut and adjusted (DC-022, E-42); the file stays as it is. */
export interface PictureLook {
  crop?: { x: number; y: number; w: number; h: number } | undefined;
  adjust?: { brightness: number; contrast: number; saturation: number; hue: number } | undefined;
}

/** The CSS/canvas filter for an adjustment; empty: none. */
export function pictureFilter(adjust: PictureLook['adjust']): string {
  if (!adjust) return '';
  return `brightness(${adjust.brightness}) contrast(${adjust.contrast}) saturate(${adjust.saturation}) hue-rotate(${adjust.hue}deg)`;
}

/** The cut inside a picture of `w` × `h` (whole pixels); null: the whole picture. */
export function cropIn(crop: PictureLook['crop'], w: number, h: number): { x: number; y: number; w: number; h: number } | null {
  if (!crop) return null;
  const x = Math.max(0, Math.min(w - 1, Math.round(crop.x)));
  const y = Math.max(0, Math.min(h - 1, Math.round(crop.y)));
  const cw = Math.max(1, Math.min(w - x, Math.round(crop.w)));
  const ch = Math.max(1, Math.min(h - y, Math.round(crop.h)));
  return { x, y, w: cw, h: ch };
}

export interface MapBinding {
  /** Shows the map at `url` (no-op if unchanged), cut and adjusted by `look`. Resolves once it is set or has failed. */
  set(url: string | null, isVideo: boolean, look?: PictureLook): Promise<void>;
  /** Shows a drawn map's area (map px): it has no picture (no-op if unchanged). */
  setDrawn(area: DrawnArea): void;
  dispose(): void;
}

/** A drawn map's area: where it starts (it grows left and up too) and its size. */
export interface DrawnArea {
  origin: { x: number; y: number };
  width: number;
  height: number;
}

/**
 * @param host positioned element the canvas lies in; a video map goes in right under the canvas
 */
export function bindMap(renderer: Renderer, host: HTMLElement, onError?: (e: unknown) => void): MapBinding {
  let current: string | null = null;
  let video: HTMLVideoElement | null = null;
  let token = 0;

  const dropVideo = () => {
    if (!video) return;
    renderer.setVideo(null);
    video.pause();
    video.remove();
    video = null;
  };

  return {
    async set(url, isVideo, look) {
      const key = url ? `${isVideo ? 'v' : 'i'}:${url}:${JSON.stringify(look ?? null)}` : null;
      if (key === current) return;
      current = key;
      const mine = ++token;
      // The map before goes at once (fail-closed, DC-105): under the new scene's fog it would
      // show what the old scene kept covered. Until the new one has loaded, the map is black.
      dropVideo();
      renderer.setMap(null);
      if (!url) return;
      try {
        if (isVideo) {
          const v = await createMapVideo(url);
          if (mine !== token) return;
          // A video is adjusted, not cut (E-42).
          v.style.filter = pictureFilter(look?.adjust);
          host.insertBefore(v, host.firstChild);
          video = v;
          renderer.setVideo(v);
        } else {
          const img = await loadMapImage(url);
          if (mine !== token) return;
          const w = img instanceof HTMLImageElement ? img.naturalWidth : img.width;
          const h = img instanceof HTMLImageElement ? img.naturalHeight : img.height;
          const cut = cropIn(look?.crop, w, h);
          const filter = pictureFilter(look?.adjust);
          if (!cut && !filter) renderer.setMap(img);
          else {
            // A copy cut and adjusted; the map's area starts where the cut does.
            const r = cut ?? { x: 0, y: 0, w, h };
            const c = document.createElement('canvas');
            c.width = r.w;
            c.height = r.h;
            const g = c.getContext('2d');
            if (!g) throw new Error('No 2D context for the map picture');
            g.filter = filter || 'none';
            g.drawImage(img, r.x, r.y, r.w, r.h, 0, 0, r.w, r.h);
            renderer.setMap(c, { x: r.x, y: r.y });
          }
        }
      } catch (e) {
        if (mine === token) current = null;
        onError?.(e);
      }
    },
    setDrawn(area) {
      const key = `d:${JSON.stringify(area)}`;
      if (key === current) return;
      current = key;
      token++;
      dropVideo();
      renderer.setMap({ blank: true, width: area.width, height: area.height }, area.origin);
    },
    dispose() {
      token++;
      dropVideo();
    },
  };
}
