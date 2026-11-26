import { describe, expect, it } from 'vitest';
import { createSampleScene } from '../sample/crypt';
import { hearingPoints, isSoundRef, mapSoundMix, sourceHearing, sourceLevel, WALL_DAMP } from './sound';
import type { Wall } from './scene';
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
      { key: 'ambient', sound: 'builtin:wind', gain: 0.4, muffle: 0 },
      { key: 'sound-near', sound: 'builtin:fire', gain: 0.8, muffle: 0 },
      { key: 'sound-far', sound: 'builtin:fire', gain: 0, muffle: 0 },
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

describe('walls between (E-37, DC-104b)', () => {
  const wall = (id: string, x: number, kind: Wall['kind'] = 'wall', open?: boolean): Wall => ({ id, kind, x1: x, y1: -100, x2: x, y2: 100, ...(open === undefined ? {} : { open }) });
  const s = src({ fade: false, volume: 1 });
  const at = [{ x: 40, y: 0 }];

  it('a wall between makes it quieter and muffled; two walls more so', () => {
    expect(sourceHearing(s, at, FT, [])).toEqual({ gain: 1, muffle: 0 });
    const one = sourceHearing(s, at, FT, [wall('w1', 20)]);
    expect(one.gain).toBeCloseTo(WALL_DAMP);
    expect(one.muffle).toBeGreaterThan(0);
    const two = sourceHearing(s, at, FT, [wall('w1', 10), wall('w2', 30)]);
    expect(two.gain).toBeLessThan(one.gain);
    expect(two.muffle).toBeGreaterThan(one.muffle);
  });

  it('open doors, windows and cliffs do not damp; closed doors do', () => {
    expect(sourceHearing(s, at, FT, [wall('d', 20, 'door', true), wall('win', 25, 'window'), wall('c', 30, 'cliff')]).gain).toBe(1);
    expect(sourceHearing(s, at, FT, [wall('d', 20, 'door', false)]).gain).toBeCloseTo(WALL_DAMP);
  });

  it('a wall beside the line does not count', () => {
    expect(sourceHearing(s, at, FT, [{ id: 'w', kind: 'wall', x1: 20, y1: 10, x2: 20, y2: 100 }]).gain).toBe(1);
  });

  it('the player character that hears it best counts: one behind a wall, one in the open a little further away', () => {
    const r = sourceHearing(src({ volume: 1 }), [{ x: 10, y: 0 }, { x: -20, y: 0 }], FT, [wall('w', 5)]);
    expect(r.muffle).toBe(0);
    expect(r.gain).toBeCloseTo(sourceLevel(src({ volume: 1 }), [{ x: -20, y: 0 }], FT));
  });
});
