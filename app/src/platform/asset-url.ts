/**
 * URLs for files inside the open campaign folder. The Electron main process answers
 * `dc-asset://file/<path>` only for files inside that folder (with CORS and range support,
 * so maps work as WebGL textures and videos can loop). No imports: the table bundle uses it.
 */
export const ASSET_SCHEME = 'dc-asset';
const PREFIX = `${ASSET_SCHEME}://file/`;

export function assetUrlFor(absPath: string): string {
  return PREFIX + encodeURIComponent(absPath);
}

/** Inverse of `assetUrlFor`; null for anything else. */
export function assetPathFrom(url: string): string | null {
  if (!url.startsWith(PREFIX)) return null;
  const rest = url.slice(PREFIX.length).split(/[?#]/)[0] ?? '';
  try {
    const path = decodeURIComponent(rest);
    return path.length > 0 ? path : null;
  } catch {
    return null;
  }
}
