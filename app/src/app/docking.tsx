/**
 * The app's docking setup: every panel is registered once; each workspace has its own layout
 * (stored as `dc.dock.<workspace>`) whose canvas is the workspace's central panel.
 */
import type { ReactNode } from 'react';
import { MapSoundPanel } from '../panels/SoundPanels';
import { DockManager } from '../dock/manager';
import type { DefaultSpec } from '../dock/persist';
import { translate, type Locale } from '../i18n/i18n';
import { onMonitorsChanged, screenSetup, screenSetupSync } from '../platform/bridge';
import { MapView } from '../panels/MapView';
import {
  BrowserPanel, CreaturePanel, DicePanel, EncounterPanel, FogPanel, InitiativePanel, LogPanel, PreviewPanel, PropertiesPanel, SoonPanel, SoundPanel, TablePanel,
} from '../panels/panels';
import { PartyPanel } from '../panels/PartyPanel';
import { AssetPropertiesPanel, VaultPanel } from '../panels/VaultPanels';
import { AssetPicker } from '../panels/AssetPicker';
import type { WorkspaceId } from './store';
import { PANEL_TITLES, WORKSPACES, type PanelId } from './workspaces';

export const PANEL_CONTENT: Record<PanelId, () => ReactNode> = {
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
  vault: () => <VaultPanel />,
  asset: () => <AssetPropertiesPanel />,
  assets: () => <AssetPicker />,
  sound: () => <SoundPanel />,
  party: () => <PartyPanel />,
  mapSound: () => <MapSoundPanel />,
};

function storage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export const dock = new DockManager<ReactNode>(storage());

// Floating windows are placed on the screens that exist: known before the first layout loads,
// and again whenever a display is plugged in or removed.
dock.setScreens(screenSetupSync());
onMonitorsChanged(() => {
  void screenSetup().then((s) => dock.setScreens(s));
});

const currentLocale = (): Locale => (document.documentElement.lang === 'de' ? 'de' : 'en');

for (const id of Object.keys(PANEL_TITLES) as PanelId[]) {
  dock.registerPanel({ id, title: () => translate(currentLocale(), PANEL_TITLES[id]), create: PANEL_CONTENT[id] });
}

const GROUP_SIZES = { left: 270, right: 320, bottom: 200 };

/**
 * false: the left and right zones run the full height and the bottom zone sits between them.
 * true: the bottom zone runs the full width under them.
 */
export const BOTTOM_SPANS_FULL_WIDTH = false;

export function workspaceDefaults(ws: WorkspaceId): DefaultSpec {
  const l = WORKSPACES[ws].layout;
  return { left: l.left, right: l.right, bottom: l.bottom, floating: l.floating ?? [], sizes: GROUP_SIZES };
}

/** Activates a workspace's layout. Default floating panels start near the main window's top right. */
export function activateWorkspaceLayout(ws: WorkspaceId): void {
  dock.useWorkspace({
    key: `dc.dock.${ws}`,
    defaults: workspaceDefaults(ws),
    exclude: [WORKSPACES[ws].layout.center],
    place: (i, width) => ({
      x: window.screenX + window.outerWidth - GROUP_SIZES.right - width - 40 - 40 * i,
      y: window.screenY + 180 + 40 * i,
    }),
  });
}

/** Shows a panel: brings a closed one back, expands it and its zone. The canvas is always shown. */
export function focusPanel(id: PanelId): void {
  dock.focus(id);
}

/** Layouts of the former dockview-based docking; no longer read. */
export function removeLegacyLayouts(): void {
  const s = storage();
  if (!s) return;
  for (let i = s.length - 1; i >= 0; i--) {
    const k = s.key(i);
    if (k?.startsWith('dc.layout.')) s.removeItem(k);
  }
}
