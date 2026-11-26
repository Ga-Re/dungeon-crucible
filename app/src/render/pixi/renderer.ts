// The desktop app's CSP forbids `eval`; this import makes PixiJS use precompiled shaders instead
// (Dungeon-Manager: packages/renderer/src/index.ts).
import "pixi.js/unsafe-eval";
import type { Polygon } from "../../core/poly/types";
import {
  Application,
  Container,
  Graphics,
  Mesh,
  MeshGeometry,
  Rectangle,
  Shader,
  Sprite,
  Text,
  Texture,
  type TextureSource,
  UniformGroup,
  WebGLRenderer,
} from "pixi.js";
import {
  TOKEN_ACTIVE_RING,
  TOKEN_HIDDEN_ALPHA,
  TOKEN_RING,
  TOKEN_SELECTED_RING,
  labelResolution,
  tokenColor,
  tokenInitials,
} from "./token-look";
import type { Camera, Size } from "./camera";
import { disposeFog } from "./fog-dispose";
import { shiftGrid, shiftLighting, shiftPolygons, ZERO, type Origin } from "./origin";
import { buildWaterLayer, type WaterHandle, type WaterScene } from "./water-layer";
import { easeOut, fadeProgress } from "./fog-fade";
import { mapTiles } from "./map-tiles";
import {
  coarseSpreadOrder,
  DURATION_SHARES,
  spreadAtSpeed,
  type SpreadShares,
  sampleOrder,
  spreadMix,
  type Grid,
} from "./fog-spread";
import {
  drawLivingFog,
  livingReach,
  type LivingFog,
  type LivingHandle,
} from "./fog-living";
import { softFogAlpha } from "./soft-mask";
import { createVideoGate, cssTransform, sameAspect } from "./video-layer";

/** An image the browser has loaded (or drawn), ready to become the map texture. */
export type MapImage = HTMLImageElement | HTMLCanvasElement | ImageBitmap | PaintedImage;

/**
 * Dungeon Crucible (E-33): a map picture that paints itself region by region (a drawn map) –
 * however large, it never exists as one canvas: each GPU tile is painted on its own.
 */
export interface PaintedImage {
  readonly width: number;
  readonly height: number;
  /** Paints the region left…left+width × top…top+height of the picture at 0, 0 of `context`. */
  paint(context: CanvasRenderingContext2D, left: number, top: number, width: number, height: number): void;
}

const isPainted = (image: MapImage): image is PaintedImage => "paint" in image;

/** The tiles of a painted picture (E-33), kept so a change repaints only what it touched. */
interface PaintedTiles {
  width: number;
  height: number;
  tiles: { left: number; top: number; canvas: HTMLCanvasElement; source: TextureSource }[];
}
const paintedTiles = new WeakMap<Container, PaintedTiles>();

export interface FogOptions {
  /** 1 for players (opaque, the default); less for the DM, who must see what lies beneath. */
  readonly opacity?: number;
  /**
   * Width of the soft edge in map pixels (T-136a); 0 or none draws hard edges. The softening
   * lies inside the revealed area, so it never shows more than the hard fog would.
   */
  readonly softEdge?: number;
  /**
   * Animate from the fog shown now to this one, in milliseconds (T-136b); 0 or none switches at
   * once. The change spreads (T-167): a reveal from the revealed area it touches, else from its
   * middle; a hide from the fog it touches, else from its middle (T-249). Only within the same map: the
   * first fog and the fog of a new map never animate. A pixel fogged before and after stays
   * fogged throughout.
   */
  readonly fade?: number;
  /**
   * Spread at a speed (T-246, ADR-0019): the change travels `cellsPerSecond` grid cells (of
   * `cellSizePx` map pixels) per second with a ragged front, and `fade` becomes the time each
   * spot takes to turn over; an infinite speed turns everything over together. None spreads over
   * `fade` as T-167 did.
   */
  readonly speed?: {
    readonly cellsPerSecond: number;
    readonly cellSizePx: number;
    /** The same for the same map (e.g. from its path), so its fronts look alike; by size if none. */
    readonly seed?: number;
  };
  /**
   * Where hiding everything starts when no fog is left to come from (T-249): the map's middle
   * (the default) or a point that looks random, derived from what was revealed before, so the
   * DM window and the TV practically always pick the same one.
   */
  readonly coverFrom?: "middle" | "random";
  /**
   * Living fog (T-245, ADR-0019): the fog drifts and its edge wobbles, only ever into revealed
   * area (the player view keeps the exact hard fog underneath). Needs the map's size; replaces
   * `softEdge` with its own band. None draws the still fog of before.
   */
  readonly living?: LivingFog;
}

export type { LivingFog } from "./fog-living";
export { LIVING_EDGE_MAX, LIVING_HALO_CELLS } from "./fog-living";

export interface RendererOptions {
  /** The canvas to draw into; it is sized by the caller (CSS) and by `resize`. */
  readonly canvas: HTMLCanvasElement;
  readonly size: Size;
  /** Device pixels per CSS pixel (`devicePixelRatio`); 1 keeps tests deterministic. */
  readonly resolution?: number;
  /** Shown around the map; dark, so a TV in a dim room does not glare. */
  readonly background?: string;
  /** Milliseconds for fog animations; tests freeze it for screenshots mid-spread. */
  readonly now?: () => number;
  /**
   * The largest texture side to use (T-127); the GPU's own limit by default. Tests set a small
   * one to draw a map in tiles.
   */
  readonly maxTextureSize?: number;
}

/** A token as the renderer draws it (T-107a): where, how big, and what it shows. */
export interface TokenShape {
  readonly id: string;
  /** Its name, for the initials; absent when this viewer may not see it. */
  readonly name?: string | undefined;
  /** Its footprint's top left corner and size, in map pixels. */
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  /** Selected in the DM window (T-107b): drawn with a selection ring. */
  readonly selected?: boolean | undefined;
  /** Hidden from the players (T-107b): the DM window draws it faded. */
  readonly hidden?: boolean | undefined;
  /** Its turn in the initiative (T-111c): drawn with a bright ring, on the TV too. */
  readonly active?: boolean | undefined;
  /** Dungeon Crucible: the token's own ring colour (`#rrggbb`); the id's colour if none. */
  readonly color?: string | undefined;
}

/**
 * Dungeon Crucible (DC-041): an asset placed on the map – its picture or looping video, centre,
 * size before turning (map pixels) and turn in degrees.
 */
export interface AssetShape {
  readonly id: string;
  readonly url: string;
  readonly video: boolean;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly rotation: number;
  /** A play-once effect (DC-110): when this run started; a new value plays it again from the start. */
  readonly once?: number | undefined;
  /** Opacity 0–1 (a roof the DM sees through, E-29); none: opaque. */
  readonly alpha?: number | undefined;
}

/**
 * Dungeon Crucible (E-33): a small picture over the drawn walls – a door, a crack, the DM's mark
 * of a secret door – centred at x, y and turned by `rotation` (radians). Doors change often;
 * as pictures of their own, opening one repaints nothing of the map.
 */
export interface Decal {
  readonly image: HTMLCanvasElement;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly rotation: number;
}

/** Dungeon Crucible: one light's glow (map pixels), clipped to the area it lights. */
export interface LightGlow {
  readonly x: number;
  readonly y: number;
  readonly brightPx: number;
  readonly dimPx: number;
  readonly color: string;
  /** 0–1: how much the glow flickers (asset lights, DC-110). */
  readonly flicker?: number | undefined;
  readonly area: readonly Polygon[];
}

/**
 * Dungeon Crucible: lighting between the map and the tokens, under the fog. `darkness` (0–1)
 * darkens everything outside `lit`; each glow adds its colour inside its own lit area. It never
 * makes fog transparent, so it cannot show hidden map areas.
 */
export interface Lighting {
  readonly darkness: number;
  readonly lit: readonly Polygon[];
  readonly glows: readonly LightGlow[];
  /** Soft edge of the darkness in map pixels. */
  readonly softEdge: number;
}

/** A map's grid, in map pixels (the sidecar's calibration), and how its lines look. */
export interface GridLines {
  readonly cellSizePx: number;
  readonly offsetXPx: number;
  readonly offsetYPx: number;
  /** `#rrggbb`; white by default. */
  readonly color?: string;
  /** 0–1; 0.35 by default, visible on dark and light maps without hiding them. */
  readonly alpha?: number;
}

/**
 * Most grid lines drawn per axis: more would freeze the view (a sidecar with a tiny cell size)
 * and could not be told apart on screen anyway.
 */
export const MAX_GRID_LINES = 2000;

/**
 * The x (or y) positions of grid lines across `length` map pixels; none when there would be
 * more than {@link MAX_GRID_LINES}.
 */
export function gridLinePositions(
  length: number,
  cellSizePx: number,
  offsetPx: number,
): number[] {
  if (!(cellSizePx > 0) || !(length > 0)) return [];
  if (length / cellSizePx > MAX_GRID_LINES) return [];
  const positions: number[] = [];
  // The first line inside the map: the offset moved back by whole cells.
  const first = offsetPx - Math.floor(offsetPx / cellSizePx) * cellSizePx;
  for (let at = first; at <= length; at += cellSizePx) positions.push(at);
  return positions;
}

/**
 * Draws one view of a scene (ARCHITECTURE §8). For now the map layer only; grid, tokens and
 * fog follow in later tasks. It draws on demand – once per change, in the next animation
 * frame – instead of every frame, so an idle DM window costs no GPU time.
 */
export interface Renderer {
  /**
   * Replaces the map image (`null` removes it). The renderer owns the texture from now on.
   * `origin`: where the image's top left lies in map pixels (a drawn map grows left and up,
   * E-33); the map's area – grid, light, memory and fog – is built there too.
   */
  setMap(image: MapImage | null, origin?: Origin): void;
  /**
   * Dungeon Crucible (E-33): walls drawn over a picture map, as an image whose top left lies at
   * `origin` – above the map, under the grid. `null` removes it.
   */
  setDrawing(image: MapImage | null, origin?: Origin): void;
  /** Dungeon Crucible (E-33): doors and cracks of drawn walls, above them; replaces those set before. */
  setDecals(decals: readonly Decal[]): void;
  /** Dungeon Crucible (E-35): moving water over the drawn water; `null` stills it (the painted water stays). */
  setWater(scene: WaterScene | null): void;
  /**
   * Dungeon Crucible (E-33): paints only `region` (picture px) of the painted map – or of the
   * drawing over a picture map – again, from `image` of the same size. False when that is not
   * possible (another size, no painted picture): then set it anew.
   */
  repaint(layer: 'map' | 'drawing', image: PaintedImage, region: { x: number; y: number; w: number; h: number }): boolean;
  /**
   * Shows a video map (ADR-0010): `video` must lie directly under the canvas in the same
   * positioned box; the renderer sizes, transforms and shows it, the caller owns it (loading,
   * playing, removing). It stays hidden until a frame was drawn with the fog known, and on
   * resize, context loss and teardown. `null` removes it (and hides it).
   */
  setVideo(video: HTMLVideoElement | null): void;
  /**
   * Covers everything except `revealed` with opaque fog (the player view), or removes the fog
   * layer with `null` (the DM sees the whole map). Set it before or with the map: the player
   * view must never draw a map without its fog (ARCHITECTURE §5.1, ADR-0010).
   */
  setFog(revealed: readonly Polygon[] | null, options?: FogOptions): void;
  /**
   * Dungeon Crucible addition – memory fog: darkens everything except `clear` (what players
   * see right now) by `opacity`, between the tokens and the fog. It only ever darkens, so it
   * cannot show more than the fog above it. `null` removes it.
   */
  setMemory(clear: readonly Polygon[] | null, options?: { opacity: number; softEdge?: number }): void;
  /** Dungeon Crucible addition – light and darkness (see {@link Lighting}); `null` removes it. */
  setLighting(lighting: Lighting | null): void;
  /**
   * Draws grid lines over the map (T-106b), under the fog – hidden areas stay covered, lines
   * included. `null` removes them.
   */
  setGrid(grid: GridLines | null): void;
  /**
   * Draws tokens (T-107a) over the map and grid, under the fog: a token in fog stays covered
   * on the TV. Replaces the tokens drawn before; a token that only moved keeps what was built
   * for it (T-107b), so dragging one rebuilds nothing. With `glide` (milliseconds) moved tokens
   * glide to their new place instead of jumping (T-233b: combat's snap).
   */
  setTokens(tokens: readonly TokenShape[], options?: { glide?: number }): void;
  /**
   * Dungeon Crucible (DC-041): draws placed assets over the map and grid, under light, tokens
   * and fog – darkness and fog cover them like the map. Videos loop; replaces those drawn before.
   */
  setAssets(assets: readonly AssetShape[]): void;
  setCamera(camera: Camera): void;
  resize(size: Size): void;
  /** Resolves after the next draw has been submitted (for screenshots and tests). */
  drawn(): Promise<void>;
  destroy(): void;
}

/** Creates a renderer drawing into `options.canvas` (WebGL; WebGPU is not reliable yet, T-007). */
export async function createRenderer(
  options: RendererOptions,
): Promise<Renderer> {
  const background = options.background ?? "#111111";
  const now = options.now ?? (() => performance.now());
  const app = new Application();
  await app.init({
    canvas: options.canvas,
    width: options.size.width,
    height: options.size.height,
    resolution: options.resolution ?? 1,
    autoDensity: true,
    background,
    // The WebGL context only gets an alpha channel if the background starts transparent; video
    // maps need it (they lie under the canvas). Opaque again right below for image maps.
    backgroundAlpha: 0,
    preference: "webgl",
    antialias: false,
    // Drawing happens on demand (see `requestDraw`); no render loop, no resizeTo: the caller
    // owns the canvas and calls `resize`.
    autoStart: false,
  });

  app.renderer.background.alpha = 1;
  // The GPU's texture limit (T-127): larger maps are drawn in tiles.
  const maxTextureSize =
    options.maxTextureSize ??
    (app.renderer instanceof WebGLRenderer
      ? Number(app.renderer.gl.getParameter(app.renderer.gl.MAX_TEXTURE_SIZE))
      : // WebGPU (not the preference): a size every GPU takes.
        4096);

  const world = new Container();
  app.stage.addChild(world);
  // Walls drawn over a picture map (E-33): right above the map (which goes in at index 0).
  const drawingLayer = new Container();
  world.addChild(drawingLayer);
  // Their doors and cracks, each a sprite; a picture's texture is made once.
  const decalLayer = new Container();
  world.addChild(decalLayer);
  const decalTextures = new Map<HTMLCanvasElement, Texture>();
  // Moving water (E-35): over the drawing, under grid, assets, tokens and fog.
  const waterHost = new Container();
  world.addChild(waterHost);
  // Decals and moving water stay inside the map's area, which the fog covers: nothing drawn past
  // its edge shows uncovered (a scene's own drawing does not grow the area).
  const decalMask = new Graphics();
  const waterMask = new Graphics();
  world.addChild(decalMask, waterMask);
  decalLayer.mask = decalMask;
  waterHost.mask = waterMask;
  const clipToArea = () => {
    for (const m of [decalMask, waterMask]) {
      m.clear();
      // No map yet: an empty mask shows nothing.
      m.rect(origin.x, origin.y, mapSize?.width ?? 0, mapSize?.height ?? 0).fill({ color: 0xffffff });
    }
  };
  let water: WaterHandle | null = null;
  let waterKey: string | null = null;
  const waterStart = now();
  // Grid lines (T-106b): above the map (which goes in at index 0), below the fog (added last).
  const gridLayer = new Graphics();
  world.addChild(gridLayer);
  let gridInput: GridLines | null = null;
  // Flickering glows (DC-110): their brightness wavers each frame, each light differently.
  let flickering: { sprite: Sprite; base: number; amount: number; seed: number }[] = [];
  const stepFlicker = () => {
    const t = now() / 1000;
    for (const f of flickering) {
      const wave = Math.sin(t * 9.1 + f.seed) * 0.5 + Math.sin(t * 23.7 + f.seed * 2.3) * 0.3 + Math.sin(t * 3.3 + f.seed * 5.1) * 0.2;
      f.sprite.alpha = f.base * (1 - f.amount * 0.5 * (0.5 + 0.5 * wave));
    }
  };
  // Placed assets (Dungeon Crucible): above the grid, below light, tokens and fog.
  const assetLayer = new Container();
  world.addChild(assetLayer);
  type BuiltAsset = { url: string; sprite: Sprite; width: number; height: number; run: number | undefined; alpha: number; fadeIn: number | null; previous: { sprite: Sprite; key: string } | null };
  const builtAssets = new Map<string, BuiltAsset>();
  // An asset whose picture changes (a house's roof and interior, E-29) crossfades: the old picture
  // fades out above the new one fading in.
  const ASSET_FADE_MS = 400;
  let fadingOut: { id: string; sprite: Sprite; key: string; from: number; start: number }[] = [];
  const fadingIn = new Set<BuiltAsset>();
  const stepAssetFades = () => {
    if (!fadingOut.length && !fadingIn.size) return;
    const t = now();
    fadingOut = fadingOut.filter((f) => {
      const k = Math.min(1, (t - f.start) / ASSET_FADE_MS);
      f.sprite.alpha = f.from * (1 - k);
      if (k < 1) return true;
      dropSprite(f.sprite);
      return false;
    });
    for (const b of fadingIn) {
      const k = Math.min(1, (t - (b.fadeIn ?? t)) / ASSET_FADE_MS);
      b.sprite.alpha = b.alpha * k;
      if (k >= 1) {
        b.fadeIn = null;
        fadingIn.delete(b);
      }
    }
  };
  const assetsFading = () => fadingOut.length > 0 || fadingIn.size > 0;
  const dropSprite = (sprite: Sprite) => {
    assetLayer.removeChild(sprite);
    sprite.destroy();
  };
  // One texture per file (and one looping video element per video file), kept until teardown.
  const assetTextures = new Map<string, { texture: Promise<Texture | null>; video: HTMLVideoElement | null; ready: Texture | null }>();
  let playingVideos = 0;
  const loadAssetTexture = (key: string, isVideo: boolean, once = false) => {
    let entry = assetTextures.get(key);
    if (entry) return entry.texture;
    // The key of a play-once video carries its placement after the file's URL.
    const url = key.split("#once:")[0];
    if (isVideo) {
      const video = document.createElement("video");
      video.crossOrigin = "anonymous";
      video.loop = !once;
      video.muted = true;
      video.playsInline = true;
      video.src = url;
      const texture = new Promise<Texture | null>((resolve) => {
        video.onloadeddata = () => {
          if (!once) void video.play().catch(() => undefined);
          resolve(Texture.from(video));
        };
        video.onerror = () => resolve(null);
      });
      entry = { texture, video, ready: null };
    } else {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.src = url;
      entry = { texture: img.decode().then(() => Texture.from(img), () => null), video: null, ready: null };
    }
    const own = entry;
    void own.texture.then((t) => (own.ready = t));
    assetTextures.set(key, own);
    return own.texture;
  };
  const drawAssets = (next: readonly AssetShape[]) => {
    const keep = new Set(next.map((a) => a.id));
    for (const [id, built] of builtAssets) {
      if (keep.has(id)) continue;
      dropSprite(built.sprite);
      if (built.previous) dropSprite(built.previous.sprite);
      fadingIn.delete(built);
      builtAssets.delete(id);
    }
    // A placement gone in the middle of a crossfade takes its old picture along.
    fadingOut = fadingOut.filter((f) => {
      if (keep.has(f.id)) return true;
      dropSprite(f.sprite);
      return false;
    });
    // Children in drawing order: each placement's picture, its old one (fading out) right above.
    let pos = 0;
    next.forEach((a) => {
      // A play-once effect has its own video (it restarts on its own); loops share one per file.
      const source = a.once === undefined ? a.url : `${a.url}#once:${a.id}`;
      let built = builtAssets.get(a.id);
      if (!built || built.url !== source) {
        // A new picture for the same placement: the old one stays until the new one has loaded,
        // then they crossfade. Changed again meanwhile: the one still shown stays the old one.
        let previous: { sprite: Sprite; key: string } | null = null;
        if (built) {
          if (built.previous) {
            previous = built.previous;
            dropSprite(built.sprite);
          } else previous = { sprite: built.sprite, key: built.url };
          fadingIn.delete(built);
        }
        const sprite = new Sprite();
        sprite.anchor.set(0.5);
        if (previous) sprite.alpha = 0;
        built = { url: source, sprite, width: a.width, height: a.height, run: undefined, alpha: a.alpha ?? 1, fadeIn: null, previous };
        builtAssets.set(a.id, built);
        const target = built;
        void loadAssetTexture(source, a.video, a.once !== undefined).then((texture) => {
          if (destroyed || builtAssets.get(a.id) !== target) return;
          if (!texture) {
            // The new picture failed: the old one must not stand in for it.
            if (target.previous) dropSprite(target.previous.sprite);
            target.previous = null;
            requestDraw();
            return;
          }
          sprite.texture = texture;
          // The size was set for the empty sprite; the picture now fills it.
          sprite.setSize(target.width, target.height);
          if (target.previous) {
            const start = now();
            target.fadeIn = start;
            fadingIn.add(target);
            fadingOut.push({ id: a.id, sprite: target.previous.sprite, key: target.previous.key, from: target.previous.sprite.alpha, start });
            target.previous = null;
          } else sprite.alpha = target.alpha;
          requestDraw();
        });
      }
      const sprite = built.sprite;
      assetLayer.addChildAt(sprite, Math.min(pos++, assetLayer.children.length));
      const old = [...(built.previous ? [built.previous.sprite] : []), ...fadingOut.filter((f) => f.id === a.id).map((f) => f.sprite)];
      for (const o of old) assetLayer.addChildAt(o, Math.min(pos++, assetLayer.children.length));
      sprite.position.set(a.x, a.y);
      sprite.angle = a.rotation;
      built.width = a.width;
      built.height = a.height;
      built.alpha = a.alpha ?? 1;
      if (built.fadeIn === null && sprite.texture !== Texture.EMPTY) sprite.alpha = built.alpha;
      // A new run of a play-once effect: from the start, shown until it ends.
      if (a.once !== undefined && built.run !== a.once) {
        built.run = a.once;
        const video = assetTextures.get(source)?.video;
        sprite.visible = true;
        if (video) {
          video.currentTime = 0;
          video.onended = () => {
            sprite.visible = false;
            requestDraw();
          };
          void video.play().catch(() => undefined);
        }
      }
      if (sprite.texture !== Texture.EMPTY) sprite.setSize(a.width, a.height);
    });
    // Files no placement shows any more are freed (GPU memory; videos stop decoding).
    // Pictures still shown while their placement crossfades count as shown.
    const used = new Set([
      ...next.map((a) => (a.once === undefined ? a.url : `${a.url}#once:${a.id}`)),
      ...fadingOut.map((f) => f.key),
      ...[...builtAssets.values()].flatMap((b) => (b.previous ? [b.previous.key] : [])),
    ]);
    for (const [url, entry] of assetTextures) {
      if (used.has(url)) continue;
      entry.video?.pause();
      entry.video?.removeAttribute("src");
      void entry.texture.then((tex) => tex?.destroy(true));
      assetTextures.delete(url);
    }
    playingVideos = next.filter((a) => a.video).length;
  };
  // Lighting (Dungeon Crucible): above the grid, below the tokens and the fog.
  const lightLayer = new Container();
  world.addChild(lightLayer);
  let lightInput: Lighting | null = null;
  let lightBuiltFrom: string | null = null;
  let glowTexture: Texture | null = null;
  // Tokens (T-107a): above the grid, below the fog.
  const tokenLayer = new Container();
  world.addChild(tokenLayer);
  // Memory fog (Dungeon Crucible): above the tokens, below the fog (added last).
  const memoryLayer = new Container();
  world.addChild(memoryLayer);
  // The fog on top of everything, in the map's own space like the other area layers (E-33).
  const fogHost = new Container();
  world.addChild(fogHost);
  let memoryInput: { readonly clear: readonly Polygon[]; readonly opacity: number; readonly softEdge: number } | null = null;
  let memoryBuiltFrom: string | null = null;
  // Per token id: what its look was built from, and the container drawn at its centre.
  const builtTokens = new Map<
    string,
    { look: string; view: Container; label: Text | null }
  >();
  // Tokens gliding to their new place, by id: from where they were shown, to where they go.
  const glides = new Map<
    string,
    {
      readonly view: Container;
      readonly from: { x: number; y: number };
      readonly to: { x: number; y: number };
      readonly start: number;
      readonly duration: number;
    }
  >();
  const stepGlides = () => {
    for (const [id, glide] of glides) {
      const progress = fadeProgress(glide.start, glide.duration, now());
      const mix = easeOut(progress);
      glide.view.position.set(
        glide.from.x + (glide.to.x - glide.from.x) * mix,
        glide.from.y + (glide.to.y - glide.from.y) * mix,
      );
      if (progress >= 1) glides.delete(id);
    }
  };
  // Labels are rasterised for the current zoom, so initials stay sharp when the DM zooms in.
  let tokenLabelResolution = labelResolution(1, options.resolution ?? 1);
  const buildToken = (token: TokenShape) => {
    const radius = Math.min(token.width, token.height) / 2;
    const view = new Container();
    // A little inside its footprint, so neighbours never touch.
    view.addChild(
      new Graphics()
        .circle(0, 0, radius * 0.9)
        .fill(token.color ? "#2a2620" : tokenColor(token.id))
        .stroke({ width: radius * (token.color ? 0.14 : 0.08), color: token.color ?? TOKEN_RING }),
    );
    // The turn's token: a bright ring outside its own, with a dark edge on any map.
    if (token.active === true)
      view.addChild(
        new Graphics()
          .circle(0, 0, radius * 1.08)
          .stroke({ width: radius * 0.2, color: "#000000", alpha: 0.6 })
          .circle(0, 0, radius * 1.08)
          .stroke({ width: radius * 0.12, color: TOKEN_ACTIVE_RING }),
      );
    if (token.selected === true)
      view.addChild(
        new Graphics()
          .circle(0, 0, radius * 1.02)
          .stroke({ width: radius * 0.1, color: TOKEN_SELECTED_RING }),
      );
    const initials = tokenInitials(token.name);
    let label: Text | null = null;
    if (initials !== "") {
      label = new Text({
        text: initials,
        style: {
          fill: "#ffffff",
          fontFamily: "system-ui, sans-serif",
          fontWeight: "600",
          fontSize: radius * (initials.length > 2 ? 0.55 : 0.8),
        },
        resolution: tokenLabelResolution,
      });
      label.anchor.set(0.5);
      view.addChild(label);
    }
    view.alpha = token.hidden === true ? TOKEN_HIDDEN_ALPHA : 1;
    return { view, label };
  };
  const drawTokens = (tokens: readonly TokenShape[], glide = 0) => {
    const wanted = new Set(tokens.map((token) => token.id));
    for (const [id, built] of builtTokens)
      if (!wanted.has(id)) {
        glides.delete(id);
        tokenLayer.removeChild(built.view);
        built.view.destroy({ children: true, context: true, style: true });
        builtTokens.delete(id);
      }
    tokens.forEach((token, index) => {
      const look = JSON.stringify([
        token.name,
        token.width,
        token.height,
        token.selected === true,
        token.hidden === true,
        token.active === true,
        token.color,
      ]);
      let built = builtTokens.get(token.id);
      // Where it is shown now, mid-glide too: a new glide starts from there.
      const shownAt = built
        ? { x: built.view.position.x, y: built.view.position.y }
        : null;
      if (built?.look !== look) {
        if (built) {
          tokenLayer.removeChild(built.view);
          built.view.destroy({ children: true, context: true, style: true });
        }
        built = { look, ...buildToken(token) };
        builtTokens.set(token.id, built);
        tokenLayer.addChild(built.view);
      }
      const to = {
        x: token.x + token.width / 2,
        y: token.y + token.height / 2,
      };
      const moves = shownAt && (shownAt.x !== to.x || shownAt.y !== to.y);
      const running = glides.get(token.id);
      // Already on its way there (another message during the glide): it goes on as it was.
      if (
        running?.view === built.view &&
        running.to.x === to.x &&
        running.to.y === to.y
      )
        return;
      if (glide > 0 && moves) {
        glides.set(token.id, {
          view: built.view,
          from: shownAt,
          to,
          start: now(),
          duration: glide,
        });
        built.view.position.set(shownAt.x, shownAt.y);
      } else {
        glides.delete(token.id);
        built.view.position.set(to.x, to.y);
      }
      // The order given is the drawing order (later tokens on top).
      tokenLayer.setChildIndex(built.view, index);
    });
  };
  // What the drawn lines were built from: an equal request (the player view gets the whole
  // state with every message) keeps them instead of rebuilding.
  let gridBuiltFrom: string | null = null;
  // The map: one sprite, or a container of tiles for a map larger than the texture limit (T-127).
  let map: Container | null = null;
  let mapImageSize: Size | null = null;
  // Where the map's area starts (E-33), and the area layers' inputs as given, in map pixels.
  let origin: Origin = ZERO;
  let rawFog: { readonly revealed: readonly Polygon[]; readonly options: FogOptions } | null = null;
  let rawMemory: { readonly clear: readonly Polygon[]; readonly opacity: number; readonly softEdge: number } | null = null;
  let rawLight: Lighting | null = null;
  let rawGrid: GridLines | null = null;
  /** The area layers' inputs in the map's own space, and the layers placed at the origin. */
  const toMapSpace = () => {
    fogInput = rawFog && { ...rawFog, revealed: shiftPolygons(rawFog.revealed, origin) };
    memoryInput = rawMemory && { ...rawMemory, clear: shiftPolygons(rawMemory.clear, origin) };
    lightInput = shiftLighting(rawLight, origin);
    gridInput = shiftGrid(rawGrid, origin);
    for (const layer of [fogHost, memoryLayer, lightLayer, gridLayer]) layer.position.set(origin.x, origin.y);
    map?.position.set(origin.x, origin.y);
    clipToArea();
  };
  let fog: Container | null = null;
  // The last fog asked for: rebuilt when the map changes, as soft edges follow the map's size.
  let fogInput: {
    readonly revealed: readonly Polygon[];
    readonly options: FogOptions;
  } | null = null;
  let mapSize: Size | null = null;
  // What the current fog was built from: an equal request (the player view gets the whole
  // scene with every message, also for a rotation) keeps it instead of rebuilding.
  let fogBuiltFrom: string | null = null;
  // The fog shown before the current request, and the map size it was shown on: fades start
  // from it.
  let shownFog: {
    readonly revealed: readonly Polygon[];
    readonly options: FogOptions;
    readonly map: Size;
  } | null = null;
  let fade: Fade | null = null;
  // The living fog's clock (seconds of drift at speed 1) and when it last moved.
  let livingTime = 0;
  let livingAt = now();
  const rootResolution = options.resolution ?? 1;
  /** The light layer's darkness (a fog layer of its own, freed like the fog). */
  let darknessLayer: Container | null = null;
  let size = options.size;
  let camera: Camera | null = null;
  let frame: number | null = null;
  let waiting: (() => void)[] = [];
  let destroyed = false;

  const applyCamera = () => {
    if (!camera) return;
    world.pivot.set(camera.centerX, camera.centerY);
    world.position.set(size.width / 2, size.height / 2);
    world.scale.set(camera.zoom);
    world.rotation = (camera.rotation * Math.PI) / 180;
  };

  let video: HTMLVideoElement | null = null;
  const gate = createVideoGate();
  // Hide first, decide later: the video may only show once the gate allows it again.
  const showVideo = () => {
    if (!video) return;
    if (camera) video.style.transform = cssTransform(camera, size);
    video.style.visibility = gate.visible() ? "visible" : "hidden";
  };
  const hideVideo = () => {
    if (video) video.style.visibility = "hidden";
  };
  // The element keeps the map size it had when handed over: fog and camera are in those map
  // pixels. Later frames of another resolution are stretched onto it (object-fit: fill).
  let videoSize = { width: 0, height: 0 };
  const onVideoResize = () => {
    if (!video) return;
    const frames = { width: video.videoWidth, height: video.videoHeight };
    gate.videoResized(sameAspect(frames, videoSize));
    if (!gate.visible()) hideVideo();
  };
  const onContextLost = () => {
    gate.contextLost();
    hideVideo();
  };
  const onContextRestored = () => {
    gate.contextRestored();
    requestDraw();
  };
  options.canvas.addEventListener("webglcontextlost", onContextLost);
  options.canvas.addEventListener("webglcontextrestored", onContextRestored);

  const drawLighting = () => {
    const key = JSON.stringify([lightInput, mapSize]);
    if (key === lightBuiltFrom) return;
    lightBuiltFrom = key;
    flickering = [];
    // The darkness is a fog layer and goes with its mask texture; the glows share their texture,
    // so they go without it.
    for (const child of lightLayer.removeChildren()) {
      if (child === darknessLayer) disposeFog(child);
      else child.destroy({ children: true, context: true });
    }
    darknessLayer = null;
    if (!lightInput) return;
    if (lightInput.darkness > 0) {
      darknessLayer = drawFog(lightInput.lit, { opacity: Math.min(0.95, lightInput.darkness), softEdge: lightInput.softEdge }, mapSize, rootResolution);
      lightLayer.addChild(darknessLayer);
    }
    if (lightInput.glows.length === 0) return;
    glowTexture ??= radialGlowTexture();
    for (const glow of lightInput.glows) {
      if (glow.dimPx <= 0 || glow.area.length === 0) continue;
      const sprite = new Sprite(glowTexture);
      sprite.anchor.set(0.5);
      sprite.position.set(glow.x, glow.y);
      sprite.width = sprite.height = glow.dimPx * 2;
      sprite.tint = glow.color;
      sprite.blendMode = "add";
      // Brighter where the bright radius is a larger share of the dim one.
      sprite.alpha = 0.22 + 0.25 * Math.min(1, glow.brightPx / glow.dimPx);
      if (glow.flicker) flickering.push({ sprite, base: sprite.alpha, amount: glow.flicker, seed: glow.x * 0.013 + glow.y * 0.029 });
      const mask = new Graphics();
      for (const polygon of glow.area) {
        mask.poly(flat(polygon.outer)).fill({ color: 0xffffff });
        for (const hole of polygon.holes) mask.poly(flat(hole)).cut();
      }
      sprite.mask = mask;
      lightLayer.addChild(mask, sprite);
    }
  };

  const drawMemory = () => {
    const key = JSON.stringify([memoryInput, mapSize]);
    if (key === memoryBuiltFrom) return;
    memoryBuiltFrom = key;
    for (const child of memoryLayer.removeChildren()) disposeFog(child as Container);
    if (!memoryInput || memoryInput.opacity <= 0) return;
    memoryLayer.addChild(
      drawFog(memoryInput.clear, { opacity: Math.min(0.99, memoryInput.opacity), softEdge: memoryInput.softEdge }, mapSize, rootResolution),
    );
  };

  const drawGrid = () => {
    const key = JSON.stringify([gridInput, mapSize]);
    if (key === gridBuiltFrom) return;
    gridBuiltFrom = key;
    gridLayer.clear();
    if (!gridInput || !mapSize) return;
    const { cellSizePx, offsetXPx, offsetYPx } = gridInput;
    for (const x of gridLinePositions(mapSize.width, cellSizePx, offsetXPx))
      gridLayer.moveTo(x, 0).lineTo(x, mapSize.height);
    for (const y of gridLinePositions(mapSize.height, cellSizePx, offsetYPx))
      gridLayer.moveTo(0, y).lineTo(mapSize.width, y);
    // One device pixel wide at any zoom.
    gridLayer.stroke({
      width: 1,
      pixelLine: true,
      color: gridInput.color ?? "#ffffff",
      alpha: gridInput.alpha ?? 0.35,
    });
  };

  // The fog shown before a change of its look alone (a biome, T-168), fading out over the new
  // one. Both cover the same polygons, so nothing hidden shows while they blend.
  let outgoing: {
    readonly layer: Container;
    readonly start: number;
    readonly duration: number;
  } | null = null;
  const dropOutgoing = () => {
    if (!outgoing) return;
    fogHost.removeChild(outgoing.layer);
    disposeFog(outgoing.layer);
    outgoing = null;
  };
  /** Shows `next` under the fog on screen, which then fades out over `duration` ms. */
  const blendFog = (next: Container, duration: number) => {
    dropOutgoing();
    const old = fog;
    fog = next;
    fogHost.addChild(next);
    if (!old) return;
    // On top of the new layer, fading out.
    fogHost.removeChild(old);
    fogHost.addChild(old);
    outgoing = { layer: old, start: now(), duration };
  };
  const stepOutgoing = () => {
    if (!outgoing) return;
    const progress = fadeProgress(outgoing.start, outgoing.duration, now());
    if (progress >= 1) dropOutgoing();
    else outgoing.layer.alpha = 1 - progress;
  };

  const replaceFog = (next: Container | null) => {
    dropOutgoing();
    if (fog) {
      fogHost.removeChild(fog);
      disposeFog(fog);
    }
    fog = next;
    if (fog) fogHost.addChild(fog);
  };

  /** A fade from the fog on screen to `target`, or `null` if this change must not fade. */
  const startFade = (target: NonNullable<typeof fogInput>): Fade | null => {
    const transition = target.options.fade ?? 0;
    const speed = target.options.speed;
    const previous = shownFog;
    // Nothing to animate: no transition, and no finite speed to travel at.
    const spreads =
      speed !== undefined && Number.isFinite(speed.cellsPerSecond);
    if (transition <= 0 && !spreads) return null;
    if (!previous || !mapSize || !fog) return null;
    if (!sameSize(previous.map, mapSize)) return null;
    // Only the look changed (soft edges, living fog): nothing spreads, it switches at once.
    if (JSON.stringify(previous.revealed) === JSON.stringify(target.revealed))
      return null;
    const to = fogMask(target.revealed, mapSize, maskEdge(target.options));
    // From what is on screen: mid-fade, the mix reached so far.
    const from = fade
      ? {
          ...fade.to,
          alpha: spreadMix(
            fade.from.alpha,
            fade.to.alpha,
            sampleOrder(fade.order, fade.to.width, fade.to.height),
            fadeMix(fade, now()),
            fade.shares,
          ),
        }
      : fogMask(previous.revealed, mapSize, maskEdge(previous.options));
    // "Sofort" turns everything over together: no order to build.
    const order = coarseSpreadOrder(
      gridOf(from),
      gridOf(to),
      speed && spreads
        ? {
            cellsPerTexel: to.texel / speed.cellSizePx,
            seed: speed.seed ?? mapSeed(mapSize),
          }
        : undefined,
      // From the point the device chose (T-249); used only when the whole map ends fogged –
      // decided on the mask, so revealed slivers beyond the map's border do not count.
      target.options.coverFrom === "random"
        ? shareOf(JSON.stringify(previous.revealed), mapSeed(mapSize))
        : undefined,
    );
    const timing = speed
      ? spreadAtSpeed(
          order.longest * to.texel,
          speed.cellSizePx,
          speed.cellsPerSecond,
          transition,
        )
      : { duration: transition, shares: DURATION_SHARES };
    if (timing.duration <= 0) return null;
    // Fogged in every state of the fade: the exact hard fog covers it all along.
    const revealedAll = unique([
      ...(fade?.revealedAll ?? previous.revealed),
      ...target.revealed,
    ]);
    return {
      ...drawFadeFog(
        revealedAll,
        from,
        to,
        order,
        target.options,
        mapSize,
        rootResolution,
        timing.shares,
      ),
      from,
      to,
      order,
      revealedAll,
      start: now(),
      duration: timing.duration,
      shares: timing.shares,
      // At a speed the front travels evenly; a fixed duration eases out (T-136b).
      eased: !speed,
      final: drawFog(
        target.revealed,
        target.options,
        mapSize,
        rootResolution,
        to,
      ),
    };
  };

  /** Stops a running fade; its unused final layer goes. */
  const dropFade = () => {
    if (fade) disposeFog(fade.final);
    fade = null;
  };

  const applyFog = () => {
    // The fade duration is how to get there, not what is shown: it is not part of the key.
    const key = fogInput
      ? JSON.stringify([
          fogInput.revealed,
          {
            ...fogInput.options,
            fade: undefined,
            // How fast a change travels is how to get there too (T-246).
            speed: undefined,
            coverFrom: undefined,
            // The drift's speed is read every frame; changing it rebuilds nothing.
            living: fogInput.options.living && {
              ...fogInput.options.living,
              motion: undefined,
            },
          },
          mapSize,
        ])
      : null;
    if (key !== null && key === fogBuiltFrom && fog) return;
    // Build the new fog first: if that fails, the old fog stays in place and counts.
    const fading = fogInput ? startFade(fogInput) : null;
    const next = fading
      ? fading.layer
      : fogInput
        ? drawFog(fogInput.revealed, fogInput.options, mapSize, rootResolution)
        : null;
    // Only the look changed (the same polygons on the same map): blend over (T-168), quickly
    // (T-261) – unless the device turned fades off, then it switches at once.
    const blend =
      !fading &&
      next !== null &&
      fogInput !== null &&
      shownFog !== null &&
      mapSize !== null &&
      sameSize(shownFog.map, mapSize) &&
      (fogInput.options.fade ?? 0) > 0 &&
      JSON.stringify(shownFog.revealed) === JSON.stringify(fogInput.revealed);
    if (blend) blendFog(next, LOOK_BLEND_MS);
    else replaceFog(next);
    dropFade();
    fade = fading;
    fogBuiltFrom = key;
    shownFog = fogInput && mapSize ? { ...fogInput, map: mapSize } : null;
  };

  /** Advances a running fade; at its end the exact fog takes over. */
  const stepFade = () => {
    if (!fade) return;
    const progress = fadeProgress(fade.start, fade.duration, now());
    if (progress < 1) {
      fade.setMix(fadeMix(fade, now()));
      return;
    }
    // Shows the target, should swapping in the final layer fail.
    fade.setMix(1);
    const final = fade.final;
    fade = null;
    replaceFog(final);
  };

  /** The living fog shown now (a fade's or the settled one's), if any. */
  const livingShown = () => (fog ? livingLayers.get(fog) : undefined);
  const drifting = () =>
    livingShown() !== undefined && (fogInput?.options.living?.motion ?? 0) > 0;
  /** Moves the living fog's clock on by the time since the last frame, at its speed. */
  const stepLiving = () => {
    const at = now();
    livingTime +=
      (Math.max(0, at - livingAt) / 1000) *
      (fogInput?.options.living?.motion ?? 0);
    livingAt = at;
    livingShown()?.setTime(livingTime);
    if (outgoing) livingLayers.get(outgoing.layer)?.setTime(livingTime);
  };

  const requestDraw = () => {
    if (frame !== null || destroyed) return;
    frame = requestAnimationFrame(() => {
      frame = null;
      try {
        stepFade();
        stepLiving();
        water?.setTime((now() - waterStart) / 1000);
        stepOutgoing();
        stepGlides();
        stepFlicker();
        stepAssetFades();
        applyCamera();
        // Looping asset videos: their frames go to the GPU, and the next draw follows.
        if (playingVideos > 0) for (const t of assetTextures.values()) if (t.video) t.ready?.source.update();
        app.render();
        gate.drawn();
        showVideo();
        if (playingVideos > 0 || flickering.length > 0 || assetsFading()) requestDraw();
      } catch (error) {
        // ADR-0010: on renderer errors the raw video must not stay visible.
        gate.renderFailed();
        hideVideo();
        console.error("The renderer failed to draw a frame.", error);
      }
      const done = waiting;
      waiting = [];
      done.forEach((resolve) => {
        resolve();
      });
      // A fade, a glide or drifting fog draws every frame; otherwise drawing stays on demand.
      if (fade || outgoing || glides.size > 0 || drifting() || water) requestDraw();
    });
  };

  return {
    setMap(image, at = ZERO) {
      if (image && video) {
        // An image map replaces a video map: hide it and make the canvas opaque again.
        hideVideo();
        video.removeEventListener("resize", onVideoResize);
        video = null;
        app.renderer.background.color = background;
        app.renderer.background.alpha = 1;
      }
      if (map) {
        world.removeChild(map);
        map.destroy({ children: true, texture: true, textureSource: true });
        map = null;
        mapImageSize = null;
      }
      if (image) {
        map = mapSprites(image, maxTextureSize);
        mapImageSize = { width: image.width, height: image.height };
        world.addChildAt(map, 0);
      }
      mapSize = mapImageSize ? mapImageSize : video ? videoSize : null;
      // A video map starts at 0, 0.
      origin = image ? at : ZERO;
      toMapSpace();
      // A new map never fades: its fog is there at once, also if the map's size and fog are
      // the same as before (a running fade must not freeze half-way).
      dropFade();
      shownFog = null;
      fogBuiltFrom = null;
      if (fogInput) applyFog();
      drawMemory();
      drawLighting();
      drawGrid();
      requestDraw();
    },
    setWater(scene) {
      const key = scene ? JSON.stringify(scene) : null;
      if (key === waterKey) return;
      waterKey = key;
      water?.destroy();
      water = null;
      if (scene && (scene.waters.length > 0)) {
        water = buildWaterLayer(scene);
        waterHost.addChild(water.container);
      }
      requestDraw();
    },
    setDecals(decals) {
      for (const child of decalLayer.removeChildren()) child.destroy();
      const used = new Set<HTMLCanvasElement>();
      for (const d of decals) {
        used.add(d.image);
        let texture = decalTextures.get(d.image);
        if (!texture) {
          texture = Texture.from(d.image, true);
          decalTextures.set(d.image, texture);
        }
        const sprite = new Sprite(texture);
        sprite.anchor.set(0.5);
        sprite.position.set(d.x, d.y);
        sprite.width = d.width;
        sprite.height = d.height;
        sprite.rotation = d.rotation;
        decalLayer.addChild(sprite);
      }
      // Pictures no longer shown go with their textures.
      for (const [image, texture] of decalTextures)
        if (!used.has(image)) {
          texture.destroy(true);
          decalTextures.delete(image);
        }
      requestDraw();
    },
    repaint(layer, image, region) {
      const container = layer === 'map' ? map : (drawingLayer.children[0] as Container | undefined);
      const tiles = container ? paintedTiles.get(container) : undefined;
      if (!tiles || tiles.width !== image.width || tiles.height !== image.height) return false;
      for (const t of tiles.tiles) {
        const x0 = Math.max(region.x, t.left);
        const y0 = Math.max(region.y, t.top);
        const x1 = Math.min(region.x + region.w, t.left + t.canvas.width);
        const y1 = Math.min(region.y + region.h, t.top + t.canvas.height);
        if (x1 <= x0 || y1 <= y0) continue;
        const context = t.canvas.getContext("2d");
        if (!context) return false;
        context.save();
        context.beginPath();
        context.rect(x0 - t.left, y0 - t.top, x1 - x0, y1 - y0);
        context.clip();
        context.clearRect(x0 - t.left, y0 - t.top, x1 - x0, y1 - y0);
        context.translate(x0 - t.left, y0 - t.top);
        image.paint(context, x0, y0, x1 - x0, y1 - y0);
        context.restore();
        t.source.update();
      }
      requestDraw();
      return true;
    },
    setDrawing(image, at = ZERO) {
      for (const child of drawingLayer.removeChildren()) child.destroy({ children: true, texture: true, textureSource: true });
      if (image) {
        drawingLayer.addChild(mapSprites(image, maxTextureSize));
        drawingLayer.position.set(at.x, at.y);
      }
      requestDraw();
    },
    setVideo(next) {
      hideVideo();
      video?.removeEventListener("resize", onVideoResize);
      video = next;
      next?.addEventListener("resize", onVideoResize);
      gate.newVideo();
      // A video map lies under the canvas, so the canvas must be see-through around the fog –
      // cleared to black: with premultiplied alpha, any other colour at alpha 0 would be added
      // onto the video.
      app.renderer.background.color = next ? 0x000000 : background;
      app.renderer.background.alpha = next ? 0 : 1;
      if (next) {
        next.style.position = "absolute";
        next.style.left = "0";
        next.style.top = "0";
        videoSize = { width: next.videoWidth, height: next.videoHeight };
        next.style.width = `${String(videoSize.width)}px`;
        next.style.height = `${String(videoSize.height)}px`;
        next.style.objectFit = "fill";
        next.style.transformOrigin = "0 0";
        next.style.visibility = "hidden";
        mapSize = videoSize;
        origin = ZERO;
        toMapSpace();
      } else if (!map) mapSize = null;
      clipToArea();
      dropFade();
      shownFog = null;
      fogBuiltFrom = null;
      if (fogInput) applyFog();
      drawMemory();
      drawLighting();
      drawGrid();
      requestDraw();
    },
    setFog(revealed, fogOptions) {
      // The clock only runs while the fog drifts: an idle spell is no jump.
      if (!drifting()) livingAt = now();
      rawFog = revealed ? { revealed, options: fogOptions ?? {} } : null;
      toMapSpace();
      applyFog();
      gate.fogSet();
      requestDraw();
    },
    setLighting(next) {
      rawLight = next;
      toMapSpace();
      drawLighting();
      requestDraw();
    },
    setMemory(clear, memoryOptions) {
      rawMemory = clear ? { clear, opacity: memoryOptions?.opacity ?? 0.5, softEdge: memoryOptions?.softEdge ?? 0 } : null;
      toMapSpace();
      drawMemory();
      requestDraw();
    },
    setAssets(next) {
      drawAssets(next);
      requestDraw();
    },
    setTokens(next, tokenOptions) {
      drawTokens(next, tokenOptions?.glide ?? 0);
      requestDraw();
    },
    setGrid(next) {
      rawGrid = next;
      toMapSpace();
      drawGrid();
      requestDraw();
    },
    setCamera(next) {
      camera = next;
      const resolution = labelResolution(next.zoom, options.resolution ?? 1);
      if (resolution !== tokenLabelResolution) {
        tokenLabelResolution = resolution;
        for (const built of builtTokens.values())
          if (built.label) built.label.resolution = resolution;
      }
      requestDraw();
    },
    resize(next) {
      if (next.width === size.width && next.height === size.height) return;
      size = next;
      gate.resized();
      hideVideo();
      app.renderer.resize(next.width, next.height);
      requestDraw();
    },
    drawn() {
      if (destroyed) return Promise.resolve();
      return new Promise((resolve) => {
        waiting.push(resolve);
        requestDraw();
      });
    },
    destroy() {
      destroyed = true;
      dropFade();
      // The fog's graphics contexts too, as on every rebuild; and the grid's (Pixi keeps a
      // Graphics' own context when destroyed with options).
      replaceFog(null);
      memoryInput = null;
      drawMemory();
      lightInput = null;
      drawLighting();
      glowTexture?.destroy(true);
      world.removeChild(gridLayer);
      gridLayer.destroy({ context: true });
      for (const child of drawingLayer.removeChildren()) child.destroy({ children: true, texture: true, textureSource: true });
      for (const child of decalLayer.removeChildren()) child.destroy();
      for (const texture of decalTextures.values()) texture.destroy(true);
      decalTextures.clear();
      water?.destroy();
      water = null;
      drawTokens([]);
      drawAssets([]);
      for (const entry of assetTextures.values()) {
        entry.video?.pause();
        entry.video?.removeAttribute("src");
        void entry.texture.then((tex) => tex?.destroy(true));
      }
      assetTextures.clear();
      gate.destroyed();
      hideVideo();
      video?.removeEventListener("resize", onVideoResize);
      options.canvas.removeEventListener("webglcontextlost", onContextLost);
      options.canvas.removeEventListener(
        "webglcontextrestored",
        onContextRestored,
      );
      if (frame !== null) cancelAnimationFrame(frame);
      waiting.forEach((resolve) => {
        resolve();
      });
      waiting = [];
      // Keep the canvas element: React owns and removes it.
      app.destroy(
        { removeView: false },
        { children: true, texture: true, textureSource: true },
      );
    },
  };
}

/**
 * How long a change of the fog's look alone (a biome, its strength) blends over, in ms (T-261,
 * DM decision 2026-11-22): quick, whatever the fog's fade takes for reveals.
 */
export const LOOK_BLEND_MS = 300;

/** Living fog layers (T-245) by the fog layer that shows them: the frame loop moves their clock. */
const livingLayers = new WeakMap<Container, LivingHandle>();

/** The soft mask's edge for `options`: the living fog's band, else the soft edge (or none). */
function maskEdge(options: FogOptions): number {
  return options.living
    ? livingReach(options.living).band
    : (options.softEdge ?? 0);
}

/** A 1×1 spread order of 0: everything has turned over (a settled living fog). */
function settledOrder(): Texture {
  return alphaTexture({ width: 1, height: 1, data: new Uint8Array(1) }, 1);
}

/**
 * Living fog over `map` (T-245): over the map and, for the player view, far around it, so a
 * fitted or panned view never shows its edge; the see-through DM view tints only the map.
 */
function livingLayer(
  layer: Container,
  masks: {
    readonly from: FogMask;
    readonly to: FogMask;
    readonly order: Texture;
  },
  living: LivingFog,
  opacity: number,
  map: Size,
  rootResolution: number,
): LivingHandle {
  const to = maskTexture(masks.to, 1);
  const handle = drawLivingFog({
    from: masks.from === masks.to ? to : maskTexture(masks.from, 1),
    to,
    order: masks.order,
    maskSize: {
      width: masks.to.width * masks.to.texel,
      height: masks.to.height * masks.to.texel,
    },
    map,
    margin: opacity < 1 ? 0 : Math.max(map.width, map.height),
    living,
    opacity,
    rootResolution,
  });
  layer.addChild(handle.mesh);
  livingLayers.set(layer, handle);
  return handle;
}

/** Fog reaches far beyond any map, so panning or rotating never shows an uncovered edge. */
const FOG_EXTENT = 1_000_000;
const FOG_COLOUR = 0x000000;

const flat = (ring: readonly (readonly [number, number])[]) =>
  ring.flatMap(([x, y]) => [x, y]);

/**
 * Fog: an opaque area with the revealed polygons as an inverse stencil mask. Each polygon is
 * filled on its own (holes cut only from their own outer ring), and the stencil adds them up, so
 * nested shapes (an island revealed inside a hidden hole), touching corners and overlaps are all
 * drawn correctly – no hole ever has to fit inside one shared outer shape.
 */
function drawHardFog(revealed: readonly Polygon[], opacity: number): Container {
  const layer = new Container();
  const cover = new Graphics()
    .rect(-FOG_EXTENT, -FOG_EXTENT, 2 * FOG_EXTENT, 2 * FOG_EXTENT)
    .fill({ color: FOG_COLOUR, alpha: opacity });
  const open = new Graphics();
  for (const polygon of revealed) {
    open.poly(flat(polygon.outer)).fill({ color: 0xffffff });
    for (const hole of polygon.holes) open.poly(flat(hole)).cut();
  }
  layer.addChild(cover, open);
  cover.setMask({ mask: open, inverse: true });
  return layer;
}

/**
 * Longest side of the soft mask in texels: enough for an edge, cheap to compute (about 13 ms
 * for the soft mask itself at 1024², measured in Node; plus rasterizing and one upload).
 */
const SOFT_MASK_SIDE = 1024;

/** The fog's alpha over the map, one texel per `texel` map pixels (255 = opaque). */
export interface FogMask {
  readonly width: number;
  readonly height: number;
  readonly texel: number;
  readonly alpha: Uint8Array;
}

/** The polygons without repeats (a fade restarted many times repeats the same areas). */
function unique(polygons: readonly Polygon[]): Polygon[] {
  const seen = new Set<string>();
  return polygons.filter((polygon) => {
    const key = JSON.stringify(polygon);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

const sameSize = (a: Size, b: Size) =>
  a.width === b.width && a.height === b.height;

/**
 * The revealed polygons rasterized into a small mask over the map: softened inside the revealed
 * area with a soft edge (T-136a), or as they are (hard, for fades without soft edges).
 */
function fogMask(
  revealed: readonly Polygon[],
  map: Size,
  softEdge: number,
): FogMask {
  const texel = Math.max(1, Math.max(map.width, map.height) / SOFT_MASK_SIDE);
  const width = Math.ceil(map.width / texel);
  const height = Math.ceil(map.height / texel);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("No 2D canvas for the fog mask.");
  context.fillStyle = "#000";
  context.fillRect(0, 0, width, height);
  context.fillStyle = "#fff";
  // Each polygon is its own path (even-odd cuts only its own holes); paths add up.
  for (const polygon of revealed) {
    context.beginPath();
    for (const ring of [polygon.outer, ...polygon.holes]) {
      ring.forEach(([x, y], index) => {
        if (index === 0) context.moveTo(x / texel, y / texel);
        else context.lineTo(x / texel, y / texel);
      });
      context.closePath();
    }
    context.fill("evenodd");
  }
  const pixels = context.getImageData(0, 0, width, height).data;
  // Only fully covered texels count as revealed: anti-aliased edges stay hidden.
  const open = new Uint8Array(width * height);
  for (let index = 0; index < open.length; index++)
    open[index] = pixels[index * 4] === 255 ? 255 : 0;
  if (softEdge > 0) {
    const alpha = softFogAlpha(
      { width, height, data: open },
      // At least 2 texels, so there is a blur at all.
      Math.max(2, Math.round(softEdge / texel)),
    );
    return { width, height, texel, alpha };
  }
  return { width, height, texel, alpha: open.map((value) => 255 - value) };
}

/** A mask as a black texture with the mask's alpha (times `opacity`), linearly filtered. */
function maskTexture(mask: FogMask, opacity: number): Texture {
  return alphaTexture(gridOf(mask), opacity);
}

/** `grid` as the alpha of a black texture (times `scale`), linearly filtered. */
function alphaTexture(grid: Grid, scale: number): Texture {
  const canvas = document.createElement("canvas");
  canvas.width = grid.width;
  canvas.height = grid.height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("No 2D canvas for the fog mask.");
  const pixels = context.createImageData(grid.width, grid.height);
  for (let index = 0; index < grid.data.length; index++)
    pixels.data[index * 4 + 3] = Math.round((grid.data[index] ?? 255) * scale);
  context.putImageData(pixels, 0, 0);
  return Texture.from(canvas);
}

function gridOf(mask: FogMask): Grid {
  return { width: mask.width, height: mask.height, data: mask.alpha };
}

/**
 * Soft fog over the map (T-136a): the revealed polygons rasterized into a small mask, softened
 * inside the revealed area (`softFogAlpha`) and stretched over the map with linear filtering.
 */
function drawSoftFog(mask: FogMask, opacity: number): Sprite {
  const sprite = new Sprite(maskTexture(mask, opacity));
  sprite.scale.set(mask.texel);
  return sprite;
}

/** A running fade (T-136b, spreading since T-167): its layer, where it goes, and how. */
interface Fade {
  readonly layer: Container;
  readonly setMix: (t: number) => void;
  readonly from: FogMask;
  readonly to: FogMask;
  /** When each part of the change turns over (coarse, see `coarseSpreadOrder`). */
  readonly order: Grid;
  /** Every revealed area of the fade's states: the hard fog covers the rest throughout. */
  readonly revealedAll: readonly Polygon[];
  readonly start: number;
  readonly duration: number;
  /** How the duration splits into the travel of the front and each spot's turn (T-246). */
  readonly shares: SpreadShares;
  /** Eased (a fixed duration) or even (at a speed). */
  readonly eased: boolean;
  /** The exact fog shown once the fade is over, built at its start (no work at its end). */
  readonly final: Container;
}

/** How far `fade` is at `at`, 0…1, as the shaders take it. */
function fadeMix(fade: Fade, at: number): number {
  const progress = fadeProgress(fade.start, fade.duration, at);
  return fade.eased ? easeOut(progress) : progress;
}

/** A share 0…1 from `text` and `seed` (FNV-1a): random-looking, the same in every window. */
function shareOf(text: string, seed: number): number {
  let hash = (0x811c9dc5 ^ seed) | 0;
  for (let index = 0; index < text.length; index++) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0) / 4294967296;
}

/** A seed from the map's size, when the caller gives none. */
function mapSeed(map: Size): number {
  return (
    (Math.imul(Math.round(map.width), 73856093) ^
      Math.imul(Math.round(map.height), 19349663)) |
    0
  );
}

// Blends two fog masks texel by texel on the GPU while a front passes in the spread order
// (`spreadMix` does the same on the CPU): linear, so fog in both stays fog.
const FADE_VERTEX = `in vec2 aPosition;
in vec2 aUV;
out vec2 vUV;
uniform mat3 uProjectionMatrix;
uniform mat3 uWorldTransformMatrix;
uniform mat3 uTransformMatrix;
void main() {
  mat3 mvp = uProjectionMatrix * uWorldTransformMatrix * uTransformMatrix;
  gl_Position = vec4((mvp * vec3(aPosition, 1.0)).xy, 0.0, 1.0);
  vUV = aUV;
}`;
const FADE_FRAGMENT = `in vec2 vUV;
uniform sampler2D uFrom;
uniform sampler2D uTo;
uniform sampler2D uOrder;
uniform float uMix;
uniform float uSpread;
uniform float uFront;
out vec4 finalColor;
void main() {
  float local = clamp((uMix - texture(uOrder, vUV).a * uSpread) / uFront, 0.0, 1.0);
  float alpha = mix(texture(uFrom, vUV).a, texture(uTo, vUV).a, local);
  finalColor = vec4(0.0, 0.0, 0.0, alpha);
}`;

/**
 * The fog during a fade: the exact hard fog over everything fogged in all of the fade's states
 * (player view), and over the map the masks before and after, mixed along `order`.
 */
/** Exported for its disposal test (DC-004). */
export function drawFadeFog(
  revealedAll: readonly Polygon[],
  from: FogMask,
  to: FogMask,
  order: Grid,
  options: FogOptions,
  map: Size,
  rootResolution: number,
  shares: SpreadShares,
): { readonly layer: Container; readonly setMix: (t: number) => void } {
  const opacity = options.opacity ?? 1;
  if (options.living) {
    const layer = opacity < 1 ? new Container() : drawHardFog(revealedAll, 1);
    const handle = livingLayer(
      layer,
      { from, to, order: alphaTexture(order, 1) },
      options.living,
      opacity,
      map,
      rootResolution,
    );
    handle.setShares(shares);
    handle.setMix(0);
    return { layer, setMix: handle.setMix };
  }
  const fromTexture = maskTexture(from, opacity);
  const toTexture = maskTexture(to, opacity);
  const orderTexture = alphaTexture(order, 1);
  const uniforms = new UniformGroup({
    uMix: { value: 0, type: "f32" },
    uSpread: { value: shares.spread, type: "f32" },
    uFront: { value: shares.front, type: "f32" },
  });
  const width = to.width * to.texel;
  const height = to.height * to.texel;
  const geometry = new MeshGeometry({
    positions: new Float32Array([0, 0, width, 0, width, height, 0, height]),
    uvs: new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]),
    indices: new Uint32Array([0, 1, 2, 0, 2, 3]),
  });
  const shader = Shader.from({
    gl: { vertex: FADE_VERTEX, fragment: FADE_FRAGMENT },
    resources: {
      uFrom: fromTexture.source,
      uTo: toTexture.source,
      uOrder: orderTexture.source,
      fadeUniforms: uniforms,
    },
  });
  const mesh = new Mesh({
    geometry,
    // Its own texture (the target): destroying the mesh with its texture must never reach a
    // shared default texture.
    texture: toTexture,
    shader,
  });
  const layer = opacity < 1 ? new Container() : drawHardFog(revealedAll, 1);
  layer.addChild(mesh);
  // The target texture goes with the mesh; the others, the geometry and the shader are not
  // destroyed by PixiJS with the mesh. On the mesh itself, as PixiJS emits "destroyed" before
  // the mesh frees its texture (a layer would only go after its children): the shader first,
  // so no texture is destroyed while still bound to it (DC-004).
  mesh.on("destroyed", () => {
    shader.destroy();
    fromTexture.destroy(true);
    orderTexture.destroy(true);
    geometry.destroy();
  });
  return {
    layer,
    setMix: (t) => {
      uniforms.uniforms.uMix = t;
    },
  };
}

/**
 * The fog layer. Soft edges need the map's size; without it (fog set before the map) the fog is
 * hard until the map arrives. The player view keeps the exact hard fog underneath the soft
 * one, so the result never shows more than the hard polygons. The see-through DM view gets the
 * soft layer alone, as two see-through layers would darken the hidden area.
 */
function drawFog(
  revealed: readonly Polygon[],
  options: FogOptions,
  map: Size | null,
  rootResolution: number,
  /** The soft mask if already computed (the target of a fade). */
  known?: FogMask,
): Container {
  const opacity = options.opacity ?? 1;
  const softEdge = options.softEdge ?? 0;
  if (options.living && map && map.width > 0 && map.height > 0) {
    const mask = known ?? fogMask(revealed, map, maskEdge(options));
    const layer =
      opacity < 1 ? new Container() : drawHardFog(revealed, opacity);
    livingLayer(
      layer,
      { from: mask, to: mask, order: settledOrder() },
      options.living,
      opacity,
      map,
      rootResolution,
    );
    return layer;
  }
  // A map without size yet (e.g. a video before its metadata) gets hard fog for now.
  if (softEdge <= 0 || !map || map.width <= 0 || map.height <= 0)
    return drawHardFog(revealed, opacity);
  const soft = drawSoftFog(known ?? fogMask(revealed, map, softEdge), opacity);
  if (opacity < 1) {
    const layer = new Container();
    layer.addChild(soft);
    return layer;
  }
  const layer = drawHardFog(revealed, opacity);
  layer.addChild(soft);
  return layer;
}

/** A white radial glow (bright core, soft falloff) to be tinted per light. */
function radialGlowTexture(): Texture {
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("No 2D canvas for the light glow.");
  const gradient = context.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, "rgba(255,255,255,1)");
  gradient.addColorStop(0.45, "rgba(255,255,255,0.55)");
  gradient.addColorStop(1, "rgba(255,255,255,0)");
  context.fillStyle = gradient;
  context.fillRect(0, 0, size, size);
  return Texture.from(canvas);
}

/** Pixels a tile carries from its neighbours, so scaled sampling at its edge sees the real map. */
const TILE_PAD = 2;

/**
 * The map as sprites (T-127): one for an image within the texture limit, else one per tile. Each
 * tile is cut from the image on a canvas of its own with `TILE_PAD` pixels of its neighbours
 * around it, and shows only its own part: when the map is scaled, the GPU samples across a tile's
 * edge into those pixels, so no seams appear. Nothing is scaled when cutting.
 */
function mapSprites(image: MapImage, maxTextureSize: number): Container {
  const painted = isPainted(image);
  if (!painted && Math.max(image.width, image.height) <= maxTextureSize)
    return new Sprite(Texture.from(image, true));
  // Room for the pixels each tile carries from its neighbours.
  const tiles = mapTiles(
    image.width,
    image.height,
    maxTextureSize - 2 * TILE_PAD,
  );
  const container = new Container();
  const kept: PaintedTiles = { width: image.width, height: image.height, tiles: [] };
  try {
    for (const tile of tiles) {
      const left = Math.max(0, tile.x - TILE_PAD);
      const top = Math.max(0, tile.y - TILE_PAD);
      const right = Math.min(image.width, tile.x + tile.width + TILE_PAD);
      const bottom = Math.min(image.height, tile.y + tile.height + TILE_PAD);
      const canvas = document.createElement("canvas");
      canvas.width = right - left;
      canvas.height = bottom - top;
      const context = canvas.getContext("2d");
      if (!context)
        throw new Error("A map tile could not be drawn (no 2D canvas).");
      if (painted) image.paint(context, left, top, canvas.width, canvas.height);
      else
        context.drawImage(
          image,
          left,
          top,
          canvas.width,
          canvas.height,
          0,
          0,
          canvas.width,
          canvas.height,
        );
      const source = Texture.from(canvas, true).source;
      if (painted) kept.tiles.push({ left, top, canvas, source });
      const texture = new Texture({
        source,
        frame: new Rectangle(
          tile.x - left,
          tile.y - top,
          tile.width,
          tile.height,
        ),
      });
      const sprite = new Sprite(texture);
      sprite.position.set(tile.x, tile.y);
      container.addChild(sprite);
    }
  } catch (error) {
    // Tiles made so far would otherwise keep their textures.
    container.destroy({ children: true, texture: true, textureSource: true });
    throw error;
  }
  if (painted) paintedTiles.set(container, kept);
  return container;
}
