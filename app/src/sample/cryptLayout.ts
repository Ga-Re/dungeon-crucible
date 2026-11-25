/**
 * Floor layout of the sample crypt. Pure geometry without tokens or DM data,
 * so the table window can draw the sample map image from it.
 */
export const CELL = 70;
export const COLS = 36;
export const ROWS = 24;

export type Rect = [number, number, number, number];

export const ROOMS: { id: string; name: string; r: Rect; color: string; secret?: boolean }[] = [
  { id: 'storage', name: 'Storeroom', r: [3, 2, 6, 5], color: '#c9a45c' },
  { id: 'hall', name: 'Entrance Hall', r: [2, 9, 8, 7], color: '#7fb2d9' },
  { id: 'guard', name: 'Guardroom', r: [13, 2, 7, 7], color: '#d97f7f' },
  { id: 'throne', name: 'Throne Room', r: [13, 11, 11, 9], color: '#d9a97f' },
  { id: 'crypt', name: 'Crypt', r: [27, 2, 7, 8], color: '#8fd98f' },
  { id: 'secret', name: 'Hidden Chamber', r: [28, 14, 6, 6], color: '#b48fe0', secret: true },
];
export const CORRIDORS: Rect[] = [[5, 7, 1, 2], [10, 13, 3, 1], [16, 9, 1, 2], [20, 4, 7, 1], [24, 16, 4, 1], [0, 12, 2, 1]];
export const PILLARS: [number, number][] = [[15, 13], [21, 13], [15, 17], [21, 17]];
export const DOORS: { id: string; s: Rect; secret?: boolean }[] = [
  { id: 'd-storage', s: [5, 7, 6, 7] },
  { id: 'd-throne', s: [13, 13, 13, 14] },
  { id: 'd-guard', s: [16, 9, 17, 9] },
  { id: 'd-crypt', s: [27, 4, 27, 5] },
  { id: 'd-secret', s: [28, 16, 28, 17], secret: true },
];

/** Floor mask (1 = walkable) in grid cells. */
export function cryptFloor(): Uint8Array {
  const f = new Uint8Array(COLS * ROWS);
  const fill = ([x0, y0, w, h]: Rect) => {
    for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) f[y * COLS + x] = 1;
  };
  ROOMS.forEach((r) => fill(r.r));
  CORRIDORS.forEach(fill);
  PILLARS.forEach(([x, y]) => (f[y * COLS + x] = 0));
  return f;
}

