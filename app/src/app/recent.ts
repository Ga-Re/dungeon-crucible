/**
 * Recently used campaigns for the start screen, newest first. Stored per installation (not in a
 * campaign), so a moved or deleted folder just shows as missing.
 */
export interface RecentCampaign {
  root: string;
  name: string;
  /** Last opened (ms since epoch). */
  openedAt: number;
}

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export const RECENT_KEY = 'dc.recentCampaigns';
/** Former single entry (before the start screen). */
const LEGACY_KEY = 'dc.lastCampaign';
export const MAX_RECENT = 12;

/** Adds or moves a campaign to the top. */
export function addRecent(list: readonly RecentCampaign[], entry: RecentCampaign): RecentCampaign[] {
  return [entry, ...list.filter((r) => r.root !== entry.root)].slice(0, MAX_RECENT);
}

export function removeRecent(list: readonly RecentCampaign[], root: string): RecentCampaign[] {
  return list.filter((r) => r.root !== root);
}

function valid(x: unknown): x is RecentCampaign {
  if (typeof x !== 'object' || x === null) return false;
  const r = x as Record<string, unknown>;
  return typeof r['root'] === 'string' && r['root'] !== '' && typeof r['name'] === 'string' && typeof r['openedAt'] === 'number';
}

export function loadRecent(storage: StorageLike | null): RecentCampaign[] {
  if (!storage) return [];
  try {
    const raw = storage.getItem(RECENT_KEY);
    if (raw) {
      const parsed: unknown = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.filter(valid).slice(0, MAX_RECENT) : [];
    }
    // First start with the start screen: take over the last campaign.
    const last = storage.getItem(LEGACY_KEY);
    if (last) return [{ root: last, name: last.split(/[\\/]/).filter(Boolean).pop() ?? last, openedAt: 0 }];
  } catch {
    /* unreadable: start empty */
  }
  return [];
}

export function saveRecent(storage: StorageLike | null, list: readonly RecentCampaign[]): void {
  try {
    storage?.setItem(RECENT_KEY, JSON.stringify(list));
  } catch {
    /* storage full or unavailable */
  }
}
