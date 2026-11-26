import { describe, expect, it } from 'vitest';
import { contours, generate, generatedElements } from './generate';

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
