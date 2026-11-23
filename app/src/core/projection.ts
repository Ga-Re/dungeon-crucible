/**
 * Fail-closed player projection.
 *
 * The table window never receives the DM scene. It receives a `PlayerFrame`
 * built here from a whitelist of fields. The table validates every frame with
 * `parsePlayerFrame`; anything invalid, stale or missing fog results in black.
 */
import { z } from 'zod';
import type { Scene } from './scene';
import { tokensVisibleToPlayers, type ViewerVision } from './vision';

export const FRAME_VERSION = 1;
/** The table blacks out when no valid frame or heartbeat arrived for this long. */
export const MAX_FRAME_AGE_MS = 2500;

const point = z.object({ x: z.number().finite(), y: z.number().finite() });

export const PlayerFrameSchema = z.object({
  version: z.literal(FRAME_VERSION),
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
    grid: z.object({
      type: z.enum(['square', 'hex-pointy', 'hex-flat']),
      cellWidth: z.number().positive(),
      cellHeight: z.number().positive(),
      originX: z.number(),
      originY: z.number(),
      rotationDeg: z.number(),
      feetPerCell: z.number().positive(),
    }),
    showGrid: z.boolean(),
  }),
  fog: z.object({
    cols: z.number().int().positive(),
    rows: z.number().int().positive(),
    cellSize: z.number().positive(),
    /** RLE of explored cells (see FogState.encode). */
    explored: z.string(),
    memoryOpacity: z.number().min(0.2).max(1),
    softness: z.number().min(0).max(1),
    vision: z.array(z.object({ origin: point, radius: z.number().positive(), polygon: z.array(point).min(3) })),
    biome: z.string(),
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
    }),
  ),
  templates: z.array(
    z.object({ shape: z.enum(['cone', 'sphere', 'line', 'cube']), x: z.number(), y: z.number(), angle: z.number(), sizeFt: z.number().positive(), color: z.string() }),
  ),
  pings: z.array(z.object({ x: z.number(), y: z.number(), age: z.number().nonnegative() })),
});

export type PlayerFrame = z.infer<typeof PlayerFrameSchema>;

export interface ProjectionOptions {
  seq: number;
  now: number;
  showGrid: boolean;
  memoryOpacity: number;
  softness: number;
  movementLocked: boolean;
  zoom: number;
}

export function buildPlayerFrame(scene: Scene, vision: readonly ViewerVision[], o: ProjectionOptions): PlayerFrame {
  const visibleTokens = tokensVisibleToPlayers(scene.tokens, vision);
  const g = scene.map.grid;
  return {
    version: FRAME_VERSION,
    seq: o.seq,
    issuedAt: o.now,
    blackout: scene.table.blackout,
    rotation: scene.table.rotation,
    zoom: o.zoom,
    display: { widthPx: scene.table.display.widthPx, heightPx: scene.table.display.heightPx },
    center: { x: scene.table.centerX, y: scene.table.centerY },
    map: {
      imageUrl: scene.map.imageUrl,
      isVideo: scene.map.isVideo,
      widthPx: scene.map.widthPx,
      heightPx: scene.map.heightPx,
      grid: {
        type: g.type,
        cellWidth: g.cellWidth,
        cellHeight: g.cellHeight,
        originX: g.originX,
        originY: g.originY,
        rotationDeg: g.rotationDeg,
        feetPerCell: g.feetPerCell,
      },
      showGrid: o.showGrid,
    },
    fog: {
      cols: scene.fog.cols,
      rows: scene.fog.rows,
      cellSize: scene.fog.cellSize,
      explored: scene.fog.encode(),
      memoryOpacity: o.memoryOpacity,
      softness: o.softness,
      vision: vision.map((v) => ({ origin: { ...v.origin }, radius: v.radius, polygon: v.polygon.map((p) => ({ x: p.x, y: p.y })) })),
      biome: scene.map.biome,
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
    })),
    templates: scene.templates.map((t) => ({ shape: t.shape, x: t.x, y: t.y, angle: t.angle, sizeFt: t.sizeFt, color: t.color })),
    pings: scene.pings.map((p) => ({ x: p.x, y: p.y, age: Math.max(0, o.now - p.at) })),
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

export function isFrameFresh(frame: PlayerFrame | null, lastReceivedAt: number, now: number): boolean {
  return !!frame && now - lastReceivedAt <= MAX_FRAME_AGE_MS;
}
