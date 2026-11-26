/**
 * Command panel of the "Build" tab (E-33, E-34, E-6): over the map at its top right, not modal.
 * "Wall": style, thickness and snapping, then click the wall point by point – each wall is added
 * when it ends. "Cliff": kind, form and options, drawn the same way. "Door": secret or not, then
 * click a drawn wall. Done (or Escape) ends the command.
 */
import type { KeyboardEvent } from 'react';
import type { BuildSnap } from '../core/build/editing';
import { MASONRY_STYLES } from '../core/build/masonry';
import { CLIFF_FORMS, CLIFF_KINDS, type CliffForm, type CliffKind } from '../core/build/cliffs';
import { WATER_KINDS, type WaterKind } from '../core/build/water';
import { FLOOR_STYLES, type FloorPaint } from '../core/build/floors';
import { ROOM_KINDS, type RoomKind } from '../core/build/rooms';
import type { MessageKey } from '../i18n/en';
import { useI18n } from '../i18n/i18n';
import { Icon } from '../ui/Icon';
import { endBuildCommand, undoBuildPoint, updateBuildCommand, updateGenerate } from '../app/build';
import type { GenStyle } from '../core/build/generate';
import { useStore } from '../app/store';

const SNAPS: BuildSnap[] = ['grid', 'half', 'angle', 'free'];

export function BuildCommandPanel() {
  const { t } = useI18n();
  const c = useStore((s) => s.buildCommand);
  if (!c) return null;
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      endBuildCommand(true);
    }
  };
  const title = t(c.kind === 'wall' ? 'build.cmd.wall' : c.kind === 'cliff' ? 'build.cmd.cliff' : c.kind === 'water' ? 'build.cmd.water' : c.kind === 'floor' ? 'build.cmd.floor' : c.kind === 'generate' ? 'build.cmd.generate' : c.kind === 'room' ? 'build.cmd.room' : 'build.cmd.door');
  return (
    <form
      className="command-panel"
      aria-labelledby="build-cmd-title"
      onKeyDown={onKey}
      onSubmit={(e) => {
        e.preventDefault();
        endBuildCommand(true);
      }}
    >
      <div className="cmd-head">
        <b id="build-cmd-title">{title}</b>
        <button type="button" className="ab-btn" title={t('build.done')} aria-label={t('build.done')} onClick={() => endBuildCommand(true)}><Icon name="close" /></button>
      </div>
      <div className="cmd-body">
        {c.kind === 'room' ? (
          <>
            <label className="cmd-field">
              <span>{t('build.room.kind')}</span>
              <select value={c.roomKind} onChange={(e) => updateBuildCommand({ roomKind: e.target.value as RoomKind })}>
                {ROOM_KINDS.map((k) => <option key={k} value={k}>{t(`build.room.kind.${k}` as MessageKey)}</option>)}
              </select>
            </label>
            {c.roomKind === 'corridor' && (
              <label className="cmd-field">
                <span>{t('build.room.width')}</span>
                <input type="number" min={1} step={1} value={c.corridorWidthFt} onChange={(e) => Number(e.target.value) > 0 && updateBuildCommand({ corridorWidthFt: Number(e.target.value) })} />
              </label>
            )}
            <RoomFields style={c.style} floor={c.roomFloor} onChange={(p) => updateBuildCommand({ ...(p.style ? { style: p.style } : {}), ...(p.floor !== undefined ? { roomFloor: p.floor } : {}) })} />
            <label className="cmd-field">
              <span>{t('build.thickness')}</span>
              <input type="number" min={0.25} max={20} step={0.25} value={c.thicknessFt} onChange={(e) => Number(e.target.value) > 0 && updateBuildCommand({ thicknessFt: Number(e.target.value) })} />
            </label>
            <label className="cmd-field">
              <span>{t('build.snap')}</span>
              <select value={c.snap} onChange={(e) => updateBuildCommand({ snap: e.target.value as BuildSnap })}>
                {SNAPS.map((s) => <option key={s} value={s}>{t(`build.snap.${s}` as MessageKey)}</option>)}
              </select>
            </label>
            <p className="hint">{t('hint.buildRoom')}</p>
            {(c.roomKind === 'corridor' || c.roomKind === 'polygon') && (
              <div className="cmd-line">
                <span className="hint" role="status">{t('build.points', { n: c.points.length })}</span>
                <button type="button" className="btn sm" disabled={c.points.length === 0} onClick={undoBuildPoint}><Icon name="undo" />{t('build.undoPoint')}</button>
              </div>
            )}
          </>
        ) : c.kind === 'floor' ? (
          <>
            <label className="cmd-field">
              <span>{t('build.floor')}</span>
              <select value={c.floorStyle} onChange={(e) => updateBuildCommand({ floorStyle: e.target.value as FloorPaint })}>
                {FLOOR_STYLES.map((f) => <option key={f} value={f}>{t(`build.floor.${f}` as MessageKey)}</option>)}
              </select>
            </label>
            <label className="cmd-field">
              <span>{t('build.brush', { n: c.brushCells })}</span>
              <input type="range" min={0.5} max={8} step={0.5} value={c.brushCells} onChange={(e) => updateBuildCommand({ brushCells: Number(e.target.value) })} />
            </label>
            <p className="hint">{t('hint.buildFloor')}</p>
          </>
        ) : c.kind === 'generate' ? (
          <>
            <label className="cmd-field">
              <span>{t('build.gen.style')}</span>
              <select value={c.genStyle} onChange={(e) => updateGenerate({ genStyle: e.target.value as GenStyle })}>
                <option value="dungeon">{t('build.gen.dungeon')}</option>
                <option value="cave">{t('build.gen.cave')}</option>
              </select>
            </label>
            <label className="cmd-field">
              <span>{t('build.gen.density')}</span>
              <input type="range" min={5} max={100} value={Math.round(c.genDensity * 100)} onChange={(e) => updateGenerate({ genDensity: Number(e.target.value) / 100 })} />
            </label>
            <div className="cmd-line">
              <label className="cmd-field">
                <span>{t('build.gen.seed')}</span>
                <input type="number" value={c.genSeed} onChange={(e) => updateGenerate({ genSeed: Math.floor(Number(e.target.value)) || 0 })} />
              </label>
              <button type="button" className="btn sm" onClick={() => updateGenerate({ genSeed: Math.floor(Math.random() * 1_000_000) })}><Icon name="dice" />{t('build.reroll')}</button>
            </div>
            {c.region ? <button type="button" className="btn sm danger" onClick={() => endBuildCommand(false)}>{t('build.gen.discard')}</button> : <p className="hint">{t('build.gen.region')}</p>}
            <p className="hint">{t('hint.buildGenerate')}</p>
          </>
        ) : c.kind === 'water' ? (
          <>
            <WaterFields kind={c.waterKind} widthFt={c.riverWidthFt} onChange={(p) => updateBuildCommand({ ...(p.kind ? { waterKind: p.kind } : {}), ...(p.widthFt ? { riverWidthFt: p.widthFt } : {}) })} />
            <label className="cmd-field">
              <span>{t('build.snap')}</span>
              <select value={c.snap} onChange={(e) => updateBuildCommand({ snap: e.target.value as BuildSnap })}>
                {SNAPS.map((s) => <option key={s} value={s}>{t(`build.snap.${s}` as MessageKey)}</option>)}
              </select>
            </label>
            <p className="hint">{t('hint.buildWater')}</p>
            <div className="cmd-line">
              <span className="hint" role="status">{t('build.points', { n: c.points.length })}</span>
              <button type="button" className="btn sm" disabled={c.points.length === 0} onClick={undoBuildPoint}><Icon name="undo" />{t('build.undoPoint')}</button>
            </div>
          </>
        ) : c.kind === 'cliff' ? (
          <>
            <CliffFields value={c} onChange={updateBuildCommand} />
            <label className="cmd-field">
              <span>{t('build.snap')}</span>
              <select value={c.snap} onChange={(e) => updateBuildCommand({ snap: e.target.value as BuildSnap })}>
                {SNAPS.map((s) => <option key={s} value={s}>{t(`build.snap.${s}` as MessageKey)}</option>)}
              </select>
            </label>
            <p className="hint">{t('hint.buildCliff')}</p>
            <div className="cmd-line">
              <span className="hint" role="status">{t('build.points', { n: c.points.length })}</span>
              <button type="button" className="btn sm" disabled={c.points.length === 0} onClick={undoBuildPoint}><Icon name="undo" />{t('build.undoPoint')}</button>
            </div>
          </>
        ) : c.kind === 'wall' ? (
          <>
            <label className="cmd-field">
              <span>{t('build.style')}</span>
              <select value={c.style} onChange={(e) => updateBuildCommand({ style: e.target.value as (typeof MASONRY_STYLES)[number] })}>
                {MASONRY_STYLES.map((s) => <option key={s} value={s}>{t(`build.style.${s}` as MessageKey)}</option>)}
              </select>
            </label>
            <label className="cmd-field">
              <span>{t('build.thickness')}</span>
              <input type="number" min={0.25} max={20} step={0.25} value={c.thicknessFt} onChange={(e) => {
                const v = Number(e.target.value);
                if (v > 0) updateBuildCommand({ thicknessFt: v });
              }} />
            </label>
            <label className="cmd-field">
              <span>{t('build.snap')}</span>
              <select value={c.snap} onChange={(e) => updateBuildCommand({ snap: e.target.value as BuildSnap })}>
                {SNAPS.map((s) => <option key={s} value={s}>{t(`build.snap.${s}` as MessageKey)}</option>)}
              </select>
            </label>
            <label className="cmd-check"><input type="checkbox" checked={c.fortified} onChange={(e) => updateBuildCommand({ fortified: e.target.checked })} />{t('build.fortified')}</label>
            <p className="hint">{t('hint.buildWall')}</p>
            <div className="cmd-line">
              <span className="hint" role="status">{t('build.points', { n: c.points.length })}</span>
              <button type="button" className="btn sm" disabled={c.points.length === 0} onClick={undoBuildPoint}><Icon name="undo" />{t('build.undoPoint')}</button>
            </div>
          </>
        ) : (
          <>
            <label className="cmd-field">
              <span>{t('build.opening')}</span>
              <select value={c.window ? 'window' : c.secret ? 'secret' : 'door'} onChange={(e) => updateBuildCommand({ window: e.target.value === 'window', secret: e.target.value === 'secret' })}>
                <option value="door">{t('build.opening.door')}</option>
                <option value="secret">{t('build.opening.secret')}</option>
                <option value="window">{t('build.opening.window')}</option>
              </select>
            </label>
            <p className="hint">{t(c.window ? 'build.windowAbout' : 'hint.buildDoor')}</p>
          </>
        )}
      </div>
      <div className="cmd-buttons">
        <button type="submit" className="btn pri">{t('build.done')}</button>
      </div>
    </form>
  );
}

/** A cliff's settings (E-34), in the command panel and in the Properties panel. Widths in feet. */
export function CliffFields({ value, onChange }: { value: { cliffKind: CliffKind; form: CliffForm; steep: boolean; widthFt: number; steps: number; inside: 'low' | 'high'; growth: boolean }; onChange: (patch: Partial<{ cliffKind: CliffKind; form: CliffForm; steep: boolean; widthFt: number; steps: number; inside: 'low' | 'high'; growth: boolean }>) => void }) {
  const { t } = useI18n();
  const v = value;
  return (
    <>
      <label className="cmd-field">
        <span>{t('build.cliff.kind')}</span>
        <select value={v.cliffKind} onChange={(e) => onChange({ cliffKind: e.target.value as CliffKind })}>
          {CLIFF_KINDS.map((k) => <option key={k} value={k}>{t(`build.cliff.kind.${k}` as MessageKey)}</option>)}
        </select>
      </label>
      {v.cliffKind === 'scree' && <p className="hint">{t('build.cliff.screeAbout')}</p>}
      <label className="cmd-field">
        <span>{t('build.cliff.form')}</span>
        <select value={v.form} onChange={(e) => onChange({ form: e.target.value as CliffForm })}>
          {CLIFF_FORMS.map((f) => <option key={f} value={f}>{t(`build.cliff.form.${f}` as MessageKey)}</option>)}
        </select>
      </label>
      {(v.form === 'ravine' || v.form === 'terraces') && (
        <label className="cmd-field">
          <span>{t(v.form === 'ravine' ? 'build.cliff.width' : 'build.cliff.spacing')}</span>
          <input type="number" min={1} step={1} value={v.widthFt} onChange={(e) => Number(e.target.value) > 0 && onChange({ widthFt: Number(e.target.value) })} />
        </label>
      )}
      {v.form === 'terraces' && (
        <label className="cmd-field">
          <span>{t('build.cliff.steps')}</span>
          <input type="number" min={1} max={12} step={1} value={v.steps} onChange={(e) => Number(e.target.value) >= 1 && onChange({ steps: Math.min(12, Math.round(Number(e.target.value))) })} />
        </label>
      )}
      {v.form === 'ring' && (
        <label className="cmd-field">
          <span>{t('build.cliff.inside')}</span>
          <select value={v.inside} onChange={(e) => onChange({ inside: e.target.value as 'low' | 'high' })}>
            <option value="low">{t('build.cliff.inside.low')}</option>
            <option value="high">{t('build.cliff.inside.high')}</option>
          </select>
        </label>
      )}
      {v.cliffKind !== 'scree' && (
        <label className="cmd-check"><input type="checkbox" checked={v.steep} onChange={(e) => onChange({ steep: e.target.checked })} />{t('build.cliff.steep')}</label>
      )}
      <label className="cmd-check"><input type="checkbox" checked={v.growth} onChange={(e) => onChange({ growth: e.target.checked })} />{t('build.cliff.growth')}</label>
    </>
  );
}

/** Water's settings (E-35), in the command panel and in the Properties panel. */
export function WaterFields({ kind, widthFt, onChange }: { kind: WaterKind; widthFt: number; onChange: (patch: { kind?: WaterKind; widthFt?: number }) => void }) {
  const { t } = useI18n();
  return (
    <>
      <label className="cmd-field">
        <span>{t('build.water.kind')}</span>
        <select value={kind} onChange={(e) => onChange({ kind: e.target.value as WaterKind })}>
          {WATER_KINDS.map((k) => <option key={k} value={k}>{t(`build.water.kind.${k}` as MessageKey)}</option>)}
        </select>
      </label>
      {kind === 'river' && (
        <label className="cmd-field">
          <span>{t('build.water.width')}</span>
          <input type="number" min={1} step={1} value={widthFt} onChange={(e) => Number(e.target.value) > 0 && onChange({ widthFt: Number(e.target.value) })} />
        </label>
      )}
    </>
  );
}

/** A room's wall style and floor (E-45), in the command panel and in the Properties panel. */
export function RoomFields({ style, floor, onChange }: { style: (typeof MASONRY_STYLES)[number]; floor: FloorPaint | ''; onChange: (patch: { style?: (typeof MASONRY_STYLES)[number]; floor?: FloorPaint | '' }) => void }) {
  const { t } = useI18n();
  return (
    <>
      <label className="cmd-field">
        <span>{t('build.style')}</span>
        <select value={style} onChange={(e) => onChange({ style: e.target.value as (typeof MASONRY_STYLES)[number] })}>
          {MASONRY_STYLES.map((s) => <option key={s} value={s}>{t(`build.style.${s}` as MessageKey)}</option>)}
        </select>
      </label>
      <label className="cmd-field">
        <span>{t('build.room.floor')}</span>
        <select value={floor} onChange={(e) => onChange({ floor: e.target.value as FloorPaint | '' })}>
          <option value="">{t('build.room.noFloor')}</option>
          {FLOOR_STYLES.map((f) => <option key={f} value={f}>{t(`build.floor.${f}` as MessageKey)}</option>)}
        </select>
      </label>
    </>
  );
}
