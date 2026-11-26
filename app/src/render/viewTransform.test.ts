import { describe, expect, it } from 'vitest';
import { fitView, toMap, toScreen, viewAt, type Turn } from './viewTransform';

const near = (a: { x: number; y: number }, b: { x: number; y: number }) => {
  expect(a.x).toBeCloseTo(b.x);
  expect(a.y).toBeCloseTo(b.y);
};

/** The DM window's turned view (DC-022). */
describe('view with the map turned', () => {
  it('screen and map points go back and forth at every turn', () => {
    for (const rot of [0, 90, 180, 270] as Turn[]) {
      const v = { zoom: 0.5, x: 30, y: -20, rot };
      near(toMap(v, toScreen(v, { x: 123, y: 45 })), { x: 123, y: 45 });
    }
  });

  it('turned by 90°, the right of the map goes down on screen (as the renderer turns)', () => {
    const v = { zoom: 1, x: 0, y: 0, rot: 90 as Turn };
    near(toScreen(v, { x: 10, y: 0 }), { x: 0, y: 10 });
  });

  it('fitting a tall map turned sideways fills the width', () => {
    const v = fitView({ x: 0, y: 0, w: 100, h: 400 }, { width: 840, height: 240 }, 90);
    expect(v.zoom).toBeCloseTo(2);
    near(toScreen(v, { x: 50, y: 200 }), { x: 420, y: 120 });
  });

  it('keeps a map point under the pointer when zooming', () => {
    const v = viewAt({ x: 70, y: 30 }, { x: 200, y: 100 }, 3, 270);
    near(toScreen(v, { x: 70, y: 30 }), { x: 200, y: 100 });
  });
});
