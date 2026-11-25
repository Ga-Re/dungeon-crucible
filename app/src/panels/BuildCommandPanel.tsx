/**
 * Command panel of the "Build" tab (E-33, E-6): over the map at its top right, not modal. "Wall":
 * style, thickness and snapping, then click the wall point by point – each wall is added when it
 * ends. "Door": secret or not, then click a drawn wall. Done (or Escape) ends the command.
 */
import type { KeyboardEvent } from 'react';
import type { BuildSnap } from '../core/build/editing';
import { MASONRY_STYLES } from '../core/build/masonry';
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
  const title = t(c.kind === 'wall' ? 'build.cmd.wall' : 'build.cmd.door');
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
        {c.kind === 'wall' ? (
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
