/** Width and height in pixels. */
export interface Size {
  readonly width: number;
  readonly height: number;
}

export interface Point {
  readonly x: number;
  readonly y: number;
}

/** Map rotation on screen, clockwise; the table TV may face any side of the table. */
export type Rotation = 0 | 90 | 180 | 270;

/**
 * What the view shows: the map point at the view's centre, the scale (screen pixels per map
 * pixel) and the rotation. Pure data, so the DM window can control the player view's camera.
 */
export interface Camera {
  readonly centerX: number;
  readonly centerY: number;
  readonly zoom: number;
  readonly rotation: Rotation;
}

export const MIN_ZOOM = 1 / 64;
export const MAX_ZOOM = 16;

const clampZoom = (zoom: number) =>
  Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));
const radians = (rotation: Rotation) => (rotation * Math.PI) / 180;

/** The camera that shows the whole map centred in the view. */
export function fitCamera(map: Size, view: Size, rotation: Rotation): Camera {
  const sideways = rotation === 90 || rotation === 270;
  const width = sideways ? map.height : map.width;
  const height = sideways ? map.width : map.height;
  const zoom =
    width > 0 && height > 0
      ? clampZoom(Math.min(view.width / width, view.height / height))
      : 1;
  return { centerX: map.width / 2, centerY: map.height / 2, zoom, rotation };
}

/**
 * The map area (map pixels) a calibrated display shows (T-106c): `display` physical pixels at
 * `pxPerCell` physical pixels per grid cell of `cellSizePx` map pixels, turned by `rotation`.
 */
export function viewArea(
  display: Size,
  pxPerCell: number,
  cellSizePx: number,
  rotation: Rotation,
): Size {
  const sideways = rotation === 90 || rotation === 270;
  const across = sideways ? display.height : display.width;
  const down = sideways ? display.width : display.height;
  const scale = pxPerCell > 0 ? cellSizePx / pxPerCell : 0;
  return { width: across * scale, height: down * scale };
}

/**
 * The camera that shows the map at a true size on a calibrated display (T-106a, SPEC 2.2): one
 * grid cell (`cellSizePx` map pixels) becomes `viewPxPerCell` view pixels – e.g. one inch, so
 * physical minis fit. Centred on `center` (the map's middle by default); the DM moves it (T-106c).
 */
export function inchCamera(
  map: Size,
  rotation: Rotation,
  cellSizePx: number,
  viewPxPerCell: number,
  center: Point = { x: map.width / 2, y: map.height / 2 },
): Camera {
  return {
    centerX: center.x,
    centerY: center.y,
    zoom: cellSizePx > 0 ? clampZoom(viewPxPerCell / cellSizePx) : 1,
    rotation,
  };
}

/** Turns a screen-space offset into the matching map-space offset. */
function screenOffsetToMap(camera: Camera, offset: Point): Point {
  const angle = -radians(camera.rotation);
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return {
    x: (offset.x * cos - offset.y * sin) / camera.zoom,
    y: (offset.x * sin + offset.y * cos) / camera.zoom,
  };
}

/** The map point under a point of the view. */
export function screenToMap(camera: Camera, view: Size, point: Point): Point {
  const offset = screenOffsetToMap(camera, {
    x: point.x - view.width / 2,
    y: point.y - view.height / 2,
  });
  return { x: camera.centerX + offset.x, y: camera.centerY + offset.y };
}

/** Where a map point appears in the view (the inverse of `screenToMap`). */
export function mapToScreen(camera: Camera, view: Size, point: Point): Point {
  const angle = radians(camera.rotation);
  const dx = (point.x - camera.centerX) * camera.zoom;
  const dy = (point.y - camera.centerY) * camera.zoom;
  return {
    x: view.width / 2 + dx * Math.cos(angle) - dy * Math.sin(angle),
    y: view.height / 2 + dx * Math.sin(angle) + dy * Math.cos(angle),
  };
}

/** Zooms by `factor` keeping the map point under `anchor` (e.g. the cursor) in place. */
export function zoomAt(
  camera: Camera,
  factor: number,
  anchor: Point,
  view: Size,
): Camera {
  const zoom = clampZoom(camera.zoom * factor);
  const before = screenToMap(camera, view, anchor);
  const zoomed = { ...camera, zoom };
  const after = screenToMap(zoomed, view, anchor);
  return {
    ...zoomed,
    centerX: camera.centerX + before.x - after.x,
    centerY: camera.centerY + before.y - after.y,
  };
}

/** Moves the map by a screen-space delta, as when dragging it. */
export function panBy(camera: Camera, delta: Point): Camera {
  const offset = screenOffsetToMap(camera, delta);
  return {
    ...camera,
    centerX: camera.centerX - offset.x,
    centerY: camera.centerY - offset.y,
  };
}

/** Rotates by a multiple of 90° (clockwise for positive steps) around the view centre. */
export function rotateBy(camera: Camera, degrees: 90 | -90 | 180): Camera {
  const rotation = (((camera.rotation + degrees) % 360) + 360) % 360;
  return { ...camera, rotation: rotation as Rotation };
}
