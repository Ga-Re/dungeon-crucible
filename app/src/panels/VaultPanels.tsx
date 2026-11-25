/**
 * The Asset Vault (E-27, DC-040): the catalog of library assets in the middle (thumbnails, search,
 * selection, favourites, dropping files to import), its filters and collections in the Browser,
 * and the selected assets' properties on the right (several at once: a change applies to all).
 */
import { useEffect, useMemo, useRef, useState, type DragEvent, type KeyboardEvent, type MouseEvent } from 'react';
import { addTags, removeTag } from '../core/catalog';
import { collectionsOf, commonValue, ENVIRONMENTS, SUBKINDS } from '../core/assets';
import { ASSET_KINDS, type AssetKind, type AssetSidecar } from '../core/sidecar';
import type { MessageKey } from '../i18n/en';
import { useI18n } from '../i18n/i18n';
import { Icon, type IconName } from '../ui/Icon';
import { useStore } from '../app/store';
import { thumbnailUrl } from '../app/thumbs';
import { AssetEditorView } from './AssetEditor';
import '../app/start.css';
import {
  openAssetEditor, cancelPackImport, closePackImport, runPackImport, setAllPackFolders, setPackName, togglePackFolder,
  addAssetsToCollection, createCollection, deleteCollectionEverywhere, importDroppedFiles, refreshVault, renameCollectionEverywhere, selectAsset, setThumbSize, setVaultFilter,
  shownAssets, toggleFavorite, updateSelectedAssets, type VaultItem,
} from '../app/vault';

/** Drag type for assets dragged from the catalog (onto a collection, later onto the map). */
export const ASSET_DRAG = 'application/x-dc-assets';

export const KIND_ICONS: Record<AssetKind, IconName> = {
  prop: 'box', tile: 'grid', texture: 'brush', effect: 'bolt', light: 'light', sound: 'music', handout: 'list',
};

/** A built-in value (subkind, environment) translated; the DM's own text as typed. */
function useLabels() {
  const { t } = useI18n();
  const subkind = (v: string) => (Object.values(SUBKINDS).some((l) => l.includes(v)) ? t(`subkind.${v}` as MessageKey) : v);
  const env = (v: string) => ((ENVIRONMENTS as readonly string[]).includes(v) ? t(`env.${v}` as MessageKey) : v);
  /** Typed text back to a built-in key when it is one's translation (any case), else the text. */
  const toKey = (text: string, keys: readonly string[], label: (k: string) => string) => {
    const v = text.trim();
    return keys.find((k) => label(k).toLowerCase() === v.toLowerCase() || k === v.toLowerCase()) ?? v;
  };
  return { subkind, env, toKey };
}

/* ---------- Catalog (centre) ---------- */

export function VaultPanel() {
  const { t } = useI18n();
  const items = useStore((s) => s.vault.items);
  const filter = useStore((s) => s.vault.filter);
  const selected = useStore((s) => s.vault.selected);
  const thumbPx = useStore((s) => s.vault.thumbPx);
  const root = useStore((s) => s.root?.root);
  const pack = useStore((s) => s.vault.pack !== null);
  const editing = useStore((s) => s.vault.editor !== null);
  const [dropping, setDropping] = useState(false);
  useEffect(() => {
    void refreshVault();
  }, [root]);
  const shown = useMemo(() => shownAssets(), [items, filter]);
  const sel = new Set(selected);
  if (editing) return <AssetEditorView />;

  const onDrop = (e: DragEvent) => {
    setDropping(false);
    if (e.dataTransfer.files.length === 0) return;
    e.preventDefault();
    void importDroppedFiles([...e.dataTransfer.files]);
  };
  return (
    <div
      className={`vault ${dropping ? 'dropping' : ''}`}
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes('Files')) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
        setDropping(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDropping(false);
      }}
      onDrop={onDrop}
    >
      <div className="vault-bar">
        <input type="search" value={filter.query ?? ''} placeholder={t('vault.search')} aria-label={t('vault.search')} onChange={(e) => setVaultFilter({ query: e.target.value })} />
        <span className="hint">{t('vault.count', { n: shown.length, total: items.length })}</span>
        <label className="vault-size" title={t('vault.thumbSize')}>
          <Icon name="grid" />
          <input type="range" min={64} max={240} step={8} value={thumbPx} aria-label={t('vault.thumbSize')} onChange={(e) => setThumbSize(Number(e.target.value))} />
        </label>
      </div>
      {items.length === 0 ? (
        <p className="vault-empty hint">{t('vault.empty')}</p>
      ) : shown.length === 0 ? (
        <p className="vault-empty hint">{t('vault.noMatch')}</p>
      ) : (
        <ul className="vault-grid" role="listbox" aria-multiselectable="true" aria-label={t('ws.vault')} style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${thumbPx}px, 1fr))` }}>
          {shown.map((item) => (
            <AssetCard key={item.relPath} item={item} selected={sel.has(item.relPath)} selection={selected} />
          ))}
        </ul>
      )}
      {dropping && <div className="vault-drop" aria-hidden="true">{t('vault.drop')}</div>}
      {pack && <PackImportDialog />}
    </div>
  );
}

function sizeText(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

/**
 * "Import pack" (DC-040b): the pack's folders with ticks, then progress with Stop, then a summary.
 * Modal: a long copy needs the DM's attention and must not be mixed with edits.
 */
function PackImportDialog() {
  const { t } = useI18n();
  const p = useStore((s) => s.vault.pack)!;
  useEffect(() => {
    const esc = (e: globalThis.KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (p.phase === 'running') cancelPackImport();
      else closePackImport();
    };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [p.phase]);
  const chosen = p.folders.filter((f) => p.chosen.has(f.path));
  const files = chosen.reduce((n, f) => n + f.files, 0);
  const bytes = chosen.reduce((n, f) => n + f.bytes, 0);
  return (
    <div className="start-modal" role="presentation">
      <form
        className="start-dialog pack-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="pack-title"
        onSubmit={(e) => {
          e.preventDefault();
          if (p.phase === 'choose') void runPackImport();
          else if (p.phase === 'done') closePackImport();
        }}
      >
        <h2 id="pack-title">{t('pack.title')}</h2>
        {p.phase === 'choose' && (
          <>
            <label className="start-field">
              <span>{t('pack.name')}</span>
              <input value={p.name} autoFocus onChange={(e) => setPackName(e.target.value)} />
            </label>
            <p className="hint">{t('pack.nameHint', { name: p.name.trim() || 'Pack' })}</p>
            <div className="pack-head">
              <b>{t('pack.folders')}</b>
              <button type="button" className="btn sm" onClick={() => setAllPackFolders(true)}>{t('pack.all')}</button>
              <button type="button" className="btn sm" onClick={() => setAllPackFolders(false)}>{t('pack.none')}</button>
            </div>
            <ul className="pack-folders">
              {p.folders.map((f) => {
                const depth = f.path ? f.path.split('/').length : 0;
                return (
                  <li key={f.path} style={{ paddingLeft: depth * 16 }}>
                    <label>
                      <input type="checkbox" checked={p.chosen.has(f.path)} onChange={() => togglePackFolder(f.path)} />
                      <Icon name="folder" />
                      <span className="nm">{f.path ? f.path.split('/').pop() : t('pack.root')}</span>
                      {f.files > 0 && <span className="meta">{t('pack.summary', { files: f.files, size: sizeText(f.bytes) })}</span>}
                    </label>
                  </li>
                );
              })}
            </ul>
            <p className="hint" role="status">{t('pack.summary', { files, size: sizeText(bytes) })}</p>
            <div className="start-buttons">
              <button type="button" className="btn" onClick={closePackImport}>{t('start.cancel')}</button>
              <button type="submit" className="btn pri" disabled={files === 0}>{t('pack.start')}</button>
            </div>
          </>
        )}
        {p.phase === 'running' && p.progress && (
          <>
            <p role="status">{t('pack.running', { done: p.progress.done, total: p.progress.total })}</p>
            <progress className="pack-progress" max={Math.max(1, p.progress.total)} value={p.progress.done} />
            <p className="hint mono pack-file">{p.progress.file}</p>
            <div className="start-buttons">
              <button type="button" className="btn" autoFocus onClick={cancelPackImport}>{t('pack.cancel')}</button>
            </div>
          </>
        )}
        {p.phase === 'done' && p.result && (
          <>
            <p role="status">{t('pack.doneText', { imported: p.result.imported, reused: p.result.reused })}</p>
            {p.result.skipped > 0 && <p className="hint">{t('pack.skipped', { n: p.result.skipped })}</p>}
            {p.result.cancelled && <p className="hint">{t('pack.cancelled')}</p>}
            <div className="start-buttons">
              <button type="submit" className="btn pri" autoFocus>{t('pack.close')}</button>
            </div>
          </>
        )}
      </form>
    </div>
  );
}

function AssetCard({ item, selected, selection }: { item: VaultItem; selected: boolean; selection: readonly string[] }) {
  const { t } = useI18n();
  const thumb = useThumbnail(item);
  const a = item.asset;
  const pick = (e: MouseEvent | KeyboardEvent) => selectAsset(item.relPath, e.shiftKey ? 'range' : e.metaKey || e.ctrlKey ? 'toggle' : 'single');
  return (
    <li
      role="option"
      aria-selected={selected}
      tabIndex={0}
      className={`vault-card ${selected ? 'sel' : ''}`}
      draggable
      onDragStart={(e) => {
        // Dragging a selected card takes the whole selection along.
        const paths = selected ? selection : [item.relPath];
        e.dataTransfer.setData(ASSET_DRAG, JSON.stringify(paths));
        e.dataTransfer.effectAllowed = 'copy';
      }}
      onClick={pick}
      onDoubleClick={() => openAssetEditor(item.relPath)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          pick(e);
        }
      }}
    >
      <div className="vault-thumb">
        {thumb ? <img src={thumb} alt="" draggable={false} /> : <Icon name={KIND_ICONS[a.assetKind]} />}
      </div>
      <div className="vault-name">
        <Icon name={KIND_ICONS[a.assetKind]} />
        <span title={a.name}>{a.name}</span>
      </div>
      <button
        className={`vault-star ${a.favorite ? 'on' : ''}`}
        title={t('vault.favorite')}
        aria-label={t('vault.favorite')}
        aria-pressed={a.favorite}
        onClick={(e) => {
          e.stopPropagation();
          void toggleFavorite(item.relPath);
        }}
      >
        <Icon name="star" />
      </button>
    </li>
  );
}

/** The thumbnail URL once made (sounds have none). */
function useThumbnail(item: Pick<VaultItem, 'relPath' | 'size' | 'mtimeMs'>): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    void thumbnailUrl(item.relPath, item.size, item.mtimeMs).then((u) => live && setUrl(u));
    return () => {
      live = false;
    };
  }, [item.relPath, item.size, item.mtimeMs]);
  return url;
}

/* ---------- Filters and collections (Browser) ---------- */

export function VaultBrowser() {
  const { t } = useI18n();
  const { env } = useLabels();
  const items = useStore((s) => s.vault.items);
  const filter = useStore((s) => s.vault.filter);
  const fresh = useStore((s) => s.vault.newCollections);
  const [naming, setNaming] = useState<{ from: string | null; value: string } | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);
  const collections = useMemo(() => [...new Set([...collectionsOf(items), ...fresh])].sort((a, b) => a.localeCompare(b)), [items, fresh]);
  const environments = useMemo(() => [...new Set(items.flatMap((i) => i.asset.environments))].sort((a, b) => env(a).localeCompare(env(b))), [items]);
  const count = (pred: (a: AssetSidecar) => boolean) => items.filter((i) => pred(i.asset)).length;
  const kinds = filter.kinds ?? [];
  const toggleKind = (k: AssetKind) => setVaultFilter({ kinds: kinds.includes(k) ? kinds.filter((x) => x !== k) : [...kinds, k], subkind: undefined });

  const commitName = () => {
    if (!naming) return;
    const v = naming.value.trim();
    if (v && naming.from) void renameCollectionEverywhere(naming.from, v);
    else if (v) createCollection(v);
    setNaming(null);
  };
  const dropOn = (name: string) => (e: DragEvent) => {
    const data = e.dataTransfer.getData(ASSET_DRAG);
    if (!data) return;
    e.preventDefault();
    let paths: unknown;
    try {
      paths = JSON.parse(data);
    } catch {
      return;
    }
    if (Array.isArray(paths)) void addAssetsToCollection(paths.filter((p): p is string => typeof p === 'string'), name);
  };
  return (
    <div className="panel-body vault-browser">
      <div className="sec">{t('vault.kinds')}</div>
      <ul className="tree">
        <li>
          <button className={`tn ${kinds.length === 0 && !filter.favorites ? 'sel' : ''}`} onClick={() => setVaultFilter({ kinds: [], favorites: false, subkind: undefined })}>
            <Icon name="archive" /><span className="nm">{t('vault.all')}</span><span className="meta">{items.length}</span>
          </button>
        </li>
        <li>
          <button className={`tn ${filter.favorites ? 'sel' : ''}`} aria-pressed={!!filter.favorites} onClick={() => setVaultFilter({ favorites: !filter.favorites })}>
            <Icon name="star" /><span className="nm">{t('vault.favorites')}</span><span className="meta">{count((a) => a.favorite)}</span>
          </button>
        </li>
        {ASSET_KINDS.map((k) => (
          <li key={k}>
            <button className={`tn ${kinds.includes(k) ? 'sel' : ''}`} aria-pressed={kinds.includes(k)} onClick={() => toggleKind(k)}>
              <Icon name={KIND_ICONS[k]} /><span className="nm">{t(`assetKind.${k}` as MessageKey)}</span><span className="meta">{count((a) => a.assetKind === k)}</span>
            </button>
          </li>
        ))}
      </ul>
      {environments.length > 0 && (
        <>
          <div className="sec">{t('vault.environments')}</div>
          <div className="chips">
            {environments.map((e) => (
              <button key={e} className={`chip ${filter.environment === e ? 'on' : ''}`} aria-pressed={filter.environment === e} onClick={() => setVaultFilter({ environment: filter.environment === e ? undefined : e })}>
                {env(e)}
              </button>
            ))}
          </div>
        </>
      )}
      <div className="sec">{t('vault.collections')}</div>
      <ul className="tree">
        {collections.map((c) => (
          <li key={c} onDragOver={(e) => e.dataTransfer.types.includes(ASSET_DRAG) && e.preventDefault()} onDrop={dropOn(c)}>
            {naming?.from === c ? (
              <NameField value={naming.value} onChange={(value) => setNaming({ from: c, value })} onDone={commitName} onCancel={() => setNaming(null)} />
            ) : (
              <div className={`tn ${filter.collection === c ? 'sel' : ''}`}>
                <button className="library-open" onClick={() => setVaultFilter({ collection: filter.collection === c ? undefined : c })}>
                  <Icon name="folder" /><span className="nm">{c}</span><span className="meta">{count((a) => a.collections.some((x) => x.toLowerCase() === c.toLowerCase()))}</span>
                </button>
                <button className="ab-btn" title={t('vault.rename')} aria-label={`${t('vault.rename')}: ${c}`} onClick={() => setNaming({ from: c, value: c })}><Icon name="sliders" /></button>
                <button className="ab-btn" title={t('vault.delete')} aria-label={`${t('vault.delete')}: ${c}`} onClick={() => setConfirm(c)}><Icon name="trash" /></button>
              </div>
            )}
            {confirm === c && (
              <div className="library-confirm" role="alert">
                <p>{t('vault.deleteCollection', { name: c })}</p>
                <div className="library-buttons">
                  <button className="btn sm danger" onClick={() => { void deleteCollectionEverywhere(c); setConfirm(null); }}>{t('vault.delete')}</button>
                  <button className="btn sm" onClick={() => setConfirm(null)}>{t('start.cancel')}</button>
                </div>
              </div>
            )}
          </li>
        ))}
      </ul>
      {collections.length === 0 && <p className="hint">{t('vault.noCollections')}</p>}
      {naming && naming.from === null ? (
        <NameField value={naming.value} onChange={(value) => setNaming({ from: null, value })} onDone={commitName} onCancel={() => setNaming(null)} />
      ) : (
        <button className="btn sm" onClick={() => setNaming({ from: null, value: '' })}><Icon name="plus" />{t('vault.newCollection')}</button>
      )}
    </div>
  );
}

function NameField({ value, onChange, onDone, onCancel }: { value: string; onChange: (v: string) => void; onDone: () => void; onCancel: () => void }) {
  const { t } = useI18n();
  return (
    <input
      className="vault-name-field"
      autoFocus
      value={value}
      placeholder={t('vault.collectionName')}
      aria-label={t('vault.collectionName')}
      onChange={(e) => onChange(e.target.value)}
      onBlur={onDone}
      onKeyDown={(e) => {
        if (e.key === 'Enter') onDone();
        if (e.key === 'Escape') onCancel();
      }}
    />
  );
}

/* ---------- Properties (right) ---------- */

const SIZED: readonly AssetKind[] = ['prop', 'tile', 'texture', 'effect', 'light'];

export function AssetPropertiesPanel() {
  const { t } = useI18n();
  const labels = useLabels();
  const items = useStore((s) => s.vault.items);
  const selected = useStore((s) => s.vault.selected);
  const chosen = useMemo(() => items.filter((i) => selected.includes(i.relPath)), [items, selected]);
  if (chosen.length === 0) return <div className="panel-body hint">{t('vault.noSelection')}</div>;
  const assets = chosen.map((i) => i.asset);
  const one = chosen.length === 1 ? chosen[0] : null;
  const kind = commonValue(assets, (a) => a.assetKind);
  const subkind = commonValue(assets, (a) => a.subkind ?? '');
  const group = commonValue(assets, (a) => a.group ?? '');
  const size = commonValue(assets, (a) => a.sizeCells ?? null);
  const fav = commonValue(assets, (a) => a.favorite);
  const union = (pick: (a: AssetSidecar) => string[]) => [...new Set(assets.flatMap(pick))];
  const edit = (change: (a: AssetSidecar) => AssetSidecar) => void updateSelectedAssets(change);
  const subkindKeys = kind === 'mixed' ? [] : SUBKINDS[kind];
  const groups = [...new Set(items.map((i) => i.asset.group).filter((g): g is string => !!g))];
  return (
    <div className="panel-body vault-props">
      <div className="sec">{one ? t('panel.asset') : t('vault.selected', { n: chosen.length })}</div>
      {one && (
        <>
          <TextRow label={t('props.name')} value={one.asset.name} onCommit={(v) => v.trim() && edit((a) => ({ ...a, name: v.trim() }))} />
          <div className="row"><label>{t('vault.file')}</label><span className="mono hint" title={one.relPath}>{one.relPath.replace(/^library\//, '')}</span></div>
          {one.raw === null && <p className="hint">{t('vault.notSaved')}</p>}
        </>
      )}
      <div className="row">
        <label htmlFor="as-kind">{t('vault.kind')}</label>
        <select id="as-kind" value={kind === 'mixed' ? '' : kind} onChange={(e) => e.target.value && edit((a) => ({ ...a, assetKind: e.target.value as AssetKind }))}>
          {kind === 'mixed' && <option value="">{t('vault.mixed')}</option>}
          {ASSET_KINDS.map((k) => <option key={k} value={k}>{t(`assetKind.${k}` as MessageKey)}</option>)}
        </select>
      </div>
      <TextRow
        label={t('vault.subkind')}
        value={subkind === 'mixed' ? '' : labels.subkind(subkind)}
        placeholder={subkind === 'mixed' ? t('vault.mixed') : ''}
        suggestions={subkindKeys.map(labels.subkind)}
        onCommit={(v) => {
          const key = labels.toKey(v, subkindKeys, labels.subkind);
          edit((a) => {
            const { subkind: _s, ...rest } = a;
            return key ? { ...rest, subkind: key } : rest;
          });
        }}
      />
      <ValueList
        label={t('vault.environments')}
        values={union((a) => a.environments)}
        show={labels.env}
        suggestions={ENVIRONMENTS.map(labels.env)}
        onAdd={(v) => {
          const key = labels.toKey(v, ENVIRONMENTS, labels.env);
          edit((a) => (a.environments.some((x) => x.toLowerCase() === key.toLowerCase()) ? a : { ...a, environments: [...a.environments, key] }));
        }}
        onRemove={(v) => edit((a) => ({ ...a, environments: a.environments.filter((x) => x !== v) }))}
      />
      <ValueList
        label={t('props.tags')}
        values={union((a) => a.tags)}
        show={(v) => v}
        suggestions={[...new Set(items.flatMap((i) => i.asset.tags))]}
        onAdd={(v) => edit((a) => ({ ...a, tags: addTags(a.tags, v) }))}
        onRemove={(v) => edit((a) => ({ ...a, tags: removeTag(a.tags, v) }))}
      />
      {(kind === 'mixed' || SIZED.includes(kind)) && <SizeRow size={size} onChange={(s) => edit((a) => ({ ...a, sizeCells: s }))} />}
      <TextRow
        label={t('vault.group')}
        value={group === 'mixed' ? '' : group}
        placeholder={group === 'mixed' ? t('vault.mixed') : ''}
        suggestions={groups}
        onCommit={(v) =>
          edit((a) => {
            const { group: _g, ...rest } = a;
            return v.trim() ? { ...rest, group: v.trim() } : rest;
          })
        }
      />
      <ValueList
        label={t('vault.collections')}
        values={union((a) => a.collections)}
        show={(v) => v}
        suggestions={collectionsOf(items)}
        onAdd={(v) => void addAssetsToCollection(chosen.map((i) => i.relPath), v)}
        onRemove={(v) => edit((a) => ({ ...a, collections: a.collections.filter((x) => x !== v) }))}
      />
      <div className="row">
        <label htmlFor="as-fav">{t('vault.favorite')}</label>
        <input id="as-fav" type="checkbox" checked={fav === true} ref={(el) => {
          if (el) el.indeterminate = fav === 'mixed';
        }} onChange={(e) => edit((a) => ({ ...a, favorite: e.target.checked }))} />
      </div>
      {one && one.asset.assetKind !== 'sound' && (
        <button className="btn sm" onClick={() => openAssetEditor(one.relPath)}><Icon name="sliders" />{t('editor.open')} …</button>
      )}
      {one && SIZED.includes(one.asset.assetKind) && <GridPreview item={one} />}
    </div>
  );
}

/** A text field saved on Enter or when leaving it. */
function TextRow({ label, value, placeholder, suggestions, onCommit }: { label: string; value: string; placeholder?: string; suggestions?: readonly string[]; onCommit: (v: string) => void }) {
  const [draft, setDraft] = useState(value);
  const id = useRef(`tr-${Math.random().toString(36).slice(2)}`).current;
  useEffect(() => setDraft(value), [value]);
  const commit = () => draft !== value && onCommit(draft);
  return (
    <div className="row">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        value={draft}
        placeholder={placeholder}
        list={suggestions ? `${id}-list` : undefined}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit();
          if (e.key === 'Escape') setDraft(value);
        }}
      />
      {suggestions && <datalist id={`${id}-list`}>{suggestions.map((s) => <option key={s} value={s} />)}</datalist>}
    </div>
  );
}

/** Chips with a field to add more (environments, tags, collections). */
function ValueList({ label, values, show, suggestions, onAdd, onRemove }: { label: string; values: readonly string[]; show: (v: string) => string; suggestions: readonly string[]; onAdd: (v: string) => void; onRemove: (v: string) => void }) {
  const { t } = useI18n();
  const [draft, setDraft] = useState('');
  const id = useRef(`vl-${Math.random().toString(36).slice(2)}`).current;
  const add = () => {
    if (draft.trim()) onAdd(draft.trim());
    setDraft('');
  };
  return (
    <div className="row vault-values">
      <label htmlFor={id}>{label}</label>
      <div className="ms-tags">
        {values.map((v) => (
          <span key={v} className="chip">
            {show(v)}
            <button type="button" aria-label={t('vault.remove', { value: show(v) })} onClick={() => onRemove(v)}>×</button>
          </span>
        ))}
        <input
          id={id}
          value={draft}
          list={`${id}-list`}
          placeholder={values.length ? '' : t('vault.addValue')}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={add}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ',') {
              e.preventDefault();
              add();
            }
          }}
        />
        <datalist id={`${id}-list`}>{suggestions.filter((s) => !values.map(show).includes(s)).map((s) => <option key={s} value={s} />)}</datalist>
      </div>
    </div>
  );
}

function SizeRow({ size, onChange }: { size: { w: number; h: number } | null | 'mixed'; onChange: (s: { w: number; h: number }) => void }) {
  const { t } = useI18n();
  const s = size === 'mixed' || size === null ? null : size;
  const set = (w: number, h: number) => w > 0 && h > 0 && w <= 100 && h <= 100 && onChange({ w, h });
  return (
    <div className="row">
      <label>{t('vault.sizeCells')}</label>
      <span className="vault-size-fields">
        <input type="number" min={0.5} max={100} step={0.5} aria-label={`${t('vault.sizeCells')} W`} value={s?.w ?? ''} placeholder={size === 'mixed' ? '–' : '1'} title={size === 'mixed' ? t('vault.mixed') : undefined} onChange={(e) => set(Number(e.target.value), s?.h ?? Number(e.target.value))} />
        ×
        <input type="number" min={0.5} max={100} step={0.5} aria-label={`${t('vault.sizeCells')} H`} value={s?.h ?? ''} placeholder={size === 'mixed' ? '–' : '1'} title={size === 'mixed' ? t('vault.mixed') : undefined} onChange={(e) => set(s?.w ?? Number(e.target.value), Number(e.target.value))} />
      </span>
    </div>
  );
}

/** The asset at its size on a 5-ft grid (one cell = 36 px here), so its scale can be judged. */
function GridPreview({ item }: { item: VaultItem }) {
  const { t } = useI18n();
  const thumb = useThumbnail(item);
  const size = item.asset.sizeCells ?? { w: 1, h: 1 };
  const cell = Math.max(12, Math.min(36, Math.floor(200 / Math.max(size.w, size.h, 1))));
  const pad = 1;
  return (
    <>
      <div className="sec">{t('vault.preview')}</div>
      <div className="vault-preview" style={{ width: (size.w + pad * 2) * cell, height: (size.h + pad * 2) * cell, backgroundSize: `${cell}px ${cell}px` }}>
        {thumb && <img src={thumb} alt="" style={{ left: pad * cell, top: pad * cell, width: size.w * cell, height: size.h * cell }} />}
      </div>
    </>
  );
}
