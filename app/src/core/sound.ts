/**
 * Sound sources on the map (E-37, DC-104): who hears and how loud each source is. The map's
 * sound plays everywhere; a source is heard within its radius of the nearest player character
 * (without any on the map: the middle of the TV view), quieter towards the edge when it fades.
 * Pure; the app's audio engine plays the result.
 */
import type { Point } from './geometry';
import type { Scene, SoundSource } from './scene';

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

/** One loop of the mix: `key` identifies it while it plays (the source's id, or "ambient"). */
export interface MixEntry {
  key: string;
  sound: string;
  gain: number;
}

/** What the map plays now: its sound everywhere and every shown source at its level. */
export function mapSoundMix(scene: Pick<Scene, 'map' | 'sounds' | 'tokens' | 'table'>): MixEntry[] {
  const g = scene.map.grid;
  const ftPx = g.cellWidth / g.feetPerCell;
  const at = hearingPoints(scene);
  const out: MixEntry[] = [];
  const amb = scene.map.ambientSound;
  if (amb) out.push({ key: 'ambient', sound: amb.sound, gain: amb.volume });
  for (const s of scene.sounds) out.push({ key: s.id, sound: s.sound, gain: sourceLevel(s, at, ftPx) });
  return out;
}
