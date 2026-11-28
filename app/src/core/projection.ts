/**
 * Fail-closed player projection.
 *
 * The table window never receives the DM scene. It receives a `PlayerFrame` built here from a
 * whitelist of fields. The table validates every frame with `parsePlayerFrame`; anything invalid,
 * stale or missing fog results in black.
 */
import { z } from 'zod';
import type { AssetDraw } from './placement';
import { clearArea, openArea } from './fogModel';
import { polygonSchema, type Polygon } from './poly/types';
import type { Scene } from './scene';
import type { TransitionPlay } from './transition';
import { stairsOn } from './stairs';
import { tokensVisibleToPlayers, type LitSource } from './vision';
import { intersection } from 'polyclip-ts';
import { asGeom, fromClip } from './poly/polygon-clip';
import { BLOCK_KEY, stepFtSchema, TERRAIN_BIOMES, type TerrainBiome } from './build/terrainKeys';

export const FRAME_VERSION = 8;

/** How dark unlit areas look on a dark map (darkvision sees them, dimmed). */
export const DARKNESS = 0.45;
/** The table blacks out when no valid frame or heartbeat arrived for this long. */
export const MAX_FRAME_AGE_MS = 2500;

const point = z.object({ x: z.number().finite(), y: z.number().finite() });

/** The device's fog look (Dungeon-Manager's fog settings), so the TV looks like the DM's preview. */
export const fogLookSchema = z.object({
  softEdges: z.boolean(),
  fadeSeconds: z.number().min(0).max(3),
  quality: z.enum(['high', 'medium', 'off']),
  edge: z.number().min(0).max(2.5),
  motion: z.number().min(0).max(3),
  /** Grid cells per second; `null` is "Sofort" (JSON has no Infinity). */
  speed: z.number().positive().nullable(),
  coverFrom: z.enum(['middle', 'random']),
});
export type FogLookWire = z.infer<typeof fogLookSchema>;

/** One storey's picture on the TV (E-40): the frame itself, and those of the storeys below it. */
export const StoreyFrameSchema = z.object({
  version: z.literal(FRAME_VERSION),
  /**
   * The TV's last change of picture (DC-105, E-38): a counter, what to play and how long. Only
   * this – the table draws the transition from the picture it already shows and black.
   */
  cut: z.object({ n: z.number().int().min(0), play: z.enum(['fade', 'black', 'cut', 'out', 'in']), ms: z.number().min(0).max(10_000) }).default({ n: 0, play: 'cut', ms: 0 }),
  seq: z.number().int().nonnegative(),
  issuedAt: z.number().finite(),
  blackout: z.boolean(),
  rotation: z.union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)]),
  /** Table pixels per map pixel at physical scale. */
  zoom: z.number().positive().finite(),
  /** Physical resolution of the table display the frame is laid out for. */
  display: z.object({ widthPx: z.number().int().positive(), heightPx: z.number().int().positive() }),
  center: point,
  map: z.object({
    imageUrl: z.string().nullable(),
    isVideo: z.boolean(),
    widthPx: z.number().positive(),
    heightPx: z.number().positive(),
    /** Seeds the ragged spread front, so DM window and TV spread alike. */
    seedKey: z.string(),
    grid: z.object({
      type: z.literal('square'),
      cellWidth: z.number().positive(),
      cellHeight: z.number().positive(),
      originX: z.number(),
      originY: z.number(),
      rotationDeg: z.number(),
      feetPerCell: z.number().positive(),
    }),
    showGrid: z.boolean(),
    /** A drawn map (E-33): where its area starts (it has no picture); null for a picture or video map. */
    drawnOrigin: z.object({ x: z.number(), y: z.number() }).nullable(),
    /**
     * The terrain (E-61): step height, biome palette and, per block the TV may know, its checksum –
     * the blocks themselves come over the raster channel; the cliff band's width (cells per 10 ft)
     * and where the light falls (degrees, E-87), so the TV draws the DM's cliffs. None: no terrain shown.
     */
    raster: z
      .object({
        stepFt: stepFtSchema,
        /** The biomes by palette place; a place the TV's blocks do not use is null – it never learns its name (E-88). */
        palette: z
          .array(z.enum(TERRAIN_BIOMES).nullable())
          .min(1)
          .max(4)
          .refine((p) => p[0] !== null && new Set(p.filter((b) => b !== null)).size === p.filter((b) => b !== null).length, 'the first known, each biome once'),
        perspective: z.number().min(0.2).max(1),
        lightAngle: z.number(),
        blocks: z.record(z.string().regex(BLOCK_KEY), z.string().regex(/^[0-9a-f]{16}$/)),
      })
      .nullable(),
    /** How the picture is cut and adjusted (E-42); its turn is in `rotation`. Numbers only. */
    look: z.object({ crop: z.object({ x: z.number(), y: z.number(), w: z.number().positive(), h: z.number().positive() }).optional(), adjust: z.object({ brightness: z.number(), contrast: z.number(), saturation: z.number(), hue: z.number() }).optional() }).optional(),
  }),
  fog: z.object({
    /** Not covered by opaque fog. */
    open: z.array(polygonSchema),
    /** Seen right now (no memory dimming). */
    clear: z.array(polygonSchema),
    memoryOpacity: z.number().min(0.2).max(1),
    look: fogLookSchema,
    effect: z.object({ biome: z.string().min(1), strength: z.number().min(0).max(1) }),
    /** A change from token movement switches quickly instead of spreading. */
    quick: z.boolean(),
  }),
  /** Light and darkness, already limited to what players see now (no hints from hidden lights). */
  lighting: z.object({
    darkness: z.number().min(0).max(1),
    lit: z.array(polygonSchema),
    glows: z.array(z.object({ x: z.number(), y: z.number(), brightPx: z.number().min(0), dimPx: z.number().min(0), color: z.string(), flicker: z.number().min(0).max(1).optional(), area: z.array(polygonSchema) })),
  }),
  tokens: z.array(
    z.object({
      id: z.string(),
      label: z.string().max(4),
      x: z.number(),
      y: z.number(),
      size: z.number().positive(),
      ringColor: z.string(),
      /** Only for player characters; monsters show no HP to players. */
      hpRatio: z.number().min(0).max(1).nullable(),
      down: z.boolean(),
      locked: z.boolean(),
      active: z.boolean(),
    }),
  ),
  templates: z.array(
    z.object({ shape: z.enum(['cone', 'sphere', 'line', 'cube']), x: z.number(), y: z.number(), angle: z.number(), sizeFt: z.number().positive(), color: z.string() }),
  ),
  pings: z.array(z.object({ x: z.number(), y: z.number(), age: z.number().nonnegative() })),
  /** Placed assets (DC-041): under the fog like the map; assets a scene hides are never sent. */
  assets: z.array(z.object({ url: z.string(), video: z.boolean(), x: z.number(), y: z.number(), width: z.number().positive(), height: z.number().positive(), rotation: z.number(), once: z.number().optional() })).default([]),
  /** The area this storey covers (E-40); none: everything. Outside it, the storey below shows. */
  storeyClip: z.array(polygonSchema).optional(),
  /** Stairs on this storey (E-44): where and which way up – drawn under the fog like the map. */
  stairs: z.array(z.object({ x: z.number(), y: z.number(), w: z.number().positive(), h: z.number().positive(), dir: z.enum(['n', 'e', 's', 'w']) })).max(200).optional(),
});

/** What the TV shows: its storey, and the storeys below it nearest first, each with its own fog (E-40). */
export const PlayerFrameSchema = StoreyFrameSchema.extend({ below: z.array(StoreyFrameSchema).max(16).optional() });

export type PlayerFrame = z.infer<typeof PlayerFrameSchema>;
export type StoreyFrame = z.infer<typeof StoreyFrameSchema>;

export interface ProjectionOptions {
  seq: number;
  now: number;
  showGrid: boolean;
  memoryOpacity: number;
  movementLocked: boolean;
  zoom: number;
  look: FogLookWire;
  /** What players see right now (from `visiblePolygons`). */
  visible: readonly Polygon[];
  quick: boolean;
  activeTokenId: string | null;
  seedKey: string;
  /** Lights that are on (from `litSources`). */
  lights: readonly LitSource[];
  /** The scene's shown placed assets, as drawn (`assetShapes`). */
  assets?: readonly AssetDraw[];
  /** Their cover masks: figures inside one stay hidden until a character is in there too. */
  covers?: readonly Polygon[];
  /** The TV's last change of picture (DC-105); none: no transition yet. */
  cut?: { n: number; play: TransitionPlay; ms: number };
  /** The terrain the TV may know (`tvRaster`): its checksums by block; none: no terrain. */
  raster?: { stepFt: 5 | 10 | 15 | 20; palette: readonly (TerrainBiome | null)[]; perspective: number; lightAngle: number; blocks: Readonly<Record<string, string>> } | null;
}

/** Light for the players: only inside what they see now, so a light in remembered or hidden areas gives nothing away. */
export function playerLighting(scene: Scene, lights: readonly LitSource[], clear: readonly Polygon[]): PlayerFrame['lighting'] {
  if (scene.ambient === 'lit') return { darkness: 0, lit: [], glows: [] };
  const clip = (ps: readonly Polygon[]) => (ps.length && clear.length ? fromClip(intersection(asGeom(ps), asGeom(clear))) : []);
  // A light whose clipping fails is left out: the TV stays dark there rather than showing more.
  const safeClip = (ps: readonly Polygon[]) => {
    try {
      return clip(ps);
    } catch {
      return [];
    }
  };
  const glows = lights.map((l) => ({ x: l.x, y: l.y, brightPx: l.brightPx, dimPx: l.dimPx, color: l.color, ...(l.flicker ? { flicker: l.flicker } : {}), area: safeClip(l.area) })).filter((g) => g.area.length > 0);
  return { darkness: DARKNESS, lit: glows.flatMap((g) => g.area), glows };
}

export function buildPlayerFrame(scene: Scene, o: ProjectionOptions): PlayerFrame {
  const visibleTokens = tokensVisibleToPlayers(scene.tokens, scene.fog, o.visible, o.covers);
  const g = scene.map.grid;
  const effect = scene.fogEffect ?? { biome: scene.map.biome, strength: scene.map.biomeStrength };
  const copy = (ps: readonly Polygon[]) => ps.map((p) => ({ outer: p.outer.map(([x, y]) => [x, y] as [number, number]), holes: p.holes.map((h) => h.map(([x, y]) => [x, y] as [number, number])) }));
  return {
    version: FRAME_VERSION,
    cut: o.cut ? { ...o.cut } : { n: 0, play: 'cut', ms: 0 },
    seq: o.seq,
    issuedAt: o.now,
    blackout: scene.table.blackout,
    // The TV's turn and the map's own (E-42) together.
    rotation: (((scene.table.rotation + (scene.map.look?.rotation ?? 0)) % 360) as 0 | 90 | 180 | 270),
    zoom: o.zoom,
    display: { widthPx: scene.table.display.widthPx, heightPx: scene.table.display.heightPx },
    center: { x: scene.table.centerX, y: scene.table.centerY },
    map: {
      imageUrl: scene.map.imageUrl,
      isVideo: scene.map.isVideo,
      widthPx: scene.map.widthPx,
      heightPx: scene.map.heightPx,
      seedKey: o.seedKey,
      grid: { type: g.type, cellWidth: g.cellWidth, cellHeight: g.cellHeight, originX: g.originX, originY: g.originY, rotationDeg: g.rotationDeg, feetPerCell: g.feetPerCell },
      showGrid: o.showGrid,
      drawnOrigin: scene.map.drawn ? { x: scene.map.origin?.x ?? 0, y: scene.map.origin?.y ?? 0 } : null,
      raster: o.raster ? { stepFt: o.raster.stepFt, palette: [...o.raster.palette], perspective: o.raster.perspective, lightAngle: o.raster.lightAngle, blocks: { ...o.raster.blocks } } : null,
      ...(scene.map.look?.crop || scene.map.look?.adjust ? { look: { ...(scene.map.look.crop ? { crop: { ...scene.map.look.crop } } : {}), ...(scene.map.look.adjust ? { adjust: { ...scene.map.look.adjust } } : {}) } } : {}),
    },
    fog: {
      open: copy(openArea(scene.fog, o.visible)),
      clear: copy(clearArea(scene.fog, o.visible)),
      memoryOpacity: o.memoryOpacity,
      look: { ...o.look },
      effect: { biome: effect.biome, strength: effect.strength },
      quick: o.quick,
    },
    tokens: visibleTokens.map((t) => ({
      id: t.id,
      label: t.label.slice(0, 4),
      x: t.x,
      y: t.y,
      size: t.size,
      ringColor: t.ringColor,
      hpRatio: t.kind === 'pc' ? Math.max(0, Math.min(1, t.hp / Math.max(1, t.maxHp))) : null,
      down: t.hp <= 0,
      locked: o.movementLocked && t.kind === 'pc',
      active: t.id === o.activeTokenId,
    })),
    lighting: playerLighting(scene, o.lights, clearArea(scene.fog, o.visible)),
    templates: scene.templates.map((t) => ({ shape: t.shape, x: t.x, y: t.y, angle: t.angle, sizeFt: t.sizeFt, color: t.color })),
    pings: scene.pings.map((p) => ({ x: p.x, y: p.y, age: Math.max(0, o.now - p.at) })),
    ...(scene.map.stairs?.length ? { stairs: stairsOn(scene.map.stairs, scene.map.storey ?? '').map((s) => ({ x: s.x, y: s.y, w: s.w, h: s.h, dir: s.dir })) } : {}),
    assets: (o.assets ?? []).map((a) => ({ url: a.url, video: a.video, x: a.x, y: a.y, width: a.width, height: a.height, rotation: a.rotation, ...(a.once === undefined ? {} : { once: a.once }) })),
  };
}

export type FrameCheck = { ok: true; frame: PlayerFrame } | { ok: false; reason: string };

/** Validates an incoming frame on the table side. */
export function parsePlayerFrame(data: unknown, now: number, lastSeq: number): FrameCheck {
  const r = PlayerFrameSchema.safeParse(data);
  if (!r.success) return { ok: false, reason: 'invalid-frame' };
  const f = r.data;
  if (f.seq <= lastSeq) return { ok: false, reason: 'out-of-order' };
  if (now - f.issuedAt > MAX_FRAME_AGE_MS) return { ok: false, reason: 'stale' };
  return { ok: true, frame: f };
}
