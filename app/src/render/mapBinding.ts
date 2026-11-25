/**
 * Keeps a renderer's map in step with a map URL – image texture or video under the canvas – or
 * with a drawn map (E-33), and with walls drawn over a picture map.
 */
import type { DmDrawing, Drawing } from '../core/build/playerDrawing';
import type { Renderer } from './pixi/renderer';
import { drawnMapImage } from './drawnMap';
import { createMapVideo, loadMapImage } from './mapImages';

export interface MapBinding {
  /** Shows the map at `url` (no-op if unchanged). Resolves once it is set or has failed. */
  set(url: string | null, isVideo: boolean): Promise<void>;
  /** Shows a drawn map: its drawing is its picture (no-op if unchanged). */
  setDrawn(drawing: Drawing | DmDrawing): void;
  /** Walls drawn over the picture map shown (`null`: none). */
  setOver(drawing: Drawing | DmDrawing | null): void;
  dispose(): void;
}

/**
 * @param host positioned element the canvas lies in; a video map goes in right under the canvas
 */
export function bindMap(renderer: Renderer, host: HTMLElement, onError?: (e: unknown) => void): MapBinding {
  let current: string | null = null;
  let over: string | null = null;
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
    async set(url, isVideo) {
      const key = url ? `${isVideo ? 'v' : 'i'}:${url}` : null;
      if (key === current) return;
      current = key;
      const mine = ++token;
      if (!url) {
        dropVideo();
        renderer.setMap(null);
        return;
      }
      try {
        if (isVideo) {
          const v = await createMapVideo(url);
          if (mine !== token) return;
          dropVideo();
          renderer.setMap(null);
          host.insertBefore(v, host.firstChild);
          video = v;
          renderer.setVideo(v);
        } else {
          const img = await loadMapImage(url);
          if (mine !== token) return;
          dropVideo();
          renderer.setMap(img);
        }
      } catch (e) {
        if (mine === token) current = null;
        onError?.(e);
      }
    },
    setDrawn(drawing) {
      const key = `d:${JSON.stringify(drawing)}`;
      this.setOver(null);
      if (key === current) return;
      current = key;
      token++;
      dropVideo();
      try {
        renderer.setMap(drawnMapImage(drawing, true), drawing.origin);
      } catch (e) {
        current = null;
        onError?.(e);
      }
    },
    setOver(drawing) {
      const key = drawing ? JSON.stringify(drawing) : null;
      if (key === over) return;
      over = key;
      try {
        renderer.setDrawing(drawing ? drawnMapImage(drawing, false) : null, drawing?.origin);
      } catch (e) {
        over = null;
        onError?.(e);
      }
    },
    dispose() {
      token++;
      dropVideo();
    },
  };
}
