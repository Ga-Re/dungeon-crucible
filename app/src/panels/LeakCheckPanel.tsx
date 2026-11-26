/**
 * The Map Forge's leak check (DC-025, E-43): gaps, open wall ends and doors touching no wall –
 * marked on the map and listed here (a click shows one) – and a test figure that shows live what a
 * character there would see. Nothing of it is saved; the TV never sees it.
 */
import type { KeyboardEvent } from 'react';
import type { MessageKey } from '../i18n/en';
import { useI18n } from '../i18n/i18n';
import { Icon } from '../ui/Icon';
import { currentLeaks, setLeakCheck, updateLeakCheck, useStore } from '../app/store';
import { mapCommands } from './MapView';

export function LeakCheckPanel() {
  const { t } = useI18n();
  const lc = useStore((s) => s.leakCheck);
  const leaks = useStore(() => currentLeaks());
  if (!lc) return null;
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      setLeakCheck(false);
    }
  };
  return (
    <form className="command-panel" aria-labelledby="leak-cmd-title" onKeyDown={onKey} onSubmit={(e) => e.preventDefault()}>
      <div className="cmd-head">
        <b id="leak-cmd-title">{t('leak.title')}</b>
        <button type="button" className="ab-btn" title={t('leak.close')} aria-label={t('leak.close')} onClick={() => setLeakCheck(false)}><Icon name="close" /></button>
      </div>
      <div className="cmd-body">
        <label className="cmd-check">
          <input type="checkbox" checked={!!lc.figure} onChange={(e) => updateLeakCheck({ figure: e.target.checked ? mapCommands.centre() : null })} />
          {t('leak.figure')}
        </label>
        {lc.figure && (
          <label className="cmd-field">
            <span>{t('leak.darkvision')}</span>
            <input type="number" min={0} step={5} value={lc.darkvisionFt} onChange={(e) => updateLeakCheck({ darkvisionFt: Math.max(0, Number(e.target.value) || 0) })} />
          </label>
        )}
        <div className="sec">{leaks.length ? t('leak.found', { n: leaks.length }) : t('leak.none')}</div>
        {leaks.length > 0 && (
          <ul className="leak-list">
            {leaks.map((l, i) => (
              <li key={i}>
                <button type="button" onClick={() => mapCommands.show(l.to ? { x: (l.at.x + l.to.x) / 2, y: (l.at.y + l.to.y) / 2 } : l.at)}>
                  <Icon name={l.kind === 'door' ? 'door' : 'wall'} />{t(`leak.${l.kind}` as MessageKey)}
                </button>
              </li>
            ))}
          </ul>
        )}
        <p className="hint">{t('leak.hint')}</p>
      </div>
    </form>
  );
}
