import { describe, expect, it } from 'vitest';
import { areaBounds } from './areas';
import { isVisibleFrom, visibilityPolygon } from './geometry';
import {
  gridFromBox,
  shiftGrid,
  squareBox,
  cellAt,
  cellCenter,
  cellsVisibleOnTable,
  DEFAULT_GRID,
  gridDistanceFeet,
  pixelsPerInch,
  ppiCorrectionFromMeasurement,
  tableZoomForPhysicalGrid,
} from './grid';
import { EMPTY_LEVEL_FOG, hideIn, mapPolygon, openArea, rectPolygon, rememberSeen, revealAll, revealIn, seenNow, sightPolygon } from './fogModel';
import { isInside } from './poly/fog';
import { lockedAreas } from './persistence';
import { visiblePolygons } from './vision';
import { d20Test, parseDice, rollDice } from './rules/dice';
import {
  abilityModifier,
  evaluateEncounter,
  exhaustionEffects,
  proficiencyBonusForCr,
  proficiencyBonusForLevel,
  savingThrowBonus,
} from './rules/rules2024';
import { buildPlayerFrame, MAX_FRAME_AGE_MS, parsePlayerFrame, playerLighting } from './projection';
import { litSources, tokensVisibleToPlayers, updateVision } from './vision';
import { createSampleScene } from '../sample/crypt';
import { CreatureSchema, GridSchema, MAP_VERSION, MapSidecarSchema, parseSidecar, resourcePathForSidecar, sidecarPathFor } from './sidecar';

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

describe('grid calibration with an N×N box (E-7, DC-021)', () => {
  it('the dragged box is a square in the direction of the drag', () => {
    expect(squareBox({ x: 10, y: 20 }, { x: 100, y: 50 })).toEqual({ x: 10, y: 20, size: 90 });
    // Dragged up and left: the square ends at the start point.
    expect(squareBox({ x: 100, y: 100 }, { x: 70, y: 40 })).toEqual({ x: 40, y: 40, size: 60 });
  });

  it('cell size and offset follow from a box over N×N cells', () => {
    const g = gridFromBox(DEFAULT_GRID, { x: 13 + 2 * 64, y: 27 + 64, size: 3 * 64 }, 3);
    expect(g.cellWidth).toBeCloseTo(64);
    expect(g.cellHeight).toBeCloseTo(64);
    expect(g.originX).toBeCloseTo(13);
    expect(g.originY).toBeCloseTo(27);
    expect(g.rotationDeg).toBe(0);
    expect(g.feetPerCell).toBe(DEFAULT_GRID.feetPerCell);
  });

  it('a too small box or cell count changes nothing', () => {
    expect(gridFromBox(DEFAULT_GRID, { x: 0, y: 0, size: 0 }, 3)).toBe(DEFAULT_GRID);
    expect(gridFromBox(DEFAULT_GRID, { x: 0, y: 0, size: 90 }, 0)).toBe(DEFAULT_GRID);
  });

  it('shifts the grid, its offset staying within one cell', () => {
    const g = { ...DEFAULT_GRID, cellWidth: 50, cellHeight: 50, originX: 48, originY: 1 };
    expect(shiftGrid(g, 3, -2)).toMatchObject({ originX: 1, originY: 49 });
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
  it('reads a map saved with the removed hex grid as a square grid (E-7)', () => {
    const old = { type: 'hex-flat', cellWidth: 60, cellHeight: 60, originX: 0, originY: 0, rotationDeg: 0, feetPerCell: 5 };
    expect(GridSchema.parse(old).type).toBe('square');
    expect(GridSchema.safeParse({ ...old, type: 'triangle' }).success).toBe(false);
  });
  it('counts diagonals as 5 ft (2024 rules)', () => {
    const g = { ...DEFAULT_GRID, cellWidth: 50, cellHeight: 50 };
    expect(gridDistanceFeet(g, { x: 25, y: 25 }, { x: 175, y: 175 })).toBe(15);
  });
});

describe('polygon fog with token sight', () => {
  const look = { softEdges: true, fadeSeconds: 0.65, quality: 'medium' as const, edge: 1.2, motion: 1, speed: 5, coverFrom: 'middle' as const };
  it('reveals what a token sees, blocked by walls, and remembers it after leaving', () => {
    const o = { x: 50, y: 50 };
    const sight = sightPolygon(o, 300, visibilityPolygon(o, 300, [{ x1: 150, y1: -1000, x2: 150, y2: 1000 }]));
    expect(isInside(sight, [100, 50])).toBe(true);
    expect(isInside(sight, [200, 50])).toBe(false);
    expect(isInside(sight, [50, 360])).toBe(false);
    const fog = rememberSeen(EMPTY_LEVEL_FOG, sight);
    expect(isInside(fog.remembered, [100, 50])).toBe(true);
    // Moved away: memory stays, but nothing is seen now there.
    expect(seenNow(fog, [], { x: 100, y: 50 })).toBe(false);
    expect(isInside(openArea(fog, []), [100, 50])).toBe(true);
  });
  it('DM reveal and hide work on polygons; hide-with-remember turns revealed into memory', () => {
    let fog = revealIn(EMPTY_LEVEL_FOG, rectPolygon(0, 0, 100, 100), []);
    expect(isInside(fog.revealed, [50, 50])).toBe(true);
    fog = hideIn(fog, rectPolygon(0, 0, 50, 100), true);
    expect(isInside(fog.revealed, [25, 50])).toBe(false);
    expect(isInside(fog.remembered, [25, 50])).toBe(true);
    expect(isInside(fog.revealed, [75, 50])).toBe(true);
  });
  it('reveal all leaves undiscovered secret rooms hidden', () => {
    const scene = createSampleScene();
    const locked = lockedAreas(scene.zones);
    expect(locked).toHaveLength(1);
    const fog = revealAll(EMPTY_LEVEL_FOG, scene.map.widthPx, scene.map.heightPx, locked);
    const secret = scene.zones.find((z) => z.secret)!;
    const c = areaBounds(secret.shape);
    expect(isInside(fog.revealed, [c.x + c.w / 2, c.y + c.h / 2])).toBe(false);
    expect(isInside(fog.revealed, [100, 100])).toBe(true);
    // Aimed at on purpose (force), the DM may reveal it.
    expect(isInside(revealIn(EMPTY_LEVEL_FOG, mapPolygon(10, 10), locked, true).revealed, [5, 5])).toBe(true);
  });
  it('keeps the sample hall revealed and sight out of closed rooms', () => {
    const scene = createSampleScene();
    const visible = visiblePolygons(updateVision(scene));
    expect(isInside(scene.fog.revealed, [5 * 70, 12 * 70])).toBe(true);
    // The throne room lies behind a closed door.
    expect(isInside(visible, [18 * 70, 15 * 70])).toBe(false);
  });
  void look;
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
    const visible = visiblePolygons(updateVision(scene));
    const frame = buildPlayerFrame(scene, frameOpts(1, 1000, visible));
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
    const frame = buildPlayerFrame(scene, frameOpts(5, 0, visiblePolygons(updateVision(scene))));
    expect(parsePlayerFrame(frame, MAX_FRAME_AGE_MS + 1, 0)).toEqual({ ok: false, reason: 'stale' });
    expect(parsePlayerFrame(frame, 0, 5)).toEqual({ ok: false, reason: 'out-of-order' });
    expect(parsePlayerFrame({ ...frame, fog: undefined }, 0, 0)).toEqual({ ok: false, reason: 'invalid-frame' });
  });
  it('never sends the secret room: not open, not clear', () => {
    const scene = createSampleScene();
    scene.fog = revealAll(scene.fog, scene.map.widthPx, scene.map.heightPx, lockedAreas(scene.zones));
    const frame = buildPlayerFrame(scene, frameOpts(1, 0, visiblePolygons(updateVision(scene))));
    const secret = scene.zones.find((z) => z.secret)!;
    const c = areaBounds(secret.shape);
    const mid: [number, number] = [c.x + c.w / 2, c.y + c.h / 2];
    expect(isInside(frame.fog.open, mid)).toBe(false);
    expect(isInside(frame.fog.clear, mid)).toBe(false);
  });
});

function frameOpts(seq: number, now: number, visible: ReturnType<typeof visiblePolygons>) {
  return {
    seq, now, showGrid: true, memoryOpacity: 0.6, movementLocked: false, zoom: 1, visible, quick: false, activeTokenId: null, seedKey: 'builtin:crypt', lights: [],
    look: { softEdges: true, fadeSeconds: 0.65, quality: 'medium' as const, edge: 1.2, motion: 1, speed: 5, coverFrom: 'middle' as const },
  };
}

describe('sidecars', () => {
  it('maps resource paths', () => {
    expect(sidecarPathFor('maps/crypt.webp')).toBe('maps/crypt.webp.dm.json');
    expect(resourcePathForSidecar('maps/crypt.webp.dm.json')).toBe('maps/crypt.webp');
    expect(resourcePathForSidecar('maps/crypt.webp')).toBeNull();
  });
  it('validates a map sidecar and reports errors', () => {
    const ok = parseSidecar(MapSidecarSchema, JSON.stringify({ kind: 'map', schemaVersion: MAP_VERSION, name: 'Crypt', resource: 'maps/crypt.webp', widthPx: 2000, heightPx: 1400, grid: DEFAULT_GRID }));
    expect(ok.ok).toBe(true);
    const bad = parseSidecar(CreatureSchema, JSON.stringify({ kind: 'creature', schemaVersion: 1, name: '' }));
    expect(bad.ok).toBe(false);
    expect(parseSidecar(MapSidecarSchema, '{').ok).toBe(false);
  });
});

describe('light and sight (2024)', () => {
  // Empty map without walls: 70 px per 5 ft cell.
  const open = () => {
    const s = createSampleScene();
    s.walls = [];
    s.lights = [];
    s.tokens = [];
    return s;
  };
  const pc = (o: Partial<ReturnType<typeof createSampleScene>['tokens'][number]>) => ({
    id: 'p', name: 'P', label: 'P', kind: 'pc' as const, x: 1000, y: 800, size: 1, ringColor: '#ffffff', visionFt: 0, hp: 10, maxHp: 10, ac: 10, initiative: 10, conditions: [], ...o,
  });
  const ftRight = (ft: number): [number, number] => [1000 + (ft / 5) * 70, 800];

  it('a human without darkvision sees only what light reaches', () => {
    const s = open();
    s.tokens = [pc({ lightFt: 20 })]; // torch: bright 20 ft, dim 40 ft
    const v = visiblePolygons(updateVision(s));
    expect(isInside(v, ftRight(35))).toBe(true);
    expect(isInside(v, ftRight(45))).toBe(false);
  });
  it('darkvision sees darkness within its range', () => {
    const s = open();
    s.tokens = [pc({ visionFt: 60 })];
    const v = visiblePolygons(updateVision(s));
    expect(isInside(v, ftRight(55))).toBe(true);
    expect(isInside(v, ftRight(65))).toBe(false);
  });
  it('a distant lit area in line of sight is visible, monsters there too', () => {
    const s = open();
    s.tokens = [pc({ visionFt: 0 }), { ...pc({}), id: 'm', kind: 'monster' as const, x: ftRight(100)[0], y: 800 }];
    s.lights = [{ id: 'l', x: ftRight(100)[0], y: 800, brightFt: 10, dimFt: 20, color: '#ffaa00', on: true }];
    const v = visiblePolygons(updateVision(s));
    expect(isInside(v, ftRight(100))).toBe(true);
    expect(isInside(v, ftRight(50))).toBe(false);
    expect(tokensVisibleToPlayers(s.tokens, s.fog, v).map((t) => t.id)).toContain('m');
    s.lights[0].on = false;
    expect(isInside(visiblePolygons(updateVision(s)), ftRight(100))).toBe(false);
  });
  it('light does not pass walls', () => {
    const s = open();
    s.tokens = [pc({ visionFt: 0 })];
    s.lights = [{ id: 'l', x: ftRight(30)[0], y: 800, brightFt: 20, dimFt: 40, color: '#ffaa00', on: true }];
    s.walls = [{ id: 'w', kind: 'wall', x1: ftRight(15)[0], y1: 0, x2: ftRight(15)[0], y2: 2000 }];
    const v = visiblePolygons(updateVision(s));
    expect(isInside(v, ftRight(30))).toBe(false);
  });
  it('on a lit map line of sight is enough', () => {
    const s = open();
    s.ambient = 'lit';
    s.tokens = [pc({ visionFt: 0 })];
    expect(isInside(visiblePolygons(updateVision(s)), ftRight(150))).toBe(true);
  });
});

describe('lighting on the TV (fail-closed)', () => {
  it('shows glows only where players see now; a light out of sight gives nothing away', () => {
    const scene = createSampleScene();
    // The braziers are in the throne room, behind a closed door.
    let visible = visiblePolygons(updateVision(scene));
    let lit = playerLighting(scene, litSources(scene), [...scene.fog.revealed, ...visible]);
    const brazierX = new Set(scene.lights.map((l) => l.x));
    // Only Bram's torch in the hall glows; the braziers give nothing away.
    expect(lit.glows).toHaveLength(1);
    expect(lit.glows.some((g) => brazierX.has(g.x))).toBe(false);
    expect(litSources(scene).length).toBe(3);
    scene.walls.find((w) => w.id === 'd-throne')!.open = true;
    visible = visiblePolygons(updateVision(scene));
    lit = playerLighting(scene, litSources(scene), [...scene.fog.revealed, ...visible]);
    expect(lit.darkness).toBeGreaterThan(0);
    expect(lit.glows.some((g) => brazierX.has(g.x))).toBe(true);
    scene.ambient = 'lit';
    expect(playerLighting(scene, litSources(scene), visible)).toEqual({ darkness: 0, lit: [], glows: [] });
  });
});
