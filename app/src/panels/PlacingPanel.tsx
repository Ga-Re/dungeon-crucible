/**
 * The placing mode's command panel (E-31, DC-116): what is placed with each click on the map – a
 * chosen or random variant, a random or fixed turn, a random size, snapping. Esc, a right click on
 * the map or ✕ end it.
 */
import type { KeyboardEvent } from 'react';
import type { MessageKey } from '../i18n/en';
import { useI18n } from '../i18n/i18n';
import { Icon } from '../ui/Icon';
import { setPlacing, stopPlacing, useStore } from '../app/store';

const STEPS: { id: 'free' | 15 | 90; label: MessageKey }[] = [
  { id: 'free', label: 'placing.free' },
  { id: 15, label: 'placing.step15' },
  { id: 90, label: 'placing.step90' },
];

export function PlacingPanel() {
  const { t } = useI18n();
  const p = useStore((s) => s.placing);
  const o = useStore((s) => s.placeOptions);
  const items = useStore((s) => s.vault.items);
  if (!p) return null;
  const nameOf = (path: string) => items.find((i) => i.relPath === path)?.asset.name ?? path;
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      stopPlacing();
    }
  };
  return (
    <form className="command-panel" aria-labelledby="place-cmd-title" onKeyDown={onKey} onSubmit={(e) => e.preventDefault()}>
      <div className="cmd-head">
        <b id="place-cmd-title">{t('placing.title', { name: p.name })}</b>
        <button type="button" className="ab-btn" title={t('placing.stop')} aria-label={t('placing.stop')} onClick={stopPlacing}><Icon name="close" /></button>
      </div>
      <div className="cmd-body">
        {p.variants.length > 1 && (
          <label className="cmd-field">
            <span>{t('vault.variant')}</span>
            <select value={p.variant} onChange={(e) => setPlacing({ variant: e.target.value })}>
              <option value="random">{t('placing.randomVariant')}</option>
              {p.variants.map((v) => <option key={v} value={v}>{nameOf(v)}</option>)}
            </select>
          </label>
        )}
        {/* Random among one: the others are insides of houses (never placed at random). */}
        {p.variant === 'random' && p.random.length < 2 && p.variants.length > 1 && <p className="hint">{t('placing.oneChoice')}</p>}
        <label className="cmd-check">
          <input type="checkbox" checked={o.randomRotation} onChange={(e) => setPlacing({ randomRotation: e.target.checked })} />
          {t('placing.randomRotation')}
        </label>
        {o.randomRotation ? (
          <div className="seg cmd-seg" role="radiogroup" aria-label={t('placing.step')}>
            {STEPS.map((s) => (
              <button key={s.id} type="button" role="radio" aria-checked={o.rotationStep === s.id} className={o.rotationStep === s.id ? 'on' : ''} onClick={() => setPlacing({ rotationStep: s.id })}>{t(s.label)}</button>
            ))}
          </div>
        ) : (
          <label className="cmd-field">
            <span>{t('placed.rotation')}</span>
            <input type="number" step={15} value={o.rotation} onChange={(e) => setPlacing({ rotation: ((Number(e.target.value) % 360) + 360) % 360 })} />
          </label>
        )}
        <label className="cmd-check">
          <input type="checkbox" checked={o.randomScale} onChange={(e) => setPlacing({ randomScale: e.target.checked })} />
          {t('placing.randomScale')}
        </label>
        {o.randomScale && (
          <label className="cmd-field">
            <span>{t('placing.spread')}</span>
            <input type="number" min={1} max={50} step={1} value={Math.round(o.scaleSpread * 100)} onChange={(e) => setPlacing({ scaleSpread: Math.min(0.5, Math.max(0.01, Number(e.target.value) / 100)) })} />
          </label>
        )}
        <label className="cmd-check">
          <input type="checkbox" checked={o.snap} onChange={(e) => setPlacing({ snap: e.target.checked })} />
          {t('placing.snap')}
        </label>
        <p className="hint">{t('placing.hint')}</p>
      </div>
      <div className="cmd-buttons">
        <button type="button" className="btn" onClick={stopPlacing}>{t('placing.done')}</button>
      </div>
    </form>
  );
}
