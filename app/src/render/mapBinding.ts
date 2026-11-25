/**
 * Keeps a renderer's map in step with a map URL – image texture or video under the canvas – or
 * with a drawn map (E-33), and with walls drawn over a picture map.
 */
import type { DmDrawing, Drawing } from '../core/build/playerDrawing';
import type { Renderer } from './pixi/renderer';
import { drawingDecals, paintedDrawing } from './drawnMap';
import { buildTextures } from './build/textures';
import { createMapVideo, loadMapImage } from './mapImages';

export interface MapBinding {
  /** Shows the map at `url` (no-op if unchanged). Resolves once it is set or has failed. */
  set(url: string | null, isVideo: boolean): Promise<void>;
  /** Shows a drawn map: its drawing is its picture (no-op if unchanged). `cell`: the grid's cell size (texture scale). */
  setDrawn(drawing: Drawing | DmDrawing, cell: number): Promise<void>;
  /** Walls drawn over the picture map shown (`null`: none). */
  setOver(drawing: Drawing | DmDrawing | null, cell: number): Promise<void>;
  dispose(): void;
}

/**
 * @param host positioned element the canvas lies in; a video map goes in right under the canvas
 */
/** What the painted picture depends on: walls and where doors are shown – not whether they are open. */
function paintKey(drawing: Drawing | DmDrawing, cell: number): string {
  return JSON.stringify([cell, drawing.origin, drawing.width, drawing.height, drawing.masonry, drawing.doors.map((d) => [d.wall, d.at, d.width])]);
}

export function bindMap(renderer: Renderer, host: HTMLElement, onError?: (e: unknown) => void): MapBinding {
  let current: string | null = null;
  let over: string | null = null;
  let overToken = 0;
  let video: HTMLVideoElement | null = null;
  let token = 0;

  // Doors and cracks: small pictures over the walls, set apart so a door repaints nothing else.
  let decalsShown: string | null = null;
  let decalToken = 0;
  const showDecals = (drawing: Drawing | DmDrawing | null) => {
    const key = drawing ? JSON.stringify([drawing.masonry, drawing.doors, drawing.cracks]) : null;
    if (key === decalsShown) return;
    decalsShown = key;
    const mine = ++decalToken;
    if (!drawing) {
      renderer.setDecals([]);
      return;
    }
    void buildTextures().then((tex) => {
      if (mine === decalToken) renderer.setDecals(drawingDecals(drawing, tex));
    }, onError);
  };

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
    async setDrawn(drawing, cell) {
      void this.setOver(null, cell);
      const key = `d:${paintKey(drawing, cell)}`;
      showDecals(drawing);
      if (key === current) return;
      current = key;
      const mine = ++token;
      try {
        const tex = await buildTextures();
        if (mine !== token) return;
        dropVideo();
        renderer.setMap(paintedDrawing(drawing, true, cell, tex), drawing.origin);
      } catch (e) {
        if (mine === token) current = null;
        onError?.(e);
      }
    },
    async setOver(drawing, cell) {
      const key = drawing ? paintKey(drawing, cell) : null;
      if (drawing) showDecals(drawing);
      else if (!current?.startsWith('d:')) showDecals(null);
      if (key === over) return;
      over = key;
      const mine = ++overToken;
      try {
        const tex = drawing ? await buildTextures() : null;
        if (mine !== overToken) return;
        renderer.setDrawing(drawing && tex ? paintedDrawing(drawing, false, cell, tex) : null, drawing?.origin);
      } catch (e) {
        if (mine === overToken) over = null;
        onError?.(e);
      }
    },
    dispose() {
      token++;
      dropVideo();
    },
  };
}
