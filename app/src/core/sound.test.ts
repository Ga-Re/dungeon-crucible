import { describe, expect, it } from 'vitest';
import { createSampleScene } from '../sample/crypt';
import { hearingPoints, isSoundRef, mapSoundMix, sourceLevel } from './sound';
import type { Scene, SoundSource } from './scene';

const src = (over: Partial<SoundSource> = {}): SoundSource => ({ id: 'sound-a', sound: 'builtin:fire', x: 0, y: 0, radiusFt: 30, volume: 0.8, fade: true, ...over });
// 1 ft = 2 px in these tests.
const FT = 2;

describe('how loud a sound source is (E-37)', () => {
  it('is silent outside its radius, at its volume at the source', () => {
    expect(sourceLevel(src(), [{ x: 61, y: 0 }], FT)).toBe(0);
    expect(sourceLevel(src(), [{ x: 0, y: 0 }], FT)).toBeCloseTo(0.8);
  });

  it('with fading it gets quieter towards the edge; without, it is full volume up to the edge', () => {
    const near = sourceLevel(src(), [{ x: 15, y: 0 }], FT);
    const far = sourceLevel(src(), [{ x: 45, y: 0 }], FT);
    expect(near).toBeGreaterThan(far);
    expect(far).toBeGreaterThan(0);
    expect(near).toBeLessThan(0.8);
    expect(sourceLevel(src({ fade: false }), [{ x: 59, y: 0 }], FT)).toBeCloseTo(0.8);
  });

  it('the nearest listener counts', () => {
    expect(sourceLevel(src(), [{ x: 200, y: 0 }, { x: 0, y: 10 }], FT)).toBe(sourceLevel(src(), [{ x: 0, y: 10 }], FT));
  });

  it('nobody listening: silent', () => {
    expect(sourceLevel(src(), [], FT)).toBe(0);
  });
});

describe('who hears (E-37)', () => {
  it('the player characters; without any, the middle of the TV view', () => {
    const scene = createSampleScene();
    const pcs = scene.tokens.filter((t) => t.kind === 'pc');
    expect(pcs.length).toBeGreaterThan(0);
    expect(hearingPoints(scene)).toEqual(pcs.map((t) => ({ x: t.x, y: t.y })));
    const none: Scene = { ...scene, tokens: scene.tokens.filter((t) => t.kind !== 'pc') };
    expect(hearingPoints(none)).toEqual([{ x: scene.table.centerX, y: scene.table.centerY }]);
  });
});

describe('what the map plays (E-37)', () => {
  it('its sound everywhere at its volume, and each shown source by the nearest player character', () => {
    const scene = createSampleScene();
    const pc = scene.tokens.find((t) => t.kind === 'pc')!;
    const ftPx = scene.map.grid.cellWidth / scene.map.grid.feetPerCell;
    const s: Scene = {
      ...scene,
      map: { ...scene.map, ambientSound: { sound: 'builtin:wind', volume: 0.4 } },
      sounds: [src({ id: 'sound-near', x: pc.x, y: pc.y }), src({ id: 'sound-far', x: pc.x + 1000 * ftPx, y: pc.y })],
    };
    expect(mapSoundMix(s)).toEqual([
      { key: 'ambient', sound: 'builtin:wind', gain: 0.4 },
      { key: 'sound-near', sound: 'builtin:fire', gain: 0.8 },
      { key: 'sound-far', sound: 'builtin:fire', gain: 0 },
    ]);
  });

  it('hidden sources and those on inactive layers are not part of it', () => {
    const scene = createSampleScene();
    const s: Scene = { ...scene, hidden: { ...scene.hidden, sounds: [src({ id: 'h' })] }, inactive: { ...scene.inactive, sounds: [src({ id: 'i' })] } };
    expect(mapSoundMix(s)).toEqual([]);
  });
});

describe('what is a sound', () => {
  it('a built-in one or an audio file; a picture or an unknown built-in is not', () => {
    expect(isSoundRef('builtin:wind')).toBe(true);
    expect(isSoundRef('library/sfx/Drip.OGG')).toBe(true);
    expect(isSoundRef('library/barrel.png')).toBe(false);
    expect(isSoundRef('builtin:crypt')).toBe(false);
  });
});
