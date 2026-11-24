import { useEffect, useMemo, useRef, useState, type FunctionComponent } from 'react';
import { exploredShare } from '../core/fogModel';
import { DockviewReact, type DockviewApi, type DockviewReadyEvent, type IDockviewHeaderActionsProps, type IDockviewPanelProps } from 'dockview-react';
import 'dockview-react/dist/styles/dockview.css';
import { useI18n, LOCALES, translate, type Locale } from '../i18n/i18n';
import { Icon } from '../ui/Icon';
import { MapView, mapCommands } from '../panels/MapView';
import {
  BrowserPanel, CreaturePanel, SoundPanel, DicePanel, EncounterPanel, FogPanel, InitiativePanel, LogPanel, MonitorMenu, PreviewPanel, PropertiesPanel, SoonPanel, TablePanel,
} from '../panels/panels';
import { PANEL_TITLES, WORKSPACES, WORKSPACE_ORDER, type PanelId, type RibbonButton } from './workspaces';
import {
  clearTemplates, emit, fogAll, log, nextTurn, redo, removeLastUserWall, rotateTable, setFogMode, setGridType, setTool, setWorkspace, state, toggle, toggleBlackout, toggleDmFog, undo, useStore,
} from './store';
import { stopAll } from './soundboard';
import { setMasterVolume, unlockAudioOnGesture } from './audio';
import { importMapIntoCampaign, openCampaignDialog, reopenLastCampaign, saveCampaign, startAutosave } from './campaign';
import { openTable, refreshMonitors, startFrameLoop } from './tableOutput';
import { importMapFile } from './importMap';
import { SAMPLE_CREATURES } from '../sample/creatures';

const LAYOUT_VERSION = 1;

const COMPONENTS: Record<PanelId, FunctionComponent<IDockviewPanelProps>> = {
  map: () => <MapView />,
  browser: () => <BrowserPanel />,
  properties: () => <PropertiesPanel />,
  fog: () => <FogPanel />,
  initiative: () => <InitiativePanel />,
  preview: () => <PreviewPanel />,
  table: () => <TablePanel />,
  dice: () => <DicePanel />,
  log: () => <LogPanel />,
  encounter: () => <EncounterPanel />,
  creature: () => <CreaturePanel />,
  atlas: () => <SoonPanel text="soon.atlas" />,
  vault: () => <SoonPanel text="soon.vault" />,
  sound: () => <SoundPanel />,
};

export let dockApi: DockviewApi | null = null;

type Skin = 'dark' | 'light' | 'parchment';
function initialSkin(): Skin {
  try {
    const v = localStorage.getItem('dc.skin');
    if (v === 'light' || v === 'parchment' || v === 'dark') return v;
  } catch { /* ignore */ }
  return 'dark';
}

export function App() {
  const ws = useStore((s) => s.ws);
  useEffect(() => {
    startFrameLoop();
    startAutosave();
    unlockAudioOnGesture();
    setMasterVolume(state.soundboard.master);
    void refreshMonitors();
    log('log.opened');
    emit();
    void reopenLastCampaign();
    const keys = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      if ((e.target as HTMLElement).closest('input,textarea,select')) return;
      const k = e.key.toLowerCase();
      if (k === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
      else if ((k === 'z' && e.shiftKey) || k === 'y') { e.preventDefault(); redo(); }
      else if (k === 's') { e.preventDefault(); void saveCampaign(true); }
      else if (k === 'o') { e.preventDefault(); void openCampaignDialog(); }
    };
    window.addEventListener('keydown', keys);
    return () => window.removeEventListener('keydown', keys);
  }, []);
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
  const { t, locale, setLocale } = useI18n();
  const [skin, setSkin] = useState<Skin>(initialSkin);
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
  useEffect(() => {
    document.documentElement.dataset.skin = skin;
    try { localStorage.setItem('dc.skin', skin); } catch { /* ignore */ }
  }, [skin]);
  return (
    <header className="appbar">
      <div className="brand"><span className="mark"><Icon name="anvil" /></span>{t('app.name')}</div>
      <button className={`ab-btn ${campaign ? '' : 'cta'}`} title={`${t('campaign.open')} (Ctrl/⌘+O)`} onClick={() => void openCampaignDialog()}>
        <Icon name="folder" />{!campaign && <span>{t('campaign.openShort')}</span>}
      </button>
      <button className="ab-btn" title={`${t('app.save')} (Ctrl+S)`} disabled={!campaign} onClick={() => void saveCampaign(true)}><Icon name="save" /></button>
      <button className="ab-btn" title={`${t('app.undo')} (Ctrl+Z)`} disabled={!canUndo} onClick={undo}><Icon name="undo" /></button>
      <button className="ab-btn" title={`${t('app.redo')} (Ctrl+Shift+Z)`} disabled={!canRedo} onClick={redo}><Icon name="redo" /></button>
      <span className="doc-name">
        <Icon name="folder" />
        <b>{campaign?.name ?? t('campaign.none')}</b>
        <span className="hint">{campaign ? (saving ? t('campaign.saving') : dirty ? t('campaign.unsaved') : t('campaign.saved')) : t('campaign.notSaved')}</span>
      </span>
      <button className="ab-btn" title={t('panels.menu')} onClick={(e) => setPanelsMenu(panelsMenu ? null : e.currentTarget.getBoundingClientRect())}><Icon name="list" /><span>{t('panels.menu')}</span></button>
      {panelsMenu && <PanelsMenu anchor={panelsMenu} onClose={() => setPanelsMenu(null)} />}
      <div className="ab-right">
        <button className={`pill ${!tableOpen ? 'off' : blackout ? 'black' : ''}`} onClick={(e) => setMenu(menu ? null : e.currentTarget.getBoundingClientRect())}>
          <span className="dot" />
          {tableOpen ? `${monitor?.name ?? t('table.monitor')} · ${rotation}°${blackout ? ` · ${t('tool.blackout')}` : ''}` : t('status.tableOff')}
        </button>
        <select className="compact-select" aria-label={t('app.theme')} value={skin} onChange={(e) => setSkin(e.target.value as Skin)}>
          <option value="dark">{t('app.theme')}: {t('theme.dark')}</option>
          <option value="light">{t('app.theme')}: {t('theme.light')}</option>
          <option value="parchment">{t('app.theme')}: {t('theme.parchment')}</option>
        </select>
        <select className="compact-select" aria-label={t('app.language')} value={locale} onChange={(e) => setLocale(e.target.value as Locale)}>
          {LOCALES.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}
        </select>
      </div>
      {menu && <MonitorMenu anchor={menu} onClose={() => setMenu(null)} />}
    </header>
  );
}

function Ribbon() {
  const { t } = useI18n();
  const ws = useStore((s) => s.ws);
  const tool = useStore((s) => s.tool);
  const flags = useStore((s) => ({ snap: s.snap, viewAsPlayer: s.viewAsPlayer, moveLock: s.moveLock, blackout: s.scene.table.blackout, grid: s.scene.map.grid.type, fogMode: s.fogMode, dmFogHidden: s.dmFogHidden }));
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
    if (b.id.startsWith('grid:')) return b.id.slice(5) === flags.grid;
    if (b.id === 'fogmode:reveal') return flags.fogMode === 'reveal';
    if (b.id === 'fogmode:hide') return flags.fogMode === 'hide';
    if (b.id === 'fog:dmHide') return flags.dmFogHidden;
    return false;
  };

  const run = (b: RibbonButton, el: HTMLElement) => {
    if (b.tool) return setTool(b.tool);
    switch (b.id) {
      case 'toggle:snap': return toggle('snap');
      case 'toggle:viewAsPlayer': return toggle('viewAsPlayer');
      case 'toggle:moveLock': return toggle('moveLock');
      case 'toggle:blackout': return toggleBlackout();
      case 'grid:square': return setGridType('square');
      case 'grid:hex-pointy': return setGridType('hex-pointy');
      case 'grid:hex-flat': return setGridType('hex-flat');
      case 'fit': return mapCommands.fit();
      case 'fog:hideAll': return fogAll(false);
      case 'fog:dmHide': return toggleDmFog();
      case 'fogmode:reveal': return setFogMode('reveal');
      case 'fogmode:hide': return setFogMode('hide');
      case 'panel:fog': return focusPanel('fog');
      case 'panel:sound': return focusPanel('sound');
      case 'audio:stop': return stopAll();
      case 'fog:revealAll': return fogAll(true);
      case 'walls:undo': return removeLastUserWall();
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
      case 'creature:newPc': {
        const tpl = structuredClone(SAMPLE_CREATURES[b.id === 'creature:newPc' ? 0 : 2]);
        tpl.name = b.id === 'creature:newPc' ? 'New Character' : 'New Creature';
        state.creatures.push(tpl);
        state.selectedCreatureIdx = state.creatures.length - 1;
        return emit();
      }
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
    </section>
  );
}

/** Shows a panel: activates it, or brings a closed one back where it belongs by default. */
export function focusPanel(id: PanelId): void {
  const api = dockApi;
  if (!api) return;
  const p = api.getPanel(id);
  if (p) {
    p.api.setActive();
    return;
  }
  const l = WORKSPACES[state.ws].layout;
  const title = translate(currentLocale(), PANEL_TITLES[id]);
  const side: 'left' | 'right' | 'below' | null = l.left.includes(id) ? 'left' : l.right.includes(id) ? 'right' : l.bottom.includes(id) ? 'below' : null;
  const sameSide = side ? (side === 'left' ? l.left : side === 'right' ? l.right : l.bottom).find((x) => x !== id && api.getPanel(x)) : undefined;
  const center = api.getPanel(l.center);
  if (sameSide) {
    api.addPanel({ id, component: id, title, position: { referencePanel: sameSide, direction: side === 'below' ? 'within' : 'below' } });
  } else if (side && center && id !== l.center) {
    api.addPanel({ id, component: id, title, position: { referencePanel: center, direction: side }, ...(side === 'below' ? { initialHeight: 200 } : { initialWidth: 300 }) });
  } else if (id === l.center && api.panels.length > 0) {
    api.addPanel({ id, component: id, title, position: { referencePanel: api.panels[0], direction: 'right' } });
  } else {
    api.addPanel({ id, component: id, title, floating: { width: 340, height: 460 } });
  }
}

function currentLocale(): 'en' | 'de' {
  return document.documentElement.lang === 'de' ? 'de' : 'en';
}

/** Rebuilds the workspace's default layout (all panels back in place). */
function resetLayout(): void {
  try { localStorage.removeItem(`dc.layout.v${LAYOUT_VERSION}.${state.ws}`); } catch { /* ignore */ }
  layoutResets++;
  emit();
}
let layoutResets = 0;

/** Menu "Fenster": every panel of the workspace with a check mark; closed ones open again. */
function PanelsMenu({ anchor, onClose }: { anchor: DOMRect; onClose: () => void }) {
  const { t } = useI18n();
  const ws = useStore((s) => s.ws);
  const l = WORKSPACES[ws].layout;
  const mine = [l.center, ...l.left, ...l.right, ...l.bottom, ...(l.floating ?? []).map((f) => f.id)];
  const others = (Object.keys(PANEL_TITLES) as PanelId[]).filter((id) => !mine.includes(id));
  const open = new Set(dockApi?.panels.map((p) => p.id) ?? []);
  useEffect(() => {
    const close = (e: MouseEvent) => { if (!(e.target as HTMLElement).closest('.menu')) onClose(); };
    const id = setTimeout(() => document.addEventListener('click', close), 0);
    return () => { clearTimeout(id); document.removeEventListener('click', close); };
  }, [onClose]);
  const item = (id: PanelId) => (
    <button key={id} className={open.has(id) ? 'on' : ''} onClick={() => { focusPanel(id); onClose(); }}>
      <Icon name={open.has(id) ? 'eye' : 'eyeoff'} /><span>{t(PANEL_TITLES[id])}</span>
    </button>
  );
  return (
    <div className="menu" style={{ left: Math.max(8, anchor.left), top: anchor.bottom + 4 }}>
      <div className="mh">{t('panels.workspace')}</div>
      {mine.map(item)}
      <div className="mh">{t('panels.more')}</div>
      {others.map(item)}
      <div className="mh" />
      <button onClick={() => { resetLayout(); onClose(); }}><Icon name="undo" /><span>{t('panels.reset')}</span></button>
    </div>
  );
}

const collapsedGroups = new Map<string, number>();
const COLLAPSED_HEIGHT = 30;

/** Header buttons on every panel group: collapse, float ↔ dock, like Fusion's palettes. */
function HeaderActions(props: IDockviewHeaderActionsProps) {
  const { t } = useI18n();
  const floating = props.api.location.type === 'floating';
  const [collapsed, setCollapsed] = useState(collapsedGroups.has(props.group.id));
  const toggleCollapse = () => {
    const prev = collapsedGroups.get(props.group.id);
    if (prev !== undefined) {
      collapsedGroups.delete(props.group.id);
      props.api.setConstraints({ minimumHeight: 100, maximumHeight: Number.MAX_SAFE_INTEGER });
      props.api.setSize({ height: prev });
      setCollapsed(false);
    } else {
      collapsedGroups.set(props.group.id, Math.max(120, props.group.height));
      // dockview keeps groups at least 100 px high; a collapsed group is just its tab bar.
      props.api.setConstraints({ minimumHeight: COLLAPSED_HEIGHT, maximumHeight: COLLAPSED_HEIGHT });
      props.api.setSize({ height: COLLAPSED_HEIGHT });
      setCollapsed(true);
    }
  };
  return (
    <div style={{ display: 'flex', alignItems: 'center', height: '100%', paddingRight: 4 }}>
      <button className="ab-btn" title={collapsed ? t('panels.expand') : t('panels.collapse')} aria-label={collapsed ? t('panels.expand') : t('panels.collapse')} onClick={toggleCollapse}>
        <span style={{ display: 'inline-flex', transform: collapsed ? 'rotate(-90deg)' : undefined }}><Icon name="chev" /></span>
      </button>
      <button
        className="ab-btn"
        title={floating ? t('panels.dockHint') : t('panels.floatHint')}
        aria-label={floating ? t('panels.dock') : t('panels.float')}
        onClick={() => {
          if (floating) props.api.moveTo({ position: 'right' });
          else props.containerApi.addFloatingGroup(props.group, { width: 360, height: 300 });
        }}
      >
        <Icon name={floating ? 'dock' : 'float'} />
      </button>
      {props.panels.some((p) => p.id === 'preview') && (
        <button className="ab-btn" title={t('tool.moveMonitor')} onClick={() => focusPanel('table')}><Icon name="monmove" /></button>
      )}
    </div>
  );
}

function DockArea({ ws }: { ws: keyof typeof WORKSPACES }) {
  const { t, locale } = useI18n();
  const key = `dc.layout.v${LAYOUT_VERSION}.${ws}`;
  useStore(() => layoutResets);
  const resets = layoutResets;

  const onReady = (e: DockviewReadyEvent) => {
    dockApi = e.api;
    let restored = false;
    try {
      const saved = localStorage.getItem(key);
      if (saved) {
        e.api.fromJSON(JSON.parse(saved));
        restored = true;
      }
    } catch {
      restored = false;
    }
    if (!restored) buildDefault(e.api, ws, (id) => t(PANEL_TITLES[id]));
    e.api.onDidLayoutChange(() => {
      try { localStorage.setItem(key, JSON.stringify(e.api.toJSON())); } catch { /* ignore */ }
    });
  };

  // Retitle panels when the language changes.
  useEffect(() => {
    dockApi?.panels.forEach((p) => p.api.setTitle(t(PANEL_TITLES[p.id as PanelId] ?? 'panel.map')));
  }, [locale, t]);

  return <DockviewReact key={resets} className="dockview-theme-dc" components={COMPONENTS} onReady={onReady} rightHeaderActionsComponent={HeaderActions} />;
}

function buildDefault(api: DockviewApi, ws: keyof typeof WORKSPACES, title: (id: PanelId) => string): void {
  const l = WORKSPACES[ws].layout;
  api.addPanel({ id: l.center, component: l.center, title: title(l.center) });
  const side = (ids: PanelId[], direction: 'left' | 'right' | 'below', size: number) => {
    let first: string | null = null;
    for (const id of ids) {
      if (!first) {
        api.addPanel({
          id, component: id, title: title(id),
          position: { referencePanel: l.center, direction },
          ...(direction === 'below' ? { initialHeight: size } : { initialWidth: size }),
        });
        first = id;
      } else {
        api.addPanel({ id, component: id, title: title(id), position: { referencePanel: first, direction: direction === 'below' ? 'within' : 'below' } });
      }
    }
  };
  side(l.bottom, 'below', 200);
  side(l.left, 'left', 270);
  side(l.right, 'right', 320);
  const rect = api.width;
  for (const f of l.floating ?? []) {
    api.addPanel({ id: f.id, component: f.id, title: title(f.id), floating: { x: Math.max(20, rect - 320 - f.width - 40), y: 60, width: f.width, height: f.height } });
  }
  api.getPanel(l.center)?.api.setActive();
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
      <span>{t(`tool.${grid.type === 'square' ? 'gridSquare' : grid.type === 'hex-pointy' ? 'gridHexPointy' : 'gridHexFlat'}`)} · {grid.feetPerCell} ft · <span className="mono">{grid.cellWidth.toFixed(1)} px</span></span>
      <span className="sep" />
      <span>{t('status.explored')} <span className="mono">{explored} %</span></span>
      {ws === 'play' && (<><span className="sep" /><span>{t('init.round', { n: round })}</span></>)}
      <span className="sep" />
      <span className={!tableOpen ? '' : blackout ? 'bad' : 'safe'}>● {!tableOpen ? t('status.tableOff') : blackout ? t('status.tableBlack') : t('status.tableSafe')}</span>
    </footer>
  );
}
