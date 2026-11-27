import { describe, expect, it } from 'vitest';
import { bandWidth, cliffBand } from './band';

/** The band a cliff shows on its lower side (Teil B §11.2). */
describe('band width', () => {
  it('grows with the drop: 10 ft → 0.45 cell, 20 ft → 0.9, never over 2.5 cells', () => {
    expect(bandWidth(10, 70)).toBeCloseTo(0.45 * 70);
    expect(bandWidth(20, 70)).toBeCloseTo(0.9 * 70);
    expect(bandWidth(100, 70)).toBeCloseTo(2.5 * 70);
  });
});

describe('the band mesh', () => {
  const line = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 200, y: 0 }];

  it('lies on the right of the contour (the lower side), its top on the contour', () => {
    const b = cliffBand(line, false, 30, { textureLength: 50, lightAngle: 45 });
    // Pairs: top (on the line) and bottom (offset to the right, here +y).
    expect(b.positions.length).toBe(line.length * 2 * 2);
    expect([b.positions[0], b.positions[1]]).toEqual([0, 0]);
    expect(b.positions[2]).toBeCloseTo(0);
    expect(b.positions[3]).toBeCloseTo(30);
    expect(b.indices.length).toBe((line.length - 1) * 6);
  });

  it('textures along its length (u) and from top to foot (v)', () => {
    const b = cliffBand(line, false, 30, { textureLength: 50, lightAngle: 45 });
    expect([b.uvs[0], b.uvs[1], b.uvs[2], b.uvs[3]]).toEqual([0, 0, 0, 1]);
    expect(b.uvs[8]).toBeCloseTo(4);
  });

  it('a ring repeats its first point, so the texture runs on across the seam', () => {
    const ring = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }];
    const b = cliffBand(ring, true, 20, { textureLength: 100, lightAngle: 45 });
    expect(b.positions.length).toBe((ring.length + 1) * 4);
    expect(b.uvs[ring.length * 4]).toBeCloseTo(4);
  });

  it('a sharp turn never pushes the foot further than twice the width', () => {
    const b = cliffBand([{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 0, y: 5 }], false, 20, { textureLength: 50, lightAngle: 45 });
    const dx = b.positions[6]! - b.positions[4]!;
    const dy = b.positions[7]! - b.positions[5]!;
    expect(Math.hypot(dx, dy)).toBeLessThanOrEqual(40 + 1e-4);
  });

  it('its width may change along the contour, read at the world position (protrusions and niches)', () => {
    const b = cliffBand(line, false, 30, { textureLength: 50, lightAngle: 45, widthFactor: (p) => (p.x < 50 ? 1 : 1.5) });
    expect(b.positions[3]).toBeCloseTo(30);
    expect(b.positions[7]).toBeCloseTo(45);
    expect(b.positions[11]).toBeCloseTo(45);
  });

  it('a face turned to the light is brighter than one turned away', () => {
    // Light falls towards the lower right (45°): a face looking up-left (towards the light's source) is lit.
    const facingLight = cliffBand([{ x: 100, y: 0 }, { x: 0, y: 0 }], false, 20, { textureLength: 50, lightAngle: 45 });
    const away = cliffBand([{ x: 0, y: 0 }, { x: 100, y: 0 }], false, 20, { textureLength: 50, lightAngle: 45 });
    expect(facingLight.shade[0]).toBeGreaterThan(away.shade[0]!);
  });
});
