/**
 * Which panels a workspace offers (DC-120, E-39): a sensible default per workspace that the DM
 * changes in the "Windows" menu. A device setting (local storage of the app, never the root
 * folder), kept per workspace. Panels a workspace does not offer are not in its layout at all.
 */
import { PANEL_TITLES, WORKSPACES, type PanelId } from './workspaces';
import type { WorkspaceId } from './store';

export interface PanelStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** What each workspace offers until the DM chooses: its layout's panels and those that fit its work. */
export const DEFAULT_PANELS: Record<WorkspaceId, PanelId[]> = {
  forge: ['browser', 'assets', 'properties', 'fog', 'log', 'preview', 'table'],
  vault: ['browser', 'asset', 'log'],
  creatures: ['browser', 'dice', 'log', 'party', 'encounter'],
  atlas: ['browser', 'encounter', 'party', 'log'],
  play: ['browser', 'assets', 'fog', 'initiative', 'party', 'mapSound', 'table', 'sound', 'dice', 'log', 'preview', 'properties', 'encounter'],
};

export const panelsKey = (ws: WorkspaceId): string => `dc.panels.${ws}`;

/** Every panel the DM may offer in `ws`: all but its canvas. */
export function choosablePanels(ws: WorkspaceId): PanelId[] {
  return (Object.keys(PANEL_TITLES) as PanelId[]).filter((id) => id !== WORKSPACES[ws].layout.center);
}

/** The panels `ws` offers on this device. */
export function offeredPanels(ws: WorkspaceId, storage: PanelStorage | null): PanelId[] {
  let raw: unknown = null;
  try {
    const text = storage?.getItem(panelsKey(ws));
    raw = text ? JSON.parse(text) : null;
  } catch {
    raw = null;
  }
  if (!Array.isArray(raw)) return [...DEFAULT_PANELS[ws]];
  const choosable = new Set<string>(choosablePanels(ws));
  return raw.filter((id): id is PanelId => typeof id === 'string' && choosable.has(id));
}

/** Offers panel `id` in `ws` or not; `id` null with `on` true: back to the default. */
export function setOffered(ws: WorkspaceId, id: PanelId | null, on: boolean, storage: PanelStorage | null): void {
  try {
    if (id === null) {
      storage?.removeItem(panelsKey(ws));
      return;
    }
    const now = offeredPanels(ws, storage).filter((x) => x !== id);
    storage?.setItem(panelsKey(ws), JSON.stringify(on ? [...now, id] : now));
  } catch {
    // Storage unavailable (blocked): the choice is not kept; the workspace offers what it did.
  }
}

/** What `ws` leaves out of its layout: its canvas and the panels it does not offer. */
export function excludedPanels(ws: WorkspaceId, storage: PanelStorage | null): PanelId[] {
  const offered = new Set(offeredPanels(ws, storage));
  return [WORKSPACES[ws].layout.center, ...choosablePanels(ws).filter((id) => !offered.has(id))];
}
