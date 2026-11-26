/**
 * The map's sounds (E-37, DC-104): its sound everywhere and its sound sources, played while a
 * scene is open in the Orchestrator – never in the Map Forge, never on the TV. Follows the store:
 * each change of the scene (a player character moves, a door opens, a source is hidden) sets the
 * levels and muffling anew; a source out of reach stops and starts again when someone comes near.
 */
import { mapSoundMix } from '../core/sound';
import { playLoop, setLoopVolume, stopLoop } from './audio';
import { soundUrl } from './soundboard';
import { sightWalls, state, subscribe } from './store';

/** Below this a source counts as silent and is stopped. */
const SILENT = 0.001;
/** Playing loops by key → their sound; the newest level of each. */
const playing = new Map<string, string>();
const levels = new Map<string, { gain: number; muffle: number }>();
let started = false;

function heardNow(): boolean {
  return state.ws === 'play' && state.layer !== 'map' && !!state.mapDoc;
}

function update(): void {
  // The walls sight uses (drawn ones and doors of assets included) damp the sources behind them.
  const mix = heardNow() ? mapSoundMix(state.scene, sightWalls(state.scene)) : [];
  const want = new Map(mix.filter((e) => e.gain > SILENT).map((e) => [`map:${e.key}`, e]));
  for (const [key, sound] of playing) {
    if (want.get(key)?.sound === sound) continue;
    playing.delete(key);
    levels.delete(key);
    stopLoop(key);
  }
  for (const [key, e] of want) {
    levels.set(key, { gain: e.gain, muffle: e.muffle });
    if (playing.has(key)) {
      setLoopVolume(key, e.gain, e.muffle);
      continue;
    }
    playing.set(key, e.sound);
    void soundUrl(e.sound)
      .catch(() => undefined)
      .then((url) => {
        // Stopped or changed while its file was looked up: nothing to start.
        const now = levels.get(key) ?? e;
        if (playing.get(key) === e.sound) playLoop(key, e.sound, now.gain, url, now.muffle);
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
