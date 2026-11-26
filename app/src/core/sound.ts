/**
 * Sound sources on the map (E-37, DC-104): who hears and how loud each source is. The map's
 * sound plays everywhere; a source is heard within its radius of the nearest player character
 * (without any on the map: the middle of the TV view), quieter towards the edge when it fades.
 * Walls and closed doors between make it quieter and muffled (DC-104b). Pure; the app's audio
 * engine plays the result.
 */
import type { Point } from './geometry';
import type { Scene, SoundSource, Wall } from './scene';

/** Built-in sounds (synthesised by the app, no file): `builtin:<key>`. */
export const BUILTIN_SOUND = 'builtin:';
export const BUILTIN_SOUNDS = ['wind', 'drip', 'fire', 'rain', 'choir', 'waterfall', 'brook', 'campfire', 'forest', 'storm', 'sea', 'tavern'] as const;

/** Audio files the app plays. */
export const AUDIO_FILE = /\.(mp3|ogg|oga|opus|wav|m4a|aac|flac)$/i;

/** Whether `ref` names a sound: a built-in one or an audio file. */
export function isSoundRef(ref: string): boolean {
  return (ref.startsWith(BUILTIN_SOUND) && (BUILTIN_SOUNDS as readonly string[]).includes(ref.slice(BUILTIN_SOUND.length))) || AUDIO_FILE.test(ref);
}

/** The points sound is heard from: the player characters, or the middle of the TV view. */
export function hearingPoints(scene: Pick<Scene, 'tokens' | 'table'>): Point[] {
  const pcs = scene.tokens.filter((t) => t.kind === 'pc').map((t) => ({ x: t.x, y: t.y }));
  return pcs.length ? pcs : [{ x: scene.table.centerX, y: scene.table.centerY }];
}

/** The level (0–1) of `source` for the nearest of `at`; `ftPx`: map pixels per foot. */
export function sourceLevel(source: SoundSource, at: readonly Point[], ftPx: number): number {
  const reach = source.radiusFt * ftPx;
  if (!at.length || reach <= 0) return 0;
  const d = Math.min(...at.map((p) => Math.hypot(p.x - source.x, p.y - source.y)));
  if (d >= reach) return 0;
  // Squared: the level falls away faster near the edge, where a sound fades into the background.
  return source.fade ? source.volume * (1 - d / reach) ** 2 : source.volume;
}

/** How much quieter a sound gets through each wall between (at most three count). */
export const WALL_DAMP = 0.4;
const MAX_WALLS = 3;

/** Walls that damp sound: solid ones and closed doors; open doors, windows and cliffs (open air) do not. */
function damps(w: Wall): boolean {
  return w.kind === 'wall' || ((w.kind === 'door' || w.kind === 'secret-door') && !w.open);
}

/** Whether segments a–b and c–d cross (touching at an end counts). */
function crosses(ax: number, ay: number, bx: number, by: number, w: Wall): boolean {
  const side = (px: number, py: number, qx: number, qy: number, rx: number, ry: number) => (qx - px) * (ry - py) - (qy - py) * (rx - px);
  const d1 = side(w.x1, w.y1, w.x2, w.y2, ax, ay);
  const d2 = side(w.x1, w.y1, w.x2, w.y2, bx, by);
  const d3 = side(ax, ay, bx, by, w.x1, w.y1);
  const d4 = side(ax, ay, bx, by, w.x2, w.y2);
  return d1 * d2 <= 0 && d3 * d4 <= 0 && !(d1 === 0 && d2 === 0);
}

/** Damping walls between `a` and `b`, at most `MAX_WALLS`. */
function wallsBetween(a: Point, b: Point, walls: readonly Wall[]): number {
  let n = 0;
  const [x0, x1] = a.x < b.x ? [a.x, b.x] : [b.x, a.x];
  const [y0, y1] = a.y < b.y ? [a.y, b.y] : [b.y, a.y];
  for (const w of walls) {
    // Cheap box test first: maps can have thousands of wall pieces.
    if (Math.max(w.x1, w.x2) < x0 || Math.min(w.x1, w.x2) > x1 || Math.max(w.y1, w.y2) < y0 || Math.min(w.y1, w.y2) > y1) continue;
    if (damps(w) && crosses(a.x, a.y, b.x, b.y, w) && ++n >= MAX_WALLS) break;
  }
  return n;
}

/** How muffled a sound through `n` walls is: 0 clear … 1 as dull as it gets. */
function muffleFor(n: number): number {
  return n === 0 ? 0 : n === 1 ? 0.7 : 1;
}

/**
 * How `source` is heard: the level and muffling for the listener who hears it best – the open
 * way beats a nearer one through a wall.
 */
export function sourceHearing(source: SoundSource, at: readonly Point[], ftPx: number, walls: readonly Wall[]): { gain: number; muffle: number } {
  let best = { gain: 0, muffle: 0 };
  for (const p of at) {
    const level = sourceLevel(source, [p], ftPx);
    if (level <= best.gain) continue;
    const n = wallsBetween(source, p, walls);
    const gain = level * WALL_DAMP ** n;
    if (gain > best.gain) best = { gain, muffle: muffleFor(n) };
  }
  return best;
}

/** One loop of the mix: `key` identifies it while it plays (the source's id, or "ambient"). */
export interface MixEntry {
  key: string;
  sound: string;
  gain: number;
  /** 0 clear … 1 muffled by walls between. */
  muffle: number;
}

/**
 * What the map plays now: its sound everywhere and every shown source at its level; `walls`:
 * those sight uses (drawn walls included), which damp the sources behind them.
 */
export function mapSoundMix(scene: Pick<Scene, 'map' | 'sounds' | 'tokens' | 'table'>, walls: readonly Wall[] = []): MixEntry[] {
  const g = scene.map.grid;
  const ftPx = g.cellWidth / g.feetPerCell;
  const at = hearingPoints(scene);
  const out: MixEntry[] = [];
  const amb = scene.map.ambientSound;
  if (amb) out.push({ key: 'ambient', sound: amb.sound, gain: amb.volume, muffle: 0 });
  for (const s of scene.sounds) out.push({ key: s.id, sound: s.sound, ...sourceHearing(s, at, ftPx, walls) });
  return out;
}
