// Maps larger than the GPU's texture limit (T-127): many integrated GPUs take at most 8192 px a
// side, battle maps are often larger. Such a map is cut into tiles that each fit. Pure, so it is
// tested without a GPU.

/** A tile of a map, in map pixels. */
export interface MapTile {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/**
 * The tiles a `width` × `height` map is drawn in: one for a map that fits `maxSize`, else a grid
 * of tiles at most `maxSize` a side, covering the map exactly (no gaps, no overlaps).
 */
export function mapTiles(
  width: number,
  height: number,
  maxSize: number,
): MapTile[] {
  const side = Math.max(1, Math.floor(maxSize));
  const tiles: MapTile[] = [];
  for (let y = 0; y < height; y += side)
    for (let x = 0; x < width; x += side)
      tiles.push({
        x,
        y,
        width: Math.min(side, width - x),
        height: Math.min(side, height - y),
      });
  return tiles;
}
