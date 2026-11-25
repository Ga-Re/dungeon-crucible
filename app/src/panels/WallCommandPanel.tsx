/**
 * Command panel "Draw walls" (DC-014, E-6): over the map at its top right, not modal. The DM
 * picks the kind (wall, door, secret door, window, cliff) and whether clicks chain, then clicks the
 * pieces on the map. Nothing is saved before OK; Cancel or Escape discards.
 */
import type { KeyboardEvent } from 'react';
import type { WallKind } from '../core/scene';
import type { MessageKey } from '../i18n/en';
import { useI18n } from '../i18n/i18n';
import { Icon, type IconName } from '../ui/Icon';
import { cancelWallCommand, finishWallCommand, undoWallPoint, updateWallCommand, useStore } from '../app/store';

const KINDS: { id: WallKind; icon: IconName }[] = [
  { id: 'wall', icon: 'wall' },
  { id: 'door', icon: 'door' },
  { id: 'secret-door', icon: 'secretdoor' },
  { id: 'window', icon: 'window' },
  { id: 'cliff', icon: 'cliff' },
];

export function WallCommandPanel() {
  const { t } = useI18n();
  const c = useStore((s) => s.wallCommand);
  if (!c) return null;
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      cancelWallCommand();
    }
  };
  return (
    <form
      className="command-panel"
      aria-labelledby="wall-cmd-title"
      onKeyDown={onKey}
      onSubmit={(e) => {
        e.preventDefault();
        finishWallCommand();
      }}
    >
      <div className="cmd-head">
        <b id="wall-cmd-title">{t('wall.cmd.title')}</b>
        <button type="button" className="ab-btn" title={t('start.cancel')} aria-label={t('start.cancel')} onClick={cancelWallCommand}><Icon name="close" /></button>
      </div>
      <div className="cmd-body">
        <div className="cmd-row" role="radiogroup" aria-label={t('wall.cmd.kind')}>
          {KINDS.map((k) => {
            const label = t(`wall.kind.${k.id}` as MessageKey);
            return (
              <button key={k.id} type="button" role="radio" aria-checked={c.kind === k.id} className={`cmd-icon ${c.kind === k.id ? 'on' : ''}`} title={label} aria-label={label} onClick={() => updateWallCommand({ kind: k.id })}>
                <Icon name={k.icon} />
              </button>
            );
          })}
        </div>
        <p className="hint"><b>{t(`wall.kind.${c.kind}` as MessageKey)}:</b> {t(`wall.about.${c.kind}` as MessageKey)}</p>
        {c.kind === 'cliff' && (
          <button type="button" className="btn sm" aria-pressed={c.flip} onClick={() => updateWallCommand({ flip: !c.flip })}><Icon name="redo" />{t('wall.flip')}</button>
        )}
        <label className="cmd-check">
          <input type="checkbox" checked={c.chain} onChange={(e) => updateWallCommand({ chain: e.target.checked })} />
          {t('wall.cmd.chain')}
        </label>
        <p className="hint">{t('wall.cmd.hint')}</p>
        <div className="cmd-line">
          <span className="hint" role="status">{t('wall.cmd.count', { n: c.walls.length })}</span>
          <button type="button" className="btn sm" disabled={c.walls.length === 0} onClick={undoWallPoint}><Icon name="undo" />{t('wall.cmd.undo')}</button>
        </div>
      </div>
      <div className="cmd-buttons">
        <button type="button" className="btn" onClick={cancelWallCommand}>{t('start.cancel')}</button>
        <button type="submit" className="btn pri">{t('area.cmd.ok')}</button>
      </div>
    </form>
  );
}
