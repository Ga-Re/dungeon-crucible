/** The scene of a campaign that has no map yet: nothing to draw until a map is imported. */
import { DEFAULT_GRID } from './grid';
import { EMPTY_LEVEL_FOG } from './poly/fog';
import { DEFAULT_TABLE, type Scene } from './scene';

export function emptyScene(table: Scene['table'] = DEFAULT_TABLE): Scene {
  return {
    map: { id: '', name: '', imageUrl: null, isVideo: false, widthPx: 0, heightPx: 0, grid: { ...DEFAULT_GRID }, biome: 'nebel', biomeStrength: 1 },
    walls: [],
    zones: [],
    tokens: [],
    templates: [],
    pings: [],
    lights: [],
    ambient: 'dark',
    fog: EMPTY_LEVEL_FOG,
    fogEffect: null,
    table: { ...table, blackout: true },
  };
}

/** Whether the scene has a map at all. */
export function hasMap(scene: Pick<Scene, 'map'>): boolean {
  return scene.map.widthPx > 0 && scene.map.heightPx > 0;
}
