/**
 * Sample scene "Crypt of Vhal'Durn" used for the first run and in tests.
 * Pure data: no DOM access, so it works in unit tests.
 */
import { EMPTY_LEVEL_FOG, rectPolygon, revealIn } from '../core/fogModel';
import { DEFAULT_GRID } from '../core/grid';
import { DEFAULT_TABLE, type Scene, type Token, type Wall, type Zone } from '../core/scene';

import { CELL, COLS, ROWS, DOORS, ROOMS, cryptFloor } from './cryptLayout';

export { CELL, COLS, ROWS, cryptFloor };

/** Wall segments along every floor/non-floor edge, merged into long runs. */
export function wallsFromFloor(floor: Uint8Array, cols: number, rows: number, cell: number): Wall[] {
  const isFloor = (x: number, y: number) => x >= 0 && y >= 0 && x < cols && y < rows && floor[y * cols + x] === 1;
  const h = new Map<number, number[]>();
  const v = new Map<number, number[]>();
  const push = (m: Map<number, number[]>, k: number, a: number) => {
    const arr = m.get(k) ?? [];
    arr.push(a);
    m.set(k, arr);
  };
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      if (!isFloor(x, y)) continue;
      if (!isFloor(x, y - 1)) push(h, y, x);
      if (!isFloor(x, y + 1)) push(h, y + 1, x);
      if (!isFloor(x - 1, y)) push(v, x, y);
      if (!isFloor(x + 1, y)) push(v, x + 1, y);
    }
  }
  const walls: Wall[] = [];
  let n = 0;
  const merge = (m: Map<number, number[]>, horizontal: boolean) => {
    for (const [k, list] of m) {
      const a = [...new Set(list)].sort((p, q) => p - q);
      let start = a[0];
      let prev = a[0];
      for (let i = 1; i <= a.length; i++) {
        if (i < a.length && a[i] === prev + 1) {
          prev = a[i];
          continue;
        }
        walls.push(
          horizontal
            ? { id: `w${n++}`, kind: 'wall', x1: start * cell, y1: k * cell, x2: (prev + 1) * cell, y2: k * cell }
            : { id: `w${n++}`, kind: 'wall', x1: k * cell, y1: start * cell, x2: k * cell, y2: (prev + 1) * cell },
        );
        start = prev = a[i];
      }
    }
  };
  merge(h, true);
  merge(v, false);
  return walls;
}

function token(p: Partial<Token> & Pick<Token, 'id' | 'name' | 'label' | 'kind'>, cx: number, cy: number): Token {
  return {
    x: (cx + 0.5) * CELL,
    y: (cy + 0.5) * CELL,
    size: 1,
    ringColor: '#d9d2c0',
    visionFt: 0,
    hp: 10,
    maxHp: 10,
    ac: 10,
    initiative: 10,
    conditions: [],
    ...p,
  };
}

export function createSampleScene(): Scene {
  const floor = cryptFloor();
  const walls = wallsFromFloor(floor, COLS, ROWS, CELL);
  for (const d of DOORS) {
    walls.push({ id: d.id, kind: d.secret ? 'secret-door' : 'door', open: false, x1: d.s[0] * CELL, y1: d.s[1] * CELL, x2: d.s[2] * CELL, y2: d.s[3] * CELL });
  }
  const zones: Zone[] = ROOMS.map((r) => ({
    id: r.id,
    name: r.name,
    kind: r.kind,
    rect: { x: r.r[0] * CELL, y: r.r[1] * CELL, w: r.r[2] * CELL, h: r.r[3] * CELL },
    color: r.color,
    discovered: r.kind !== 'secret',
    biome: r.id === 'crypt' ? 'sumpf' : undefined,
  }));
  // The entrance hall starts revealed.
  const fog = revealIn(EMPTY_LEVEL_FOG, rectPolygon(0, 9 * CELL, 10 * CELL, 16 * CELL), []);

  const tokens: Token[] = [
    token({ id: 'thorin', name: 'Thorin Ironbeard', label: 'TH', kind: 'pc', ringColor: '#e2a03c', visionFt: 120, hp: 44, maxHp: 44, ac: 18, initiative: 14, creatureId: 'thorin-ironbeard' }, 4, 12),
    token({ id: 'lyra', name: 'Lyra Moonfeather', label: 'LY', kind: 'pc', ringColor: '#7fb2d9', visionFt: 60, hp: 26, maxHp: 26, ac: 13, initiative: 19, creatureId: 'lyra-moonfeather' }, 6, 11),
    token({ id: 'bram', name: 'Bram Hollow', label: 'BR', kind: 'pc', ringColor: '#8fd98f', visionFt: 0, lightFt: 20, hp: 31, maxHp: 33, ac: 16, initiative: 8 }, 5, 14),
    token({ id: 'skel1', name: 'Skeleton A', label: 'S1', kind: 'monster', hp: 13, maxHp: 13, ac: 14, initiative: 12 }, 15, 4),
    token({ id: 'skel2', name: 'Skeleton B', label: 'S2', kind: 'monster', hp: 13, maxHp: 13, ac: 14, initiative: 12 }, 18, 6),
    token({ id: 'ghoul', name: 'Ghoul', label: 'GH', kind: 'monster', ringColor: '#b8c27a', hp: 22, maxHp: 22, ac: 12, initiative: 15 }, 20, 15),
    token({ id: 'wight', name: 'Ash Wight', label: 'AW', kind: 'monster', ringColor: '#e2554c', hp: 82, maxHp: 82, ac: 14, initiative: 11, conditions: ['prone'] }, 18, 17),
  ];

  return {
    map: {
      id: 'crypt',
      name: "Crypt of Vhal'Durn",
      imageUrl: null,
      isVideo: false,
      widthPx: COLS * CELL,
      heightPx: ROWS * CELL,
      grid: { ...DEFAULT_GRID, cellWidth: CELL, cellHeight: CELL },
      biome: 'nebel',
      biomeStrength: 1,
    },
    walls,
    zones,
    tokens,
    templates: [],
    pings: [],
    // Two braziers light the throne room.
    lights: [
      { id: 'brazier-w', x: 14.5 * CELL, y: 18.5 * CELL, brightFt: 10, dimFt: 20, color: '#ffb14a', on: true },
      { id: 'brazier-e', x: 22.5 * CELL, y: 18.5 * CELL, brightFt: 10, dimFt: 20, color: '#ffb14a', on: true },
    ],
    ambient: 'dark',
    fog,
    fogEffect: null,
    table: { ...DEFAULT_TABLE, centerX: 9 * CELL, centerY: 12 * CELL },
  };
}
