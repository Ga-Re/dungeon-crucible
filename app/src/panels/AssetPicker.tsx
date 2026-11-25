/**
 * The Map Forge's "Assets" panel (E-27, DC-041): the library's placeable assets – recently used
 * first, searchable, by kind – to drag onto the map. New files can be imported right here.
 */
import { useEffect, useMemo, useState } from 'react';
import { filterAssets } from '../core/assets';
import { catalogEntries, type CatalogEntry } from '../core/assetObjects';
import type { AssetKind } from '../core/sidecar';
import type { MessageKey } from '../i18n/en';
import { useI18n } from '../i18n/i18n';
import { Icon } from '../ui/Icon';
import { placeAsset, recentAssets, startPlacing, useStore } from '../app/store';
import { mapCommands } from './MapView';
import { thumbnailUrl } from '../app/thumbs';
import { importVaultAssets, refreshVault, type VaultItem } from '../app/vault';
import { ASSET_DRAG, KIND_ICONS } from './VaultPanels';

/** What can stand on a map; sounds and handouts cannot. */
const PLACEABLE: readonly AssetKind[] = ['prop', 'tile', 'texture', 'effect', 'light'];

export function AssetPicker() {
  const { t } = useI18n();
  const items = useStore((s) => s.vault.items);
  const objects = useStore((s) => s.vault.objects);
  const root = useStore((s) => s.root?.root);
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState<AssetKind | null>(null);
  useEffect(() => {
    void refreshVault();
  }, [root]);
  const placeable = useMemo(() => items.filter((i) => PLACEABLE.includes(i.asset.assetKind)), [items]);
  // Each object once (E-31): found by any of its variants, placed as its main variant.
  const entries = useMemo(() => catalogEntries(placeable, objects), [placeable, objects]);
  const shown = useMemo(() => {
    const match = new Set(filterAssets(placeable, { query, kinds: kind ? [kind] : [] }));
    return entries.filter((e) => e.variants.some((v) => match.has(v)));
  }, [entries, placeable, query, kind]);
  const recent = useMemo(() => {
    const byPath = new Map(entries.flatMap((e) => e.variants.map((v) => [v.relPath, e] as const)));
    return [...new Set(recentAssets().map((p) => byPath.get(p)).filter((e): e is CatalogEntry<VaultItem> => !!e))];
  }, [entries]);
  return (
    <div className="panel-body asset-picker">
      <div className="library-tools">
        <input type="search" value={query} placeholder={t('vault.search')} aria-label={t('vault.search')} onChange={(e) => setQuery(e.target.value)} />
        <button className="ab-btn" title={t('vault.import')} aria-label={t('vault.import')} onClick={() => void importVaultAssets()}><Icon name="import" /></button>
      </div>
      <div className="chips picker-kinds">
        {PLACEABLE.map((k) => (
          <button key={k} className={`chip ${kind === k ? 'on' : ''}`} aria-pressed={kind === k} title={t(`assetKind.${k}` as MessageKey)} onClick={() => setKind(kind === k ? null : k)}>
            <Icon name={KIND_ICONS[k]} />{t(`assetKind.${k}` as MessageKey)}
          </button>
        ))}
      </div>
      {recent.length > 0 && !query && !kind && (
        <>
          <div className="sec">{t('picker.recent')}</div>
          <ul className="picker-grid">{recent.map((e) => <PickerTile key={`r-${e.key}`} entry={e} />)}</ul>
        </>
      )}
      <div className="sec">{t('picker.all')}</div>
      {placeable.length === 0 ? (
        <p className="hint">{t('picker.empty')}</p>
      ) : (
        <ul className="picker-grid">{shown.map((e) => <PickerTile key={e.key} entry={e} />)}</ul>
      )}
      <p className="hint">{t('picker.hint')}</p>
    </div>
  );
}

function PickerTile({ entry }: { entry: CatalogEntry<VaultItem> }) {
  const { t } = useI18n();
  const item = entry.variants[0];
  const [thumb, setThumb] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    void thumbnailUrl(item.relPath, item.size, item.mtimeMs).then((u) => live && setThumb(u));
    return () => {
      live = false;
    };
  }, [item.relPath, item.size, item.mtimeMs]);
  const a = item.asset;
  const name = entry.name;
  return (
    <li
      className="picker-tile"
      tabIndex={0}
      role="button"
      aria-label={`${name}: ${t('picker.placeKey')}`}
      onKeyDown={(e) => {
        // Keyboard: Enter places it in the middle of the map view.
        const at = mapCommands.centre();
        if (e.key === 'Enter' && at) placeAsset(item.relPath, at);
        // Space starts the placing mode, as a click does.
        if (e.key === ' ') {
          e.preventDefault();
          startPlacing(item.relPath, name);
        }
      }}
      draggable
      // A click starts the placing mode (DC-116): place it with each click on the map.
      onClick={() => startPlacing(item.relPath, name)}
      title={a.sizeCells ? `${name} · ${a.sizeCells.w}×${a.sizeCells.h}` : name}
      onDragStart={(e) => {
        e.dataTransfer.setData(ASSET_DRAG, JSON.stringify([item.relPath]));
        e.dataTransfer.effectAllowed = 'copy';
      }}
    >
      <div className="vault-thumb">{thumb ? <img src={thumb} alt="" draggable={false} /> : <Icon name={KIND_ICONS[a.assetKind]} />}</div>
      <span>{name}</span>
    </li>
  );
}
