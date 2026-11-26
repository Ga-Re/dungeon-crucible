/**
 * Keeps a renderer's map in step with a map URL – image texture or video under the canvas – or
 * with a drawn map (E-33), and with walls drawn over a picture map.
 */
import type { DmDrawing, Drawing } from '../core/build/playerDrawing';
import type { PaintedImage, Renderer } from './pixi/renderer';
import { changedRegion } from '../core/build/dirty';
import { drawingDecals, paintedDrawing } from './drawnMap';
import { buildTextures } from './build/textures';
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
  /** Shows a drawn map: its drawing is its picture (no-op if unchanged). `cell`: the grid's cell size (texture scale). */
  setDrawn(drawing: Drawing | DmDrawing, cell: number): Promise<void>;
  /** Walls drawn over the picture map shown (`null`: none). */
  setOver(drawing: Drawing | DmDrawing | null, cell: number): Promise<void>;
  dispose(): void;
}

/**
 * @param host positioned element the canvas lies in; a video map goes in right under the canvas
 */
interface Painted {
  drawing: Drawing | DmDrawing;
  cell: number;
}

/** What the painted picture depends on: walls and where doors are shown – not whether they are open. */
export function paintKey(drawing: Drawing | DmDrawing, cell: number): string {
  return JSON.stringify([cell, drawing.origin, drawing.width, drawing.height, drawing.biome, drawing.masonry, drawing.doors.map((d) => [d.wall, d.at, d.width, d.window ?? false]), drawing.cliffs, drawing.waters, drawing.lightAngle, drawing.autoShore, drawing.autoGrowth, drawing.floors]);
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

  // What the painted map and the drawing over a picture were last painted from.
  let lastMap: Painted | null = null;
  let lastOver: Painted | null = null;
  /** Repaints only the region an edit changed; false when everything must be painted anew. */
  const repaintChanged = (layer: 'map' | 'drawing', last: Painted | null, drawing: Drawing | DmDrawing, cell: number, image: PaintedImage): boolean => {
    if (!last) return false;
    const region = changedRegion(last.drawing, drawing, cell, last.cell);
    if (region === 'all') return false;
    if (region === null) return true;
    return renderer.repaint(layer, image, { x: region.x - drawing.origin.x, y: region.y - drawing.origin.y, w: region.w, h: region.h });
  };

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
      // Another map is shown now: a drawn map coming back is painted anew, not only its changes.
      lastMap = null;
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
    async setDrawn(drawing, cell) {
      void this.setOver(null, cell);
      const key = `d:${paintKey(drawing, cell)}`;
      showDecals(drawing);
      if (key === current) return;
      // Only a drawn map on screen may be repainted in part; a picture map before goes at once.
      if (!current?.startsWith('d:')) {
        lastMap = null;
        dropVideo();
        renderer.setMap(null);
      }
      current = key;
      const mine = ++token;
      try {
        const tex = await buildTextures();
        if (mine !== token) return;
        const image = paintedDrawing(drawing, true, cell, tex);
        // Only what the edit touched, when the map stays the same size; else the whole map.
        if (!repaintChanged('map', lastMap, drawing, cell, image)) {
          dropVideo();
          renderer.setMap(image, drawing.origin);
        }
        lastMap = { drawing, cell };
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
        const image = drawing && tex ? paintedDrawing(drawing, false, cell, tex) : null;
        if (!(drawing && image && repaintChanged('drawing', lastOver, drawing, cell, image))) renderer.setDrawing(image, drawing?.origin);
        lastOver = drawing ? { drawing, cell } : null;
      } catch (e) {
        if (mine === overToken) over = null;
        onError?.(e);
      }
    },
    dispose() {
      token++;
      lastMap = null;
      lastOver = null;
      dropVideo();
    },
  };
}
