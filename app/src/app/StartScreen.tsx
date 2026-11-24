/**
 * Start screen of the desktop app: recently used campaigns for quick access, a new campaign
 * (empty or with the sample crypt), open a campaign folder, import a campaign archive.
 */
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useI18n } from '../i18n/i18n';
import type { RecentStatus } from '../platform/bridge';
import { Icon } from '../ui/Icon';
import { AppearanceControls } from './Appearance';
import { forgetRecent, importCampaign, newCampaign, openCampaignDialog, openRecent, refreshRecent } from './campaign';
import { state, useStore, emit } from './store';
import './start.css';

export function StartScreen() {
  const { t } = useI18n();
  const recent = useStore((s) => s.recent);
  const notice = useStore((s) => s.notice);
  const [status, setStatus] = useState<Map<string, RecentStatus>>(new Map());
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void refreshRecent().then(setStatus);
  }, []);

  /** Runs one action at a time (each may show a system dialog). */
  const run = (fn: () => Promise<void>) => async () => {
    if (busy) return;
    state.notice = null;
    emit();
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
      if (state.home) setStatus(await refreshRecent());
    }
  };

  return (
    <div className="start">
      <header className="start-top">
        <div className="brand"><span className="mark"><Icon name="anvil" /></span>{t('app.name')}</div>
        <div className="ab-right"><AppearanceControls /></div>
      </header>
      <main className="start-main">
        <section className="start-actions" aria-labelledby="start-title">
          <h1 id="start-title">{t('start.title')}</h1>
          <p className="start-lead">{t('start.lead')}</p>
          <button className="start-action primary" disabled={busy} onClick={() => setCreating(true)}>
            <Icon name="plus" />
            <span><b>{t('start.new')}</b><small>{t('start.newHint')}</small></span>
          </button>
          <button className="start-action" disabled={busy} onClick={run(openCampaignDialog)}>
            <Icon name="folder" />
            <span><b>{t('start.open')}</b><small>{t('start.openHint')}</small></span>
          </button>
          <button className="start-action" disabled={busy} onClick={run(importCampaign)}>
            <Icon name="archive" />
            <span><b>{t('start.import')}</b><small>{t('start.importHint')}</small></span>
          </button>
          {notice && <p className="start-notice" role="alert">{t(notice.key, notice.params)}</p>}
        </section>

        <section className="start-recent" aria-labelledby="start-recent">
          <h2 id="start-recent">{t('start.recent')}</h2>
          {recent.length === 0 ? (
            <p className="hint">{t('start.recentEmpty')}</p>
          ) : (
            <ul>
              {recent.map((r) => {
                const missing = status.get(r.root) === 'missing';
                return (
                  <li key={r.root} className={missing ? 'missing' : ''}>
                    <button className="start-recent-open" disabled={busy || missing} onClick={run(() => openRecent(r.root))} title={r.root}>
                      <Icon name="map" />
                      <span className="start-recent-text">
                        <b>{r.name}</b>
                        <span className="start-path">{r.root}</span>
                      </span>
                      <span className="start-when">{missing ? t('start.missing') : <When at={r.openedAt} />}</span>
                    </button>
                    <button className="start-recent-remove" title={t('start.forget')} aria-label={`${t('start.forget')}: ${r.name}`} onClick={() => forgetRecent(r.root)}>
                      <Icon name="close" />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </main>
      {creating && (
        <NewCampaignDialog
          busy={busy}
          onCancel={() => setCreating(false)}
          onCreate={(name, sample) => void run(async () => {
            await newCampaign(name, sample);
            if (!state.home) return;
            setCreating(false);
          })()}
        />
      )}
    </div>
  );
}

/** "3 days ago" in the current language. */
function When({ at }: { at: number }) {
  const { locale } = useI18n();
  if (!at) return null;
  const diff = (at - Date.now()) / 1000;
  const units: [Intl.RelativeTimeFormatUnit, number][] = [['year', 31536000], ['month', 2592000], ['week', 604800], ['day', 86400], ['hour', 3600], ['minute', 60]];
  const fmt = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  for (const [unit, sec] of units) if (Math.abs(diff) >= sec) return <>{fmt.format(Math.round(diff / sec), unit)}</>;
  return <>{fmt.format(0, 'minute')}</>;
}

function NewCampaignDialog({ busy, onCancel, onCreate }: { busy: boolean; onCancel: () => void; onCreate: (name: string, sample: boolean) => void }) {
  const { t } = useI18n();
  const [name, setName] = useState(() => t('start.defaultName'));
  const [sample, setSample] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    input.current?.select();
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onCancel();
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [onCancel]);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (name.trim()) onCreate(name.trim(), sample);
  };
  return (
    <div className="start-modal" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && onCancel()}>
      <form className="start-dialog" role="dialog" aria-modal="true" aria-labelledby="new-title" onSubmit={submit}>
        <h2 id="new-title">{t('start.new')}</h2>
        <label className="start-field">
          <span>{t('start.name')}</span>
          <input ref={input} value={name} maxLength={80} onChange={(e) => setName(e.target.value)} required />
        </label>
        <fieldset className="start-choice">
          <legend>{t('start.content')}</legend>
          <label className={!sample ? 'on' : ''}>
            <input type="radio" name="content" checked={!sample} onChange={() => setSample(false)} />
            <span><b>{t('start.empty')}</b><small>{t('start.emptyHint')}</small></span>
          </label>
          <label className={sample ? 'on' : ''}>
            <input type="radio" name="content" checked={sample} onChange={() => setSample(true)} />
            <span><b>{t('start.sample')}</b><small>{t('start.sampleHint')}</small></span>
          </label>
        </fieldset>
        <p className="hint">{t('start.whereHint')}</p>
        <div className="start-buttons">
          <button type="button" className="btn" onClick={onCancel}>{t('start.cancel')}</button>
          <button type="submit" className="btn pri" disabled={busy || !name.trim()}>{t('start.create')}</button>
        </div>
      </form>
    </div>
  );
}
