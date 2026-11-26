import { describe, expect, it } from 'vitest';
import { rectPolygon } from './fogModel';
import { EMPTY_LAYER, diffElements, resolveElements, type MapElements } from './mapLayers';

function base(): MapElements {
  return {
    walls: [
      { id: 'wall-a', kind: 'wall', x1: 0, y1: 0, x2: 100, y2: 0 },
      { id: 'door-b', kind: 'door', x1: 100, y1: 0, x2: 150, y2: 0, open: true },
    ],
    zones: [{ id: 'area-hall', name: 'Hall', shape: [rectPolygon(0, 0, 200, 100)], secret: false, color: '#7fd9cf', biome: 'sumpf' }],
    lights: [{ id: 'light-torch', x: 50, y: 50, brightFt: 20, dimFt: 40, color: '#ffb14a' }],
    sounds: [],
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
      added: { walls: [{ id: 'wall-rubble', kind: 'wall', x1: 0, y1: 50, x2: 100, y2: 50 }], zones: [], lights: [], sounds: [] },
    });
    expect(r.elements.walls.map((w) => w.id)).toEqual(['door-b', 'wall-rubble']);
    expect(r.elements.zones[0]).toEqual({ id: 'area-hall', name: 'Ruined hall', shape: [rectPolygon(0, 0, 200, 100)], secret: false, color: '#7fd9cf' });
    expect(r.elements.lights[0]!.brightFt).toBe(20);
    expect(r.orphaned).toEqual(['wall-gone']);
    expect(r.invalid).toEqual(['light-torch']);
  });

  it('does not change its inputs', () => {
    const b = base();
    const copy = structuredClone(b);
    resolveElements(b, { overrides: { 'wall-a': { x2: 5 } }, added: { walls: [], zones: [], lights: [], sounds: [] } });
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
      zones: [{ id: 'area-hall', name: 'Ruined hall', shape: [rectPolygon(0, 0, 200, 100)], secret: false, color: '#7fd9cf' }],
      lights: [{ id: 'light-torch', x: 50, y: 50, brightFt: 20, dimFt: 40, color: '#ffb14a' }],
      sounds: [],
    };
    const layer = diffElements(b, current);
    expect(layer.overrides).toEqual({ 'wall-a': { hidden: true }, 'area-hall': { name: 'Ruined hall', biome: null } });
    expect(layer.added.walls.map((w) => w.id)).toEqual(['wall-rubble']);
  });

  it('round trip: resolving the diff gives the edited elements back', () => {
    const b = base();
    const edited = resolveElements(b, EMPTY_LAYER).elements;
    edited.walls = edited.walls.filter((w) => w.id !== 'door-b');
    edited.zones[0] = { ...edited.zones[0]!, shape: [rectPolygon(10, 10, 60, 60)] };
    edited.lights.push({ id: 'light-new', x: 1, y: 1, brightFt: 5, dimFt: 10, color: '#ffffff' });
    const again = resolveElements(b, diffElements(b, edited)).elements;
    expect(again).toEqual(edited);
  });

  it('an unchanged scene has no overrides; orphaned ones from before are kept', () => {
    const b = base();
    const same = resolveElements(b, EMPTY_LAYER).elements;
    expect(diffElements(b, same)).toEqual(EMPTY_LAYER);
    const kept = diffElements(b, same, { overrides: { 'wall-gone': { x1: 1 } }, added: { walls: [], zones: [], lights: [], sounds: [] } });
    expect(kept.overrides).toEqual({ 'wall-gone': { x1: 1 } });
  });
});

describe('sound sources as map elements (E-37)', () => {
  const fall = { id: 'sound-fall', sound: 'library/waterfall.ogg', x: 10, y: 20, radiusFt: 30, volume: 0.8, fade: true };
  const withSound = (): MapElements => ({ ...base(), sounds: [fall] });

  it('a scene changes a source\'s volume by an override and adds its own sources', () => {
    const own = { id: 'sound-own', sound: 'builtin:fire', x: 0, y: 0, radiusFt: 10, volume: 1, fade: false };
    const layer = diffElements(withSound(), { ...withSound(), sounds: [{ ...fall, volume: 0.3 }, own] });
    expect(layer.overrides).toEqual({ 'sound-fall': { volume: 0.3 } });
    expect(layer.added.sounds).toEqual([own]);
    expect(resolveElements(withSound(), layer).elements.sounds).toEqual([{ ...fall, volume: 0.3 }, own]);
  });

  it('an override that would make a source invalid is not applied', () => {
    const r = resolveElements(withSound(), { ...EMPTY_LAYER, overrides: { 'sound-fall': { radiusFt: -5 } } });
    expect(r.invalid).toEqual(['sound-fall']);
    expect(r.elements.sounds).toEqual([fall]);
  });
});
