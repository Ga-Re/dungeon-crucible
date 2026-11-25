import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { cellsVisibleOnTable, pixelsPerInch, ppiCorrectionFromMeasurement } from '../core/grid';
import { FOG_BIOMES, type TableRotation } from '../core/scene';
import { abilityModifier, ABILITIES, CONDITIONS, evaluateEncounter, proficiencyBonusForCr, proficiencyBonusForLevel, xpForCr, type ChallengeRating } from '../core/rules/rules2024';
import { d20Test } from '../core/rules/dice';
import { useI18n } from '../i18n/i18n';
import { TableView, type FrameSource } from '../table/TableView';
import { BIOMES } from '../render/pixi/fog-living';
import { FADE_MAX_SECONDS, FADE_STEP_SECONDS, FOG_EDGE, FOG_MOTION, FOG_QUALITIES, FOG_SPEED, speedOfStep, stepOfSpeed } from '../app/fog-settings';
import { tileCount } from '../render/mapImages';
import { Icon } from '../ui/Icon';
import {
  addCreatureToken, changeHp, discoverZone, emit, initiativeOrder, markDirty, removeLight, removeToken, setAmbient, toggleLight, updateLight, nextTurn, revealZone, roll, rotateTable, selectToken, selectZone,
  resetSceneFogEffect, setBiome, setBiomeStrength, setFogLook, setFogMode, setFogOption, setGridType, toggleDmFog, setTableRotation, state, toggle, toggleBlackout, toggleCondition, updateTable, useStore,
} from '../app/store';
import { openTable, moveTableTo } from '../app/tableOutput';
import { importMapIntoCampaign, switchScene } from '../app/campaign';
import { filterLibraryMaps, mapUsage, openLibraryMap, refreshLibraryMaps, trashLibraryMap, type MapUsage } from '../app/library';
import { CREATURE_DRAG } from './MapView';
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
              <button className={`tn ${i === selCreature ? 'sel' : ''}`} onClick={() => { state.selectedCreatureIdx = i; emit(); }}>
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
  if (ws === 'vault' || ws === 'atlas') {
    return <div className="panel-body hint">{t(ws === 'vault' ? 'soon.vault' : 'soon.atlas')}</div>;
  }
  return (
    <div className="panel-body">
      {ws === 'forge' && campaign && <LibraryMaps />}
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
          <div className="tn"><Icon name="map" /><span className="nm">{scene.map.name}</span></div>
          <ul>
            {scene.zones.map((z) => (
              <li key={z.id}>
                <button className={`tn ${z.id === selZone ? 'sel' : ''}`} onClick={() => selectZone(z.id)}>
                  <span className="swatch" style={{ background: z.color }} />
                  <span className="nm">{z.name}</span>
                  {z.kind === 'secret' && !z.discovered && <span className="meta" style={{ color: 'var(--arcane)' }}>secret</span>}
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
  const [query, setQuery] = useState('');
  const [confirm, setConfirm] = useState<{ resource: string; usage: MapUsage[] } | null>(null);
  useEffect(() => {
    void refreshLibraryMaps();
  }, [sceneVersion]);
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
                <button className="library-open" title={m.resource} onClick={() => void openLibraryMap(m.resource)}>
                  <Icon name={m.isVideo ? 'play' : 'map'} />
                  <span className="nm">{m.name}</span>
                  {m.tags.length > 0 && <span className="meta">{m.tags.join(', ')}</span>}
                </button>
                <button className="ab-btn" title={t('library.trash')} aria-label={`${t('library.trash')}: ${m.name}`} onClick={() => void mapUsage(m.resource).then((usage) => setConfirm({ resource: m.resource, usage }))}><Icon name="trash" /></button>
              </div>
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
      {z.kind === 'secret' && !z.discovered ? (
        <button className="btn sm" onClick={() => discoverZone(id)}><Icon name="eye" />{t('tool.revealRoom')}</button>
      ) : (
        <button className="btn sm" onClick={() => revealZone(id)}><Icon name="room" />{t('tool.revealRoom')}</button>
      )}
    </div>
  );
}

/* ---------- Properties (Map Forge) ---------- */

export function PropertiesPanel() {
  const { t } = useI18n();
  const map = useStore((s) => s.scene.map);
  const selZone = useStore((s) => s.selectedZoneId);
  const cal = useStore((s) => s.lastCalibration);
  const file = useStore((s) => s.mapFileName);
  const ambient = useStore((s) => s.scene.ambient);
  const selLight = useStore((s) => s.selectedLightId);
  const light = useStore((s) => s.scene.lights.find((l) => l.id === selLight));
  const zone = state.scene.zones.find((z) => z.id === selZone);
  return (
    <div className="panel-body">
      <div className="sec">{t('panel.map')}</div>
      <div className="row"><label htmlFor="p-name">{t('props.name')}</label><input id="p-name" value={map.name} onChange={(e) => { map.name = e.target.value; emit(); }} /></div>
      <div className="row"><label>{t('props.file')}</label><span className="mono hint">{file}</span></div>
      <div className="row"><label>{t('props.grid')}</label>
        <div className="seg">
          {(['square', 'hex-pointy', 'hex-flat'] as const).map((g) => (
            <button key={g} className={map.grid.type === g ? 'on' : ''} onClick={() => setGridType(g)}>
              {t(g === 'square' ? 'tool.gridSquare' : g === 'hex-pointy' ? 'tool.gridHexPointy' : 'tool.gridHexFlat')}
            </button>
          ))}
        </div>
      </div>
      <div className="row"><label htmlFor="p-cell">{t('props.cellSize')}</label>
        <input id="p-cell" type="number" min={10} step={0.5} value={Number(map.grid.cellWidth.toFixed(2))} onChange={(e) => { const v = Number(e.target.value); if (v >= 10) { map.grid = { ...map.grid, cellWidth: v, cellHeight: v }; emit(); } }} />
      </div>
      <div className="row"><label htmlFor="p-ft">{t('props.feetPerCell')}</label>
        <input id="p-ft" type="number" min={1} value={map.grid.feetPerCell} onChange={(e) => { const v = Number(e.target.value); if (v > 0) { map.grid = { ...map.grid, feetPerCell: v }; emit(); } }} />
      </div>
      {map.widthPx > 0 && <div className="row"><label /><span className="hint mono">{map.widthPx}×{map.heightPx} px · {tileCount(map.widthPx, map.heightPx)} GPU tiles</span></div>}
      {cal && <div className="row"><label /><span className="hint">{t('props.calibrated', { w: cal.w.toFixed(1), h: cal.h.toFixed(1), r: cal.r.toFixed(2) })}</span></div>}
      <div className="row"><label htmlFor="p-amb">{t('map.ambient')}</label>
        <select id="p-amb" value={ambient} onChange={(e) => setAmbient(e.target.value as 'dark' | 'lit')}>
          <option value="dark">{t('ambient.dark')}</option>
          <option value="lit">{t('ambient.lit')}</option>
        </select>
      </div>
      {light && (
        <>
          <div className="sec">{t('light.title')}</div>
          <div className="row"><label htmlFor="l-b">{t('light.bright')}</label><input id="l-b" type="number" min={0} step={5} value={light.brightFt} onChange={(e) => updateLight(light.id, { brightFt: Math.max(0, Number(e.target.value)) })} /></div>
          <div className="row"><label htmlFor="l-d">{t('light.dim')}</label><input id="l-d" type="number" min={0} step={5} value={light.dimFt} onChange={(e) => updateLight(light.id, { dimFt: Math.max(0, Number(e.target.value)) })} /></div>
          <div className="row"><label htmlFor="l-c">{t('light.color')}</label><input id="l-c" type="color" value={light.color} onChange={(e) => updateLight(light.id, { color: e.target.value })} /></div>
          <div className="row"><label>{t('light.on')}</label><input type="checkbox" checked={light.on} onChange={() => toggleLight(light.id)} /></div>
          <button className="btn sm danger" onClick={() => removeLight(light.id)}><Icon name="trash" />{t('light.remove')}</button>
        </>
      )}
      <div className="sec">{t('props.selection')}</div>
      {zone ? (
        <>
          <div className="row"><label htmlFor="z-name">{t('props.name')}</label><input id="z-name" value={zone.name} onChange={(e) => { zone.name = e.target.value; emit(); }} /></div>
          <div className="row"><label htmlFor="z-kind">{t('props.type')}</label>
            <select id="z-kind" value={zone.kind} onChange={(e) => { zone.kind = e.target.value as typeof zone.kind; emit(); }}>
              <option value="room">Room</option><option value="area">Area</option><option value="poi">POI</option><option value="secret">Secret</option>
            </select>
          </div>
          <div className="row"><label htmlFor="z-col">Color</label><input id="z-col" type="color" value={zone.color} onChange={(e) => { zone.color = e.target.value; emit(); }} /></div>
        </>
      ) : <p className="hint">{t('props.noSelection')}</p>}
    </div>
  );
}

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
            <div className="nm"><span>{k.name}</span><span className={`tag ${k.kind !== 'pc' ? 'm' : ''}`}>{k.kind === 'pc' ? t('init.pc') : t('init.monster')}</span>{k.kind === 'pc' && lock && <Icon name="lock" />}</div>
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

export function SoonPanel({ text }: { text: 'soon.atlas' | 'soon.vault' }) {
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
