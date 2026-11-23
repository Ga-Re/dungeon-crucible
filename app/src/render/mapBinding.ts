/** Keeps a renderer's map in step with a map URL: image texture or video under the canvas. */
import type { Renderer } from './pixi/renderer';
import { createMapVideo, loadMapImage } from './mapImages';

export interface MapBinding {
  /** Shows the map at `url` (no-op if unchanged). Resolves once it is set or has failed. */
  set(url: string | null, isVideo: boolean): Promise<void>;
  dispose(): void;
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
    dispose() {
      token++;
      dropVideo();
    },
  };
}
