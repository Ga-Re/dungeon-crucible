/** Export the open campaign as an archive: campaign data only, or with the library files it uses. */
import { useEffect, useState, type FormEvent } from 'react';
import { useI18n } from '../i18n/i18n';
import { exportCampaign } from './campaign';
import './start.css';

export function ExportDialog({ onClose }: { onClose: () => void }) {
  const { t } = useI18n();
  const [full, setFull] = useState(true);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [onClose]);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await exportCampaign(full);
    } finally {
      setBusy(false);
      onClose();
    }
  };
  return (
    <div className="start-modal" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form className="start-dialog" role="dialog" aria-modal="true" aria-labelledby="export-title" onSubmit={(e) => void submit(e)}>
        <h2 id="export-title">{t('export.title')}</h2>
        <fieldset className="start-choice">
          <legend>{t('export.content')}</legend>
          <label className={full ? 'on' : ''}>
            <input type="radio" name="export" checked={full} onChange={() => setFull(true)} />
            <span><b>{t('export.full')}</b><small>{t('export.fullHint')}</small></span>
          </label>
          <label className={!full ? 'on' : ''}>
            <input type="radio" name="export" checked={!full} onChange={() => setFull(false)} />
            <span><b>{t('export.campaignOnly')}</b><small>{t('export.campaignOnlyHint')}</small></span>
          </label>
        </fieldset>
        <div className="start-buttons">
          <button type="button" className="btn" onClick={onClose}>{t('start.cancel')}</button>
          <button type="submit" className="btn pri" disabled={busy}>{t('export.go')}</button>
        </div>
      </form>
    </div>
  );
}
