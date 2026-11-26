/**
 * Offers the rescue copies of the campaign just opened (DC-003): documents whose save failed
 * last time. Each one is restored (written back, the campaign reloads) or discarded; "decide
 * later" keeps them for the next opening. A file changed since the copy is only overwritten after
 * the DM confirms; one from a newer app version never.
 */
import { useEffect, useState } from 'react';
import type { RescueCopy } from '../core/rescue';
import { useI18n } from '../i18n/i18n';
import { reloadCampaign } from './campaign';
import { discardRescue, restoreRescue, type RestoreResult } from './rescue';
import { emit, state, useStore } from './store';
import './start.css';

const keyOf = (c: RescueCopy) => `${c.session}:${c.path}`;

export function closeRescueOffer(): void {
  state.rescueOffer = [];
  emit();
}

export function RescueDialog() {
  const { t, locale } = useI18n();
  const copies = useStore((s) => s.rescueOffer);
  const [busy, setBusy] = useState(false);
  /** What the last restore of a copy said, if it did not restore. */
  const [issues, setIssues] = useState<Record<string, Exclude<RestoreResult, 'restored'>>>({});
  const open = copies.length > 0;
  useEffect(() => {
    if (!open || busy) return;
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && closeRescueOffer();
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [open, busy]);
  if (!open) return null;
  const when = new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' });
  const restore = (c: RescueCopy, overwrite: boolean) => {
    setBusy(true);
    void restoreRescue(c, reloadCampaign, overwrite)
      .then((r) => setIssues(({ [keyOf(c)]: _, ...rest }) => (r === 'restored' ? rest : { ...rest, [keyOf(c)]: r })))
      .finally(() => setBusy(false));
  };
  return (
    <div className="start-modal" role="presentation">
      <div className="start-dialog rescue-dialog" role="alertdialog" aria-modal="true" aria-labelledby="rescue-title" aria-describedby="rescue-text">
        <h2 id="rescue-title">{t('rescue.title')}</h2>
        <p id="rescue-text" className="start-lead">{t('rescue.intro')}</p>
        <ul className="rescue-list">
          {copies.map((c) => {
            const issue = issues[keyOf(c)];
            return (
              <li key={keyOf(c)}>
                <div className="rescue-row">
                  <span className="rescue-file" title={c.path}>
                    <b>{c.path.split('/').pop()}</b>
                    <span>{c.path.split('/').slice(0, -1).join('/')} · {when.format(c.at)}</span>
                  </span>
                  <button type="button" className="btn" disabled={busy} onClick={() => discardRescue(c)}>{t('rescue.discard')}</button>
                  {issue === 'changed' ? (
                    <button type="button" className="btn danger" disabled={busy} onClick={() => restore(c, true)}>{t('rescue.overwrite')}</button>
                  ) : (
                    <button type="button" className="btn pri" disabled={busy || issue === 'newer'} onClick={() => restore(c, false)}>{t('rescue.restore')}</button>
                  )}
                </div>
                {issue && <p className="rescue-issue" role="alert">{t(`rescue.${issue}`)}</p>}
              </li>
            );
          })}
        </ul>
        <div className="start-buttons">
          <button type="button" className="btn" disabled={busy} onClick={closeRescueOffer} autoFocus>{t('rescue.close')}</button>
        </div>
      </div>
    </div>
  );
}
