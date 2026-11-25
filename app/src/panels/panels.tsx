import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { sceneIssues, type ElementChange } from '../core/persistence';
import { cellsVisibleOnTable, pixelsPerInch, ppiCorrectionFromMeasurement } from '../core/grid';
import { FOG_BIOMES, type TableRotation, type Wall, type WallKind } from '../core/scene';
import { abilityModifier, ABILITIES, CONDITIONS, evaluateEncounter, proficiencyBonusForCr, proficiencyBonusForLevel, xpForCr, type ChallengeRating } from '../core/rules/rules2024';
import { d20Test } from '../core/rules/dice';
import { playerOfToken } from '../core/party';
import type { InteriorTrigger } from '../core/sidecar';
import { useI18n } from '../i18n/i18n';
import type { MessageKey } from '../i18n/en';
import { TableView, type FrameSource } from '../table/TableView';
import { BIOMES } from '../render/pixi/fog-living';
import { FADE_MAX_SECONDS, FADE_STEP_SECONDS, FOG_EDGE, FOG_MOTION, FOG_QUALITIES, FOG_SPEED, speedOfStep, stepOfSpeed } from '../app/fog-settings';
import { tileCount } from '../render/mapImages';
import { Icon } from '../ui/Icon';
import {
  addCreatureToken, changeHp, discoverZone, emit, initiativeOrder, markDirty, openMapSettings, removeLight, startAreaCommand, removeToken, toggleLight, updateLight, nextTurn, revealZone, roll, rotateTable, selectToken, selectZone,
  openCreatureTab, setElementsLayer, setPlacementInteriorTrigger, cycleAssetVariant, deletePlacedAsset, rotatePlacedAsset, scalePlacedAsset, cleanUpOrphans, currentChanges, resetToMap, toggleHidden, deleteSelectedWalls, flipSelectedCliffs, setWallKind, resetSceneFogEffect, setBiome, setBiomeStrength, setFogLook, setFogMode, setFogOption, toggleDmFog, setTableRotation, state, toggle, toggleBlackout, toggleCondition, updateTable, useStore,
} from '../app/store';
import { openTable, moveTableTo } from '../app/tableOutput';
import { importMapIntoCampaign, newSceneOnMap, switchScene } from '../app/campaign';
import { filterLibraryMaps, mapUsage, openLibraryMap, refreshLibraryMaps, trashLibraryMap, type MapUsage } from '../app/library';
import { CREATURE_DRAG } from './MapView';
import { VaultBrowser } from './VaultPanels';
import { LayerList } from './LayerList';
import { BASE_LAYER } from '../core/layers';
import { BUILTIN_PREFIX, BUILTIN_SFX, masterLevel } from '../app/audio';
import { importAudio, setMaster, setTrackVolume, stopAll, toggleAmbience, trackFileName, triggerSfx } from '../app/soundboard';

/* ---------- Browser ---------- */

export function BrowserPanel() {
  const { t } = useI18n();
  const ws = useStore((s) => s.ws);
  const scene = useStore((s) => s.scene);
  const selZone = useStore((s) => s.selectedZoneId);
  const selTok = useStore((s) => s.selectedTokenId);
  const creatures = useStore((s) => s.creatures);
  const selCreature = useStore((s) => s.selectedCreatureIdx);
  const campaign = useStore((s) => s.campaign);
  const scenes = useStore((s) => s.scenes);
  const scenePath = useStore((s) => s.scenePath);

  if (ws === 'creatures') {
    return (
      <div className="panel-body">
        <ul className="tree">
          {creatures.map((c, i) => (
            <li key={i}>
              <button className={`tn ${i === selCreature ? 'sel' : ''}`} onClick={() => openCreatureTab(c.id)}>
                <span className="swatch" style={{ background: c.token.ringColor, borderRadius: '50%' }} />
                <span className="nm">{c.name}</span>
                <span className="meta">{c.role === 'pc' ? `${t('creature.level')} ${c.classes?.[0]?.level ?? 1}` : `${t('creature.cr')} ${c.cr ?? '–'}`}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    );
  }
  if (ws === 'vault') return <VaultBrowser />;
  if (ws === 'atlas') return <div className="panel-body hint">{t('soon.atlas')}</div>;
  return (
    <div className="panel-body">
      {ws === 'forge' && campaign && <LibraryMaps />}
      {(ws === 'forge' || ws === 'play') && <LayerList />}
      <ul className="tree">
        {campaign && (
          <li>
            <div className="tn"><Icon name="folder" /><span className="nm">{campaign.name}</span><span className="meta">{t('campaign.scenes')}</span></div>
            <ul>
              {scenes.map((p) => (
                <li key={p}>
                  <button className={`tn ${p === scenePath ? 'sel' : ''}`} onClick={() => void switchScene(p)}>
                    <Icon name="map" /><span className="nm">{p.replace(/^scenes\//, '').replace(/\.scene\.json$/, '')}</span>
                  </button>
                </li>
              ))}
            </ul>
          </li>
        )}
        <li>
          {ws === 'forge' ? (
            <button className="tn" title={t('tool.mapSettings')} onDoubleClick={() => openMapSettings()} onKeyDown={(e) => e.key === 'Enter' && openMapSettings()}>
              <Icon name="map" /><span className="nm">{scene.map.name}</span>
            </button>
          ) : (
            <div className="tn"><Icon name="map" /><span className="nm">{scene.map.name}</span></div>
          )}
          <ul>
            {scene.zones.map((z) => (
              <li key={z.id}>
                <button
                  className={`tn ${z.id === selZone ? 'sel' : ''}`}
                  onClick={() => selectZone(z.id)}
                  // Map Forge: double-click or Enter edits the area.
                  onDoubleClick={() => ws === 'forge' && startAreaCommand(z.id)}
                  onKeyDown={(e) => e.key === 'Enter' && ws === 'forge' && startAreaCommand(z.id)}
                >
                  <span className="swatch" style={{ background: z.color }} />
                  <span className="nm">{z.name}</span>
                  {z.secret && !z.discovered && <span className="meta" style={{ color: 'var(--arcane)' }}>{t('area.secret')}</span>}
                </button>
              </li>
            ))}
          </ul>
        </li>
        {ws !== 'forge' && <li>
          <div className="tn"><Icon name="users" /><span className="nm">Tokens</span><span className="meta">{scene.tokens.length}</span></div>
          <ul>
            {scene.tokens.map((k) => (
              <li key={k.id}>
                <button className={`tn ${k.id === selTok ? 'sel' : ''}`} onClick={() => selectToken(k.id)}>
                  <span className="swatch" style={{ background: k.ringColor, borderRadius: '50%' }} />
                  <span className="nm">{k.name}</span>
                  <span className="meta">{k.hp}/{k.maxHp}</span>
                </button>
              </li>
            ))}
          </ul>
        </li>}
      </ul>
      {selZone && <ZoneActions id={selZone} />}
      {ws !== 'forge' && <SceneChanges />}
      {ws !== 'forge' && <>
      <div className="sec" style={{ marginTop: 12 }}>{t('browser.creatures')}</div>
      <ul className="tree">
        {creatures.map((c, i) => (
          <li key={i}>
            <div className="tn" draggable onDragStart={(e) => { e.dataTransfer.setData(CREATURE_DRAG, String(i)); e.dataTransfer.effectAllowed = 'copy'; }} style={{ cursor: 'grab' }}>
              <span className="swatch" style={{ background: c.token.ringColor, borderRadius: '50%' }} />
              <span className="nm">{c.name}</span>
              <span className="meta">{c.role === 'pc' ? t('init.pc') : `${t('creature.cr')} ${c.cr ?? '–'}`}</span>
              <button className="ab-btn" title={t('creature.addToMap')} onClick={() => addCreatureToken(i)}><Icon name="plus" /></button>
            </div>
          </li>
        ))}
      </ul>
      </>}
    </div>
  );
}

/** Map Forge: the maps of the global library, searchable; open one, or move it to the trash. */
function LibraryMaps() {
  const { t } = useI18n();
  const maps = useStore((s) => s.libraryMaps);
  const current = useStore((s) => s.mapResource);
  const sceneVersion = useStore((s) => s.sceneVersion);
  // After a save the catalog data (name, tags …) may have changed.
  const savedAt = useStore((s) => s.lastSavedAt);
  const [query, setQuery] = useState('');
  const [confirm, setConfirm] = useState<{ resource: string; usage: MapUsage[] } | null>(null);
  // The context menu of a map (E-30): a click opens the map on its own; a scene is made on request.
  const [ctx, setCtx] = useState<string | null>(null);
  useEffect(() => {
    void refreshLibraryMaps();
  }, [sceneVersion, savedAt]);
  const shown = filterLibraryMaps(maps, query);
  return (
    <div className="library">
      <div className="sec">{t('library.maps')}</div>
      <div className="library-tools">
        <input type="search" value={query} placeholder={t('library.search')} aria-label={t('library.search')} onChange={(e) => setQuery(e.target.value)} />
        <button className="ab-btn" title={t('tool.importMap')} aria-label={t('tool.importMap')} onClick={() => void importMapIntoCampaign()}><Icon name="import" /></button>
      </div>
      {maps.length === 0 ? (
        <p className="hint">{t('library.empty')}</p>
      ) : shown.length === 0 ? (
        <p className="hint">{t('library.noMatch')}</p>
      ) : (
        <ul className="tree">
          {shown.map((m) => (
            <li key={m.resource}>
              <div className={`tn ${m.resource === current ? 'sel' : ''}`}>
                <button className="library-open" title={m.resource} onClick={() => void openLibraryMap(m.resource)} onContextMenu={(e) => { e.preventDefault(); setCtx(ctx === m.resource ? null : m.resource); }}>
                  <Icon name={m.isVideo ? 'play' : 'map'} />
                  <span className="nm">{m.name}</span>
                  {m.tags.length > 0 && <span className="meta">{m.tags.join(', ')}</span>}
                </button>
                <button className="ab-btn" title={t('library.trash')} aria-label={`${t('library.trash')}: ${m.name}`} onClick={() => void mapUsage(m.resource).then((usage) => setConfirm({ resource: m.resource, usage }))}><Icon name="trash" /></button>
              </div>
              {ctx === m.resource && (
                <div className="library-confirm" role="menu">
                  <div className="library-buttons">
                    <button className="btn sm" role="menuitem" onClick={() => { setCtx(null); void newSceneOnMap(m.resource); }}><Icon name="plus" />{t('tabs.newScene')}</button>
                    <button className="btn sm" onClick={() => setCtx(null)}>{t('start.cancel')}</button>
                  </div>
                </div>
              )}
              {confirm?.resource === m.resource && (
                <div className="library-confirm" role="alert">
                  {confirm.usage.length > 0 ? (
                    <>
                      <p>{t('library.usedBy', { n: confirm.usage.length })}</p>
                      <ul>{confirm.usage.slice(0, 6).map((u, i) => <li key={i}>{u.campaign} · {u.scene}</li>)}</ul>
                      <p className="hint">{t('library.usedHint')}</p>
                    </>
                  ) : (
                    <p>{t('library.unused')}</p>
                  )}
                  <div className="library-buttons">
                    <button className="btn sm danger" onClick={() => void trashLibraryMap(m.resource).then(() => setConfirm(null))}>{t('library.trashConfirm')}</button>
                    <button className="btn sm" onClick={() => setConfirm(null)}>{t('start.cancel')}</button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ZoneActions({ id }: { id: string }) {
  const { t } = useI18n();
  const z = state.scene.zones.find((q) => q.id === id);
  if (!z) return null;
  return (
    <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
      {z.secret && !z.discovered ? (
        <button className="btn sm" onClick={() => discoverZone(id)}><Icon name="eye" />{t('tool.revealRoom')}</button>
      ) : (
        <button className="btn sm" onClick={() => revealZone(id)}><Icon name="room" />{t('tool.revealRoom')}</button>
      )}
    </div>
  );
}

/**
 * The scene's changes of the map (DC-103): hidden, changed and scene-own elements with "show
 * again" / "reset to map", and the changes that no longer fit the map, with "clean up".
 */
function SceneChanges() {
  const { t } = useI18n();
  const changes = useStore(() => currentChanges());
  const scene = useStore((s) => s.scene);
  const mapDoc = useStore((s) => s.mapDoc);
  const sceneDoc = useStore((s) => s.sceneDoc);
  const assetInfo = useStore((s) => s.assetInfo);
  const [confirm, setConfirm] = useState(false);
  const issues = useMemo(() => (mapDoc && sceneDoc ? sceneIssues(mapDoc, sceneDoc) : { orphaned: [], invalid: [] }), [mapDoc, sceneDoc]);
  const stale = [...issues.orphaned, ...issues.invalid];
  if (changes.length === 0 && stale.length === 0) return null;
  const nameOf = (c: ElementChange): string => {
    if (c.kind === 'zones') return [...scene.zones, ...scene.hidden.zones].find((z) => z.id === c.id)?.name ?? c.id;
    if (c.kind === 'lights') return t('changes.light');
    if (c.kind === 'assets') {
      const a = [...scene.map.assets, ...scene.ownAssets, ...scene.hidden.assets].find((x) => x.id === c.id);
      return (a && assetInfo[a.assetPath]?.name) ?? t('panel.asset');
    }
    const w = [...scene.walls, ...scene.hidden.walls].find((x) => x.id === c.id);
    return w ? t(`wall.kind.${w.kind}` as MessageKey) : c.id;
  };
  return (
    <>
      <div className="sec" style={{ marginTop: 12 }}>{t('changes.title')}</div>
      <ul className="tree">
        {changes.map((c) => (
          <li key={c.id}>
            <div className="tn">
              <Icon name={c.kind === 'walls' ? 'wall' : c.kind === 'zones' ? 'zone' : c.kind === 'assets' ? 'box' : 'light'} />
              <span className="nm">{nameOf(c)}</span>
              <span className="meta">{t(`changes.${c.status}` as MessageKey)}</span>
              {c.status === 'hidden' && <button className="ab-btn" title={t('changes.show')} aria-label={`${t('changes.show')}: ${nameOf(c)}`} onClick={() => toggleHidden(c.id)}><Icon name="eye" /></button>}
              {c.status === 'changed' && <button className="ab-btn" title={t('changes.reset')} aria-label={`${t('changes.reset')}: ${nameOf(c)}`} onClick={() => resetToMap(c.id)}><Icon name="reset" /></button>}
            </div>
          </li>
        ))}
      </ul>
      {stale.length > 0 && (
        <div className="library-confirm" role="status">
          <p>{t('changes.orphaned', { n: stale.length })}</p>
          <p className="hint">{t('changes.orphanedHint')}</p>
          <p className="hint mono">{stale.join(', ')}</p>
          {confirm ? (
            <>
              <p>{t('changes.cleanUpConfirm', { n: stale.length })}</p>
              <div className="library-buttons">
                <button className="btn sm danger" onClick={() => { cleanUpOrphans(); setConfirm(false); }}>{t('changes.cleanUp')}</button>
                <button className="btn sm" onClick={() => setConfirm(false)}>{t('start.cancel')}</button>
              </div>
            </>
          ) : (
            <div className="library-buttons"><button className="btn sm" onClick={() => setConfirm(true)}><Icon name="trash" />{t('changes.cleanUp')}</button></div>
          )}
        </div>
      )}
    </>
  );
}

/* ---------- Properties (Map Forge) ---------- */

export function PropertiesPanel() {
  const { t } = useI18n();
  const map = useStore((s) => s.scene.map);
  const selZone = useStore((s) => s.selectedZoneId);
  const file = useStore((s) => s.mapFileName);
  const ambient = useStore((s) => s.scene.ambient);
  const selLight = useStore((s) => s.selectedLightId);
  const light = useStore((s) => s.scene.lights.find((l) => l.id === selLight));
  const zone = state.scene.zones.find((z) => z.id === selZone);
  const selWalls = useStore((s) => s.selectedWallIds);
  const placedAsset = useStore((s) => s.selectedAssetId);
  const allWalls = useStore((s) => s.scene.walls);
  const walls = allWalls.filter((w) => selWalls.includes(w.id));
  return (
    <div className="panel-body">
      <div className="sec">{t('panel.map')}</div>
      <div className="row"><label>{t('props.name')}</label><span>{map.name}</span></div>
      <div className="row"><label>{t('mapSettings.type')}</label><span>{t(`mapType.${map.mapType}` as MessageKey)}{map.region ? ` · ${map.region}` : ''}</span></div>
      {map.tags.length > 0 && <div className="row"><label>{t('props.tags')}</label><span className="prop-tags">{map.tags.map((tag) => <span key={tag} className="chip">{tag}</span>)}</span></div>}
      <div className="row"><label>{t('props.file')}</label><span className="mono hint">{file}</span></div>
      <div className="row"><label htmlFor="p-cell">{t('props.cellSize')}</label>
        <input id="p-cell" type="number" min={10} step={0.5} value={Number(map.grid.cellWidth.toFixed(2))} onChange={(e) => { const v = Number(e.target.value); if (v >= 10) { map.grid = { ...map.grid, cellWidth: v, cellHeight: v }; emit(); } }} />
      </div>
      <div className="row"><label htmlFor="p-ft">{t('props.feetPerCell')}</label>
        <input id="p-ft" type="number" min={1} value={map.grid.feetPerCell} onChange={(e) => { const v = Number(e.target.value); if (v > 0) { map.grid = { ...map.grid, feetPerCell: v }; emit(); } }} />
      </div>
      {map.widthPx > 0 && <div className="row"><label /><span className="hint mono">{map.widthPx}×{map.heightPx} px · {tileCount(map.widthPx, map.heightPx)} GPU tiles</span></div>}
      <div className="row"><label>{t('map.ambient')}</label><span>{t(ambient === 'lit' ? 'ambient.lit' : 'ambient.dark')}</span></div>
      <button className="btn sm" onClick={() => openMapSettings()}><Icon name="sliders" />{t('tool.mapSettings')} …</button>
      {light && (
        <>
          <div className="sec">{t('light.title')}</div>
          <div className="row"><label htmlFor="l-b">{t('light.bright')}</label><input id="l-b" type="number" min={0} step={5} value={light.brightFt} onChange={(e) => updateLight(light.id, { brightFt: Math.max(0, Number(e.target.value)) })} /></div>
          <div className="row"><label htmlFor="l-d">{t('light.dim')}</label><input id="l-d" type="number" min={0} step={5} value={light.dimFt} onChange={(e) => updateLight(light.id, { dimFt: Math.max(0, Number(e.target.value)) })} /></div>
          <div className="row"><label htmlFor="l-c">{t('light.color')}</label><input id="l-c" type="color" value={light.color} onChange={(e) => updateLight(light.id, { color: e.target.value })} /></div>
          <div className="row"><label>{t('light.on')}</label><input type="checkbox" checked={light.on} onChange={() => toggleLight(light.id)} /></div>
          <LayerRow ids={[light.id]} />
          <button className="btn sm danger" onClick={() => removeLight(light.id)}><Icon name="trash" />{t('light.remove')}</button>
        </>
      )}
      <div className="sec">{t('props.selection')}</div>
      {placedAsset ? (
        <PlacedAssetProperties id={placedAsset} />
      ) : walls.length > 0 ? (
        <WallProperties walls={walls} />
      ) : zone ? (
        <>
          <div className="row"><label>{t('props.name')}</label><span><span className="swatch" style={{ background: zone.color }} /> {zone.name}</span></div>
          <div className="row"><label>{t('area.cmd.biome')}</label><span>{zone.biome ? t(`biome.${zone.biome}` as MessageKey) : t('area.cmd.biomeMap')}{zone.secret ? ` · ${t('area.secret')}` : ''}</span></div>
          <LayerRow ids={[zone.id]} />
          <button className="btn sm" onClick={() => startAreaCommand(zone.id)}><Icon name="zone" />{t('area.edit')} …</button>
        </>
      ) : <p className="hint">{t('props.noSelection')}</p>}
    </div>
  );
}

/** The selected walls (Map Forge, DC-014): their kind, the length of a single one, delete. */
function WallProperties({ walls }: { walls: readonly Wall[] }) {
  const { t } = useI18n();
  const grid = useStore((s) => s.scene.map.grid);
  const kinds = new Set(walls.map((w) => w.kind));
  const kind = kinds.size === 1 ? walls[0].kind : '';
  const one = walls.length === 1 ? walls[0] : null;
  return (
    <>
      <div className="row"><label>{t('wall.title')}</label><span>{t('wall.selected', { n: walls.length })}</span></div>
      <div className="row"><label htmlFor="w-kind">{t('wall.cmd.kind')}</label>
        <select id="w-kind" value={kind} onChange={(e) => e.target.value && setWallKind(e.target.value as WallKind)}>
          {kind === '' && <option value="">–</option>}
          {WALL_KINDS.map((k) => <option key={k} value={k}>{t(`wall.kind.${k}` as MessageKey)}</option>)}
        </select>
      </div>
      {one && <div className="row"><label>{t('wall.length')}</label><span className="mono">{Math.round((Math.hypot(one.x2 - one.x1, one.y2 - one.y1) / grid.cellWidth) * grid.feetPerCell * 10) / 10} ft</span></div>}
      {kinds.has('cliff') && <button className="btn sm" onClick={flipSelectedCliffs}><Icon name="redo" />{t('wall.flip')}</button>}
      <LayerRow ids={walls.map((w) => w.id)} />
      <p className="hint">{t('wall.editHint')}</p>
      <button className="btn sm danger" onClick={deleteSelectedWalls}><Icon name="trash" />{t('wall.delete')}</button>
    </>
  );
}

/** The placed asset selected in the Map Forge (DC-041): its turn, scale, variant; remove it. */
function PlacedAssetProperties({ id }: { id: string }) {
  const { t } = useI18n();
  const a = useStore((s) => [...s.scene.map.assets, ...s.scene.ownAssets].find((x) => x.id === id));
  const info = useStore((s) => (a ? s.assetInfo[a.assetPath] : undefined));
  const hasVariants = useStore((s) => !!info?.group && Object.values(s.assetInfo).filter((i) => i.group === info.group).length > 1);
  if (!a) return null;
  return (
    <>
      <div className="row"><label>{t('placed.title')}</label><span>{info?.name ?? a.assetPath}</span></div>
      {!info && <p className="hint">{t('placed.missing')}</p>}
      <NumberRow id="pa-rot" label={t('placed.rotation')} value={a.rotation} step={15} onCommit={(v) => rotatePlacedAsset(id, v - a.rotation)} />
      <NumberRow id="pa-scale" label={t('placed.scale')} value={a.scale} step={0.25} min={0.25} max={8} onCommit={(v) => v > 0 && scalePlacedAsset(id, v / a.scale)} />
      <LayerRow ids={[id]} />
      {info?.interior && <PlacedInteriorTrigger id={id} own={a.interiorTrigger} fromAsset={info.interior.trigger} />}
      {hasVariants && <button className="btn sm" onClick={() => cycleAssetVariant(id)}><Icon name="next" />{t('placed.variant')}</button>}
      <button className="btn sm danger" onClick={() => deletePlacedAsset(id)}><Icon name="trash" />{t('placed.remove')}</button>
      <p className="hint">{t('picker.hint')}</p>
    </>
  );
}

/** A placed house's interior trigger (E-29): the asset's, or its own. */
function PlacedInteriorTrigger({ id, own, fromAsset }: { id: string; own: InteriorTrigger | undefined; fromAsset: InteriorTrigger }) {
  const { t } = useI18n();
  const tr = own ?? fromAsset;
  const set = (patch: Partial<InteriorTrigger>) => setPlacementInteriorTrigger(id, { ...tr, ...patch });
  return (
    <>
      <div className="row"><label htmlFor="pa-int">{t('editor.trigger.mode')}</label>
        <select id="pa-int" value={own ? own.mode : 'asset'} onChange={(e) => (e.target.value === 'asset' ? setPlacementInteriorTrigger(id, undefined) : set({ mode: e.target.value as InteriorTrigger['mode'] }))}>
          <option value="asset">{t('interior.asAsset', { mode: t(`interior.mode.${fromAsset.mode}`) })}</option>
          <option value="click">{t('interior.mode.click')}</option>
          <option value="enter">{t('interior.mode.enter')}</option>
          <option value="near">{t('interior.mode.near')}</option>
        </select>
      </div>
      {own && own.mode === 'near' && <NumberRow id="pa-near" label={t('interior.nearFt')} value={own.nearFt} step={5} min={0} onCommit={(v) => v >= 0 && set({ nearFt: v })} />}
      {own && own.mode !== 'click' && (
        <>
          <label className="cmd-check"><input type="checkbox" checked={own.confirm} onChange={(e) => set({ confirm: e.target.checked })} />{t('interior.confirm')}</label>
          <label className="cmd-check"><input type="checkbox" checked={own.leaveOff} onChange={(e) => set({ leaveOff: e.target.checked })} />{t('interior.leaveOff')}</label>
        </>
      )}
    </>
  );
}

/** A number taken on Enter or when leaving the field (one undo step; an empty field changes nothing). */
function NumberRow({ id, label, value, step, min, max, onCommit }: { id: string; label: string; value: number; step: number; min?: number; max?: number; onCommit: (v: number) => void }) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  const commit = () => {
    const v = Number(draft);
    if (draft.trim() === '' || !Number.isFinite(v) || v === value) setDraft(String(value));
    else onCommit(v);
  };
  return (
    <div className="row"><label htmlFor={id}>{label}</label>
      <input id={id} type="number" step={step} min={min} max={max} value={draft} onChange={(e) => setDraft(e.target.value)} onBlur={commit} onKeyDown={(e) => e.key === 'Enter' && commit()} />
    </div>
  );
}

/** The layer of the selected map elements, to move them to another (Map Forge, E-28). */
function LayerRow({ ids }: { ids: readonly string[] }) {
  const { t } = useI18n();
  const layers = useStore((s) => s.scene.map.layers);
  const current = useStore((s) => {
    const sc = s.scene;
    const of = new Set([...sc.walls, ...sc.zones, ...sc.lights, ...sc.map.assets].filter((x) => ids.includes(x.id)).map((x) => x.layer ?? BASE_LAYER));
    return of.size === 1 ? [...of][0] : '';
  });
  if (layers.length === 0) return null;
  return (
    <div className="row"><label htmlFor="p-layer">{t('props.layer')}</label>
      <select id="p-layer" value={current} onChange={(e) => e.target.value && setElementsLayer(ids, e.target.value)}>
        {current === '' && <option value="">{t('layers.mixed')}</option>}
        {[...layers].sort((a, b) => b.height - a.height).map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
        <option value={BASE_LAYER}>{t('layers.base')}</option>
      </select>
    </div>
  );
}

const WALL_KINDS: readonly WallKind[] = ['wall', 'door', 'secret-door', 'window', 'cliff'];

/* ---------- Fog ---------- */

/** Swatches in each biome's colours (Dungeon-Manager's `BIOMES`). */
function biomeSwatch(b: string): string {
  const c = BIOMES[b]?.colours ?? ['#2a3238', '#66737c', '#b9c5cc'];
  return `linear-gradient(180deg, ${c[0]}, ${c[1]} 60%, ${c[2]})`;
}

export function FogPanel() {
  const { t } = useI18n();
  const look = useStore((s) => s.fogLook);
  const mem = useStore((s) => s.memoryOpacity);
  const brush = useStore((s) => s.brushCells);
  const dmSee = useStore((s) => s.dmSeeThrough);
  const roofsSee = useStore((s) => s.roofsSeeThrough);
  const dmHidden = useStore((s) => s.dmFogHidden);
  const mode = useStore((s) => s.fogMode);
  const ws = useStore((s) => s.ws);
  const map = useStore((s) => s.scene.map);
  const effect = useStore((s) => s.scene.fogEffect);
  const biome = effect?.biome ?? map.biome;
  const strength = effect?.strength ?? map.biomeStrength;
  const step = stepOfSpeed(look.speed);
  const living = look.quality !== 'off';
  return (
    <div className="panel-body">
      <div className="sec">{t('fog.mode')}</div>
      <div className="seg">
        <button className={mode === 'reveal' ? 'on' : ''} onClick={() => setFogMode('reveal')}>{t('fog.reveal')}</button>
        <button className={mode === 'hide' ? 'on' : ''} onClick={() => setFogMode('hide')}>{t('fog.hide')}</button>
      </div>
      <p className="hint">{t('fog.altInverts')}</p>

      <div className="sec">{t('fog.biome')}{ws === 'play' && effect ? ` · ${t('fog.sceneOverride')}` : ''}</div>
      <div className="biomes">
        {FOG_BIOMES.map((b) => (
          <button key={b} className={`biome ${b === biome ? 'on' : ''}`} onClick={() => setBiome(b)}>
            <i style={{ background: biomeSwatch(b) }} />{t(`biome.${b}`)}
          </button>
        ))}
      </div>
      <div className="row" style={{ marginTop: 8 }}><label htmlFor="f-str">{t('fog.strength')}</label><input id="f-str" type="range" min={0} max={1} step={0.05} value={strength} onChange={(e) => setBiomeStrength(Number(e.target.value))} /></div>
      {ws === 'play' && effect && <button className="btn sm" onClick={resetSceneFogEffect}>{t('fog.resetScene')}</button>}

      <div className="sec">{t('fog.spread')}</div>
      <div className="row"><label htmlFor="f-speed">{t('fog.speed')}</label>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <input id="f-speed" type="range" min={0} max={FOG_SPEED.steps} step={1} value={step} onChange={(e) => setFogLook({ speed: speedOfStep(Number(e.target.value)) })} style={{ flex: 1 }} />
          <span className="mono hint" style={{ minWidth: 54 }}>{Number.isFinite(look.speed) ? `${look.speed} ${t('fog.cellsPerSecond')}` : t('fog.instant')}</span>
        </div>
      </div>
      <div className="row"><label htmlFor="f-fade">{t('fog.transition')}</label>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <input id="f-fade" type="range" min={0} max={FADE_MAX_SECONDS} step={FADE_STEP_SECONDS} value={look.fadeSeconds} onChange={(e) => setFogLook({ fadeSeconds: Number(e.target.value) })} style={{ flex: 1 }} />
          <span className="mono hint" style={{ minWidth: 54 }}>{look.fadeSeconds.toFixed(2)} s</span>
        </div>
      </div>
      <div className="row"><label>{t('fog.coverFrom')}</label>
        <div className="seg">
          <button className={look.coverFrom === 'middle' ? 'on' : ''} onClick={() => setFogLook({ coverFrom: 'middle' })}>{t('fog.middle')}</button>
          <button className={look.coverFrom === 'random' ? 'on' : ''} onClick={() => setFogLook({ coverFrom: 'random' })}>{t('fog.random')}</button>
        </div>
      </div>

      <div className="sec">{t('fog.animation')}</div>
      <div className="row"><label>{t('fog.quality')}</label>
        <div className="seg">
          {FOG_QUALITIES.map((q) => <button key={q} className={look.quality === q ? 'on' : ''} onClick={() => setFogLook({ quality: q })}>{t(`fog.quality.${q}`)}</button>)}
        </div>
      </div>
      <div className="row"><label htmlFor="f-edge">{t('fog.edge')}</label><input id="f-edge" type="range" min={0} max={FOG_EDGE.max} step={FOG_EDGE.step} value={look.edge} disabled={!living} onChange={(e) => setFogLook({ edge: Number(e.target.value) })} /></div>
      <div className="row"><label htmlFor="f-motion">{t('fog.motion')}</label><input id="f-motion" type="range" min={0} max={FOG_MOTION.max} step={FOG_MOTION.step} value={look.motion} disabled={!living} onChange={(e) => setFogLook({ motion: Number(e.target.value) })} /></div>
      <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}><input type="checkbox" checked={look.softEdges} disabled={living} onChange={(e) => setFogLook({ softEdges: e.target.checked })} />{t('fog.softEdges')}</label>
      {living && <p className="hint">{t('fog.softEdgesLiving')}</p>}

      <div className="sec">{t('fog.dmView')}</div>
      <div className="row"><label htmlFor="f-mem">{t('fog.memoryOpacity')}</label><input id="f-mem" type="range" min={0.2} max={0.95} step={0.05} value={mem} onChange={(e) => setFogOption('memoryOpacity', Number(e.target.value))} /></div>
      <div className="row"><label htmlFor="f-brush">{t('fog.brushSize')}</label><input id="f-brush" type="range" min={0.5} max={6} step={0.5} value={brush} onChange={(e) => setFogOption('brushCells', Number(e.target.value))} /></div>
      <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}><input type="checkbox" checked={dmSee} onChange={() => toggle('dmSeeThrough')} />{t('fog.dmSeeThrough')}</label>
      <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}><input type="checkbox" checked={roofsSee} onChange={() => toggle('roofsSeeThrough')} />{t('fog.roofsSeeThrough')}</label>
      <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}><input type="checkbox" checked={dmHidden} onChange={toggleDmFog} />{t('fog.hideInDm')}</label>
    </div>
  );
}

/* ---------- Initiative ---------- */

export function InitiativePanel() {
  const { t } = useI18n();
  const round = useStore((s) => s.round);
  const turn = useStore((s) => s.turn);
  const sel = useStore((s) => s.selectedTokenId);
  const lock = useStore((s) => s.moveLock);
  const players = useStore((s) => s.players);
  const [amount, setAmount] = useState(5);
  const [condFor, setCondFor] = useState<string | null>(null);
  const order = initiativeOrder();
  return (
    <div className="panel-body">
      <div className="init-head">
        <b>{t('init.round', { n: round })}</b>
        <span className="hint">{t('init.turn', { i: turn + 1, n: order.length })}</span>
        <span style={{ flex: 1 }} />
        <button className="btn sm pri" onClick={nextTurn}><Icon name="next" />{t('init.next')}</button>
      </div>
      {order.map((k, i) => {
        const p = Math.max(0, Math.min(1, k.hp / k.maxHp));
        const open = k.id === sel;
        return (
          <div key={k.id} className={`ini ${i === turn ? 'cur' : ''} ${open ? 'sel' : ''} ${k.hp <= 0 ? 'down' : ''}`} onClick={() => selectToken(k.id)}>
            <div className="iv">{k.initiative}</div>
            <div className="nm"><span>{k.name}</span>{playerOfToken(players, k) && <span className="player">{playerOfToken(players, k)!.name}</span>}<span className={`tag ${k.kind !== 'pc' ? 'm' : ''}`}>{k.kind === 'pc' ? t('init.pc') : t('init.monster')}</span>{k.kind === 'pc' && lock && <Icon name="lock" />}</div>
            <div className="ac"><Icon name="shield" /><b>{k.ac}</b></div>
            <div className="sub"><span className="hp">{k.hp}/{k.maxHp}</span><div className="hpbar"><i style={{ width: `${p * 100}%`, background: p > 0.5 ? 'var(--ok)' : p > 0.25 ? 'var(--warn)' : 'var(--crit)' }} /></div></div>
            <div className="extra" onClick={(e) => e.stopPropagation()}>
              {k.conditions.map((c) => (
                <span key={c} className="chip cond">{t(`cond.${c}`)}{c === 'exhaustion' ? ` ${k.exhaustion ?? 1}` : ''}<button aria-label="remove" onClick={() => toggleCondition(k.id, c)}>×</button></span>
              ))}
              <button className="chip" onClick={() => setCondFor(condFor === k.id ? null : k.id)}>{t('init.addCondition')}</button>
              {open && (
                <>
                  <button className="btn sm" aria-label="damage" onClick={() => changeHp(k.id, -amount)}><Icon name="minus" /></button>
                  <input type="number" min={0} value={amount} aria-label={t('init.damageHeal')} onChange={(e) => setAmount(Math.max(0, Number(e.target.value)))} />
                  <button className="btn sm" aria-label="heal" onClick={() => changeHp(k.id, amount)}><Icon name="plus" /></button>
                  <button className="btn sm danger" title={t('token.remove')} aria-label={t('token.remove')} onClick={() => removeToken(k.id)}><Icon name="trash" /></button>
                </>
              )}
              {condFor === k.id && (
                <div className="chips" style={{ width: '100%' }}>
                  {CONDITIONS.map((c) => (
                    <button key={c} className={`chip ${k.conditions.includes(c) ? 'cond' : ''}`} onClick={() => toggleCondition(k.id, c)}>{t(`cond.${c}`)}</button>
                  ))}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ---------- Player preview (same renderer as the table) ---------- */

const PREVIEW_SOURCE: FrameSource = { current: () => (state.frame ? { frame: state.frame, receivedAt: Date.now() } : null) };

/** The table's own view component fed with the same frames: the preview is exactly the TV. */
export function PreviewPanel() {
  const { t } = useI18n();
  const blackout = useStore((s) => s.scene.table.blackout);
  const tableOpen = useStore((s) => s.tableOpen);
  const [menu, setMenu] = useState<DOMRect | null>(null);
  return (
    <div className="preview">
      <div className="preview-bar">
        <span className={`live ${tableOpen ? '' : 'off'}`}>{t('table.live')}</span>
        <span className="hint" style={{ flex: 1 }}>{t('table.previewOnly')}</span>
        <button className="ab-btn" title={t('tool.rotate')} onClick={rotateTable}><Icon name="rotate" /></button>
        <button className={`ab-btn ${blackout ? 'on' : ''}`} title={t('tool.blackout')} onClick={toggleBlackout}><Icon name="blackout" /></button>
        <button className="ab-btn" title={t('tool.moveMonitor')} onClick={(e) => setMenu(menu ? null : e.currentTarget.getBoundingClientRect())}><Icon name="monmove" /></button>
      </div>
      <div style={{ flex: 1, minHeight: 0 }}><TableView source={PREVIEW_SOURCE} /></div>
      {menu && <MonitorMenu anchor={menu} onClose={() => setMenu(null)} />}
    </div>
  );
}

export function MonitorMenu({ anchor, onClose }: { anchor: DOMRect; onClose: () => void }) {
  const { t } = useI18n();
  const monitors = useStore((s) => s.monitors);
  const current = useStore((s) => s.tableMonitor);
  // The panel may sit in a floating window: listen and measure in the menu's own document.
  const ref = useRef<HTMLDivElement>(null);
  const [viewWidth, setViewWidth] = useState(innerWidth);
  useLayoutEffect(() => {
    const view = ref.current?.ownerDocument.defaultView;
    if (view) setViewWidth(view.innerWidth);
  }, []);
  useEffect(() => {
    const doc = ref.current?.ownerDocument ?? document;
    const close = (e: MouseEvent) => { if (!(e.target as HTMLElement).closest('.menu')) onClose(); };
    const id = setTimeout(() => doc.addEventListener('click', close), 0);
    return () => { clearTimeout(id); doc.removeEventListener('click', close); };
  }, [onClose]);
  return (
    <div ref={ref} className="menu" style={{ left: Math.max(8, Math.min(anchor.right - 280, viewWidth - 290)), top: anchor.bottom + 4 }}>
      <div className="mh">{t('table.moveTo')}</div>
      {monitors.length === 0 && <p className="hint" style={{ padding: 6 }}>{t('table.noMonitors')}</p>}
      {monitors.map((m) => (
        <button key={m.index} className={m.index === current ? 'on' : ''} onClick={() => { void moveTableTo(m.index); onClose(); }}>
          <Icon name="monitor" />
          <span><b>{m.name}</b><small>{m.width}×{m.height} · {m.x},{m.y}</small></span>
        </button>
      ))}
    </div>
  );
}

/* ---------- Table display & physical calibration ---------- */

export function TablePanel() {
  const { t } = useI18n();
  const table = useStore((s) => s.scene.table);
  const tableOpen = useStore((s) => s.tableOpen);
  const monitors = useStore((s) => s.monitors);
  const tableMonitor = useStore((s) => s.tableMonitor);
  const [measured, setMeasured] = useState(4);
  const ppi = pixelsPerInch(table.display) * table.ppiCorrection;
  const fit = cellsVisibleOnTable(table.display, table.inchesPerCell / table.ppiCorrection);
  const [chosen, setChosen] = useState<number>(tableMonitor ?? monitors.find((m) => m.index !== 0)?.index ?? 0);
  return (
    <div className="panel-body">
      <div className="sec">{t('panel.table')}</div>
      <div className="row"><label htmlFor="t-mon">{t('table.monitor')}</label>
        <select id="t-mon" value={chosen} onChange={(e) => setChosen(Number(e.target.value))}>
          {monitors.map((m) => <option key={m.index} value={m.index}>{m.name} · {m.width}×{m.height}</option>)}
        </select>
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
        <button className="btn pri" onClick={() => void openTable(chosen)}><Icon name="monitor" />{tableOpen ? t('tool.moveMonitor') : t('table.open')}</button>
        <button className={`btn ${table.blackout ? 'danger' : ''}`} onClick={toggleBlackout}><Icon name="blackout" />{table.blackout ? t('table.blackoutOn') : t('tool.blackout')}</button>
      </div>
      <div className="row"><label>{t('table.rotation')}</label>
        <div className="seg">{([0, 90, 180, 270] as TableRotation[]).map((r) => <button key={r} className={table.rotation === r ? 'on' : ''} onClick={() => setTableRotation(r)}>{r}°</button>)}</div>
      </div>
      <div className="sec">{t('table.physical')}</div>
      <div className="row"><label htmlFor="t-diag">{t('table.diagonal')}</label><input id="t-diag" type="number" min={10} step={0.1} value={table.display.diagonalInches} onChange={(e) => { const v = Number(e.target.value); if (v > 0) updateTable({ display: { ...table.display, diagonalInches: v } }); }} /></div>
      <div className="row"><label>{t('table.resolution')}</label>
        <div style={{ display: 'flex', gap: 4 }}>
          <input aria-label="width" type="number" value={table.display.widthPx} onChange={(e) => updateTable({ display: { ...table.display, widthPx: Math.max(1, Number(e.target.value)) } })} />
          <input aria-label="height" type="number" value={table.display.heightPx} onChange={(e) => updateTable({ display: { ...table.display, heightPx: Math.max(1, Number(e.target.value)) } })} />
        </div>
      </div>
      <div className="row"><label htmlFor="t-ipc">{t('table.inchPerCell')}</label><input id="t-ipc" type="number" min={0.25} step={0.25} value={table.inchesPerCell} onChange={(e) => { const v = Number(e.target.value); if (v > 0) updateTable({ inchesPerCell: v }); }} /></div>
      <div className="row"><label>{t('table.ppi')}</label><span className="mono">{ppi.toFixed(1)}</span></div>
      <div className="row"><label /><span className="hint">{t('table.cellsFit', { cols: fit.cols, rows: fit.rows })}</span></div>
      <div className="row"><label htmlFor="t-meas">{t('table.measured')}</label>
        <div style={{ display: 'flex', gap: 4 }}>
          <input id="t-meas" type="number" step={0.01} min={0.5} value={measured} onChange={(e) => setMeasured(Number(e.target.value))} />
          <button className="btn sm" onClick={() => updateTable({ ppiCorrection: table.ppiCorrection * ppiCorrectionFromMeasurement(4, measured) })}>{t('table.applyMeasure')}</button>
        </div>
      </div>
      <div className="row"><label>{t('table.correction')}</label><span className="mono">×{table.ppiCorrection.toFixed(4)}</span></div>
      <div className="notice" style={{ marginTop: 10 }}>
        <b>{t('table.safe')}</b>
        <p className="hint" style={{ margin: '4px 0 0' }}>{t('table.safeText')}</p>
      </div>
    </div>
  );
}

/* ---------- Dice & log ---------- */

export function DicePanel() {
  const { t } = useI18n();
  const rolls = useStore((s) => s.rolls);
  const [expr, setExpr] = useState('1d20+5');
  const [err, setErr] = useState(false);
  const doRoll = (e: string) => setErr(!roll(e));
  return (
    <div className="panel-body">
      <div className="dice-grid">{[4, 6, 8, 10, 12, 20, 100].map((d) => <button key={d} onClick={() => doRoll(`1d${d}`)}>d{d}</button>)}</div>
      <form style={{ display: 'flex', gap: 6 }} onSubmit={(e) => { e.preventDefault(); doRoll(expr); }}>
        <input className="mono" style={{ flex: 1 }} value={expr} onChange={(e) => setExpr(e.target.value)} aria-label="dice" />
        <button className="btn pri" type="submit">{t('dice.roll')}</button>
        <button className="btn" type="button" onClick={() => { const r = d20Test(0, { advantage: true }); state.rolls.unshift({ expression: `d20 ${t('dice.advantage')}`, total: r.total, terms: [], natural20: r.natural }); emit(); }}>{t('dice.advantage')}</button>
        <button className="btn" type="button" onClick={() => { const r = d20Test(0, { disadvantage: true }); state.rolls.unshift({ expression: `d20 ${t('dice.disadvantage')}`, total: r.total, terms: [], natural20: r.natural }); emit(); }}>{t('dice.disadvantage')}</button>
      </form>
      {err && <p className="hint" style={{ color: 'var(--crit)' }}>{t('dice.invalid')}</p>}
      {rolls.length === 0 && <p className="hint">{t('dice.none')}</p>}
      {rolls.slice(0, 12).map((r, i) => (
        <div key={i} className="roll">
          <b className={r.natural20 === 20 ? 'crit' : r.natural20 === 1 ? 'fail' : ''}>{r.total}</b>
          <span className="mono">{r.expression}</span>
          <span>{r.terms.filter((x) => x.term.kind === 'dice').map((x) => `[${x.rolls.join(', ')}]`).join(' ')}</span>
        </div>
      ))}
    </div>
  );
}

export function LogPanel() {
  const { t } = useI18n();
  const entries = useStore((s) => s.log);
  return (
    <div className="panel-body log">
      {entries.map((e, i) => (
        <div key={i}><time>{new Date(e.at).toTimeString().slice(0, 8)}</time><span>{t(e.key, e.params)}</span></div>
      ))}
    </div>
  );
}

/* ---------- Encounter budget (2024) ---------- */

export function EncounterPanel() {
  const { t } = useI18n();
  const [levels, setLevels] = useState('4,4,4');
  const [monsters, setMonsters] = useState<{ cr: ChallengeRating; count: number; name: string }[]>([
    { name: 'Skeleton', cr: '1/4', count: 2 },
    { name: 'Ghoul', cr: '1', count: 1 },
    { name: 'Ash Wight', cr: '3', count: 1 },
  ]);
  const party = levels.split(',').map((x) => Number(x.trim())).filter((n) => Number.isInteger(n) && n >= 1 && n <= 20);
  const ev = party.length ? evaluateEncounter(party, monsters) : null;
  const max = ev ? ev.budget.high * 1.33 : 1;
  return (
    <div className="panel-body">
      <div className="row"><label htmlFor="e-lv">{t('enc.party')}</label><input id="e-lv" className="mono" value={levels} onChange={(e) => setLevels(e.target.value)} /></div>
      <div className="sec">{t('enc.monsters')}</div>
      {monsters.map((m, i) => (
        <div key={i} className="row" style={{ gridTemplateColumns: '1fr 60px 60px' }}>
          <span>{m.name} <span className="hint">({t('creature.cr')} {m.cr})</span></span>
          <input type="number" min={0} value={m.count} aria-label={m.name} onChange={(e) => setMonsters(monsters.map((x, j) => (j === i ? { ...x, count: Math.max(0, Number(e.target.value)) } : x)))} />
          <span className="mono hint">{xpForCr(m.cr)} XP</span>
        </div>
      ))}
      {ev && (
        <>
          <div className="sec">{t('enc.xp')}: {ev.monsterXp}</div>
          <b style={{ fontFamily: 'var(--font-head)', fontSize: 18 }}>{t(ev.rating === 'trivial' ? 'enc.trivial' : ev.rating === 'beyond' ? 'enc.beyond' : `enc.${ev.rating}`)}</b>
          <div style={{ position: 'relative', height: 10, borderRadius: 5, margin: '8px 0 4px', background: `linear-gradient(90deg, var(--ok) 0 ${(ev.budget.low / max) * 100}%, var(--warn) 0 ${(ev.budget.moderate / max) * 100}%, #e98a3d 0 ${(ev.budget.high / max) * 100}%, var(--crit) 0)` }}>
            <i style={{ position: 'absolute', top: -4, left: `${Math.min(1, ev.monsterXp / max) * 100}%`, width: 3, height: 18, background: 'var(--fg)', borderRadius: 2 }} />
          </div>
          <div className="hint mono">{t('enc.low')} {ev.budget.low} · {t('enc.moderate')} {ev.budget.moderate} · {t('enc.high')} {ev.budget.high}</div>
        </>
      )}
      <p className="hint">{t('enc.rule')}</p>
    </div>
  );
}

/* ---------- Creature stat block (2024) ---------- */

export function CreaturePanel() {
  const { t } = useI18n();
  const idx = useStore((s) => s.selectedCreatureIdx);
  const c = useStore((s) => s.creatures[idx]);
  if (!c) return null;
  const level = c.classes?.reduce((s, x) => s + x.level, 0) ?? 1;
  const pb = c.role === 'pc' ? proficiencyBonusForLevel(Math.max(1, Math.min(20, level))) : proficiencyBonusForCr(c.cr ?? '0');
  const set = (fn: () => void) => { fn(); markDirty(); emit(); };
  return (
    <div className="panel-body">
      <div className="sheet">
        <div className="top">
          <div style={{ width: 64, height: 64, borderRadius: '50%', border: `4px solid ${c.token.ringColor}`, display: 'grid', placeItems: 'center', fontFamily: 'var(--font-head)', fontWeight: 700, fontSize: 22, color: c.token.ringColor }}>
            {c.name.split(' ').map((w) => w[0]).join('').slice(0, 2)}
          </div>
          <div style={{ flex: 1 }}>
            <input className="name" aria-label={t('props.name')} value={c.name} onChange={(e) => set(() => (c.name = e.target.value))} />
            <div className="hint">
              {c.role === 'pc'
                ? `${c.species ?? ''} · ${c.classes?.map((x) => `${x.name}${x.subclass ? ` (${x.subclass})` : ''} ${x.level}`).join(' / ')} · ${c.background ?? ''}`
                : `${c.size} ${c.creatureType}, ${c.alignment} · ${t('creature.cr')} ${c.cr} (${xpForCr(c.cr ?? '0')} XP)`}
            </div>
          </div>
        </div>
        <div className="stats3">
          <div className="stat"><label>{t('creature.ac')}</label><input type="number" value={c.ac} onChange={(e) => set(() => (c.ac = Number(e.target.value)))} /><span className="hint">{c.acNote}</span></div>
          <div className="stat"><label>{t('creature.hp')}</label><input type="number" value={c.hp} onChange={(e) => set(() => (c.hp = Math.max(1, Number(e.target.value))))} /><span className="hint mono">{c.hpFormula}</span></div>
          <div className="stat"><label>{t('creature.initiative')}</label><span className="v">{fmt(abilityModifier(c.abilities.dex))}</span></div>
          <div className="stat"><label>{t('creature.pb')}</label><span className="v">{fmt(pb)}</span></div>
        </div>
        <div className="abil">
          {ABILITIES.map((a) => {
            const prof = c.saveProficiencies.includes(a);
            const mod = abilityModifier(c.abilities[a]);
            return (
              <div key={a} className="ab">
                <label>{a.toUpperCase()}</label>
                <input type="number" min={1} max={30} value={c.abilities[a]} aria-label={a} onChange={(e) => set(() => (c.abilities[a] = Math.max(1, Math.min(30, Number(e.target.value)))))} />
                <div className="mods">
                  <span title={t('creature.mod')}>{fmt(mod)}</span>
                  <span className={prof ? 'prof' : ''} title={t('creature.save')} style={{ cursor: 'pointer' }} onClick={() => set(() => (c.saveProficiencies = prof ? c.saveProficiencies.filter((x) => x !== a) : [...c.saveProficiencies, a]))}>
                    {fmt(mod + (prof ? pb : 0))}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
        <div className="row"><label>{t('creature.senses')}</label><span>darkvision {c.senses.darkvision} ft · passive Perception {10 + abilityModifier(c.abilities.wis) + (c.skills.perception !== undefined ? pb : 0)}</span></div>
        <div className="row"><label>{t('creature.languages')}</label><span>{c.languages.join(', ')}</span></div>
        {c.weaponMasteries.length > 0 && <div className="row"><label>Weapon Mastery</label><span>{c.weaponMasteries.join(', ')}</span></div>}
        <div className="sec">{t('creature.actions')}</div>
        {c.actions.map((a, i) => (
          <p key={i} style={{ margin: '0 0 6px' }}>
            <b><i>{a.name}.</i></b> {a.text}
            {a.attackBonus !== undefined && <button className="chip" style={{ marginLeft: 6 }} onClick={() => roll(`1d20${fmt(a.attackBonus!)}`)}>{fmt(a.attackBonus)}</button>}
            {a.damage && <button className="chip" style={{ marginLeft: 4 }} onClick={() => roll(a.damage!)}>{a.damage}</button>}
          </p>
        ))}
        <button className="btn pri" style={{ marginBottom: 8 }} onClick={() => addCreatureToken(idx)}><Icon name="plus" />{t('creature.addToMap')}</button>
        <p className="hint">{t('creature.manual')}</p>
      </div>
    </div>
  );
}

export function SoonPanel({ text }: { text: 'soon.atlas' }) {
  const { t } = useI18n();
  return (
    <div className="panel-body">
      <div className="soon"><h3>{t('soon.title')}</h3>{t(text)}</div>
    </div>
  );
}

function fmt(n: number): string {
  return n >= 0 ? `+${n}` : String(n);
}

/* ---------- Soundboard ---------- */

export function SoundPanel() {
  const { t } = useI18n();
  const sb = useStore((s) => s.soundboard);
  const campaign = useStore((s) => s.campaign);
  const meter = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const el = meter.current;
      if (el) el.style.width = `${Math.round(Math.min(1, masterLevel() * 2.5) * 100)}%`;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
  const name = (id: string) => (id.startsWith(BUILTIN_PREFIX) ? t(`amb.${id.slice(BUILTIN_PREFIX.length)}` as 'amb.wind') : trackFileName(id));
  return (
    <div className="panel-body">
      <div className="sound">
        <div>
          <div className="sec">{t('audio.ambience')}</div>
          {sb.ambience.map((a) => (
            <div key={a.id} className="amb">
              <button className={`play ${a.playing ? 'on' : ''}`} aria-label={name(a.id)} onClick={() => void toggleAmbience(a.id)}><Icon name={a.playing ? 'pause' : 'play'} /></button>
              <span className="nm">{name(a.id)}{!a.id.startsWith(BUILTIN_PREFIX) && <span className="hint mono"> · {a.id}</span>}</span>
              <input type="range" min={0} max={1} step={0.05} value={a.volume} aria-label={`${name(a.id)} volume`} onChange={(e) => setTrackVolume(a.id, Number(e.target.value))} />
            </div>
          ))}
          <button className="btn sm" style={{ marginTop: 6 }} disabled={!campaign} onClick={() => void importAudio(false)}><Icon name="plus" />{t('audio.addAmbience')}</button>
        </div>
        <div>
          <div className="sec">{t('audio.sfx')}</div>
          <div className="sfx">
            {BUILTIN_SFX.map((k) => <button key={k} onClick={() => void triggerSfx(BUILTIN_PREFIX + k)}><Icon name="bolt" />{t(`sfx.${k}`)}</button>)}
            {sb.sfxFiles.map((f) => <button key={f} onClick={() => void triggerSfx(f)}><Icon name="music" />{trackFileName(f)}</button>)}
          </div>
          <button className="btn sm" style={{ marginTop: 6 }} disabled={!campaign} onClick={() => void importAudio(true)}><Icon name="plus" />{t('audio.addSfx')}</button>
        </div>
        <div>
          <div className="sec">{t('audio.master')}</div>
          <input type="range" min={0} max={1} step={0.05} value={sb.master} aria-label={t('audio.master')} onChange={(e) => setMaster(Number(e.target.value))} style={{ width: '100%' }} />
          <div className="meter"><div ref={meter} /></div>
          <button className="btn sm" onClick={stopAll}><Icon name="pause" />{t('audio.stopAll')}</button>
          <p className="hint">{t('audio.perScene')}</p>
          <p className="hint">{t('audio.filesHint')}</p>
        </div>
      </div>
    </div>
  );
}
