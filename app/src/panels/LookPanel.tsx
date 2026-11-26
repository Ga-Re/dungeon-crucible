/**
 * "Adjust picture" (DC-022, E-42): turn the map in 90° steps (everything on it turns along), cut
 * the picture to a rectangle dragged on the map, and adjust brightness, contrast, saturation and
 * hue – a preview in the DM window until OK, one undoable step then. The file is never changed;
 * the TV shows the same once applied.
 */
import { useEffect, useState, type KeyboardEvent } from 'react';
import type { MessageKey } from '../i18n/en';
import { useI18n } from '../i18n/i18n';
import { Icon } from '../ui/Icon';
import { cancelLookCommand, finishLookCommand, setCropping, updateLook, useStore } from '../app/store';
import type { MapLook } from '../core/sidecar';

const PLAIN = { brightness: 1, contrast: 1, saturation: 1, hue: 0 };
const SLIDERS: { field: keyof typeof PLAIN; label: MessageKey; min: number; max: number; step: number; unit: string; scale: number }[] = [
  { field: 'brightness', label: 'look.brightness', min: 20, max: 200, step: 5, unit: '%', scale: 100 },
  { field: 'contrast', label: 'look.contrast', min: 20, max: 200, step: 5, unit: '%', scale: 100 },
  { field: 'saturation', label: 'look.saturation', min: 0, max: 200, step: 5, unit: '%', scale: 100 },
  { field: 'hue', label: 'look.hue', min: -180, max: 180, step: 5, unit: '°', scale: 1 },
];

export function LookPanel() {
  const { t } = useI18n();
  const c = useStore((s) => s.lookCommand);
  const picture = useStore((s) => !!s.scene.map.imageUrl);
  if (!c) return null;
  const d = c.draft;
  const adjust = d.adjust ?? PLAIN;
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      cancelLookCommand();
    }
  };
  const turn = (by: number) => updateLook({ rotation: ((((d.rotation + by) % 360) + 360) % 360) as MapLook['rotation'] });
  const setAdjust = (patch: Partial<typeof PLAIN>) => {
    const next = { ...adjust, ...patch };
    const plain = next.brightness === 1 && next.contrast === 1 && next.saturation === 1 && next.hue === 0;
    updateLook({ adjust: plain ? undefined : next });
  };
  return (
    <form className="command-panel" aria-labelledby="look-cmd-title" onKeyDown={onKey} onSubmit={(e) => { e.preventDefault(); finishLookCommand(); }}>
      <div className="cmd-head">
        <b id="look-cmd-title">{t('look.title')}</b>
        <button type="button" className="ab-btn" title={t('start.cancel')} aria-label={t('start.cancel')} onClick={cancelLookCommand}><Icon name="close" /></button>
      </div>
      <div className="cmd-body">
        <div className="cmd-line">
          <span>{t('look.turn')}</span>
          <button type="button" className="btn sm" title={t('look.turnLeft')} aria-label={t('look.turnLeft')} onClick={() => turn(-90)}><Icon name="undo" /></button>
          <b className="mono">{d.rotation}°</b>
          <button type="button" className="btn sm" title={t('look.turnRight')} aria-label={t('look.turnRight')} onClick={() => turn(90)}><Icon name="redo" /></button>
        </div>
        {picture ? (
          <>
            {SLIDERS.map(({ field, ...sl }) => <AdjustRow key={field} {...sl} value={adjust[field]} onCommit={(v) => setAdjust({ [field]: v })} />)}
            <div className="cmd-line">
              <button type="button" className={`btn sm ${c.cropping ? 'pri' : ''}`} aria-pressed={!!c.cropping} onClick={() => setCropping(!c.cropping)}><Icon name="rect" />{t('look.crop')}</button>
              {d.crop && <button type="button" className="btn sm" onClick={() => updateLook({ crop: undefined })}><Icon name="close" />{t('look.noCrop')}</button>}
            </div>
            {c.cropping && <p className="hint">{t('look.cropHint')}</p>}
          </>
        ) : <p className="hint">{t('look.drawnHint')}</p>}
        <p className="hint">{t('look.hint')}</p>
      </div>
      <div className="cmd-buttons">
        <button type="button" className="btn" onClick={cancelLookCommand}>{t('start.cancel')}</button>
        <button type="submit" className="btn pri">{t('look.apply')}</button>
      </div>
    </form>
  );
}

/** One slider; the picture is redrawn when it is let go, not on every step. */
function AdjustRow({ label, min, max, step, unit, scale, value, onCommit }: { label: MessageKey; min: number; max: number; step: number; unit: string; scale: number; value: number; onCommit: (v: number) => void }) {
  const { t } = useI18n();
  const [v, setV] = useState(Math.round(value * scale));
  useEffect(() => setV(Math.round(value * scale)), [value, scale]);
  const commit = () => {
    if (v !== Math.round(value * scale)) onCommit(v / scale);
  };
  const id = `look-${label}`;
  return (
    <div className="row">
      <label htmlFor={id}>{t(label)} <span className="mono hint">{v}{unit}</span></label>
      <input id={id} type="range" min={min} max={max} step={step} value={v} onChange={(e) => setV(Number(e.target.value))} onMouseUp={commit} onTouchEnd={commit} onKeyUp={commit} onBlur={commit} />
    </div>
  );
}
