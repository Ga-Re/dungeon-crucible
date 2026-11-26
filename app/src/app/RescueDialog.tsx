/**
 * Offers the rescue copies of the campaign just opened (DC-003): documents whose save failed
 * last time. Each one is restored (written back, the campaign reloads) or discarded; "decide
 * later" keeps them for the next opening.
 */
import { useEffect, useState } from 'react';
import { useI18n } from '../i18n/i18n';
import { reloadCampaign } from './campaign';
import { discardRescue, restoreRescue } from './rescue';
import { emit, state, useStore } from './store';
import './start.css';

export function RescueDialog() {
  const { t, locale } = useI18n();
  const copies = useStore((s) => s.rescueOffer);
  const [busy, setBusy] = useState(false);
  const close = () => {
    state.rescueOffer = [];
    emit();
  };
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && close();
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, []);
  if (!copies.length) return null;
  const when = new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' });
  return (
    <div className="start-modal" role="presentation">
      <div className="start-dialog rescue-dialog" role="alertdialog" aria-modal="true" aria-labelledby="rescue-title" aria-describedby="rescue-text">
        <h2 id="rescue-title">{t('rescue.title')}</h2>
        <p id="rescue-text" className="start-lead">{t('rescue.intro')}</p>
        <ul className="rescue-list">
          {copies.map((c) => (
            <li key={c.path}>
              <span className="rescue-file" title={c.path}>
                <b>{c.path.split('/').pop()}</b>
                <span>{when.format(c.at)}</span>
              </span>
              <button type="button" className="btn" disabled={busy} onClick={() => discardRescue(c)}>{t('rescue.discard')}</button>
              <button
                type="button"
                className="btn pri"
                disabled={busy}
                onClick={() => {
                  setBusy(true);
                  void restoreRescue(c, reloadCampaign).finally(() => setBusy(false));
                }}
              >
                {t('rescue.restore')}
              </button>
            </li>
          ))}
        </ul>
        <div className="start-buttons">
          <button type="button" className="btn" disabled={busy} onClick={close} autoFocus>{t('rescue.close')}</button>
        </div>
      </div>
    </div>
  );
}
