/**
 * Soundboard state and actions: ambience tracks (built-in and the campaign's `audio/` files),
 * sound effects (built-in and `audio/sfx/`), master volume. Which ambience plays is stored per
 * scene (scene file `ambience`), so switching scenes crossfades to that scene's sound.
 */
import {
  BUILTIN_AMBIENCE, BUILTIN_PREFIX, playAmbience, playSfx, playSfxFile, setAmbienceVolume, setMasterVolume, stopAmbience, type BuiltinSfx,
} from './audio';
import { absolutePath, assetUrl, importToLibrary, isDesktop, listFiles, readText, writeText } from '../platform/bridge';
import { ASSET_VERSION, AssetSidecarSchema, type AssetSidecar } from '../core/sidecar';
import { assetDefaults, parseAssetSidecar } from '../core/assets';
import { emit, log, markDirty, state } from './store';

export interface AmbienceEntry {
  /** `builtin:<key>` or a path relative to the campaign folder. */
  id: string;
  volume: number;
  playing: boolean;
}

export interface SoundboardState {
  ambience: AmbienceEntry[];
  sfxFiles: string[];
  master: number;
}

export function initialSoundboard(): SoundboardState {
  return { ambience: BUILTIN_AMBIENCE.map((b) => ({ id: b.id, volume: 0.5, playing: false })), sfxFiles: [], master: 0.8 };
}

const AUDIO_FILE = /\.(mp3|ogg|oga|opus|wav|m4a|aac|flac)$/i;

/** Name shown for a track: the file name without extension, or the built-in's translation key. */
export function trackFileName(id: string): string {
  return id.split('/').pop()!.replace(/\.[^.]+$/, '');
}

async function urlFor(id: string): Promise<string | undefined> {
  if (id.startsWith(BUILTIN_PREFIX)) return undefined;
  return assetUrl(await absolutePath(id));
}

/** Audio files of the library, sorted into ambience and sound effects by their sidecar. */
export async function refreshAudioFiles(): Promise<void> {
  if (!isDesktop() || !state.campaign) return;
  const files = (await listFiles('library')).filter((f) => AUDIO_FILE.test(f));
  const ambience: string[] = [];
  const sfx: string[] = [];
  for (const f of files) {
    let category: 'ambience' | 'sfx' = 'ambience';
    try {
      // Sound assets (E-27); older audio sidecars are read as such.
      const r = parseAssetSidecar(await readText(`${f}.dm.json`), f);
      if (r.ok && r.value.subkind === 'sfx') category = 'sfx';
    } catch {
      /* no sidecar: ambience */
    }
    (category === 'sfx' ? sfx : ambience).push(f);
  }
  const sb = state.soundboard;
  const known = new Set(sb.ambience.map((a) => a.id));
  for (const f of ambience) if (!known.has(f)) sb.ambience.push({ id: f, volume: 0.5, playing: false });
  sb.sfxFiles = sfx;
  emit();
}

export async function toggleAmbience(id: string): Promise<void> {
  const a = state.soundboard.ambience.find((x) => x.id === id);
  if (!a) return;
  if (a.playing) {
    stopAmbience(id);
    a.playing = false;
  } else {
    playAmbience(id, a.volume, await urlFor(id));
    a.playing = true;
  }
  markDirty();
  emit();
}

export function setTrackVolume(id: string, v: number): void {
  const a = state.soundboard.ambience.find((x) => x.id === id);
  if (!a) return;
  a.volume = v;
  setAmbienceVolume(id, v);
  markDirty();
  emit();
}

export function setMaster(v: number): void {
  state.soundboard.master = v;
  setMasterVolume(v);
  emit();
}

export function stopAll(): void {
  for (const a of state.soundboard.ambience) {
    if (a.playing) stopAmbience(a.id);
    a.playing = false;
  }
  markDirty();
  emit();
}

export async function triggerSfx(id: string): Promise<void> {
  if (id.startsWith(BUILTIN_PREFIX)) playSfx(id.slice(BUILTIN_PREFIX.length) as BuiltinSfx);
  else {
    const url = await urlFor(id);
    if (url) playSfxFile(url);
  }
}

/** Puts an audio file into the library as ambience or sound effect. */
export async function importAudio(sfx: boolean): Promise<void> {
  if (!isDesktop() || !state.campaign) {
    log('log.audioNeedsCampaign');
    emit();
    return;
  }
  const f = await importToLibrary('audio');
  if (!f) return;
  const subkind = sfx ? 'sfx' : 'ambience';
  let text: string | null = null;
  try {
    text = await readText(`${f.relPath}.dm.json`);
  } catch {
    /* none yet */
  }
  const r = text === null ? null : parseAssetSidecar(text, f.relPath);
  const existing = r?.ok ? { asset: r.value, raw: r.raw } : null;
  // A sidecar that cannot be read (broken, or from a newer app version) is never written over.
  const writable = text === null || existing !== null;
  if (writable && (!existing || existing.asset.subkind !== subkind)) {
    const asset: AssetSidecar = existing?.asset ?? AssetSidecarSchema.parse({ kind: 'asset', schemaVersion: ASSET_VERSION, ...assetDefaults(f.relPath) });
    // Unknown fields of the file survive (file rules).
    await writeText(`${f.relPath}.dm.json`, JSON.stringify({ ...(existing?.raw ?? {}), ...asset, assetKind: 'sound', subkind }, null, 2));
  }
  log('log.audioImported', { file: f.relPath });
  await refreshAudioFiles();
}

/** What the scene file stores: the ambience playing now. */
export function sceneAmbience(): { path: string; volume: number }[] {
  return state.soundboard.ambience.filter((a) => a.playing).map((a) => ({ path: a.id, volume: a.volume }));
}

/** On loading a scene: crossfade to the scene's ambience. */
export async function applySceneAmbience(list: readonly { path: string; volume: number }[]): Promise<void> {
  const wanted = new Map(list.map((x) => [x.path, x.volume]));
  const sb = state.soundboard;
  for (const path of wanted.keys()) if (!sb.ambience.some((a) => a.id === path)) sb.ambience.push({ id: path, volume: wanted.get(path)!, playing: false });
  for (const a of sb.ambience) {
    const v = wanted.get(a.id);
    if (v === undefined) {
      if (a.playing) stopAmbience(a.id);
      a.playing = false;
    } else {
      a.volume = v;
      try {
        playAmbience(a.id, v, await urlFor(a.id));
        a.playing = true;
      } catch {
        a.playing = false;
      }
    }
  }
  emit();
}
