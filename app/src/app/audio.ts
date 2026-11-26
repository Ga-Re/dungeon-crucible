/**
 * Audio engine for the soundboard and the map's sounds (E-37): loops (built-in synthesised ones
 * and library files, each under its own key) and sound effects, mixed through one master gain. Tracks fade in and out, so scene
 * changes crossfade. Audio starts only after a user gesture (browser/WebView autoplay policy);
 * the engine resumes on the first click.
 */

import { BUILTIN_SOUND, BUILTIN_SOUNDS } from '../core/sound';

export const BUILTIN_PREFIX = BUILTIN_SOUND;
const FADE_S = 1.2;

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let masterVolume = 0.8;
const tracks = new Map<string, { gain: GainNode; stop: () => void }>();

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

/** Built-in ambience, synthesised so the soundboard works without any files. */
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
export function playLoop(key: string, sound: string, volume: number, url?: string): void {
  const { ctx: c, master: m } = audio();
  const existing = tracks.get(key);
  if (existing) {
    existing.gain.gain.setTargetAtTime(volume, c.currentTime, 0.1);
    return;
  }
  const gain = c.createGain();
  gain.gain.value = 0;
  gain.connect(m);
  gain.gain.setTargetAtTime(volume, c.currentTime, FADE_S / 3);
  let stop: () => void;
  if (sound.startsWith(BUILTIN_PREFIX)) {
    stop = startBuiltin(sound.slice(BUILTIN_PREFIX.length), c, gain);
  } else {
    const el = new Audio();
    if (url && !url.startsWith('blob:')) el.crossOrigin = 'anonymous';
    el.src = url ?? '';
    el.loop = true;
    const node = c.createMediaElementSource(el);
    node.connect(gain);
    void el.play().catch(() => undefined);
    stop = () => {
      el.pause();
      el.removeAttribute('src');
      el.load();
    };
  }
  tracks.set(key, { gain, stop });
}

export function setAmbienceVolume(id: string, volume: number): void {
  setLoopVolume(id, volume);
}

export function setLoopVolume(key: string, volume: number): void {
  const t = tracks.get(key);
  if (t && ctx) t.gain.gain.setTargetAtTime(volume, ctx.currentTime, 0.05);
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
