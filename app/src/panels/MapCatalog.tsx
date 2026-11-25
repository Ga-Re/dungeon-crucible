/**
 * The map catalog of the Map Forge (E-32, DC-117): all maps of the library as pictures in the
 * middle (while no map is open, or the "Maps" tab is chosen), its filters in the Browser and the
 * picked map's details on the right – edit (open), scenes on it, a new scene, trash.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { countsOf, filterMaps, MAP_TYPES } from '../core/mapCatalog';
import type { MapType } from '../core/scene';
import type { MessageKey } from '../i18n/en';
import { useI18n } from '../i18n/i18n';
import { Icon } from '../ui/Icon';
import { useStore } from '../app/store';
import { newSceneOnMap, switchScene } from '../app/campaign';
import {
  createDrawnMap, duplicateLibraryMap, mapIsOpen, mapUsage, openLibraryMap, refreshLibraryMaps, selectCatalogMap, setMapFilter, trashBlocked, trashLibraryMap, updateLibraryMap, type LibraryMap, type MapUsage,
} from '../app/library';
import { useThumbnail } from './VaultPanels';
import { drawingPreview } from '../render/drawnMap';
import { buildTextures } from '../render/build/textures';

function useTypeLabel() {
  const { t } = useI18n();
  return (m: MapType) => t(`mapType.${m}` as MessageKey);
}

/** The maps as the filter shows them. */
function useShownMaps(): LibraryMap[] {
  const maps = useStore((s) => s.libraryMaps);
  const filter = useStore((s) => s.mapFilter);
  const typeLabel = useTypeLabel();
  return useMemo(() => filterMaps(maps, filter, typeLabel), [maps, filter]);
}

/** The catalog in the middle: a click picks a map, a double click (or the menu's "Open") opens it. */
export function MapCatalogView() {
  const { t } = useI18n();
  const maps = useStore((s) => s.libraryMaps);
  const filter = useStore((s) => s.mapFilter);
  const selected = useStore((s) => s.mapSelected);
  const thumbPx = useStore((s) => s.vault.thumbPx);
  const shown = useShownMaps();
  const [menu, setMenu] = useState<{ mapFile: string; x: number; y: number } | null>(null);
  useEffect(() => {
    void refreshLibraryMaps();
  }, []);
  return (
    <div className="vault map-catalog">
      <div className="vault-bar">
        <input type="search" value={filter.query ?? ''} placeholder={t('library.search')} aria-label={t('library.search')} onChange={(e) => setMapFilter({ query: e.target.value })} />
        <span className="hint">{t('mapCatalog.count', { n: shown.length, total: maps.length })}</span>
        <button className="btn sm" onClick={() => void createDrawnMap(t('mapCatalog.drawnName'))}><Icon name="wall" />{t('mapCatalog.newDrawn')}</button>
      </div>
      {maps.length === 0 ? (
        <p className="vault-empty hint">{t('library.empty')}</p>
      ) : shown.length === 0 ? (
        <p className="vault-empty hint">{t('library.noMatch')}</p>
      ) : (
        <ul className="vault-grid" role="listbox" aria-label={t('mapCatalog.title')} style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${Math.max(thumbPx, 140)}px, 1fr))` }}>
          {shown.map((m) => (
            <MapCard key={m.mapFile} map={m} selected={m.mapFile === selected} onMenu={(x, y) => setMenu({ mapFile: m.mapFile, x, y })} />
          ))}
        </ul>
      )}
      {menu && (
        <CatalogMenu x={menu.x} y={menu.y} onClose={() => setMenu(null)}>
          <button role="menuitem" onClick={() => { setMenu(null); void openLibraryMap(menu.mapFile); }}><Icon name="map" /><span>{t('mapCatalog.open')}</span></button>
          <button role="menuitem" onClick={() => { setMenu(null); void newSceneOnMap(menu.mapFile); }}><Icon name="plus" /><span>{t('tabs.newScene')}</span></button>
        </CatalogMenu>
      )}
    </div>
  );
}

/** A picture's thumbnail, or a drawn map's (E-33) preview painted from its walls. */
function MapThumb({ map }: { map: LibraryMap }) {
  return map.drawn ? <DrawnThumb map={map} /> : <PictureThumb map={map} />;
}

const drawnPreviews = new Map<string, string>();

function DrawnThumb({ map, className }: { map: LibraryMap; className?: string }) {
  const key = `${map.mapFile}:${map.mtimeMs}`;
  const [url, setUrl] = useState<string | null>(drawnPreviews.get(key) ?? null);
  useEffect(() => {
    if (!map.drawing || drawnPreviews.has(key)) return;
    let live = true;
    void buildTextures().then((tex) => {
      const src = drawingPreview(map.drawing!, map.cellPx ?? 70, tex, 320).toDataURL('image/webp', 0.8);
      drawnPreviews.set(key, src);
      if (live) setUrl(src);
    });
    return () => {
      live = false;
    };
  }, [key, map.drawing, map.cellPx]);
  return url ? <img className={className} src={url} alt="" draggable={false} /> : <Icon name="wall" />;
}

function PictureThumb({ map }: { map: LibraryMap }) {
  const thumb = useThumbnail({ relPath: map.resource, size: map.size, mtimeMs: map.mtimeMs });
  return thumb ? <img src={thumb} alt="" draggable={false} /> : <Icon name={map.isVideo ? 'play' : 'map'} />;
}

function MapCard({ map, selected, onMenu }: { map: LibraryMap; selected: boolean; onMenu: (x: number, y: number) => void }) {
  const { t } = useI18n();
  const typeLabel = useTypeLabel();
  return (
    <li
      role="option"
      aria-selected={selected}
      tabIndex={0}
      className={`vault-card ${selected ? 'sel' : ''}`}
      onClick={() => selectCatalogMap(map.mapFile)}
      onDoubleClick={() => void openLibraryMap(map.mapFile)}
      onContextMenu={(e) => {
        e.preventDefault();
        selectCatalogMap(map.mapFile);
        onMenu(e.clientX, e.clientY);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') void openLibraryMap(map.mapFile);
        else if (e.key === ' ') {
          e.preventDefault();
          selectCatalogMap(map.mapFile);
        }
      }}
      title={`${map.name} · ${typeLabel(map.mapType)}`}
    >
      <div className="vault-thumb"><MapThumb map={map} /></div>
      <div className="vault-name">
        <Icon name={map.isVideo ? 'play' : 'map'} />
        <span>{map.name}</span>
        {map.copy && <span className="vault-variants" title={t('mapCatalog.copyHint')}>{t('mapCatalog.copy')}</span>}
        {map.used && <span className="vault-variants" title={t('mapCatalog.used')}>{t('mapCatalog.usedShort')}</span>}
      </div>
    </li>
  );
}

/** A small menu at the pointer; a click elsewhere or Esc closes it. */
function CatalogMenu({ x, y, onClose, children }: { x: number; y: number; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const doc = ref.current?.ownerDocument ?? document;
    const click = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) onClose(); };
    const key = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    const id = setTimeout(() => doc.addEventListener('click', click), 0);
    doc.addEventListener('keydown', key);
    return () => { clearTimeout(id); doc.removeEventListener('click', click); doc.removeEventListener('keydown', key); };
  }, [onClose]);
  return <div ref={ref} className="menu tab-menu" role="menu" style={{ left: x, top: y }}>{children}</div>;
}

/** The catalog's filters in the Browser: type, tags, landscape, use in the open campaign. */
export function MapCatalogBrowser() {
  const { t } = useI18n();
  const maps = useStore((s) => s.libraryMaps);
  const filter = useStore((s) => s.mapFilter);
  const campaign = useStore((s) => s.campaign);
  const typeLabel = useTypeLabel();
  const types = filter.types ?? [];
  const tags = useMemo(() => countsOf(maps.flatMap((m) => m.tags)), [maps]);
  const regions = useMemo(() => countsOf(maps.map((m) => m.region)), [maps]);
  const toggleType = (m: MapType) => setMapFilter({ types: types.includes(m) ? types.filter((x) => x !== m) : [...types, m] });
  return (
    <div className="panel-body vault-browser">
      <div className="sec">{t('mapCatalog.types')}</div>
      <ul className="tree">
        <li>
          <button className={`tn ${types.length === 0 && !filter.used ? 'sel' : ''}`} onClick={() => setMapFilter({ types: [], used: undefined })}>
            <Icon name="archive" /><span className="nm">{t('vault.all')}</span><span className="meta">{maps.length}</span>
          </button>
        </li>
        {MAP_TYPES.map((m) => (
          <li key={m}>
            <button className={`tn ${types.includes(m) ? 'sel' : ''}`} aria-pressed={types.includes(m)} onClick={() => toggleType(m)}>
              <Icon name="map" /><span className="nm">{typeLabel(m)}</span><span className="meta">{maps.filter((x) => x.mapType === m).length}</span>
            </button>
          </li>
        ))}
      </ul>
      {campaign && (
        <>
          <div className="sec">{t('mapCatalog.use')}</div>
          <div className="chips">
            {(['used', 'unused'] as const).map((u) => (
              <button key={u} className={`chip ${filter.used === u ? 'on' : ''}`} aria-pressed={filter.used === u} onClick={() => setMapFilter({ used: filter.used === u ? undefined : u })}>
                {t(u === 'used' ? 'mapCatalog.used' : 'mapCatalog.unused')} <span className="meta">{maps.filter((x) => x.used === (u === 'used')).length}</span>
              </button>
            ))}
          </div>
        </>
      )}
      {regions.length > 0 && (
        <>
          <div className="sec">{t('mapCatalog.regions')}</div>
          <div className="chips">
            {regions.map((r) => (
              <button key={r.value} className={`chip ${filter.region === r.value ? 'on' : ''}`} aria-pressed={filter.region === r.value} onClick={() => setMapFilter({ region: filter.region === r.value ? undefined : r.value })}>{r.value} <span className="meta">{r.n}</span></button>
            ))}
          </div>
        </>
      )}
      {tags.length > 0 && (
        <>
          <div className="sec">{t('props.tags')}</div>
          <div className="chips">
            {tags.map((g) => (
              <button key={g.value} className={`chip ${filter.tag === g.value ? 'on' : ''}`} aria-pressed={filter.tag === g.value} onClick={() => setMapFilter({ tag: filter.tag === g.value ? undefined : g.value })}>{g.value} <span className="meta">{g.n}</span></button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/** The picked map: its facts (name, type, tags changed here unless it is open), edit, its scenes, a new scene, trash. */
export function MapDetails() {
  const { t } = useI18n();
  const typeLabel = useTypeLabel();
  const mapFile = useStore((s) => s.mapSelected);
  const map = useStore((s) => s.libraryMaps.find((m) => m.mapFile === s.mapSelected));
  const scenes = useStore((s) => (s.mapSelected ? s.mapScenes[s.mapSelected] ?? [] : []));
  const campaign = useStore((s) => s.campaign);
  useStore((s) => s.tabs);
  const [usage, setUsage] = useState<MapUsage[] | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [copying, setCopying] = useState<{ name: string; withAll: boolean } | null>(null);
  useEffect(() => {
    setConfirm(false);
    setCopying(null);
    setUsage(null);
    if (mapFile) void mapUsage(mapFile).then(setUsage);
  }, [mapFile]);
  if (!map || !mapFile) return <div className="panel-body hint">{t('mapCatalog.noSelection')}</div>;
  const open = mapIsOpen(mapFile);
  const blocked = usage ? trashBlocked(map, usage) : null;
  const editable = map.hasSidecar && !open;
  const others = usage ? usage.length - scenes.length : 0;
  return (
    <div className="panel-body vault-props">
      <div className="sec">{t('panel.map')}</div>
      {map.drawn ? <DrawnThumb map={map} className="map-catalog-preview" /> : <MapPreview map={map} />}
      <DetailText label={t('props.name')} value={map.name} disabled={!editable} onCommit={(v) => v.trim() && void updateLibraryMap(mapFile, { name: v.trim() })} />
      <div className="row">
        <label htmlFor="mc-type">{t('mapSettings.type')}</label>
        <select id="mc-type" value={map.mapType} disabled={!editable} onChange={(e) => void updateLibraryMap(mapFile, { mapType: e.target.value as MapType })}>
          {MAP_TYPES.map((m) => <option key={m} value={m}>{typeLabel(m)}</option>)}
        </select>
      </div>
      <DetailText label={t('props.tags')} value={map.tags.join(', ')} disabled={!editable} onCommit={(v) => void updateLibraryMap(mapFile, { tags: [...new Set(v.split(',').map((x) => x.trim()).filter(Boolean))] })} />
      {map.region && <div className="row"><label>{t('mapCatalog.region')}</label><span>{map.region}</span></div>}
      <div className="row"><label>{t('props.file')}</label>{map.drawn ? <span className="hint">{t('props.drawnMap')}</span> : <span className="mono hint" title={map.resource}>{map.resource.replace(/^library\//, '')}</span>}</div>
      {map.copy && <div className="row"><label>{t('mapCatalog.copy')}</label><span className="mono hint" title={map.mapFile}>{map.mapFile.replace(/^library\//, '')}</span></div>}
      {map.widthPx !== null && <div className="row"><label>{t('mapCatalog.size')}</label><span>{map.widthPx} × {map.heightPx} px</span></div>}
      {map.cellPx !== null && <div className="row"><label>{t('mapCatalog.grid')}</label><span>{Number(map.cellPx.toFixed(1))} px · {map.feetPerCell} ft</span></div>}
      {open && <p className="hint">{t('mapCatalog.openHint')}</p>}
      {!map.hasSidecar && <p className="hint">{t('mapCatalog.noSidecar')}</p>}
      <button className="btn sm pri" onClick={() => void openLibraryMap(mapFile)}><Icon name="map" />{t('mapCatalog.edit')}</button>
      {campaign && (
        <>
          <div className="sec">{t('mapCatalog.scenes')}</div>
          {scenes.length === 0 ? <p className="hint">{t('mapCatalog.noScenes')}</p> : (
            <ul className="tree">
              {scenes.map((s) => (
                <li key={s.path}><button className="tn" onClick={() => void switchScene(s.path)}><Icon name="flag" /><span className="nm">{s.name}</span></button></li>
              ))}
            </ul>
          )}
          {others > 0 && <p className="hint">{t('mapCatalog.otherCampaigns', { n: others })}</p>}
          <button className="btn sm" onClick={() => void newSceneOnMap(mapFile)}><Icon name="plus" />{t('tabs.newScene')}</button>
        </>
      )}
      <div className="sec">{t('mapCatalog.manage')}</div>
      {copying ? (
        <div className="library-confirm">
          <div className="row"><label htmlFor="mc-copy">{t('props.name')}</label><input id="mc-copy" value={copying.name} onChange={(e) => setCopying({ ...copying, name: e.target.value })} /></div>
          <label className="cmd-check"><input type="radio" name="mc-copy-what" checked={!copying.withAll} onChange={() => setCopying({ ...copying, withAll: false })} />{t('mapCatalog.onlyMap')}</label>
          <label className="cmd-check"><input type="radio" name="mc-copy-what" checked={copying.withAll} onChange={() => setCopying({ ...copying, withAll: true })} />{t('mapCatalog.withAll')}</label>
          <p className="hint">{t('mapCatalog.copyHint')}</p>
          <div className="library-buttons">
            <button className="btn sm pri" onClick={() => void duplicateLibraryMap(mapFile, copying.name, copying.withAll).then(() => setCopying(null))}>{t('mapCatalog.duplicate')}</button>
            <button className="btn sm" onClick={() => setCopying(null)}>{t('start.cancel')}</button>
          </div>
        </div>
      ) : (
        <button className="btn sm" disabled={!map.hasSidecar} onClick={() => setCopying({ name: t('mapCatalog.copyName', { name: map.name }), withAll: false })}><Icon name="plus" />{t('mapCatalog.duplicate')}</button>
      )}
      {blocked && <p className="hint">{t(blocked === 'copyUsed' ? 'mapCatalog.copyUsed' : 'mapCatalog.pictureShared')}</p>}
      {confirm ? (
        <div className="library-confirm" role="alert">
          {usage && usage.length > 0 ? (
            <>
              <p>{t('library.usedBy', { n: usage.length })}</p>
              <ul>{usage.slice(0, 6).map((u, i) => <li key={i}>{u.campaign} · {u.scene}</li>)}</ul>
              <p className="hint">{t('library.usedHint')}</p>
            </>
          ) : (
            <p>{t('library.unused')}</p>
          )}
          <div className="library-buttons">
            <button className="btn sm danger" disabled={open || !!blocked} onClick={() => void trashLibraryMap(mapFile).then(() => setConfirm(false))}>{t('library.trashConfirm')}</button>
            <button className="btn sm" onClick={() => setConfirm(false)}>{t('start.cancel')}</button>
          </div>
        </div>
      ) : (
        <button className="btn sm danger" disabled={open || !!blocked} title={open ? t('mapCatalog.openHint') : undefined} onClick={() => setConfirm(true)}><Icon name="trash" />{t('library.trash')}</button>
      )}
    </div>
  );
}

function MapPreview({ map }: { map: LibraryMap }) {
  const thumb = useThumbnail({ relPath: map.resource, size: map.size, mtimeMs: map.mtimeMs });
  return thumb ? <img className="map-catalog-preview" src={thumb} alt="" /> : null;
}

/** A text field saved on Enter or when leaving it. */
function DetailText({ label, value, disabled, onCommit }: { label: string; value: string; disabled: boolean; onCommit: (v: string) => void }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const commit = () => draft !== value && onCommit(draft);
  return (
    <div className="row"><label>{label}</label>
      <input value={draft} disabled={disabled} aria-label={label} onChange={(e) => setDraft(e.target.value)} onBlur={commit} onKeyDown={(e) => e.key === 'Enter' && commit()} />
    </div>
  );
}
