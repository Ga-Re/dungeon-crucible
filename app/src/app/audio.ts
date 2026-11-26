/**
 * Audio engine for the soundboard and the map's sounds (E-37): loops (built-in synthesised ones
 * and library files, each under its own key) and sound effects, mixed through one master gain. Tracks fade in and out, so scene
 * changes crossfade. Audio starts only after a user gesture (browser/WebView autoplay policy);
 * the engine resumes on the first click.
 */

import { BUILTIN_SOUND, BUILTIN_SOUNDS } from '../core/sound';

/** The built-in sounds' files, shipped with the app (`../audio/sounds/`, see its README). */
const builtinFiles = import.meta.glob('../audio/sounds/*.ogg', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;

function builtinFile(key: string): string | undefined {
  return builtinFiles[`../audio/sounds/${key}.ogg`];
}

/** The built-in sounds the app can also synthesise: the fallback when their file cannot be played. */
const SYNTHESISED = new Set(['wind', 'drip', 'fire', 'rain', 'choir']);

export const BUILTIN_PREFIX = BUILTIN_SOUND;
const FADE_S = 1.2;

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let masterVolume = 0.8;
const tracks = new Map<string, { gain: GainNode; filter: BiquadFilterNode; stop: () => void }>();

/** The low-pass cut-off for a muffling of 0 (clear) … 1 (behind walls, DC-104b). */
function cutoff(muffle: number): number {
  return 20000 * (500 / 20000) ** Math.max(0, Math.min(1, muffle));
}

function audio(): { ctx: AudioContext; master: GainNode } {
  if (!ctx) {
    ctx = new AudioContext();
    master = ctx.createGain();
    master.gain.value = masterVolume;
    master.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return { ctx, master: master! };
}

/** Resumes audio on the first user gesture (autoplay policy). */
export function unlockAudioOnGesture(): void {
  const unlock = () => {
    if (ctx && ctx.state === 'suspended') void ctx.resume();
  };
  window.addEventListener('pointerdown', unlock);
  window.addEventListener('keydown', unlock);
}

export function setMasterVolume(v: number): void {
  masterVolume = v;
  if (master && ctx) master.gain.setTargetAtTime(v, ctx.currentTime, 0.05);
}

function noise(c: AudioContext): AudioBufferSourceNode {
  const buffer = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
  const d = buffer.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  const s = c.createBufferSource();
  s.buffer = buffer;
  s.loop = true;
  return s;
}

/** Built-in ambience: shipped loops, the first five also synthesised as a fallback. */
export const BUILTIN_AMBIENCE = BUILTIN_SOUNDS.map((key) => ({ id: `${BUILTIN_PREFIX}${key}`, key }));

function startBuiltin(key: string, c: AudioContext, out: AudioNode): () => void {
  switch (key) {
    case 'wind': {
      const s = noise(c);
      const f = c.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = 380;
      const lfo = c.createOscillator();
      const depth = c.createGain();
      lfo.frequency.value = 0.12;
      depth.gain.value = 220;
      lfo.connect(depth);
      depth.connect(f.frequency);
      s.connect(f);
      f.connect(out);
      s.start();
      lfo.start();
      return () => {
        s.stop();
        lfo.stop();
      };
    }
    case 'drip': {
      const id = setInterval(() => {
        const o = c.createOscillator();
        const g = c.createGain();
        o.frequency.value = 900 + Math.random() * 900;
        o.frequency.exponentialRampToValueAtTime(300, c.currentTime + 0.15);
        g.gain.setValueAtTime(0.35, c.currentTime);
        g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.25);
        o.connect(g);
        g.connect(out);
        o.start();
        o.stop(c.currentTime + 0.3);
      }, 700 + Math.random() * 900);
      return () => clearInterval(id);
    }
    case 'fire': {
      const s = noise(c);
      const f = c.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.value = 1400;
      const g = c.createGain();
      g.gain.value = 0.15;
      s.connect(f);
      f.connect(g);
      g.connect(out);
      s.start();
      const id = setInterval(() => {
        g.gain.setValueAtTime(0.15 + Math.random() * 0.9, c.currentTime);
        g.gain.exponentialRampToValueAtTime(0.12, c.currentTime + 0.05);
      }, 90);
      return () => {
        clearInterval(id);
        s.stop();
      };
    }
    case 'rain': {
      const s = noise(c);
      const f = c.createBiquadFilter();
      f.type = 'highpass';
      f.frequency.value = 1800;
      s.connect(f);
      f.connect(out);
      s.start();
      return () => s.stop();
    }
    default: {
      const oscs = [110, 164.8, 220, 261.6].map((fr) => {
        const o = c.createOscillator();
        o.type = 'triangle';
        o.frequency.value = fr;
        const g = c.createGain();
        g.gain.value = 0.08;
        o.connect(g);
        g.connect(out);
        o.start();
        return o;
      });
      return () => oscs.forEach((o) => o.stop());
    }
  }
}

/**
 * Starts (or keeps) an ambience track of the soundboard. `url` is needed for file tracks (asset
 * URL); built-in tracks are identified by their id alone.
 */
export function playAmbience(id: string, volume: number, url?: string): void {
  playLoop(id, id, volume, url);
}

/**
 * Starts (or keeps) the loop `key` playing `sound` (`builtin:<key>` or a file at `url`) and fades
 * it to `volume`. Keys keep the soundboard's tracks and the map's apart, even for the same sound.
 */
export function playLoop(key: string, sound: string, volume: number, url?: string, muffle = 0, onError?: () => void): void {
  const { ctx: c, master: m } = audio();
  const existing = tracks.get(key);
  if (existing) {
    existing.gain.gain.setTargetAtTime(volume, c.currentTime, 0.1);
    existing.filter.frequency.setTargetAtTime(cutoff(muffle), c.currentTime, 0.1);
    return;
  }
  const gain = c.createGain();
  gain.gain.value = 0;
  gain.connect(m);
  // Muffling (walls between): a low-pass before the volume; wide open while clear.
  const filter = c.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = cutoff(muffle);
  filter.connect(gain);
  gain.gain.setTargetAtTime(volume, c.currentTime, FADE_S / 3);
  const builtin = sound.startsWith(BUILTIN_PREFIX) ? sound.slice(BUILTIN_PREFIX.length) : null;
  const file = builtin ? builtinFile(builtin) : url;
  let stop: () => void = () => undefined;
  // A built-in sound whose file cannot be played is synthesised instead, where the app can;
  // anything else stays silent and is reported (`onError`).
  const synthesise = () => {
    if (builtin && SYNTHESISED.has(builtin)) stop = startBuiltin(builtin, c, filter);
    else onError?.();
  };
  if (file) {
    const el = new Audio();
    if (!file.startsWith('blob:')) el.crossOrigin = 'anonymous';
    el.src = file;
    el.loop = true;
    c.createMediaElementSource(el).connect(filter);
    const release = () => {
      el.pause();
      el.removeAttribute('src');
      el.load();
    };
    stop = release;
    const fail = () => {
      if (stop !== release || tracks.get(key)?.gain !== gain) return;
      release();
      synthesise();
    };
    el.addEventListener('error', fail, { once: true });
    // Only a file that cannot be decoded falls back; a play() stopped early or held back by autoplay does not.
    void el.play().catch((e: unknown) => (e as Error | undefined)?.name === 'NotSupportedError' && fail());
  } else synthesise();
  tracks.set(key, { gain, filter, stop: () => stop() });
}

export function setAmbienceVolume(id: string, volume: number): void {
  setLoopVolume(id, volume);
}

/** Fades the loop `key` to `volume`; with `muffle`, also how dull it sounds (0 clear … 1). */
export function setLoopVolume(key: string, volume: number, muffle?: number): void {
  const t = tracks.get(key);
  if (!t || !ctx) return;
  t.gain.gain.setTargetAtTime(volume, ctx.currentTime, 0.05);
  if (muffle !== undefined) t.filter.frequency.setTargetAtTime(cutoff(muffle), ctx.currentTime, 0.1);
}

/** Fades a track out and stops it. */
export function stopAmbience(id: string): void {
  stopLoop(id);
}

/** Fades the loop `key` out and stops it. */
export function stopLoop(key: string): void {
  const t = tracks.get(key);
  if (!t || !ctx) return;
  tracks.delete(key);
  t.gain.gain.setTargetAtTime(0, ctx.currentTime, FADE_S / 3);
  setTimeout(() => {
    t.stop();
    t.filter.disconnect();
    t.gain.disconnect();
  }, FADE_S * 1000 + 200);
}

export function playingAmbience(): string[] {
  return [...tracks.keys()];
}

/** Built-in sound effects (synthesised). */
export const BUILTIN_SFX = ['door', 'sword', 'spell', 'thunder', 'dice', 'roar'] as const;
export type BuiltinSfx = (typeof BUILTIN_SFX)[number];

export function playSfx(id: BuiltinSfx): void {
  const { ctx: c, master: m } = audio();
  const t = c.currentTime;
  const g = c.createGain();
  g.connect(m);
  if (id === 'door' || id === 'roar') {
    const o = c.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(id === 'door' ? 90 : 110, t);
    o.frequency.linearRampToValueAtTime(id === 'door' ? 140 : 60, t + (id === 'door' ? 0.6 : 0.9));
    g.gain.setValueAtTime(id === 'door' ? 0.25 : 0.35, t);
    g.gain.linearRampToValueAtTime(0, t + 1);
    o.connect(g);
    o.start(t);
    o.stop(t + 1);
  } else if (id === 'spell') {
    const o = c.createOscillator();
    o.frequency.setValueAtTime(300, t);
    o.frequency.exponentialRampToValueAtTime(1400, t + 0.6);
    g.gain.setValueAtTime(0.25, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.8);
    o.connect(g);
    o.start(t);
    o.stop(t + 0.8);
  } else {
    const s = noise(c);
    const f = c.createBiquadFilter();
    f.type = id === 'thunder' ? 'lowpass' : 'highpass';
    f.frequency.value = id === 'thunder' ? 220 : id === 'dice' ? 3000 : 2400;
    const d = id === 'thunder' ? 2.2 : id === 'dice' ? 0.08 : 0.25;
    g.gain.setValueAtTime(id === 'thunder' ? 0.9 : 0.6, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + d);
    s.connect(f);
    f.connect(g);
    s.start(t);
    s.stop(t + d);
  }
}

/** Plays a sound effect file once (asset URL). */
export function playSfxFile(url: string, volume = 1): void {
  const { ctx: c, master: m } = audio();
  const el = new Audio();
  if (!url.startsWith('blob:')) el.crossOrigin = 'anonymous';
  el.src = url;
  const g = c.createGain();
  g.gain.value = volume;
  c.createMediaElementSource(el).connect(g);
  g.connect(m);
  el.onended = () => g.disconnect();
  void el.play().catch(() => undefined);
}

/** A level meter for the panel: average of the master signal, 0–1. */
let analyser: AnalyserNode | null = null;
export function masterLevel(): number {
  if (!ctx || !master) return 0;
  if (!analyser) {
    analyser = ctx.createAnalyser();
    analyser.fftSize = 64;
    master.connect(analyser);
  }
  const d = new Uint8Array(analyser.frequencyBinCount);
  analyser.getByteFrequencyData(d);
  return d.reduce((a, b) => a + b, 0) / (d.length * 255);
}
