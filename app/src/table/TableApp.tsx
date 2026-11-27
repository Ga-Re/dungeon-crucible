/**
 * Table window. Shows only validated PlayerFrames; everything else is black.
 * This module must not import DM-side state (src/app/store.ts and friends).
 */
import { useMemo } from 'react';
import { parsePlayerFrame, type PlayerFrame } from '../core/projection';
import { parseRasterBatch, RASTER_TV_CAPACITY, RasterCache } from '../core/build/terrain/tvRaster';
import { onFrame, onRaster } from '../platform/bridge';
import { TableView, type FrameSource } from './TableView';

export function TableApp() {
  const source = useMemo<FrameSource>(() => {
    let latest: { frame: PlayerFrame; receivedAt: number } | null = null;
    let lastSeq = -1;
    // Terrain blocks (E-61): only whole ones with a fitting checksum are kept; the renderer resolves
    // a frame's blocks from them (DC-128), a missing one stays black.
    const raster = new RasterCache(RASTER_TV_CAPACITY);
    onRaster((data) => raster.add(parseRasterBatch(data)));
    void onFrame((data) => {
      const now = Date.now();
      const r = parsePlayerFrame(data, now, lastSeq);
      if (r.ok) {
        latest = { frame: r.frame, receivedAt: now };
        lastSeq = r.frame.seq;
      } else if (r.reason === 'invalid-frame') {
        // Unknown or broken data: drop the picture at once.
        latest = null;
      }
    });
    return { current: () => latest, raster };
  }, []);
  return (
    <div style={{ position: 'fixed', inset: 0, cursor: 'none' }}>
      <TableView source={source} />
    </div>
  );
}
