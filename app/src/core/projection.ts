/**
 * Fail-closed player projection.
 *
 * The table window never receives the DM scene. It receives a `PlayerFrame` built here from a
 * whitelist of fields. The table validates every frame with `parsePlayerFrame`; anything invalid,
 * stale or missing fog results in black.
 */
import { z } from 'zod';
import { clearArea, openArea } from './fogModel';
import { polygonSchema, type Polygon } from './poly/types';
import type { Scene } from './scene';
import { tokensVisibleToPlayers } from './vision';

export const FRAME_VERSION = 2;
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
    /** Seeds the ragged spread front, so DM window and TV spread alike. */
    seedKey: z.string(),
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
});

export type PlayerFrame = z.infer<typeof PlayerFrameSchema>;

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
}

export function buildPlayerFrame(scene: Scene, o: ProjectionOptions): PlayerFrame {
  const visibleTokens = tokensVisibleToPlayers(scene.tokens, scene.fog, o.visible);
  const g = scene.map.grid;
  const effect = scene.fogEffect ?? { biome: scene.map.biome, strength: scene.map.biomeStrength };
  const copy = (ps: readonly Polygon[]) => ps.map((p) => ({ outer: p.outer.map(([x, y]) => [x, y] as [number, number]), holes: p.holes.map((h) => h.map(([x, y]) => [x, y] as [number, number])) }));
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
      seedKey: o.seedKey,
      grid: { type: g.type, cellWidth: g.cellWidth, cellHeight: g.cellHeight, originX: g.originX, originY: g.originY, rotationDeg: g.rotationDeg, feetPerCell: g.feetPerCell },
      showGrid: o.showGrid,
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
