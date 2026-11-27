/**
 * Command panel "Stufe" (E-87, E-6): over the map at its top right, not modal. The DM picks the
 * effect (raise, lower, set to a step – with a pipette), the brush (round, square on the grid, a
 * lasso) and its size, then paints on the map; every stroke is one step of undo. OK keeps the
 * strokes, Cancel or Escape takes back all of them since the panel opened. How painting is
 * previewed is a setting of this device.
 */
import type { KeyboardEvent } from 'react';
import type { BrushShape, StepMode } from '../core/build/terrain/stepTool';
import { STEP_MAX, STEP_MIN } from '../core/build/terrain/stepTool';
import type { MessageKey } from '../i18n/en';
import { useI18n } from '../i18n/i18n';
import { Icon, type IconName } from '../ui/Icon';
import { cancelTerrainCommand, finishTerrainCommand, setTerrainPreview, updateTerrainCommand, useStore, type TerrainPreview } from '../app/store';

const MODES: { id: StepMode; icon: IconName }[] = [
  { id: 'raise', icon: 'up' },
  { id: 'lower', icon: 'down' },
  { id: 'set', icon: 'equals' },
];

const SHAPES: { id: BrushShape; icon: IconName }[] = [
  { id: 'round', icon: 'brush' },
  { id: 'square', icon: 'rect' },
  { id: 'lasso', icon: 'lasso' },
];

const PREVIEWS: TerrainPreview[] = ['live', 'outline'];

export function TerrainCommandPanel() {
  const { t } = useI18n();
  const c = useStore((s) => s.terrainCommand);
  const preview = useStore((s) => s.terrainPreview);
  if (!c) return null;
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      cancelTerrainCommand();
    }
  };
  return (
    <form
      className="command-panel"
      aria-labelledby="terrain-cmd-title"
      onKeyDown={onKey}
      onSubmit={(e) => {
        e.preventDefault();
        finishTerrainCommand();
      }}
    >
      <div className="cmd-head">
        <b id="terrain-cmd-title">{t('terrain.cmd.title')}</b>
        <button type="button" className="ab-btn" title={t('start.cancel')} aria-label={t('start.cancel')} onClick={cancelTerrainCommand}><Icon name="close" /></button>
      </div>
      <div className="cmd-body">
        <div className="cmd-row" role="radiogroup" aria-label={t('terrain.cmd.mode')}>
          {MODES.map((m) => {
            const label = t(`terrain.mode.${m.id}` as MessageKey);
            return (
              <button key={m.id} type="button" role="radio" aria-checked={c.mode === m.id} className={`cmd-icon ${c.mode === m.id ? 'on' : ''}`} title={label} aria-label={label} onClick={() => updateTerrainCommand({ mode: m.id })}>
                <Icon name={m.icon} />
              </button>
            );
          })}
        </div>
        {c.mode === 'set' && (
          <div className="cmd-line">
            <label className="cmd-field">
              <span>{t('terrain.cmd.step')}</span>
              <input type="number" min={STEP_MIN} max={STEP_MAX} step={1} value={c.picked} onChange={(e) => updateTerrainCommand({ picked: Math.max(STEP_MIN, Math.min(STEP_MAX, Math.round(Number(e.target.value) || 0))) })} />
            </label>
            <button type="button" className={`cmd-icon ${c.picking ? 'on' : ''}`} aria-pressed={c.picking} title={t('terrain.cmd.pick')} aria-label={t('terrain.cmd.pick')} onClick={() => updateTerrainCommand({ picking: !c.picking })}>
              <Icon name="pipette" />
            </button>
          </div>
        )}
        {c.picking && <p className="hint" role="status">{t('terrain.cmd.picking')}</p>}
        <div className="cmd-row" role="radiogroup" aria-label={t('terrain.cmd.shape')}>
          {SHAPES.map((s) => {
            const label = t(`terrain.shape.${s.id}` as MessageKey);
            return (
              <button key={s.id} type="button" role="radio" aria-checked={c.shape === s.id} className={`cmd-icon ${c.shape === s.id ? 'on' : ''}`} title={label} aria-label={label} onClick={() => updateTerrainCommand({ shape: s.id })}>
                <Icon name={s.icon} />
              </button>
            );
          })}
        </div>
        {c.shape !== 'lasso' && (
          <label className="cmd-field">
            <span>{t('terrain.cmd.size')}</span>
            <input type="number" min={0.5} max={20} step={0.5} value={c.sizeCells} onChange={(e) => updateTerrainCommand({ sizeCells: Math.max(0.5, Math.min(20, Number(e.target.value) || 1)) })} />
          </label>
        )}
        <p className="hint">{t('terrain.cmd.hint')}</p>
        <label className="cmd-field">
          <span>{t('terrain.cmd.preview')}</span>
          <select value={preview} onChange={(e) => setTerrainPreview(e.target.value as TerrainPreview)}>
            {PREVIEWS.map((p) => (
              <option key={p} value={p}>{t(`terrain.preview.${p}` as MessageKey)}</option>
            ))}
          </select>
        </label>
      </div>
      <div className="cmd-buttons">
        <button type="button" className="btn" onClick={cancelTerrainCommand}>{t('start.cancel')}</button>
        <button type="submit" className="btn pri">{t('area.cmd.ok')}</button>
      </div>
    </form>
  );
}
