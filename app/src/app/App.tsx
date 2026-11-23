import { useEffect, useRef, useState, type FunctionComponent } from 'react';
import { DockviewReact, type DockviewApi, type DockviewReadyEvent, type IDockviewHeaderActionsProps, type IDockviewPanelProps } from 'dockview-react';
import 'dockview-react/dist/styles/dockview.css';
import { useI18n, LOCALES, type Locale } from '../i18n/i18n';
import { Icon } from '../ui/Icon';
import { MapView, mapCommands } from '../panels/MapView';
import {
  BrowserPanel, CreaturePanel, DicePanel, EncounterPanel, FogPanel, InitiativePanel, LogPanel, MonitorMenu, PreviewPanel, PropertiesPanel, SoonPanel, TablePanel,
} from '../panels/panels';
import { PANEL_TITLES, WORKSPACES, WORKSPACE_ORDER, type PanelId, type RibbonButton } from './workspaces';
import {
  clearTemplates, emit, fogAll, log, nextTurn, removeLastUserWall, rotateTable, setGridType, setTool, setWorkspace, state, toggle, toggleBlackout, useStore,
} from './store';
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
    void refreshMonitors();
    log('log.opened');
    emit();
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
  useEffect(() => {
    document.documentElement.dataset.skin = skin;
    try { localStorage.setItem('dc.skin', skin); } catch { /* ignore */ }
  }, [skin]);
  return (
    <header className="appbar">
      <div className="brand"><span className="mark"><Icon name="anvil" /></span>{t('app.name')}</div>
      <button className="ab-btn" title={t('app.save')}><Icon name="save" /></button>
      <button className="ab-btn" title={t('app.undo')}><Icon name="undo" /></button>
      <button className="ab-btn" title={t('app.redo')}><Icon name="redo" /></button>
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
  const flags = useStore((s) => ({ snap: s.snap, viewAsPlayer: s.viewAsPlayer, moveLock: s.moveLock, blackout: s.scene.table.blackout, grid: s.scene.map.grid.type }));
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
      case 'fog:revealAll': return fogAll(true);
      case 'walls:undo': return removeLastUserWall();
      case 'turn:next': return nextTurn();
      case 'templates:clear': return clearTemplates();
      case 'table:open': return void openTable();
      case 'table:rotate': return rotateTable();
      case 'table:move': return setMenu(el.getBoundingClientRect());
      case 'panel:table': return focusPanel('table');
      case 'panel:encounter': return focusPanel('encounter');
      case 'map:import': return fileRef.current?.click();
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

function focusPanel(id: PanelId): void {
  const api = dockApi;
  if (!api) return;
  const p = api.getPanel(id);
  if (p) {
    p.api.setActive();
    return;
  }
  api.addPanel({ id, component: id, title: id, floating: { width: 340, height: 460 } });
}

/** Header buttons on every panel group: float ↔ dock, like Fusion's palettes. */
function HeaderActions(props: IDockviewHeaderActionsProps) {
  const { t } = useI18n();
  const floating = props.api.location.type === 'floating';
  return (
    <div style={{ display: 'flex', alignItems: 'center', height: '100%', paddingRight: 4 }}>
      <button
        className="ab-btn"
        title={floating ? 'Dock' : 'Float'}
        aria-label={floating ? 'Dock' : 'Float'}
        onClick={() => {
          if (floating) props.api.moveTo({ position: 'right' });
          else props.containerApi.addFloatingGroup(props.group, { width: 360, height: 300 });
        }}
      >
        <Icon name={floating ? 'map' : 'box'} />
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

  return <DockviewReact className="dockview-theme-dc" components={COMPONENTS} onReady={onReady} rightHeaderActionsComponent={HeaderActions} />;
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
  const round = useStore((s) => s.round);
  const grid = useStore((s) => s.scene.map.grid);
  const explored = Math.round((fog.exploredCount() / (fog.cols * fog.rows)) * 100);
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
