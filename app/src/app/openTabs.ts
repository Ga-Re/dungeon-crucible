/**
 * The open tabs of a campaign and the scene on the TV (E-30, DC-034), kept per campaign on this
 * device – not in the campaign folder – so they come back when the campaign is opened again.
 */
import type { StorageLike } from './recent';

export interface OpenTabs {
  tabs: { id: string; kind: 'scene' | 'map'; name: string }[];
  /** The tab shown. */
  active: string | null;
  /** The scene on the TV. */
  tv: string | null;
}

const KEY = 'dc.openTabs:';

function tab(x: unknown): x is OpenTabs['tabs'][number] {
  if (typeof x !== 'object' || x === null) return false;
  const t = x as Record<string, unknown>;
  return typeof t['id'] === 'string' && t['id'] !== '' && (t['kind'] === 'scene' || t['kind'] === 'map') && typeof t['name'] === 'string';
}

const text = (x: unknown): string | null => (typeof x === 'string' && x !== '' ? x : null);

/** The tabs kept for `campaign` (its folder), or none: what cannot be read is left out. */
export function loadOpenTabs(storage: StorageLike | null, campaign: string): OpenTabs | null {
  try {
    const raw = storage?.getItem(KEY + campaign);
    if (!raw) return null;
    const v = JSON.parse(raw) as Record<string, unknown>;
    const tabs = Array.isArray(v['tabs']) ? v['tabs'].filter(tab).map((t) => ({ id: t.id, kind: t.kind, name: t.name })) : [];
    if (!tabs.length) return null;
    return { tabs, active: text(v['active']), tv: text(v['tv']) };
  } catch {
    return null;
  }
}

export function saveOpenTabs(storage: StorageLike | null, campaign: string, value: OpenTabs): void {
  try {
    storage?.setItem(KEY + campaign, JSON.stringify(value));
  } catch {
    /* storage full or unavailable: the tabs are just not kept */
  }
}
