/**
 * Command panel "Calibrate grid" (E-7, DC-021): over the map at its top right, not modal. The DM
 * drags a square over N×N cells of the map's printed grid; cell size and offset follow and show
 * live. Fine adjustment: dragging the box, the arrow keys, or typing the values. OK saves as one
 * step; Cancel or Escape brings the old grid back.
 */
import type { KeyboardEvent } from 'react';
import { useI18n } from '../i18n/i18n';
import { Icon } from '../ui/Icon';
import { CALIBRATION_CELLS, cancelCalibration, finishCalibration, setCalibrationCells, setCalibrationGrid, useStore } from '../app/store';

/** Typed values as numbers; an empty or unfinished field changes nothing. */
function num(v: string): number | undefined {
  const n = Number(v);
  return v.trim() === '' || !Number.isFinite(n) ? undefined : n;
}

export function CalibrationPanel() {
  const { t } = useI18n();
  const c = useStore((s) => s.calibration);
  const grid = useStore((s) => s.scene.map.grid);
  if (!c) return null;
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      cancelCalibration();
    }
  };
  const round = (v: number) => Math.round(v * 100) / 100;
  return (
    <form
      className="command-panel"
      // Measured values are not on any step; the store checks what it takes.
      noValidate
      aria-labelledby="calib-cmd-title"
      onKeyDown={onKey}
      onSubmit={(e) => {
        e.preventDefault();
        finishCalibration();
      }}
    >
      <div className="cmd-head">
        <b id="calib-cmd-title">{t('calib.title')}</b>
        <button type="button" className="ab-btn" title={t('start.cancel')} aria-label={t('start.cancel')} onClick={cancelCalibration}><Icon name="close" /></button>
      </div>
      <div className="cmd-body">
        <label className="cmd-field">
          <span>{t('calib.cells')}</span>
          <input type="number" min={CALIBRATION_CELLS.min} max={CALIBRATION_CELLS.max} step={1} value={c.cells} autoFocus onChange={(e) => setCalibrationCells(Number(e.target.value))} />
        </label>
        <p className="hint">{t('calib.hint', { n: c.cells })}</p>
        <label className="cmd-field">
          <span>{t('calib.cellSize')}</span>
          <input type="number" min={4} step="any" value={round(grid.cellWidth)} onChange={(e) => setCalibrationGrid({ cellWidth: num(e.target.value) })} />
        </label>
        <div className="cmd-two">
          <label className="cmd-field">
            <span>{t('calib.offsetX')}</span>
            <input type="number" step="any" value={round(grid.originX)} onChange={(e) => setCalibrationGrid({ originX: num(e.target.value) })} />
          </label>
          <label className="cmd-field">
            <span>{t('calib.offsetY')}</span>
            <input type="number" step="any" value={round(grid.originY)} onChange={(e) => setCalibrationGrid({ originY: num(e.target.value) })} />
          </label>
        </div>
        <p className="hint">{t('calib.fine')}</p>
      </div>
      <div className="cmd-buttons">
        <button type="button" className="btn" onClick={cancelCalibration}>{t('start.cancel')}</button>
        <button type="submit" className="btn pri">{t('area.cmd.ok')}</button>
      </div>
    </form>
  );
}
