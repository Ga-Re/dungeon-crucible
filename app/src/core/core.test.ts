import { describe, expect, it } from 'vitest';
import { isVisibleFrom, visibilityPolygon } from './geometry';
import {
  calibrateFromThreePoints,
  cellAt,
  cellCenter,
  cellsVisibleOnTable,
  DEFAULT_GRID,
  gridDistanceFeet,
  pixelsPerInch,
  ppiCorrectionFromMeasurement,
  tableZoomForPhysicalGrid,
} from './grid';
import { FogState, rle, unrle } from './fog';
import { d20Test, parseDice, rollDice } from './rules/dice';
import {
  abilityModifier,
  evaluateEncounter,
  exhaustionEffects,
  proficiencyBonusForCr,
  proficiencyBonusForLevel,
  savingThrowBonus,
} from './rules/rules2024';
import { buildPlayerFrame, MAX_FRAME_AGE_MS, parsePlayerFrame } from './projection';
import { updateVision } from './vision';
import { createSampleScene } from '../sample/crypt';
import { CreatureSchema, MapSidecarSchema, parseSidecar, resourcePathForSidecar, sidecarPathFor } from './sidecar';

const seq = (...vals: number[]) => {
  let i = 0;
  return () => vals[i++ % vals.length];
};

describe('visibility', () => {
  const wall = { x1: 100, y1: -50, x2: 100, y2: 50 };
  it('blocks sight behind a wall', () => {
    const o = { x: 0, y: 0 };
    const poly = visibilityPolygon(o, 300, [wall]);
    expect(isVisibleFrom(o, 300, poly, { x: 50, y: 0 })).toBe(true);
    expect(isVisibleFrom(o, 300, poly, { x: 150, y: 0 })).toBe(false);
    expect(isVisibleFrom(o, 300, poly, { x: 150, y: 120 })).toBe(true);
  });
  it('respects the sight radius', () => {
    const o = { x: 0, y: 0 };
    const poly = visibilityPolygon(o, 100, []);
    expect(isVisibleFrom(o, 100, poly, { x: 90, y: 0 })).toBe(true);
    expect(isVisibleFrom(o, 100, poly, { x: 80, y: 80 })).toBe(false);
  });
});

describe('grid calibration', () => {
  it('recovers cell size, rotation and offset from three points', () => {
    const r = calibrateFromThreePoints({ x: 13, y: 27 }, { x: 13 + 5 * 64, y: 27 }, { x: 13, y: 27 + 5 * 64 }, 5, 5);
    expect(r.cellWidth).toBeCloseTo(64);
    expect(r.cellHeight).toBeCloseTo(64);
    expect(r.rotationDeg).toBeCloseTo(0);
    expect(r.originX).toBeCloseTo(13);
    expect(r.originY).toBeCloseTo(27);
    expect(r.distortion).toBeCloseTo(0);
    expect(r.skewDeg).toBeCloseTo(0);
  });
  it('detects rotation', () => {
    const r = calibrateFromThreePoints({ x: 0, y: 0 }, { x: 50, y: 50 }, { x: -50, y: 50 });
    expect(r.rotationDeg).toBeCloseTo(45);
    expect(r.cellWidth).toBeCloseTo(Math.SQRT2 * 50);
  });
  it('rejects identical points', () => {
    expect(() => calibrateFromThreePoints({ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 10 })).toThrow();
  });
});

describe('physical table calibration (55" 4K)', () => {
  const tv = { diagonalInches: 55, widthPx: 3840, heightPx: 2160 };
  it('computes about 80 px per inch', () => {
    expect(pixelsPerInch(tv)).toBeCloseTo(80.1, 1);
  });
  it('scales a 140 px map cell to one inch on the glass', () => {
    const zoom = tableZoomForPhysicalGrid({ cellWidth: 140 }, tv, 1);
    expect(140 * zoom).toBeCloseTo(pixelsPerInch(tv));
  });
  it('fits about 47 × 26 one-inch squares', () => {
    expect(cellsVisibleOnTable(tv)).toEqual({ cols: 47, rows: 26 });
  });
  it('derives a correction from a ruler measurement', () => {
    expect(ppiCorrectionFromMeasurement(4, 3.9)).toBeCloseTo(1.0256, 3);
  });
});

describe('cell addressing', () => {
  it('round-trips square cells', () => {
    const g = { ...DEFAULT_GRID, cellWidth: 50, cellHeight: 50 };
    expect(cellAt(g, cellCenter(g, { col: 3, row: 7 }))).toEqual({ col: 3, row: 7 });
  });
  it('round-trips hex cells', () => {
    for (const type of ['hex-pointy', 'hex-flat'] as const) {
      const g = { ...DEFAULT_GRID, type, cellWidth: 60, cellHeight: 60 };
      expect(cellAt(g, cellCenter(g, { col: 4, row: 5 }))).toEqual({ col: 4, row: 5 });
    }
  });
  it('counts diagonals as 5 ft (2024 rules)', () => {
    const g = { ...DEFAULT_GRID, cellWidth: 50, cellHeight: 50 };
    expect(gridDistanceFeet(g, { x: 25, y: 25 }, { x: 175, y: 175 })).toBe(15);
  });
});

describe('fog', () => {
  it('marks only seen cells and never locked ones', () => {
    const fog = new FogState({ cols: 10, rows: 1, cellSize: 10 });
    fog.setLocked([[8, 0]], true);
    const o = { x: 5, y: 5 };
    const poly = visibilityPolygon(o, 200, [{ x1: 60, y1: -10, x2: 60, y2: 20 }]);
    fog.markVisible(o, 200, poly);
    expect(fog.isExplored(0, 0)).toBe(true);
    expect(fog.isExplored(5, 0)).toBe(true);
    expect(fog.isExplored(7, 0)).toBe(false);
    fog.revealAll();
    expect(fog.isExplored(8, 0)).toBe(false);
    fog.brush({ x: 85, y: 5 }, 4, 'reveal');
    expect(fog.isExplored(8, 0)).toBe(true);
  });
  it('encodes and decodes', () => {
    const buf = new Uint8Array([0, 0, 1, 1, 1, 0]);
    expect(rle(buf)).toBe('0:2,1:3,0:1');
    expect([...unrle('0:2,1:3,0:1', 6)]).toEqual([...buf]);
    expect(() => unrle('0:2,2:3', 5)).toThrow();
    expect(() => unrle('0:2', 5)).toThrow();
  });
});

describe('dice', () => {
  it('parses English and German notation', () => {
    expect(parseDice('2d6+3')).toHaveLength(2);
    expect(parseDice('1W20 - 1')).toHaveLength(2);
    expect(() => parseDice('2d')).toThrow();
    expect(() => parseDice('d20d')).toThrow();
  });
  it('rolls with keep-highest', () => {
    // 4d6kh3 with rolls 1,6,4,3 → 13
    const r = rollDice('4d6kh3', seq(0, 5 / 6, 3 / 6, 2 / 6));
    expect(r.total).toBe(13);
  });
  it('reports natural 20', () => {
    expect(rollDice('1d20+5', seq(0.999)).natural20).toBe(20);
  });
  it('cancels advantage and disadvantage', () => {
    const r = d20Test(3, { advantage: true, disadvantage: true }, seq(0.5));
    expect(r.rolls).toHaveLength(1);
  });
});

describe('2024 rules', () => {
  it('computes modifiers and proficiency', () => {
    expect(abilityModifier(8)).toBe(-1);
    expect(abilityModifier(17)).toBe(3);
    expect(proficiencyBonusForLevel(1)).toBe(2);
    expect(proficiencyBonusForLevel(5)).toBe(3);
    expect(proficiencyBonusForLevel(17)).toBe(6);
    expect(proficiencyBonusForCr('1/4')).toBe(2);
    expect(proficiencyBonusForCr('5')).toBe(3);
    expect(proficiencyBonusForCr('30')).toBe(9);
    expect(savingThrowBonus(16, true, 2)).toBe(5);
  });
  it('rates encounters with the 2024 budget', () => {
    const party = [4, 4, 4];
    expect(evaluateEncounter(party, [{ cr: '3', count: 1 }]).rating).toBe('low');
    expect(evaluateEncounter(party, [{ cr: '1/4', count: 2 }, { cr: '1', count: 1 }, { cr: '3', count: 1 }]).rating).toBe('moderate');
    expect(evaluateEncounter(party, [{ cr: '3', count: 2 }]).rating).toBe('high');
    expect(evaluateEncounter(party, [{ cr: '5', count: 1 }]).rating).toBe('beyond');
  });
  it('applies 2024 exhaustion', () => {
    expect(exhaustionEffects(3)).toEqual({ d20Penalty: -6, speedPenalty: -15, dead: false });
    expect(exhaustionEffects(6).dead).toBe(true);
  });
});

describe('player projection (fail-closed)', () => {
  it('only contains whitelisted data and visible tokens', () => {
    const scene = createSampleScene();
    const vision = updateVision(scene);
    const frame = buildPlayerFrame(scene, vision, { seq: 1, now: 1000, showGrid: true, memoryOpacity: 0.6, softness: 0.5, movementLocked: false, zoom: 1 });
    const json = JSON.stringify(frame);
    expect(json).not.toContain('walls');
    expect(json).not.toContain('zones');
    expect(json).not.toContain('Ash Wight');
    const ids = frame.tokens.map((t) => t.id);
    expect(ids).toContain('thorin');
    expect(ids).not.toContain('wight');
    expect(frame.tokens.every((t) => t.label.length <= 4)).toBe(true);
    expect(parsePlayerFrame(frame, 1000, 0).ok).toBe(true);
  });
  it('rejects stale, out-of-order and malformed frames', () => {
    const scene = createSampleScene();
    const frame = buildPlayerFrame(scene, updateVision(scene), { seq: 5, now: 0, showGrid: true, memoryOpacity: 0.6, softness: 0.5, movementLocked: false, zoom: 1 });
    expect(parsePlayerFrame(frame, MAX_FRAME_AGE_MS + 1, 0)).toEqual({ ok: false, reason: 'stale' });
    expect(parsePlayerFrame(frame, 0, 5)).toEqual({ ok: false, reason: 'out-of-order' });
    expect(parsePlayerFrame({ ...frame, fog: undefined }, 0, 0)).toEqual({ ok: false, reason: 'invalid-frame' });
  });
  it('keeps secret rooms locked until discovered', () => {
    const scene = createSampleScene();
    scene.fog.revealAll();
    const secret = scene.zones.find((z) => z.kind === 'secret')!;
    const c = Math.floor((secret.rect.x + secret.rect.w / 2) / scene.fog.cellSize);
    const r = Math.floor((secret.rect.y + secret.rect.h / 2) / scene.fog.cellSize);
    expect(scene.fog.isExplored(c, r)).toBe(false);
  });
});

describe('sidecars', () => {
  it('maps resource paths', () => {
    expect(sidecarPathFor('maps/crypt.webp')).toBe('maps/crypt.webp.dm.json');
    expect(resourcePathForSidecar('maps/crypt.webp.dm.json')).toBe('maps/crypt.webp');
    expect(resourcePathForSidecar('maps/crypt.webp')).toBeNull();
  });
  it('validates a map sidecar and reports errors', () => {
    const ok = parseSidecar(MapSidecarSchema, JSON.stringify({ kind: 'map', schemaVersion: 1, name: 'Crypt', grid: DEFAULT_GRID }));
    expect(ok.ok).toBe(true);
    const bad = parseSidecar(CreatureSchema, JSON.stringify({ kind: 'creature', schemaVersion: 1, name: '' }));
    expect(bad.ok).toBe(false);
    expect(parseSidecar(MapSidecarSchema, '{').ok).toBe(false);
  });
});
