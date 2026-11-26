/**
 * The map's storeys in the Browser (DC-020, E-40): the map itself and the storeys above and
 * cellars below it, highest first. A click works on a storey (its elements, figures and fog). In
 * the Map Forge storeys are added above or below, renamed in place and deleted with confirmation.
 */
import { useState } from 'react';
import { useI18n } from '../i18n/i18n';
import { Icon } from '../ui/Icon';
import { addStorey, areaToFootprint, clearFootprint, deleteStorey, moveTokenToStorey, renameStorey, setTvStorey, setWorkingStorey, useStore } from '../app/store';

export function StoreyList() {
  const { t } = useI18n();
  const storeys = useStore((s) => s.scene.map.storeys ?? []);
  const here = useStore((s) => s.scene.map.storey ?? '');
  const tv = useStore((s) => (s.layer !== 'map' ? (s.scene.tvStorey ?? '') : null));
  const forge = useStore((s) => s.layer === 'map');
  const selectedToken = useStore((s) => (s.layer !== 'map' ? s.selectedTokenId : null));
  const selectedZone = useStore((s) => (s.layer === 'map' && s.scene.map.storey ? s.selectedZoneId : null));
  const handDrawn = useStore((s) => (s.scene.map.storeys ?? []).find((x) => x.id === s.scene.map.storey)?.footprint.length ?? 0);
  const [editing, setEditing] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);
  // In a scene there is nothing to choose on a map without storeys.
  if (!forge && storeys.length === 0) return null;
  const rows = [...storeys.map((s) => ({ id: s.id, name: s.name, level: s.level })), { id: '', name: t('storey.ground'), level: 0 }].sort((a, b) => b.level - a.level);
  return (
    <div className="layer-list">
      <div className="sec">{t('storey.title')}</div>
      <ul className="tree">
        {rows.map((r) => (
          <li key={r.id || 'ground'}>
            <div className={`tn ${here === r.id ? 'sel' : ''}`}>
              {editing === r.id && r.id ? (
                <input
                  autoFocus
                  defaultValue={r.name}
                  aria-label={t('storey.name')}
                  onBlur={(e) => { renameStorey(r.id, e.target.value); setEditing(null); }}
                  onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') setEditing(null); }}
                />
              ) : (
                <button className="library-open" title={t('storey.work')} aria-pressed={here === r.id} onClick={() => setWorkingStorey(r.id)} onDoubleClick={() => forge && r.id && setEditing(r.id)}>
                  <Icon name="map" /><span className="nm">{r.name}</span>
                </button>
              )}
              <span className="meta mono">{r.level > 0 ? `+${r.level}` : r.level}</span>
              {tv !== null && (
                <button className={`ab-btn ${tv === r.id ? 'on' : ''}`} title={t(tv === r.id ? 'storey.onTv' : 'storey.toTv')} aria-label={`${t(tv === r.id ? 'storey.onTv' : 'storey.toTv')}: ${r.name}`} aria-pressed={tv === r.id} onClick={() => setTvStorey(r.id)}><Icon name="monitor" /></button>
              )}
              {selectedToken && here !== r.id && (
                <button className="ab-btn" title={t('storey.moveToken')} aria-label={`${t('storey.moveToken')}: ${r.name}`} onClick={() => moveTokenToStorey(selectedToken, r.id)}><Icon name="token" /></button>
              )}
              {forge && r.id && <button className="ab-btn" title={t('storey.delete')} aria-label={`${t('storey.delete')}: ${r.name}`} onClick={() => setConfirm(r.id)}><Icon name="trash" /></button>}
            </div>
            {confirm === r.id && (
              <div className="library-confirm" role="alert">
                <p>{t('storey.deleteConfirm', { name: r.name })}</p>
                <div className="library-buttons">
                  <button className="btn sm danger" onClick={() => { deleteStorey(r.id); setConfirm(null); }}>{t('storey.delete')}</button>
                  <button className="btn sm" onClick={() => setConfirm(null)}>{t('start.cancel')}</button>
                </div>
              </div>
            )}
          </li>
        ))}
      </ul>
      {forge && here && (
        <div className="library-buttons">
          <button className="btn sm" disabled={!selectedZone} title={t('storey.areaHint')} onClick={() => selectedZone && areaToFootprint(selectedZone)}><Icon name="zone" />{t('storey.addArea')}</button>
          {handDrawn > 0 && <button className="btn sm" onClick={clearFootprint}><Icon name="close" />{t('storey.clearArea')}</button>}
        </div>
      )}
      {forge && (
        <div className="library-buttons">
          <button className="btn sm" onClick={() => addStorey('', true)}><Icon name="up" />{t('storey.addUp')}</button>
          <button className="btn sm" onClick={() => addStorey('', false)}><Icon name="down" />{t('storey.addDown')}</button>
        </div>
      )}
    </div>
  );
}
