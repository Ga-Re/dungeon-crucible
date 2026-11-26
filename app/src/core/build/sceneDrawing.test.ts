import { describe, expect, it } from 'vitest';
import { emptyOwnDrawing, shownDrawing, type OwnDrawing } from './sceneDrawing';
import type { Masonry } from './masonry';

const wall = (id: string): Masonry => ({ id, points: [{ x: 0, y: 0 }, { x: 70, y: 0 }], closed: false, style: 'brick', thickness: 10, seed: 1 });
const map = {
  masonry: [wall('m-a'), wall('m-b')],
  masonryDoors: [{ id: 'd-a', wall: 'm-a', at: 35, width: 30, secret: false, crack: false }, { id: 'd-b', wall: 'm-b', at: 35, width: 30, secret: false, crack: false }],
  cliffs: [],
  waters: [],
  floors: [],
};

describe('shownDrawing (what a scene shows of the drawing, DC-107c)', () => {
  it('is the map itself without anything of the scene (the same lists)', () => {
    const shown = shownDrawing(map, emptyOwnDrawing(), []);
    expect(shown.masonry).toBe(map.masonry);
    expect(shown.masonryDoors).toBe(map.masonryDoors);
  });

  it("adds the scene's own drawing and leaves out what the scene hides, with the doors of hidden walls", () => {
    const own: OwnDrawing = { ...emptyOwnDrawing(), masonry: [wall('s-a')] };
    const shown = shownDrawing(map, own, ['m-b']);
    expect(shown.masonry.map((w) => w.id)).toEqual(['m-a', 's-a']);
    expect(shown.masonryDoors.map((d) => d.id)).toEqual(['d-a']);
  });

  it('gives the same lists again while nothing changed (sight keeps what it computed)', () => {
    const own: OwnDrawing = { ...emptyOwnDrawing(), masonry: [wall('s-a')] };
    const hidden = ['m-b'];
    expect(shownDrawing(map, own, hidden).masonry).toBe(shownDrawing(map, own, hidden).masonry);
  });
});
