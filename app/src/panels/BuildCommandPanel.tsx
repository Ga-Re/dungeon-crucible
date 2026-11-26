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
import type { MessageKey } from '../i18n/en';
import { useI18n } from '../i18n/i18n';
import { Icon } from '../ui/Icon';
import { endBuildCommand, undoBuildPoint, updateBuildCommand } from '../app/build';
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
  const title = t(c.kind === 'wall' ? 'build.cmd.wall' : c.kind === 'cliff' ? 'build.cmd.cliff' : 'build.cmd.door');
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
        {c.kind === 'cliff' ? (
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
            <p className="hint">{t('hint.buildWall')}</p>
            <div className="cmd-line">
              <span className="hint" role="status">{t('build.points', { n: c.points.length })}</span>
              <button type="button" className="btn sm" disabled={c.points.length === 0} onClick={undoBuildPoint}><Icon name="undo" />{t('build.undoPoint')}</button>
            </div>
          </>
        ) : (
          <>
            <label className="cmd-check">
              <input type="checkbox" checked={c.secret} onChange={(e) => updateBuildCommand({ secret: e.target.checked })} />
              {t('build.secret')}
            </label>
            <p className="hint">{t('hint.buildDoor')}</p>
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
