/**
 * The Map Forge's "Assets" panel (E-27, DC-041): the library's placeable assets – recently used
 * first, searchable, by kind – to drag onto the map. New files can be imported right here.
 */
import { useEffect, useMemo, useState } from 'react';
import { filterAssets } from '../core/assets';
import type { AssetKind } from '../core/sidecar';
import type { MessageKey } from '../i18n/en';
import { useI18n } from '../i18n/i18n';
import { Icon } from '../ui/Icon';
import { placeAsset, recentAssets, useStore } from '../app/store';
import { mapCommands } from './MapView';
import { thumbnailUrl } from '../app/thumbs';
import { importVaultAssets, refreshVault, type VaultItem } from '../app/vault';
import { ASSET_DRAG, KIND_ICONS } from './VaultPanels';

/** What can stand on a map; sounds and handouts cannot. */
const PLACEABLE: readonly AssetKind[] = ['prop', 'tile', 'texture', 'effect', 'light'];

export function AssetPicker() {
  const { t } = useI18n();
  const items = useStore((s) => s.vault.items);
  const root = useStore((s) => s.root?.root);
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState<AssetKind | null>(null);
  useEffect(() => {
    void refreshVault();
  }, [root]);
  const placeable = useMemo(() => items.filter((i) => PLACEABLE.includes(i.asset.assetKind)), [items]);
  const shown = useMemo(() => filterAssets(placeable, { query, kinds: kind ? [kind] : [] }) as VaultItem[], [placeable, query, kind]);
  const recent = useMemo(() => {
    const byPath = new Map(placeable.map((i) => [i.relPath, i]));
    return recentAssets().map((p) => byPath.get(p)).filter((i): i is VaultItem => !!i);
  }, [placeable, items]);
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
          <ul className="picker-grid">{recent.map((i) => <PickerTile key={`r-${i.relPath}`} item={i} />)}</ul>
        </>
      )}
      <div className="sec">{t('picker.all')}</div>
      {placeable.length === 0 ? (
        <p className="hint">{t('picker.empty')}</p>
      ) : (
        <ul className="picker-grid">{shown.map((i) => <PickerTile key={i.relPath} item={i} />)}</ul>
      )}
      <p className="hint">{t('picker.hint')}</p>
    </div>
  );
}

function PickerTile({ item }: { item: VaultItem }) {
  const { t } = useI18n();
  const [thumb, setThumb] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    void thumbnailUrl(item.relPath, item.size, item.mtimeMs).then((u) => live && setThumb(u));
    return () => {
      live = false;
    };
  }, [item.relPath, item.size, item.mtimeMs]);
  const a = item.asset;
  return (
    <li
      className="picker-tile"
      tabIndex={0}
      role="button"
      aria-label={`${a.name}: ${t('picker.placeKey')}`}
      onKeyDown={(e) => {
        // Keyboard: Enter places it in the middle of the map view.
        const at = mapCommands.centre();
        if (e.key === 'Enter' && at) placeAsset(item.relPath, at);
      }}
      draggable
      title={a.sizeCells ? `${a.name} · ${a.sizeCells.w}×${a.sizeCells.h}` : a.name}
      onDragStart={(e) => {
        e.dataTransfer.setData(ASSET_DRAG, JSON.stringify([item.relPath]));
        e.dataTransfer.effectAllowed = 'copy';
      }}
    >
      <div className="vault-thumb">{thumb ? <img src={thumb} alt="" draggable={false} /> : <Icon name={KIND_ICONS[a.assetKind]} />}</div>
      <span>{a.name}</span>
    </li>
  );
}
