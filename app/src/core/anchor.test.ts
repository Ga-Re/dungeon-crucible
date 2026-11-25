import { describe, expect, it } from 'vitest';
import { anchorPoint, rotateAboutAnchor, scaleAboutAnchor, snapAnchored } from './anchor';
import { DEFAULT_GRID } from './grid';
import { AssetSidecarSchema } from './sidecar';
import { readDocument } from './documents';

/** The anchor of an asset (E-29, DC-042 step 1). Grid: 100 px cells from (0, 0). */
const grid = { ...DEFAULT_GRID, cellWidth: 100, cellHeight: 100 };
// A torch two cells wide, one high, anchored at the middle of its top edge.
const torch = { sizeCells: { w: 2, h: 1 }, anchor: { x: 1, y: 0, wallSnap: true } };
const at = (x: number, y: number, rotation = 0, scale = 1) => ({ x, y, rotation, scale });
const round = <T extends { x: number; y: number }>(p: T | null): T => ({ ...p!, x: Math.round(p!.x * 1000) / 1000, y: Math.round(p!.y * 1000) / 1000 });

describe('file', () => {
  it('a version 2 asset has no anchor', () => {
    const r = readDocument('asset', AssetSidecarSchema, JSON.stringify({ kind: 'asset', schemaVersion: 2, name: 'Barrel', assetKind: 'prop' }));
    expect(r.ok && r.value).toMatchObject({ schemaVersion: 3 });
    expect(r.ok && r.value.anchor).toBeUndefined();
  });
});

describe('anchor point', () => {
  it('lies where the anchor is on the turned and scaled footprint', () => {
    expect(anchorPoint(at(500, 500), torch, grid)).toEqual({ x: 500, y: 450 });
    // Turned by 90° clockwise: the top edge faces right.
    expect(round(anchorPoint(at(500, 500, 90), torch, grid))).toEqual({ x: 550, y: 500 });
    expect(anchorPoint(at(500, 500, 0, 2), torch, grid)).toEqual({ x: 500, y: 400 });
  });

  it('is the centre without an anchor', () => {
    expect(anchorPoint(at(500, 500), { sizeCells: { w: 2, h: 1 } }, grid)).toEqual({ x: 500, y: 500 });
  });
});

describe('turning and scaling', () => {
  it('turn about the anchor: it stays where it is', () => {
    const before = anchorPoint(at(500, 500), torch, grid);
    const turned = rotateAboutAnchor(at(500, 500), torch, grid, 90);
    expect(turned.rotation).toBe(90);
    expect(round(anchorPoint({ ...turned, scale: 1 }, torch, grid))).toEqual(before);
    expect(round(turned)).toEqual({ x: 450, y: 450, rotation: 90 });
  });

  it('scale about the anchor', () => {
    const scaled = scaleAboutAnchor(at(500, 500), torch, grid, 2);
    expect(scaled).toEqual({ x: 500, y: 550, scale: 2 });
    expect(anchorPoint({ ...scaled, rotation: 0 }, torch, grid)).toEqual({ x: 500, y: 450 });
  });

  it('without an anchor about the centre', () => {
    expect(rotateAboutAnchor(at(500, 500), { sizeCells: { w: 2, h: 1 } }, grid, 90)).toEqual({ x: 500, y: 500, rotation: 90 });
  });
});

describe('snapping the anchor', () => {
  const lantern = { sizeCells: { w: 1, h: 1 }, anchor: { x: 0.5, y: 1, wallSnap: false } };

  it('on the grid: the anchor lands on a corner, an edge middle or a cell centre', () => {
    // Anchor at (437, 512) → (450, 500).
    expect(snapAnchored(at(437, 462), lantern, grid, [])).toEqual({ x: 450, y: 450, rotation: 0 });
  });

  it('on a near wall (within the anchor distance plus half a cell of the centre): the anchor lands on it, the asset turned along it on the side it was dropped', () => {
    const wall = { x1: 0, y1: 300, x2: 1000, y2: 300 };
    // Dropped below the wall: anchor (top middle) at (320, 330) → (320, 300), turned 0.
    expect(round(snapAnchored(at(320, 380), torch, grid, [wall]))).toEqual({ x: 320, y: 350, rotation: 0 });
    // Dropped above it: turned round, the torch hangs above.
    expect(round(snapAnchored(at(320, 220, 0), torch, grid, [wall]))).toEqual({ x: 320, y: 250, rotation: 180 });
  });

  it('along a slanted wall', () => {
    const wall = { x1: 0, y1: 0, x2: 1000, y2: 1000 };
    const r = round(snapAnchored(at(460, 560), torch, grid, [wall]));
    expect(r.rotation).toBe(45);
    // The anchor lies on the wall.
    const a = round(anchorPoint({ ...r, scale: 1 }, torch, grid));
    expect(a.x).toBeCloseTo(a.y, 2);
  });

  it('a wall farther than half a cell beyond the anchor does not pull; an asset without wall snapping ignores walls', () => {
    const wall = { x1: 0, y1: 300, x2: 1000, y2: 300 };
    expect(snapAnchored(at(320, 470), torch, grid, [wall])).toEqual({ x: 300, y: 450, rotation: 0 });
    expect(snapAnchored(at(320, 362), { ...torch, anchor: { ...torch.anchor, wallSnap: false } }, grid, [wall])).toEqual({ x: 300, y: 350, rotation: 0 });
  });
});
