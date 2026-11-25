/**
 * The map's layers in the Browser (E-28, DC-101). In the Map Forge: the current layer (new
 * elements land on it), editor visibility and lock, order (height), and each layer's settings –
 * name, default, trigger area, counter layer – edited in place, delete with confirmation. In a
 * scene: which layers are active there, switched by hand.
 */
import { useState } from 'react';
import { activeLayers, BASE_LAYER } from '../core/layers';
import type { MapLayer } from '../core/sidecar';
import { useI18n } from '../i18n/i18n';
import { Icon } from '../ui/Icon';
import { createLayer, deleteLayer, moveLayer, setCurrentLayer, setLayerActive, updateLayer, useStore } from '../app/store';

export function LayerList() {
  const { t } = useI18n();
  const layers = useStore((s) => s.scene.map.layers);
  const current = useStore((s) => s.currentLayer);
  const inScene = useStore((s) => s.layer !== 'map');
  const switched = useStore((s) => s.scene.layersOn);
  const [open, setOpen] = useState<string | null>(null);
  const sorted = [...layers].sort((a, b) => b.height - a.height);
  if (inScene) {
    // In a scene: which layers are active here (E-28); editing them is the Map Forge's.
    if (layers.length === 0) return null;
    const active = activeLayers(layers, switched);
    return (
      <div className="layer-list">
        <div className="sec">{t('layers.title')}</div>
        <ul className="tree">
          {sorted.map((l) => (
            <li key={l.id}>
              <label className="tn layer-active" title={t('layers.active')}>
                <input type="checkbox" checked={active.has(l.id)} onChange={(e) => setLayerActive(l.id, e.target.checked)} />
                <span className="nm">{l.name}</span>
                {l.trigger && <Icon name="zone" />}
              </label>
            </li>
          ))}
        </ul>
      </div>
    );
  }
  return (
    <div className="layer-list">
      <div className="sec">{t('layers.title')}</div>
      <ul className="tree">
        {sorted.map((l) => (
          <li key={l.id}>
            <div className={`tn ${current === l.id ? 'sel' : ''}`}>
              <button className="library-open" title={t('layers.current')} aria-pressed={current === l.id} onClick={() => setCurrentLayer(l.id)}>
                <Icon name="list" /><span className="nm">{l.name}</span>
              </button>
              <button className={`ab-btn ${l.editorHidden ? 'off' : ''}`} title={t('layers.editorHidden')} aria-label={`${t('layers.editorHidden')}: ${l.name}`} aria-pressed={l.editorHidden} onClick={() => updateLayer(l.id, { editorHidden: !l.editorHidden })}>
                <Icon name={l.editorHidden ? 'eyeoff' : 'eye'} />
              </button>
              <button className={`ab-btn ${l.locked ? 'on' : ''}`} title={t('layers.lock')} aria-label={`${t('layers.lock')}: ${l.name}`} aria-pressed={l.locked} onClick={() => updateLayer(l.id, { locked: !l.locked })}>
                <Icon name="lock" />
              </button>
              <button className="ab-btn" title={t('layers.up')} aria-label={`${t('layers.up')}: ${l.name}`} onClick={() => moveLayer(l.id, 'up')}><Icon name="up" /></button>
              <button className="ab-btn" title={t('layers.down')} aria-label={`${t('layers.down')}: ${l.name}`} onClick={() => moveLayer(l.id, 'down')}><Icon name="down" /></button>
              <button className="ab-btn" title={t('layers.settings')} aria-label={`${t('layers.settings')}: ${l.name}`} aria-expanded={open === l.id} onClick={() => setOpen(open === l.id ? null : l.id)}><Icon name="sliders" /></button>
            </div>
            {open === l.id && <LayerSettings layer={l} onDeleted={() => setOpen(null)} />}
          </li>
        ))}
        <li>
          <div className={`tn ${current === BASE_LAYER ? 'sel' : ''}`}>
            <button className="library-open" title={t('layers.current')} aria-pressed={current === BASE_LAYER} onClick={() => setCurrentLayer(BASE_LAYER)}>
              <Icon name="map" /><span className="nm">{t('layers.base')}</span>
            </button>
          </div>
        </li>
      </ul>
      <button className="btn sm" onClick={() => setOpen(createLayer(t('layers.newName', { n: layers.length + 1 })))}><Icon name="plus" />{t('layers.new')}</button>
    </div>
  );
}

function LayerSettings({ layer, onDeleted }: { layer: MapLayer; onDeleted: () => void }) {
  const { t } = useI18n();
  const layers = useStore((s) => s.scene.map.layers);
  const zones = useStore((s) => s.scene.zones);
  const [name, setName] = useState(layer.name);
  const [confirm, setConfirm] = useState(false);
  const commitName = () => (name.trim() && name.trim() !== layer.name ? updateLayer(layer.id, { name: name.trim() }) : setName(layer.name));
  const id = `ls-${layer.id}`;
  return (
    <div className="layer-settings">
      <div className="row"><label htmlFor={`${id}-name`}>{t('layers.name')}</label>
        <input id={`${id}-name`} value={name} onChange={(e) => setName(e.target.value)} onBlur={commitName} onKeyDown={(e) => e.key === 'Enter' && commitName()} />
      </div>
      <div className="row"><label htmlFor={`${id}-h`}>{t('layers.height')}</label>
        <input id={`${id}-h`} type="number" step={1} value={layer.height} onChange={(e) => e.target.value !== '' && updateLayer(layer.id, { height: Number(e.target.value) })} />
      </div>
      <label className="cmd-check"><input type="checkbox" checked={layer.defaultActive} onChange={(e) => updateLayer(layer.id, { defaultActive: e.target.checked })} />{t('layers.defaultActive')}</label>
      <div className="row"><label htmlFor={`${id}-trig`}>{t('layers.trigger')}</label>
        <select id={`${id}-trig`} value={layer.trigger?.area ?? ''} onChange={(e) => updateLayer(layer.id, { trigger: e.target.value ? { area: e.target.value, leaveOff: layer.trigger?.leaveOff ?? true } : undefined })}>
          <option value="">{t('layers.noTrigger')}</option>
          {zones.map((z) => <option key={z.id} value={z.id}>{z.name}</option>)}
        </select>
      </div>
      {layer.trigger && (
        <label className="cmd-check"><input type="checkbox" checked={layer.trigger.leaveOff} onChange={(e) => updateLayer(layer.id, { trigger: { ...layer.trigger!, leaveOff: e.target.checked } })} />{t('layers.leaveOff')}</label>
      )}
      <div className="row"><label htmlFor={`${id}-ctr`}>{t('layers.counter')}</label>
        <select id={`${id}-ctr`} value={layer.counter ?? ''} onChange={(e) => updateLayer(layer.id, { counter: e.target.value || undefined })}>
          <option value="">{t('layers.noCounter')}</option>
          {layers.filter((l) => l.id !== layer.id).map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
        </select>
      </div>
      {confirm ? (
        <div className="library-confirm" role="alert">
          <p>{t('layers.deleteConfirm', { name: layer.name })}</p>
          <div className="library-buttons">
            <button className="btn sm danger" onClick={() => { deleteLayer(layer.id); onDeleted(); }}>{t('layers.delete')}</button>
            <button className="btn sm" onClick={() => setConfirm(false)}>{t('start.cancel')}</button>
          </div>
        </div>
      ) : (
        <button className="btn sm danger" onClick={() => setConfirm(true)}><Icon name="trash" />{t('layers.delete')}</button>
      )}
    </div>
  );
}
