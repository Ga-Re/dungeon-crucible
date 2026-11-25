/**
 * Start screen of the desktop app. First start: choose the root folder (library and campaigns).
 * Then: the campaigns of the root folder (most recently opened first), a new campaign (empty or
 * with the sample crypt), import a campaign archive, change the root folder.
 */
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useI18n } from '../i18n/i18n';
import { Icon } from '../ui/Icon';
import { AppearanceControls } from './Appearance';
import { importCampaign, listCampaigns, newCampaign, openCampaign, refreshRoot, setRootFolder, trashCampaign, type CampaignEntry } from './campaign';
import { emit, state, useStore } from './store';
import './start.css';

export function StartScreen() {
  const { t } = useI18n();
  const root = useStore((s) => s.root);
  const notice = useStore((s) => s.notice);
  const [campaigns, setCampaigns] = useState<CampaignEntry[]>([]);
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirmTrash, setConfirmTrash] = useState<string | null>(null);

  const reload = async () => setCampaigns(await listCampaigns());
  useEffect(() => {
    void refreshRoot();
  }, []);
  useEffect(() => {
    void reload();
  }, [root?.root]);

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
      if (state.home) await reload();
    }
  };

  const top = (
    <header className="start-top">
      <div className="brand"><span className="mark"><Icon name="anvil" /></span>{t('app.name')}</div>
      <div className="ab-right"><AppearanceControls /></div>
    </header>
  );

  if (!root) return <div className="start">{top}</div>;

  if (!root.root) {
    return (
      <div className="start">
        {top}
        <main className="start-setup">
          <h1>{t('start.setup.title')}</h1>
          <p className="start-lead">{t('start.setup.lead')}</p>
          <button className="start-action primary" disabled={busy} onClick={run(() => setRootFolder(true))}>
            <Icon name="folder" />
            <span><b>{t('start.setup.suggested')}</b><small className="start-path-inline">{root.suggested}</small></span>
          </button>
          <button className="start-action" disabled={busy} onClick={run(() => setRootFolder(false))}>
            <Icon name="folder" />
            <span><b>{t('start.setup.choose')}</b><small>{t('start.setup.chooseHint')}</small></span>
          </button>
          <p className="hint">{t('start.setup.sync')}</p>
        </main>
      </div>
    );
  }

  return (
    <div className="start">
      {top}
      <main className="start-main">
        <section className="start-actions" aria-labelledby="start-title">
          <h1 id="start-title">{t('start.title')}</h1>
          <p className="start-lead">{t('start.lead')}</p>
          <button className="start-action primary" disabled={busy} onClick={() => setCreating(true)}>
            <Icon name="plus" />
            <span><b>{t('start.new')}</b><small>{t('start.newHint')}</small></span>
          </button>
          <button className="start-action" disabled={busy} onClick={run(importCampaign)}>
            <Icon name="archive" />
            <span><b>{t('start.import')}</b><small>{t('start.importHint')}</small></span>
          </button>
          <div className="start-root">
            <span className="hint">{t('start.root')}</span>
            <span className="start-path" title={root.root}>{root.root}</span>
            <button className="btn sm" disabled={busy} onClick={run(() => setRootFolder(false))}>{t('start.changeRoot')}</button>
          </div>
          {notice && <p className="start-notice" role="alert">{t(notice.key, notice.params)}</p>}
        </section>

        <section className="start-recent" aria-labelledby="start-recent">
          <h2 id="start-recent">{t('start.campaigns')}</h2>
          {campaigns.length === 0 ? (
            <p className="hint">{t('start.campaignsEmpty')}</p>
          ) : (
            <ul>
              {campaigns.map((c) => {
                const blocked = c.status !== 'ok';
                return (
                  <li key={c.slug} className={blocked ? 'missing' : ''}>
                    <button className="start-recent-open" disabled={busy || blocked} onClick={run(() => openCampaign(c.slug))} title={`campaigns/${c.slug}`}>
                      <Icon name="map" />
                      <span className="start-recent-text">
                        <b>{c.name}</b>
                        <span className="start-path">campaigns/{c.slug}</span>
                      </span>
                      <span className="start-when">
                        {c.status === 'newer' ? t('start.newer') : c.status === 'invalid' ? t('start.invalid') : <When at={c.openedAt || c.modifiedAt} />}
                      </span>
                    </button>
                    {confirmTrash === c.slug ? (
                      <span className="start-confirm">
                        <button className="btn sm danger" disabled={busy} onClick={run(async () => { await trashCampaign(c.slug); setConfirmTrash(null); })}>{t('start.trashConfirm')}</button>
                        <button className="btn sm" onClick={() => setConfirmTrash(null)}>{t('start.cancel')}</button>
                      </span>
                    ) : (
                      <button className="start-recent-remove" title={t('start.trash')} aria-label={`${t('start.trash')}: ${c.name}`} onClick={() => setConfirmTrash(c.slug)}>
                        <Icon name="trash" />
                      </button>
                    )}
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
        <div className="start-buttons">
          <button type="button" className="btn" onClick={onCancel}>{t('start.cancel')}</button>
          <button type="submit" className="btn pri" disabled={busy || !name.trim()}>{t('start.create')}</button>
        </div>
      </form>
    </div>
  );
}
