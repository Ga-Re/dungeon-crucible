import { describe, expect, it } from 'vitest';
import { History } from './history';
import { mapSidecarFromScene, mapSidecarPath, manifestFromState, sceneFromDocuments, sceneOverrideFromScene, slugify, tableFromManifest } from './persistence';
import { CampaignManifestSchema, MapSidecarSchema, SceneOverrideSchema } from './sidecar';
import { createSampleScene } from '../sample/crypt';
import { updateVision } from './vision';

describe('persistence', () => {
  it('round-trips a scene through map sidecar and scene override', () => {
    const scene = createSampleScene();
    updateVision(scene);
    scene.walls.find((w) => w.id === 'd-throne')!.open = true;
    scene.tokens[0].hp = 7;
    scene.tokens[0].conditions = ['prone'];
    scene.templates.push({ id: 't1', shape: 'cone', x: 10, y: 20, angle: 1, sizeFt: 15, color: '#e2554c' });

    const map = MapSidecarSchema.parse(JSON.parse(JSON.stringify(mapSidecarFromScene(scene, 'builtin:crypt'))));
    const ov = SceneOverrideSchema.parse(JSON.parse(JSON.stringify(sceneOverrideFromScene(scene, 'Session 3', mapSidecarPath('builtin:crypt'), { round: 2, turn: 3 }))));
    const back = sceneFromDocuments(map, ov, 'builtin:crypt');

    expect(back.walls).toHaveLength(scene.walls.length);
    expect(back.walls.find((w) => w.id === 'd-throne')!.open).toBe(true);
    expect(back.walls.find((w) => w.id === 'd-secret')!.open).toBe(false);
    expect(back.tokens[0]).toMatchObject({ hp: 7, conditions: ['prone'] });
    expect(back.templates).toHaveLength(1);
    expect(back.fog.encode()).toBe(scene.fog.encode());
    expect([...back.fog.locked]).toEqual([...scene.fog.locked]);
    expect(ov.combat).toEqual({ round: 2, turn: 3 });
  });

  it('keeps secret zones locked on a fresh scene', () => {
    const scene = createSampleScene();
    const map = mapSidecarFromScene(scene, 'builtin:crypt');
    const fresh = sceneFromDocuments(map, null, null);
    const secret = fresh.zones.find((z) => z.kind === 'secret')!;
    expect(secret.discovered).toBe(false);
    fresh.fog.revealAll();
    const c = Math.floor((secret.rect.x + 10) / fresh.fog.cellSize);
    const r = Math.floor((secret.rect.y + 10) / fresh.fog.cellSize);
    expect(fresh.fog.isExplored(c, r)).toBe(false);
  });

  it('resets fog when the grid changed since saving', () => {
    const scene = createSampleScene();
    scene.fog.revealAll();
    const ov = sceneOverrideFromScene(scene, 'S', 'm', { round: 1, turn: 0 });
    const map = mapSidecarFromScene(scene, 'builtin:crypt');
    map.grid.cellWidth = 50;
    expect(sceneFromDocuments(map, ov, null).fog.exploredCount()).toBe(0);
  });

  it('stores the table calibration in the campaign manifest', () => {
    const scene = createSampleScene();
    scene.table.ppiCorrection = 1.02;
    const m = CampaignManifestSchema.parse(manifestFromState('Ashes', 'scenes/s3.scene.json', scene.table));
    expect(tableFromManifest(m)).toMatchObject({ ppiCorrection: 1.02, display: { diagonalInches: 55, widthPx: 3840, heightPx: 2160 } });
  });

  it('names files safely', () => {
    expect(slugify("Crypt of Vhal'Durn – Übersicht")).toBe('crypt-of-vhal-durn-ubersicht');
    expect(slugify('***')).toBe('untitled');
    expect(mapSidecarPath('maps/crypt.webp')).toBe('maps/crypt.webp.dm.json');
    expect(mapSidecarPath('builtin:crypt')).toBe('maps/crypt.builtin.dm.json');
  });
});

describe('history', () => {
  it('undoes and redoes', () => {
    const h = new History<number>(3);
    h.push(1);
    h.push(2);
    expect(h.undo(3)).toBe(2);
    expect(h.undo(2)).toBe(1);
    expect(h.undo(1)).toBeNull();
    expect(h.redo(1)).toBe(2);
    h.push(5);
    expect(h.canRedo).toBe(false);
  });
  it('drops the oldest entries beyond the limit', () => {
    const h = new History<number>(2);
    [1, 2, 3].forEach((n) => h.push(n));
    expect(h.undo(4)).toBe(3);
    expect(h.undo(3)).toBe(2);
    expect(h.undo(2)).toBeNull();
  });
});
