/**
 * The catalog's picture of a drawn map (E-90): read from its file and drawn by the real renderer on
 * a canvas nobody sees – its ground, cliffs, light and shadow, as the map view shows them – fitted
 * into `maxPx`, as WebP. Null if the map or its terrain cannot be read (the catalog keeps its sign).
 */
import { decodeTerrain, EncodeCache } from '../core/build/terrain/state';
import { sceneFromDocuments } from '../core/persistence';
import { MapSidecarSchema } from '../core/sidecar';
import { createRenderer } from '../render/pixi/renderer';
import { readDoc } from './campaign';
import { terrainShapeOf } from './store';

export async function drawnMapPreview(mapFile: string, maxPx: number): Promise<Uint8Array | null> {
  const doc = await readDoc(mapFile, 'map', MapSidecarSchema, { quiet: true });
  if (!doc) return null;
  let terrain = null;
  try {
    terrain = doc.terrain ? await decodeTerrain(doc.terrain, new EncodeCache()) : null;
  } catch {
    return null;
  }
  const scene = sceneFromDocuments(doc, null, null, undefined, 'map');
  const { widthPx: w, heightPx: h } = scene.map;
  if (!w || !h) return null;
  const scale = Math.min(1, maxPx / Math.max(w, h));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(w * scale));
  canvas.height = Math.max(1, Math.round(h * scale));
  const r = await createRenderer({ canvas, size: { width: canvas.width, height: canvas.height }, resolution: 1 });
  try {
    const origin = scene.map.origin ?? { x: 0, y: 0 };
    r.setMap({ blank: true, width: w, height: h }, origin);
    r.setTerrain(terrainShapeOf(scene, terrain));
    r.setCamera({ centerX: origin.x + w / 2, centerY: origin.y + h / 2, zoom: scale, rotation: 0 });
    await r.drawn();
    const still = r.snapshot();
    const blob = await new Promise<Blob | null>((done) => still.toBlob(done, 'image/webp', 0.82));
    return blob ? new Uint8Array(await blob.arrayBuffer()) : null;
  } finally {
    r.destroy();
  }
}
