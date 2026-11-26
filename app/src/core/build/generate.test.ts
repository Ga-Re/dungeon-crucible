import { describe, expect, it } from 'vitest';
import { contours, generate, generatedElements, generateMap, mapGenElements } from './generate';

const opts = { cols: 40, rows: 30, density: 0.6, seed: 7 };

/** Every open cell reachable from the first: the generated place is walkable end to end. */
function connected(open: Uint8Array, cols: number, rows: number): boolean {
  const first = open.indexOf(1);
  if (first < 0) return false;
  const seen = new Uint8Array(open.length);
  const queue = [first];
  seen[first] = 1;
  let reached = 0;
  while (queue.length) {
    const i = queue.pop()!;
    reached++;
    const x = i % cols;
    const y = Math.floor(i / cols);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx;
      const ny = y + dy;
      const n = ny * cols + nx;
      if (nx >= 0 && ny >= 0 && nx < cols && ny < rows && open[n] && !seen[n]) {
        seen[n] = 1;
        queue.push(n);
      }
    }
  }
  return reached === open.reduce((s, v) => s + v, 0);
}

describe('generated dungeon (DC-119d)', () => {
  it('is deterministic per seed and differs with the seed', () => {
    const a = generate({ ...opts, style: 'dungeon' });
    expect(generate({ ...opts, style: 'dungeon' })).toEqual(a);
    expect(generate({ ...opts, style: 'dungeon', seed: 8 }).open).not.toEqual(a.open);
  });

  it('has rooms joined by corridors: everything open hangs together', () => {
    const g = generate({ ...opts, style: 'dungeon' });
    expect(g.rooms.length).toBeGreaterThan(2);
    expect(connected(g.open, g.cols, g.rows)).toBe(true);
  });

  it('more density means more open floor', () => {
    const little = generate({ ...opts, density: 0.1, style: 'dungeon' }).open.reduce((s, v) => s + v, 0);
    const much = generate({ ...opts, density: 1, style: 'dungeon' }).open.reduce((s, v) => s + v, 0);
    expect(much).toBeGreaterThan(little);
  });

  it('doors sit on open cells at a room edge', () => {
    const g = generate({ ...opts, style: 'dungeon' });
    expect(g.doors.length).toBeGreaterThan(0);
    for (const d of g.doors) {
      expect(g.open[d.y * g.cols + d.x]).toBe(1);
      expect(g.rooms.some((r) => d.x >= r.x - 1 && d.x <= r.x + r.w && d.y >= r.y - 1 && d.y <= r.y + r.h)).toBe(true);
    }
  });
});

describe('generated cave (DC-119d)', () => {
  it('is deterministic, one connected cavern, and denser with more density', () => {
    const g = generate({ ...opts, style: 'cave' });
    expect(generate({ ...opts, style: 'cave' })).toEqual(g);
    expect(connected(g.open, g.cols, g.rows)).toBe(true);
    const little = generate({ ...opts, density: 0.1, style: 'cave' }).open.reduce((s, v) => s + v, 0);
    const much = generate({ ...opts, density: 1, style: 'cave' }).open.reduce((s, v) => s + v, 0);
    expect(much).toBeGreaterThan(little);
  });

  it('keeps a closed border: nothing opens at the region edge', () => {
    const g = generate({ ...opts, style: 'cave' });
    for (let x = 0; x < g.cols; x++) expect(g.open[x] | g.open[(g.rows - 1) * g.cols + x]).toBe(0);
  });
});

describe('contours (DC-119d)', () => {
  it('a single open block gives one closed rectilinear ring around it', () => {
    const open = new Uint8Array(5 * 4);
    for (const [x, y] of [[1, 1], [2, 1], [1, 2], [2, 2]]) open[y * 5 + x] = 1;
    const rings = contours(open, 5, 4);
    expect(rings).toHaveLength(1);
    // Simplified to the 4 corners of the block.
    expect(rings[0]).toHaveLength(4);
    const xs = rings[0].map(([x]) => x);
    const ys = rings[0].map(([, y]) => y);
    expect([Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]).toEqual([1, 1, 3, 3]);
  });

  it('a hole gives its own ring', () => {
    const open = new Uint8Array(6 * 6);
    for (let y = 1; y < 5; y++) for (let x = 1; x < 5; x++) open[y * 6 + x] = 1;
    open[2 * 6 + 2] = 0;
    const rings = contours(open, 6, 6);
    expect(rings).toHaveLength(2);
    expect(rings.some((r) => r.length === 4 && r.every(([x, y]) => x >= 2 && x <= 3 && y >= 2 && y <= 3))).toBe(true);
  });
});

describe('generated elements (DC-119d)', () => {
  it('turns the grid into closed walls, doors on them and a floor of the open shape', () => {
    const g = generate({ ...opts, style: 'dungeon' });
    let n = 0;
    const els = generatedElements(g, { x: 70, y: 140 }, 70, 'dungeon', 7, (p) => `${p}-${n++}`);
    expect(els.walls.length).toBeGreaterThan(0);
    for (const w of els.walls) {
      expect(w.closed).toBe(true);
      expect(w.style).toBe('dungeon-stone');
      expect(w.points.length).toBeGreaterThanOrEqual(4);
    }
    expect(els.doors.length).toBe(g.doors.length);
    for (const d of els.doors) expect(els.walls.some((w) => w.id === d.wall)).toBe(true);
    expect(els.floors).toHaveLength(1);
    expect(els.floors[0].style).toBe('dungeon-stone');
    // Everything lies inside the region (origin + cells).
    for (const w of els.walls) for (const p of w.points) {
      expect(p.x).toBeGreaterThanOrEqual(70 - 1);
      expect(p.x).toBeLessThanOrEqual(70 + g.cols * 70 + 1);
    }
  });

  it('a cave rounds its walls (points off the grid corners) and floors in cave rock', () => {
    const g = generate({ ...opts, style: 'cave' });
    let n = 0;
    const els = generatedElements(g, { x: 0, y: 0 }, 70, 'cave', 7, (p) => `${p}-${n++}`);
    expect(els.walls.every((w) => w.style === 'cave-rock')).toBe(true);
    expect(els.floors[0].style).toBe('cave-rock');
    const offGrid = els.walls[0].points.filter((p) => p.x % 35 !== 0 || p.y % 35 !== 0);
    expect(offGrid.length).toBeGreaterThan(0);
  });
});

describe('whole-map generation (DC-119e)', () => {
  const mopts = { cols: 60, rows: 45, density: 0.6, seed: 11 };

  it('a cave with water gets ponds inside the cavern, away from the walls', () => {
    const g = generateMap({ ...mopts, style: 'cave', water: true, lights: false, details: false });
    const wet = [...g.water].reduce((s, v) => s + v, 0);
    expect(wet).toBeGreaterThan(0);
    for (let y = 0; y < g.rows; y++)
      for (let x = 0; x < g.cols; x++) {
        if (!g.water[y * g.cols + x]) continue;
        expect(g.open[y * g.cols + x]).toBe(1);
        // No pond cell touches a wall cell.
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) expect(g.open[(y + dy) * g.cols + (x + dx)]).toBe(1);
      }
    expect(generateMap({ ...mopts, style: 'cave', water: false, lights: false, details: false }).water.every((v) => v === 0)).toBe(true);
  });

  it('a dungeon with lights gets them in rooms, on floor beside a wall', () => {
    const g = generateMap({ ...mopts, style: 'dungeon', water: false, lights: true, details: false });
    expect(g.lightSpots.length).toBeGreaterThan(0);
    for (const l of g.lightSpots) {
      expect(g.open[l.y * g.cols + l.x]).toBe(1);
      expect(g.rooms.some((r) => l.x >= r.x && l.x < r.x + r.w && l.y >= r.y && l.y < r.y + r.h)).toBe(true);
      expect([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => !g.open[(l.y + dy) * g.cols + (l.x + dx)])).toBe(true);
    }
  });

  it('details scatter on open floor; everything is deterministic', () => {
    const g = generateMap({ ...mopts, style: 'cave', water: true, lights: true, details: true });
    expect(g.detailSpots.length).toBeGreaterThan(0);
    for (const d of g.detailSpots) expect(g.open[d.y * g.cols + d.x]).toBe(1);
    expect(generateMap({ ...mopts, style: 'cave', water: true, lights: true, details: true })).toEqual(g);
  });

  it('mapGenElements adds lakes, light spots in px and detail floor patches', () => {
    const g = generateMap({ ...mopts, style: 'cave', water: true, lights: true, details: true });
    let n = 0;
    const els = mapGenElements(g, 70, 'cave', 11, (p) => `${p}-${n++}`);
    expect(els.waters.length).toBeGreaterThan(0);
    for (const w of els.waters) {
      expect(w.kind).toBe('lake');
      expect(w.closed).toBe(true);
      expect(w.points.length).toBeGreaterThanOrEqual(4);
    }
    expect(els.lights.length).toBe(g.lightSpots.length);
    // The open-shape floor plus one patch per detail spot.
    expect(els.floors.length).toBe(1 + g.detailSpots.length);
    expect(els.floors.slice(1).every((f) => f.style === 'moss')).toBe(true);
  });
});

describe('generated rock (DC-119f)', () => {
  it('outer rings carry rock outside, holes are rock blocks; a reach is passed on', () => {
    const g = generate({ cols: 40, rows: 30, density: 0.6, seed: 7, style: 'cave' });
    let n = 0;
    const els = generatedElements(g, { x: 0, y: 0 }, 70, 'cave', 7, (p) => `${p}-${n++}`, 175);
    const outside = els.walls.filter((w) => w.solid === 'outside');
    expect(outside.length).toBeGreaterThanOrEqual(1);
    expect(outside.every((w) => w.solidReach === 175)).toBe(true);
    expect(els.walls.every((w) => w.solid === 'outside' || w.solid === 'inside')).toBe(true);
    // Without a reach the rock goes to the map's edge.
    n = 0;
    expect(generatedElements(g, { x: 0, y: 0 }, 70, 'cave', 7, (p) => `${p}-${n++}`).walls.some((w) => w.solidReach)).toBe(false);
  });

  it('a pillar in a room is an inside block', () => {
    const open = new Uint8Array(8 * 8);
    for (let y = 1; y < 7; y++) for (let x = 1; x < 7; x++) open[y * 8 + x] = 1;
    open[3 * 8 + 3] = 0;
    open[3 * 8 + 4] = 0;
    let n = 0;
    const els = generatedElements({ cols: 8, rows: 8, open, rooms: [], doors: [] }, { x: 0, y: 0 }, 70, 'dungeon', 1, (p) => `${p}-${n++}`);
    expect(els.walls.map((w) => w.solid).sort()).toEqual(['inside', 'outside']);
  });
});

describe('generated rock in a large cave (DC-119f review)', () => {
  it('holes of a cave come out as rock blocks', () => {
    const g = generate({ cols: 120, rows: 80, density: 0.6, seed: 3, style: 'cave' });
    let n = 0;
    const els = generatedElements(g, { x: 0, y: 0 }, 70, 'cave', 3, (p) => `${p}-${n++}`);
    expect(els.walls.filter((w) => w.solid === 'outside')).toHaveLength(1);
    expect(els.walls.filter((w) => w.solid === 'inside').length).toBeGreaterThan(0);
  });
});
