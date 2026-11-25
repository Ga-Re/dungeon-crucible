import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { exploredShare } from '../core/fogModel';
import { DockHost } from '../dock/DockHost';
import { floatingBackend } from '../platform/bridge';
import { draftChanged, importVaultAssets, startPackImport } from './vault';
import { showMapCatalog } from './library';
import { useI18n } from '../i18n/i18n';
import { Icon } from '../ui/Icon';
import { mapCommands } from '../panels/MapView';
import { MonitorMenu } from '../panels/panels';
import { PANEL_TITLES, WORKSPACES, WORKSPACE_ORDER, type PanelId, type RibbonButton } from './workspaces';
import { BOTTOM_SPANS_FULL_WIDTH, PANEL_CONTENT, activateWorkspaceLayout, dock, focusPanel, removeLegacyLayouts } from './docking';
import type { DocTab } from './store';
import {
  clearTemplates, emit, fogAll, log, nextTurn, openMapSettings, placeParty, startAreaCommand, startCalibration, startWallCommand, redo, rotateTable, setFogMode, setTool, setWorkspace, state, toggle, toggleBlackout, toggleDmFog, undo, useStore,
} from './store';
import { stopAll } from './soundboard';
import { setMasterVolume, unlockAudioOnGesture } from './audio';
import { closeCampaign, closeTab, importMapIntoCampaign, newCreature, newSceneOnMap, putOnTv, refreshRoot, saveCampaign, setEditStart, showTab, startAutosave } from './campaign';
import { ResetSceneDialog } from './ResetSceneDialog';
import { MapSettingsDialog } from './MapSettingsDialog';
import { ExportDialog } from './ExportDialog';
import { AppearanceControls } from './Appearance';
import { StartScreen } from './StartScreen';
import { isDesktop } from '../platform/bridge';
import { openTable, refreshMonitors, startFrameLoop } from './tableOutput';
import { importMapFile } from './importMap';

export function App() {
  const ws = useStore((s) => s.ws);
  const home = useStore((s) => s.home);
  useEffect(() => {
    startFrameLoop();
    startAutosave();
    unlockAudioOnGesture();
    setMasterVolume(state.soundboard.master);
    void refreshMonitors();
    // Without the desktop app (plain browser) the sample campaign is what is open.
    if (!isDesktop()) log('log.opened');
    emit();
    // The desktop app starts on the start screen (recent campaigns, new, open, import).
    if (isDesktop()) {
      state.home = true;
      void refreshRoot();
    }
    removeLegacyLayouts();
    const flush = () => dock.flush();
    window.addEventListener('pagehide', flush);
    const keys = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      if ((e.target as HTMLElement).closest('input,textarea,select')) return;
      const k = e.key.toLowerCase();
      if (k === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
      else if ((k === 'z' && e.shiftKey) || k === 'y') { e.preventDefault(); redo(); }
      else if (k === 's') { e.preventDefault(); void saveCampaign(true); }
      // Campaigns live in the root folder: Ctrl/⌘+O goes to the start screen.
      else if (k === 'o' && isDesktop()) { e.preventDefault(); void closeCampaign(); }
    };
    window.addEventListener('keydown', keys);
    return () => {
      window.removeEventListener('keydown', keys);
      window.removeEventListener('pagehide', flush);
      flush();
    };
  }, []);
  if (home) return <StartScreen />;
  return (
    <div className="app">
      <AppBar />
      <Ribbon />
      <div className="dock-area">
        <DockArea key={ws} ws={ws} />
      </div>
      <StatusBar />
    </div>
  );
}

function AppBar() {
  const { t } = useI18n();
  const tableOpen = useStore((s) => s.tableOpen);
  const blackout = useStore((s) => s.scene.table.blackout);
  const rotation = useStore((s) => s.scene.table.rotation);
  const monitor = useStore((s) => s.monitors.find((m) => m.index === s.tableMonitor));
  const [menu, setMenu] = useState<DOMRect | null>(null);
  const [panelsMenu, setPanelsMenu] = useState<DOMRect | null>(null);
  const campaign = useStore((s) => s.campaign);
  const dirty = useStore((s) => s.dirty);
  const saving = useStore((s) => s.saving);
  const canUndo = useStore((s) => s.canUndo);
  const canRedo = useStore((s) => s.canRedo);
  const [exporting, setExporting] = useState(false);
  return (
    <header className="appbar">
      <div className="brand"><span className="mark"><Icon name="anvil" /></span>{t('app.name')}</div>
      {isDesktop() && <button className="ab-btn" title={`${t('start.home')} (Ctrl/⌘+O)`} aria-label={t('start.home')} onClick={() => void closeCampaign()}><Icon name="home" /></button>}
      <button className="ab-btn" title={`${t('app.save')} (Ctrl+S)`} disabled={!campaign} onClick={() => void saveCampaign(true)}><Icon name="save" /></button>
      <button className="ab-btn" title={t('campaign.export')} aria-label={t('campaign.export')} disabled={!campaign} onClick={() => setExporting(true)}><Icon name="export" /></button>
      {exporting && <ExportDialog onClose={() => setExporting(false)} />}
      <button className="ab-btn" title={`${t('app.undo')} (Ctrl+Z)`} disabled={!canUndo} onClick={undo}><Icon name="undo" /></button>
      <button className="ab-btn" title={`${t('app.redo')} (Ctrl+Shift+Z)`} disabled={!canRedo} onClick={redo}><Icon name="redo" /></button>
      <span className="doc-name">
        <Icon name="folder" />
        <b>{campaign?.name ?? t('campaign.none')}</b>
        <span className="hint">{campaign ? (saving ? t('campaign.saving') : dirty ? t('campaign.unsaved') : t('campaign.saved')) : t('campaign.notSaved')}</span>
      </span>
      {campaign && <DocTabs />}
      <button className="ab-btn" title={t('panels.menu')} onClick={(e) => setPanelsMenu(panelsMenu ? null : e.currentTarget.getBoundingClientRect())}><Icon name="list" /><span>{t('panels.menu')}</span></button>
      {panelsMenu && <PanelsMenu anchor={panelsMenu} onClose={() => setPanelsMenu(null)} />}
      <div className="ab-right">
        <button className={`pill ${!tableOpen ? 'off' : blackout ? 'black' : ''}`} onClick={(e) => setMenu(menu ? null : e.currentTarget.getBoundingClientRect())}>
          <span className="dot" />
          {tableOpen ? `${monitor?.name ?? t('table.monitor')} · ${rotation}°${blackout ? ` · ${t('tool.blackout')}` : ''}` : t('status.tableOff')}
        </button>
        <AppearanceControls />
      </div>
      {menu && <MonitorMenu anchor={menu} onClose={() => setMenu(null)} />}
    </header>
  );
}

function Ribbon() {
  const { t } = useI18n();
  const ws = useStore((s) => s.ws);
  const tool = useStore((s) => s.tool);
  const flags = useStore((s) => ({ snap: s.snap, viewAsPlayer: s.viewAsPlayer, moveLock: s.moveLock, blackout: s.scene.table.blackout, fogMode: s.fogMode, dmFogHidden: s.dmFogHidden, editStart: s.editStart, onTv: !!s.scenePath && s.scenePath === s.tvScenePath }));
  const [resetting, setResetting] = useState(false);
  const mapSettings = useStore((s) => s.mapSettingsOpen);
  const [tab, setTab] = useState(0);
  const [open, setOpen] = useState(false);
  const [menu, setMenu] = useState<DOMRect | null>(null);
  const def = WORKSPACES[ws];
  const activeTab = def.tabs[Math.min(tab, def.tabs.length - 1)];
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => setTab(0), [ws]);

  const isActive = (b: RibbonButton): boolean => {
    if (b.tool) return tool === b.tool;
    if (b.id === 'toggle:snap') return flags.snap;
    if (b.id === 'toggle:viewAsPlayer') return flags.viewAsPlayer;
    if (b.id === 'toggle:moveLock') return flags.moveLock;
    if (b.id === 'toggle:blackout') return flags.blackout;
    if (b.id === 'fogmode:reveal') return flags.fogMode === 'reveal';
    if (b.id === 'fogmode:hide') return flags.fogMode === 'hide';
    if (b.id === 'fog:dmHide') return flags.dmFogHidden;
    if (b.id === 'toggle:editStart') return flags.editStart;
    if (b.id === 'scene:toTv') return flags.onTv;
    if (b.id === 'area:create') return tool === 'area';
    if (b.id === 'walls:draw') return tool === 'wall';
    if (b.id === 'grid:calibrate') return tool === 'calibrate';
    return false;
  };

  const run = (b: RibbonButton, el: HTMLElement) => {
    if (b.tool) return setTool(b.tool);
    switch (b.id) {
      case 'toggle:snap': return toggle('snap');
      case 'toggle:viewAsPlayer': return toggle('viewAsPlayer');
      case 'toggle:moveLock': return toggle('moveLock');
      case 'toggle:blackout': return toggleBlackout();
      case 'toggle:editStart': return void setEditStart(!flags.editStart);
      case 'scene:reset': return setResetting(true);
      case 'scene:toTv': return void (state.scenePath && putOnTv(state.scenePath));
      case 'party:place': return placeParty();
      case 'map:settings': return openMapSettings();
      case 'area:create': return startAreaCommand();
      case 'fit': return mapCommands.fit();
      case 'fog:hideAll': return fogAll(false);
      case 'fog:dmHide': return toggleDmFog();
      case 'fogmode:reveal': return setFogMode('reveal');
      case 'fogmode:hide': return setFogMode('hide');
      case 'panel:fog': return focusPanel('fog');
      case 'panel:sound': return focusPanel('sound');
      case 'audio:stop': return stopAll();
      case 'fog:revealAll': return fogAll(true);
      case 'walls:draw': return startWallCommand();
      case 'grid:calibrate': return startCalibration();
      case 'vault:import': return void importVaultAssets();
      case 'vault:pack': return void startPackImport();
      case 'turn:next': return nextTurn();
      case 'templates:clear': return clearTemplates();
      case 'table:open': return void openTable();
      case 'table:rotate': return rotateTable();
      case 'table:move': return setMenu(el.getBoundingClientRect());
      case 'panel:table': return focusPanel('table');
      case 'panel:encounter': return focusPanel('encounter');
      case 'map:import':
        void importMapIntoCampaign().then((handled) => { if (!handled) fileRef.current?.click(); });
        return;
      case 'creature:new':
      case 'creature:newPc': return newCreature(b.id === 'creature:newPc' ? 'pc' : 'monster', t(b.id === 'creature:newPc' ? 'tool.newPc' : 'tool.newCreature'));
    }
  };

  return (
    <section className="ribbon">
      <div className="ws-switch">
        <span className="lbl">{t('app.workspace')}</span>
        <button className="ws-btn" aria-haspopup="true" aria-expanded={open} onClick={() => setOpen(!open)}>
          <span className="wsic"><Icon name={def.icon} /></span>{t(def.name)}<Icon name="chev" />
        </button>
        {open && (
          <div className="ws-menu" onMouseLeave={() => setOpen(false)}>
            {WORKSPACE_ORDER.map((id) => (
              <button key={id} className={`ws-item ${id === ws ? 'on' : ''}`} onClick={() => { setWorkspace(id); setOpen(false); }}>
                <span className="wsic"><Icon name={WORKSPACES[id].icon} /></span>
                <span><b>{t(WORKSPACES[id].name)}</b><span>{t(WORKSPACES[id].desc)}</span></span>
              </button>
            ))}
          </div>
        )}
      </div>
      <nav className="r-tabs" role="tablist">
        {def.tabs.map((tb, i) => (
          <button key={tb.label} role="tab" aria-selected={tb === activeTab} className={`r-tab ${tb === activeTab ? 'on' : ''}`} onClick={() => setTab(i)}>{t(tb.label)}</button>
        ))}
      </nav>
      <div className="r-tools">
        {activeTab.groups.map((g) => (
          <div key={g.label} className="r-group">
            <div className="tools">
              {g.buttons.map((b) => (
                <button key={b.id} className={`tool ${isActive(b) ? (b.tool ? 'on' : 'active') : ''}`} title={t(b.label)} onClick={(e) => run(b, e.currentTarget)}>
                  <Icon name={b.icon} /><span>{t(b.label)}</span>
                </button>
              ))}
            </div>
            <div className="glabel">{t(g.label)}</div>
          </div>
        ))}
      </div>
      <input ref={fileRef} type="file" hidden accept=".png,.jpg,.jpeg,.webp,.mp4,.webm,image/png,image/jpeg,image/webp,video/mp4,video/webm" onChange={(e) => { const f = e.target.files?.[0]; if (f) void importMapFile(f); e.target.value = ''; }} />
      {menu && <MonitorMenu anchor={menu} onClose={() => setMenu(null)} />}
      {resetting && <ResetSceneDialog onClose={() => setResetting(false)} />}
      {mapSettings && <MapSettingsDialog onClose={() => openMapSettings(false)} />}
    </section>
  );
}

/** Menu "Windows": every panel with its state; a click shows a closed one or closes an open one. */
function PanelsMenu({ anchor, onClose }: { anchor: DOMRect; onClose: () => void }) {
  const { t } = useI18n();
  const ws = useStore((s) => s.ws);
  useSyncExternalStore(dock.subscribe, dock.getLayout);
  const l = WORKSPACES[ws].layout;
  const mine = [...l.left, ...l.right, ...l.bottom, ...(l.floating ?? []).map((f) => f.id)];
  const others = (Object.keys(PANEL_TITLES) as PanelId[]).filter((id) => id !== l.center && !mine.includes(id));
  useEffect(() => {
    const close = (e: MouseEvent) => { if (!(e.target as HTMLElement).closest('.menu')) onClose(); };
    const id = setTimeout(() => document.addEventListener('click', close), 0);
    return () => { clearTimeout(id); document.removeEventListener('click', close); };
  }, [onClose]);
  const item = (id: PanelId) => {
    const open = dock.isVisible(id);
    return (
      <button key={id} className={open ? 'on' : ''} aria-pressed={open} onClick={() => { if (open) dock.hide(id); else focusPanel(id); onClose(); }}>
        <Icon name={open ? 'eye' : 'eyeoff'} /><span>{t(PANEL_TITLES[id])}</span>
      </button>
    );
  };
  return (
    <div className="menu" style={{ left: Math.max(8, anchor.left), top: anchor.bottom + 4 }}>
      <div className="mh">{t('panels.workspace')}</div>
      {mine.map(item)}
      <div className="mh">{t('panels.more')}</div>
      {others.map(item)}
      <div className="mh" />
      <button onClick={() => { dock.resetLayout(); onClose(); }}><Icon name="undo" /><span>{t('panels.reset')}</span></button>
    </div>
  );
}

function DockArea({ ws }: { ws: keyof typeof WORKSPACES }) {
  const { t } = useI18n();
  // Before the first render, so the workspace never shows the previous layout.
  useMemo(() => activateWorkspaceLayout(ws), [ws]);
  const labels = useMemo(
    () => ({ collapse: t('panels.collapse'), expand: t('panels.expand'), close: t('panels.close'), collapseZone: t('panels.collapseZone'), expandZone: t('panels.expandZone'), pin: t('panels.pin'), resize: t('panels.resize') }),
    [t],
  );
  const titleOf = useMemo(() => (id: string) => t(PANEL_TITLES[id as PanelId] ?? 'panel.map'), [t]);
  return <DockHost manager={dock} canvas={PANEL_CONTENT[WORKSPACES[ws].layout.center]()} labels={labels} titleOf={titleOf} floating={floatingBackend()} bottomSpansFullWidth={BOTTOM_SPANS_FULL_WIDTH} />;
}

function StatusBar() {
  const { t } = useI18n();
  const ws = useStore((s) => s.ws);
  const tableOpen = useStore((s) => s.tableOpen);
  const blackout = useStore((s) => s.scene.table.blackout);
  const fog = useStore((s) => s.scene.fog);
  const visible = useStore((s) => s.visible);
  const map = useStore((s) => s.scene.map);
  const round = useStore((s) => s.round);
  const grid = useStore((s) => s.scene.map.grid);
  const explored = useMemo(() => Math.round(exploredShare(fog, visible, map.widthPx, map.heightPx) * 100), [fog, visible, map.widthPx, map.heightPx]);
  return (
    <footer className="statusbar">
      <span>{t(WORKSPACES[ws].name)}</span>
      <span className="sep" />
      <span>{t('props.grid')} {grid.feetPerCell} ft · <span className="mono">{grid.cellWidth.toFixed(1)} px</span></span>
      <span className="sep" />
      <span>{t('status.explored')} <span className="mono">{explored} %</span></span>
      {ws === 'play' && (<><span className="sep" /><span>{t('init.round', { n: round })}</span></>)}
      <span className="sep" />
      <span className={!tableOpen ? '' : blackout ? 'bad' : 'safe'}>● {!tableOpen ? t('status.tableOff') : blackout ? t('status.tableBlack') : t('status.tableSafe')}</span>
    </footer>
  );
}

/**
 * The open documents as tabs in the title bar (E-30, DC-034): a click shows one, the ✕ (or a
 * middle click) closes it, the context menu puts it on the TV. The TV's scene carries a TV mark;
 * a tab a dot while its changes are not saved yet. Closing the TV's scene asks first.
 */
function DocTabs() {
  const { t } = useI18n();
  const tabs = useStore((s) => s.tabs);
  // In the Creatures workspace the creature shown; elsewhere the scene or map behind the tabs.
  const catalogOn = useStore((s) => s.ws === 'forge' && s.forgeCatalog);
  const active = useStore((s) => (s.ws === 'creatures' ? s.creatureTab : s.ws === 'vault' ? s.assetTab : (s.ws === 'forge' && !s.forgeCatalog) || s.ws === 'play' ? s.activeTab : null));
  const creatures = useStore((s) => s.creatures);
  const assets = useStore((s) => s.vault.items);
  // Asset tabs whose draft has changes not saved with OK.
  const editor = useStore((s) => s.vault.editor);
  const drafts = useStore((s) => s.vault.drafts);
  const changed = new Set([...(editor ? [editor] : []), ...Object.values(drafts)].filter(draftChanged).map((e) => `asset:${e.relPath}`));
  const tv = useStore((s) => s.tvScenePath);
  const pending = useStore((s) => s.dirty || s.saving);
  const [menu, setMenu] = useState<{ id: string; at: DOMRect } | null>(null);
  const [confirm, setConfirm] = useState<{ id: string; at: DOMRect; draft?: boolean } | null>(null);
  const close = (id: string, el: HTMLElement) => {
    const at = el.closest('.doc-tab')!.getBoundingClientRect();
    // The TV's scene and an asset with an unsaved draft ask first.
    if (id === tv) setConfirm({ id, at });
    else if (changed.has(id)) setConfirm({ id, at, draft: true });
    else void closeTab(id);
  };
  // A creature's tab carries its name as it is now (renamed in its stat block).
  const nameOf = (tab: DocTab) =>
    tab.kind === 'creature' ? creatures.find((c) => `creature:${c.id}` === tab.id)?.name ?? tab.name
    : tab.kind === 'asset' ? assets.find((a) => `asset:${a.relPath}` === tab.id)?.asset.name ?? tab.name
    : tab.name;
  return (
    <div className="doc-tabs" role="tablist" aria-label={t('tabs.label')}>
      {/* The map catalog (E-32): always first, opens the Map Forge on it. */}
      <div className={`doc-tab doc-tab-fixed ${catalogOn ? 'on' : ''}`}>
        <button role="tab" aria-selected={catalogOn} className="doc-tab-name" title={t('mapCatalog.tabHint')} onClick={() => { if (state.ws !== 'forge') setWorkspace('forge'); showMapCatalog(); }}>
          <Icon name="grid" /><span>{t('mapCatalog.tab')}</span>
        </button>
      </div>
      {tabs.map((tab) => {
        const on = tab.id === active;
        const name = nameOf(tab);
        return (
          <div
            key={tab.id}
            className={`doc-tab ${on ? 'on' : ''}`}
            onAuxClick={(e) => e.button === 1 && close(tab.id, e.currentTarget)}
            onContextMenu={(e) => {
              e.preventDefault();
              setMenu({ id: tab.id, at: e.currentTarget.getBoundingClientRect() });
            }}
          >
            <button role="tab" aria-selected={on} className="doc-tab-name" title={name} onClick={() => void showTab(tab.id)}>
              <Icon name={tab.kind === 'map' ? 'map' : tab.kind === 'creature' ? 'token' : tab.kind === 'asset' ? 'cube' : 'flag'} />
              <span>{name}</span>
              {tab.id === tv && <span className="doc-tab-tv" title={t('tabs.onTv')} aria-label={t('tabs.onTv')}><Icon name="monitor" /></span>}
              {((on && pending && (tab.kind === 'scene' || tab.kind === 'map')) || tab.unsaved || changed.has(tab.id)) && <span className="doc-tab-dot" aria-label={t('tabs.unsaved')} />}
            </button>
            <button className="doc-tab-close" title={t('tabs.close')} aria-label={`${t('tabs.close')}: ${name}`} onClick={(e) => close(tab.id, e.currentTarget)}><Icon name="close" /></button>
          </div>
        );
      })}
      {menu && (
        <TabMenu at={menu.at} onClose={() => setMenu(null)}>
          {menu.id.startsWith('creature:') || menu.id.startsWith('asset:') ? null : menu.id.startsWith('map:') ? (
            <button onClick={() => { void newSceneOnMap(menu.id.slice(4)); setMenu(null); }}><Icon name="plus" /><span>{t('tabs.newScene')}</span></button>
          ) : (
            <button disabled={menu.id === tv} onClick={() => { void putOnTv(menu.id); setMenu(null); }}><Icon name="monitor" /><span>{t('tool.sceneToTv')}</span></button>
          )}
          <button onClick={(e) => { const at = menu.at; setMenu(null); if (menu.id === tv) setConfirm({ id: menu.id, at }); else if (changed.has(menu.id)) setConfirm({ id: menu.id, at, draft: true }); else void closeTab(menu.id); e.stopPropagation(); }}><Icon name="close" /><span>{t('tabs.close')}</span></button>
        </TabMenu>
      )}
      {confirm && (
        <TabMenu at={confirm.at} onClose={() => setConfirm(null)}>
          <p className="tab-confirm">{t(confirm.draft ? 'tabs.closeDraft' : 'tabs.closeTv')}</p>
          <div className="library-buttons tab-confirm-buttons">
            <button className="btn sm danger" onClick={() => { void closeTab(confirm.id); setConfirm(null); }}>{t(confirm.draft ? 'tabs.discard' : 'tabs.closeAnyway')}</button>
            <button className="btn sm" autoFocus onClick={() => setConfirm(null)}>{t('start.cancel')}</button>
          </div>
        </TabMenu>
      )}
    </div>
  );
}

/** A small menu under a tab; a click elsewhere or Esc closes it. */
function TabMenu({ at, onClose, children }: { at: DOMRect; onClose: () => void; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const doc = ref.current?.ownerDocument ?? document;
    const click = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) onClose(); };
    // Keys in the menu stay there: an editor behind it must not take Esc (cancel) or Enter (OK).
    const key = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' && !ref.current?.contains(e.target as Node)) return;
      e.stopPropagation();
      if (e.key === 'Escape') onClose();
    };
    const id = setTimeout(() => doc.addEventListener('click', click), 0);
    doc.addEventListener('keydown', key);
    return () => { clearTimeout(id); doc.removeEventListener('click', click); doc.removeEventListener('keydown', key); };
  }, [onClose]);
  return <div ref={ref} className="menu tab-menu" role="menu" style={{ left: at.left, top: at.bottom + 2 }}>{children}</div>;
}
