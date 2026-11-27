import { describe, expect, it } from 'vitest';
import { createSampleScene } from '../sample/crypt';
import { rectPolygon } from './fogModel';
import { mapSidecarFromScene, mapSidecarPath, sceneFromDocuments, sceneOverrideFromScene } from './persistence';
import { MapSidecarSchema, SceneOverrideSchema, type MapSidecar } from './sidecar';

const PATH = mapSidecarPath('builtin:crypt');
const fogOver = (x: number) => ({ revealed: [rectPolygon(x, 0, x + 70, 70)], remembered: [] });

/** A map with a storey above (DC-020, E-40). */
function storeyMap(): MapSidecar {
  const forge = createSampleScene();
  forge.walls = [...forge.walls, { id: 'up-wall', kind: 'wall', x1: 0, y1: 0, x2: 70, y2: 0, storey: 'up' }];
  forge.map.storeys = [{ id: 'up', name: 'Upstairs', level: 1, footprint: [] }];
  return MapSidecarSchema.parse(JSON.parse(JSON.stringify(mapSidecarFromScene(forge, 'builtin:crypt'))));
}

describe('storeys (DC-020)', () => {
  it('a view shows one storey: its walls and figures; the others are put aside', () => {
    const map = storeyMap();
    const ground = sceneFromDocuments(map, null, null);
    expect(ground.walls.some((w) => w.id === 'up-wall')).toBe(false);
    expect(ground.inactive.walls.some((w) => w.id === 'up-wall')).toBe(true);
    const up = sceneFromDocuments(map, null, null, undefined, 'scene', 'up');
    expect(up.map.storey).toBe('up');
    expect(up.walls.map((w) => w.id)).toEqual(['up-wall']);
    // An unknown storey shows the map itself.
    expect(sceneFromDocuments(map, null, null, undefined, 'scene', 'gone').map.storey).toBeUndefined();
  });

  it('saving from a storey keeps everything: walls, figures and fog of every storey', () => {
    const map = storeyMap();
    const base = sceneFromDocuments(map, null, null);
    base.tokens = createSampleScene().tokens;
    base.fog = fogOver(0);
    const pc = base.tokens[0];
    const ov0 = SceneOverrideSchema.parse(JSON.parse(JSON.stringify(sceneOverrideFromScene({ ...base, tokens: base.tokens.map((t) => (t.id === pc.id ? { ...t, storey: 'up' } : t)) }, 'S', PATH, { round: 1, turn: 0 }, map))));
    const up = sceneFromDocuments(map, ov0, null, undefined, 'scene', 'up');
    expect(up.tokens.map((t) => t.id)).toEqual([pc.id]);
    expect(up.offStoreyTokens!.length).toBe(base.tokens.length - 1);
    up.fog = fogOver(700);
    const ov = SceneOverrideSchema.parse(JSON.parse(JSON.stringify(sceneOverrideFromScene(up, 'S', PATH, { round: 1, turn: 0 }, map))));
    expect(ov.tokens.length).toBe(base.tokens.length);
    expect(ov.fog).toEqual(fogOver(0));
    expect(ov.storeyFog.up).toEqual(fogOver(700));
    const back = sceneFromDocuments(map, ov, null);
    expect(back.fog).toEqual(fogOver(0));
    expect(back.storeyFogs!.up).toEqual(fogOver(700));
    const saved = MapSidecarSchema.parse(JSON.parse(JSON.stringify(mapSidecarFromScene(up, 'builtin:crypt', 'scene', map))));
    expect(saved.walls.length).toBe(map.walls.length);
  });

  it('the Map Forge paints a storey\'s start fog on it; the map\'s own stays', () => {
    const map = storeyMap();
    const forgeUp = sceneFromDocuments(map, null, null, undefined, 'map', 'up');
    forgeUp.fog = fogOver(140);
    const saved = MapSidecarSchema.parse(JSON.parse(JSON.stringify(mapSidecarFromScene(forgeUp, 'builtin:crypt', 'map', map))));
    expect(saved.storeys[0].startFog).toEqual(fogOver(140));
    expect(saved.startFog).toEqual(map.startFog);
    expect(saved.walls.length).toBe(map.walls.length);
    // A new scene starts the storey with that fog.
    expect(sceneFromDocuments(saved, null, null, undefined, 'scene', 'up').fog).toEqual(fogOver(140));
  });

  it('an element hidden on another storey stays hidden when saved from this one', () => {
    const map = storeyMap();
    const up = sceneFromDocuments(map, null, null, undefined, 'scene', 'up');
    const ov0 = sceneOverrideFromScene({ ...up, hidden: { ...up.hidden, walls: up.walls }, walls: [] }, 'S', PATH, { round: 1, turn: 0 }, map);
    expect(ov0.hidden).toContain('up-wall');
    const ground = sceneFromDocuments(map, SceneOverrideSchema.parse(JSON.parse(JSON.stringify(ov0))), null);
    expect(ground.hidden.walls.some((w) => w.id === 'up-wall')).toBe(false);
    const ov = sceneOverrideFromScene(ground, 'S', PATH, { round: 1, turn: 0 }, map);
    expect(ov.hidden).toContain('up-wall');
  });
});

describe('storeys: kept across views (DC-020 review)', () => {
  it('figures on a storey the map no longer has never show on the map itself, and are kept', () => {
    const map = storeyMap();
    const base = sceneFromDocuments(map, null, null);
    const ov = SceneOverrideSchema.parse(JSON.parse(JSON.stringify(sceneOverrideFromScene({ ...base, tokens: createSampleScene().tokens.map((t, i) => (i === 0 ? { ...t, storey: 'up' } : t)) }, 'S', PATH, { round: 1, turn: 0 }, map))));
    const without = { ...map, storeys: [] };
    const ground = sceneFromDocuments(without, ov, null);
    expect(ground.tokens.some((t) => t.storey === 'up')).toBe(false);
    expect(sceneOverrideFromScene(ground, 'S', PATH, { round: 1, turn: 0 }, without).tokens.length).toBe(ov.tokens.length);
  });
});
