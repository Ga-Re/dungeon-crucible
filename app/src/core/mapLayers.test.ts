import { describe, expect, it } from 'vitest';
import { EMPTY_LAYER, diffElements, resolveElements, type MapElements } from './mapLayers';

function base(): MapElements {
  return {
    walls: [
      { id: 'wall-a', kind: 'wall', x1: 0, y1: 0, x2: 100, y2: 0 },
      { id: 'door-b', kind: 'door', x1: 100, y1: 0, x2: 150, y2: 0, open: true },
    ],
    zones: [{ id: 'area-hall', name: 'Hall', kind: 'room', rect: { x: 0, y: 0, w: 200, h: 100 }, color: '#7fd9cf', biome: 'sumpf' }],
    lights: [{ id: 'light-torch', x: 50, y: 50, brightFt: 20, dimFt: 40, color: '#ffb14a' }],
  };
}

describe('resolveElements', () => {
  it('without a layer, the map as it is (state fields left out)', () => {
    const r = resolveElements(base(), EMPTY_LAYER);
    expect(r.elements.walls[1]).toEqual({ id: 'door-b', kind: 'door', x1: 100, y1: 0, x2: 150, y2: 0 });
    expect(r.orphaned).toEqual([]);
  });

  it('hides, changes and adds elements; orphaned and invalid overrides are reported, not applied', () => {
    const r = resolveElements(base(), {
      overrides: {
        'wall-a': { hidden: true },
        'area-hall': { name: 'Ruined hall', biome: null },
        'light-torch': { brightFt: -5 },
        'wall-gone': { hidden: true },
      },
      added: { walls: [{ id: 'wall-rubble', kind: 'wall', x1: 0, y1: 50, x2: 100, y2: 50 }], zones: [], lights: [] },
    });
    expect(r.elements.walls.map((w) => w.id)).toEqual(['door-b', 'wall-rubble']);
    expect(r.elements.zones[0]).toEqual({ id: 'area-hall', name: 'Ruined hall', kind: 'room', rect: { x: 0, y: 0, w: 200, h: 100 }, color: '#7fd9cf' });
    expect(r.elements.lights[0]!.brightFt).toBe(20);
    expect(r.orphaned).toEqual(['wall-gone']);
    expect(r.invalid).toEqual(['light-torch']);
  });

  it('does not change its inputs', () => {
    const b = base();
    const copy = structuredClone(b);
    resolveElements(b, { overrides: { 'wall-a': { x2: 5 } }, added: { walls: [], zones: [], lights: [] } });
    expect(b).toEqual(copy);
  });
});

describe('diffElements', () => {
  it('records what the scene changed: hidden, changed fields, added; state fields do not count', () => {
    const b = base();
    const current: MapElements = {
      walls: [
        { id: 'door-b', kind: 'door', x1: 100, y1: 0, x2: 150, y2: 0, open: false },
        { id: 'wall-rubble', kind: 'wall', x1: 0, y1: 50, x2: 100, y2: 50 },
      ],
      zones: [{ id: 'area-hall', name: 'Ruined hall', kind: 'room', rect: { x: 0, y: 0, w: 200, h: 100 }, color: '#7fd9cf' }],
      lights: [{ id: 'light-torch', x: 50, y: 50, brightFt: 20, dimFt: 40, color: '#ffb14a' }],
    };
    const layer = diffElements(b, current);
    expect(layer.overrides).toEqual({ 'wall-a': { hidden: true }, 'area-hall': { name: 'Ruined hall', biome: null } });
    expect(layer.added.walls.map((w) => w.id)).toEqual(['wall-rubble']);
  });

  it('round trip: resolving the diff gives the edited elements back', () => {
    const b = base();
    const edited = resolveElements(b, EMPTY_LAYER).elements;
    edited.walls = edited.walls.filter((w) => w.id !== 'door-b');
    edited.zones[0] = { ...edited.zones[0]!, rect: { x: 10, y: 10, w: 50, h: 50 } };
    edited.lights.push({ id: 'light-new', x: 1, y: 1, brightFt: 5, dimFt: 10, color: '#ffffff' });
    const again = resolveElements(b, diffElements(b, edited)).elements;
    expect(again).toEqual(edited);
  });

  it('an unchanged scene has no overrides; orphaned ones from before are kept', () => {
    const b = base();
    const same = resolveElements(b, EMPTY_LAYER).elements;
    expect(diffElements(b, same)).toEqual(EMPTY_LAYER);
    const kept = diffElements(b, same, { overrides: { 'wall-gone': { x1: 1 } }, added: { walls: [], zones: [], lights: [] } });
    expect(kept.overrides).toEqual({ 'wall-gone': { x1: 1 } });
  });
});
