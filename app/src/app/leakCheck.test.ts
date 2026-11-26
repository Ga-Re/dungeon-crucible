import { describe, expect, it } from 'vitest';
import { currentLeaks, setLeakCheck, setWorkspace, state, testFigureSight, updateLeakCheck } from './store';

/** The leak check in the Map Forge (DC-025, E-43); the sample crypt has 70 px cells. */
describe('leak check', () => {
  it('the test figure sees from where it stands; nothing of it reaches the scene or the map', () => {
    setWorkspace('forge');
    const walls = state.scene.walls.length;
    setLeakCheck(true);
    expect(testFigureSight()).toEqual([]);
    updateLeakCheck({ figure: { x: 18 * 70, y: 12 * 70 } });
    const sight = testFigureSight();
    expect(sight.length).toBeGreaterThan(0);
    // The same answer while nothing changed (the overlay asks every frame).
    expect(testFigureSight()).toBe(sight);
    updateLeakCheck({ darkvisionFt: 0 });
    expect(testFigureSight()).not.toBe(sight);
    expect(state.scene.tokens.some((t) => t.id === '__test')).toBe(false);
    expect(state.scene.walls.length).toBe(walls);
    expect(Array.isArray(currentLeaks())).toBe(true);
    setLeakCheck(false);
    expect(state.leakCheck).toBeNull();
  });

  it('a wall drawn standing free is found', () => {
    setWorkspace('forge');
    const before = currentLeaks().length;
    state.scene.walls = [...state.scene.walls, { id: 'free', kind: 'wall', x1: 5, y1: 5, x2: 60, y2: 5 }];
    expect(currentLeaks().filter((l) => l.walls.includes('free')).length).toBe(2);
    state.scene.walls = state.scene.walls.filter((w) => w.id !== 'free');
    expect(currentLeaks().length).toBe(before);
  });
});
