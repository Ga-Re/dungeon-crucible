/**
 * "Map settings" (DC-011): the open map's name, type, landscape, tags, default fog, ambient
 * light, its sound everywhere (E-37) and how the TV changes to its scenes (E-38). Edits a draft;
 * OK applies it as one undoable step.
 */
import { MAP_TYPES } from '../core/mapCatalog';
import { useEffect, useMemo, useState, type KeyboardEvent } from 'react';
import { addTags, removeTag, suggestions } from '../core/catalog';
import { FOG_BIOMES, type MapType } from '../core/scene';
import { useI18n } from '../i18n/i18n';
import type { MessageKey } from '../i18n/en';
import { applyMapSettings, currentMapSettings, useStore } from './store';
import { pickVariantPicture } from './campaign';
import { newId } from '../core/documents';
import { Icon } from '../ui/Icon';
import { SoundSelect } from '../panels/SoundPanels';
import { TRANSITION_KINDS, type TransitionKind } from '../core/transition';
import './start.css';


export function MapSettingsDialog({ onClose }: { onClose: () => void }) {
  const { t } = useI18n();
  const library = useStore((s) => s.libraryMaps);
  const [draft, setDraft] = useState(currentMapSettings);
  const [tagInput, setTagInput] = useState('');
  const [variantError, setVariantError] = useState<string | null>(null);
  const picture = useStore((s) => !!s.scene.map.imageUrl);
  const addVariant = async () => {
    setVariantError(null);
    const r = await pickVariantPicture();
    if (!r) return;
    if ('error' in r) {
      setVariantError(r.error === 'variant.wrongSize' ? t('variant.wrongSize', { w: Math.round(r.w ?? 0), h: Math.round(r.h ?? 0), mw: Math.round(draftSize.w), mh: Math.round(draftSize.h) }) : t('variant.unreadable'));
      return;
    }
    const name = r.path.split('/').pop()!.replace(/\.[^.]+$/, '');
    setDraft((d) => ({ ...d, variants: [...d.variants, { id: newId('variant', (id) => d.variants.some((v) => v.id === id)), name, image: r.path }] }));
  };
  const draftSize = useStore((s) => ({ w: s.scene.map.widthPx, h: s.scene.map.heightPx }));
  useEffect(() => {
    const esc = (e: globalThis.KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [onClose]);

  const tagHints = useMemo(() => suggestions(library.flatMap((m) => m.tags), draft.tags), [library, draft.tags]);
  const regionHints = useMemo(() => suggestions(library.map((m) => m.region)), [library]);
  const set = <K extends keyof typeof draft>(k: K, v: (typeof draft)[K]) => setDraft((d) => ({ ...d, [k]: v }));
  const commitTag = () => {
    if (!tagInput.trim()) return;
    set('tags', addTags(draft.tags, tagInput));
    setTagInput('');
  };
  const onTagKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      // Enter adds the tag instead of submitting the form; an empty field submits.
      if (tagInput.trim()) {
        e.preventDefault();
        commitTag();
      }
    } else if (e.key === 'Backspace' && !tagInput && draft.tags.length > 0) {
      set('tags', draft.tags.slice(0, -1));
    }
  };

  return (
    <div className="start-modal" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form
        className="start-dialog map-settings"
        role="dialog"
        aria-modal="true"
        aria-labelledby="map-settings-title"
        onSubmit={(e) => {
          e.preventDefault();
          // A tag still in the field counts as typed.
          const final = tagInput.trim() ? { ...draft, tags: addTags(draft.tags, tagInput) } : draft;
          if (applyMapSettings(final)) onClose();
        }}
      >
        <h2 id="map-settings-title">{t('mapSettings.title')}</h2>
        <label className="start-field">
          <span>{t('props.name')}</span>
          <input value={draft.name} required autoFocus onChange={(e) => set('name', e.target.value)} />
        </label>
        <div className="ms-row">
          <label className="start-field">
            <span>{t('mapSettings.type')}</span>
            <select value={draft.mapType} onChange={(e) => set('mapType', e.target.value as MapType)}>
              {MAP_TYPES.map((m) => <option key={m} value={m}>{t(`mapType.${m}` as MessageKey)}</option>)}
            </select>
          </label>
          <label className="start-field">
            <span>{t('mapSettings.region')}</span>
            <input value={draft.region} list="ms-regions" placeholder={t('mapSettings.regionHint')} onChange={(e) => set('region', e.target.value)} />
            <datalist id="ms-regions">{regionHints.map((r) => <option key={r} value={r} />)}</datalist>
          </label>
        </div>
        <div className="start-field">
          <label htmlFor="ms-tag">{t('props.tags')}</label>
          <div className="ms-tags">
            {draft.tags.map((tag) => (
              <span key={tag} className="chip">
                {tag}
                <button type="button" aria-label={t('mapSettings.removeTag', { tag })} onClick={() => set('tags', removeTag(draft.tags, tag))}>×</button>
              </span>
            ))}
            <input
              id="ms-tag"
              value={tagInput}
              list="ms-tag-hints"
              placeholder={draft.tags.length ? '' : t('mapSettings.tagHint')}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={onTagKey}
              onBlur={commitTag}
            />
            <datalist id="ms-tag-hints">{tagHints.map((h) => <option key={h} value={h} />)}</datalist>
          </div>
        </div>
        <div className="ms-row">
          <label className="start-field">
            <span>{t('mapSettings.fog')}</span>
            <select value={draft.biome} onChange={(e) => set('biome', e.target.value as typeof draft.biome)}>
              {FOG_BIOMES.map((b) => <option key={b} value={b}>{t(`biome.${b}` as MessageKey)}</option>)}
            </select>
          </label>
          <label className="start-field">
            <span>{t('map.ambient')}</span>
            <select value={draft.ambient} onChange={(e) => set('ambient', e.target.value as typeof draft.ambient)}>
              <option value="dark">{t('ambient.dark')}</option>
              <option value="lit">{t('ambient.lit')}</option>
            </select>
          </label>
        </div>
        <div className="ms-row">
          <label className="start-field">
            <span>{t('mapSettings.sound')}</span>
            <SoundSelect none value={draft.ambientSound?.sound ?? ''} onChange={(sound) => set('ambientSound', sound ? { sound, volume: draft.ambientSound?.volume ?? 0.5 } : null)} />
          </label>
          <label className="start-field">
            <span>{t('mapSettings.soundVolume')}</span>
            <input type="range" min={0} max={100} disabled={!draft.ambientSound} value={Math.round((draft.ambientSound?.volume ?? 0.5) * 100)}
              onChange={(e) => draft.ambientSound && set('ambientSound', { ...draft.ambientSound, volume: Number(e.target.value) / 100 })} />
          </label>
        </div>
        <div className="ms-row">
          <label className="start-field">
            <span>{t('transition.title')}</span>
            <select value={draft.transition.kind} onChange={(e) => set('transition', { ...draft.transition, kind: e.target.value as TransitionKind })}>
              {TRANSITION_KINDS.map((k) => <option key={k} value={k}>{t(`transition.${k}` as MessageKey)}</option>)}
            </select>
          </label>
          <label className="start-field">
            <span>{t('transition.seconds')}</span>
            <input type="number" min={0.1} max={10} step={0.1} disabled={draft.transition.kind === 'cut'} value={draft.transition.seconds}
              onChange={(e) => { const v = Number(e.target.value); if (v > 0 && v <= 10) set('transition', { ...draft.transition, seconds: v }); }} />
          </label>
        </div>
        {picture && (
          <div className="start-field">
            <span>{t('variant.title')}</span>
            {draft.variants.map((v, i) => (
              <div key={v.id} className="ms-row ms-variant">
                <input aria-label={t('variant.name')} value={v.name} onChange={(e) => set('variants', draft.variants.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
                <select aria-label={t('variant.ambient')} value={v.ambient ?? ''} onChange={(e) => set('variants', draft.variants.map((x, j) => (j === i ? { ...x, ambient: (e.target.value || undefined) as typeof x.ambient } : x)))}>
                  <option value="">{t('variant.ambientMap')}</option>
                  <option value="dark">{t('ambient.dark')}</option>
                  <option value="lit">{t('ambient.lit')}</option>
                </select>
                <button type="button" className="ab-btn" title={t('variant.remove')} aria-label={`${t('variant.remove')}: ${v.name}`} onClick={() => set('variants', draft.variants.filter((_, j) => j !== i))}><Icon name="trash" /></button>
              </div>
            ))}
            <div><button type="button" className="btn sm" onClick={() => void addVariant()}><Icon name="plus" />{t('variant.add')}</button></div>
            {variantError ? <p className="hint" role="alert">{variantError}</p> : <p className="hint">{t('variant.hint')}</p>}
          </div>
        )}
        <div className="start-buttons">
          <button type="button" className="btn" onClick={onClose}>{t('start.cancel')}</button>
          <button type="submit" className="btn pri" disabled={!draft.name.trim()}>{t('mapSettings.apply')}</button>
        </div>
      </form>
    </div>
  );
}
