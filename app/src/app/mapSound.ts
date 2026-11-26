/**
 * The map's sounds (E-37, DC-104): its sound everywhere and its sound sources, played for the TV's
 * scene (also while another tab is prepared or the Map Forge is open; without a TV scene the one
 * open in the Orchestrator) – never on the TV itself. Follows the store: each change (a player
 * character moves, a door opens, a source is switched off) sets the levels and muffling anew; a
 * source out of reach stops and starts again when someone comes near.
 */
import { mapSoundMix, type MixEntry } from '../core/sound';
import { playLoop, setLoopVolume, stopLoop } from './audio';
import { soundUrl } from './soundboard';
import { emit, log, sightWalls, soundView, state, subscribe } from './store';

/** Below this a source counts as silent and is stopped. */
const SILENT = 0.001;
/** Playing loops by key → their sound; the newest level of each. */
const playing = new Map<string, string>();
const levels = new Map<string, { gain: number; muffle: number }>();
/** Sounds already reported as not playable (one message each, this session). */
const reported = new Set<string>();
let started = false;

/** What the map plays now; walls are only looked at when someone hears a source. */
function currentMix(): MixEntry[] {
  const scene = state.mapSoundsMuted ? null : soundView();
  if (!scene) return [];
  const everywhere = scene.ambientOverride === 'none' ? undefined : (scene.ambientOverride ?? scene.map.ambientSound);
  // Most store changes are pointer moves: nothing to hear, nothing to compute.
  if (!scene.sounds.length && !everywhere) return [];
  const open = mapSoundMix(scene);
  // The walls sight uses (drawn ones and doors of assets included) damp the sources behind them.
  return open.some((e) => e.key !== 'ambient' && e.gain > SILENT) ? mapSoundMix(scene, sightWalls(scene)) : open;
}

function notPlayable(sound: string): void {
  if (reported.has(sound)) return;
  reported.add(sound);
  log('log.soundMissing', { file: sound });
  emit();
}

function update(): void {
  const want = new Map(currentMix().filter((e) => e.gain > SILENT).map((e) => [`map:${e.key}`, e]));
  for (const [key, sound] of playing) {
    if (want.get(key)?.sound === sound) continue;
    playing.delete(key);
    levels.delete(key);
    stopLoop(key);
  }
  for (const [key, e] of want) {
    const before = levels.get(key);
    levels.set(key, { gain: e.gain, muffle: e.muffle });
    if (playing.has(key)) {
      if (before?.gain !== e.gain || before?.muffle !== e.muffle) setLoopVolume(key, e.gain, e.muffle);
      continue;
    }
    playing.set(key, e.sound);
    void soundUrl(e.sound)
      .catch(() => undefined)
      .then((url) => {
        // Stopped or changed while its file was looked up: nothing to start.
        const now = levels.get(key) ?? e;
        if (playing.get(key) === e.sound) playLoop(key, e.sound, now.gain, url, now.muffle, () => notPlayable(e.sound));
      });
  }
}

/** Starts following the store (once). */
export function startMapSound(): void {
  if (started) return;
  started = true;
  subscribe(update);
}

let previews = 0;

/** "Listen" in the Map Forge: a sound for a few seconds at `volume`; a new one ends the last. */
export function previewSound(sound: string, volume: number): void {
  const n = ++previews;
  stopLoop('preview');
  void soundUrl(sound)
    .catch(() => undefined)
    .then((url) => {
      if (n !== previews) return;
      playLoop('preview', sound, volume, url);
      setTimeout(() => n === previews && stopLoop('preview'), 4000);
    });
}
