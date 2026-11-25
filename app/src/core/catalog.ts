/**
 * Catalog data of library items (DC-011): tags and free-text values like a map's landscape, with
 * suggestions from what the library already uses. Pure.
 */

/** Longest tag kept; longer input is cut. */
export const TAG_MAX = 40;

function clean(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ').slice(0, TAG_MAX).trim();
}

/**
 * `tags` with the tags typed in `raw` added: split at commas, trimmed, inner spaces collapsed,
 * empty ones dropped; a tag already there (in any case) is not added again. Order is kept.
 */
export function addTags(tags: readonly string[], raw: string): string[] {
  const out = [...tags];
  const seen = new Set(out.map((t) => t.toLowerCase()));
  for (const part of raw.split(',')) {
    const tag = clean(part);
    if (!tag || seen.has(tag.toLowerCase())) continue;
    seen.add(tag.toLowerCase());
    out.push(tag);
  }
  return out;
}

export function removeTag(tags: readonly string[], tag: string): string[] {
  return tags.filter((t) => t !== tag);
}

/**
 * Values the library uses (e.g. every map's tags), most used first, then alphabetically; one
 * spelling per value (the most used). Values in `exclude` (any case) and empty ones are left out;
 * with a `query`, only values containing it (any case).
 */
export function suggestions(values: readonly string[], exclude: readonly string[] = [], query = ''): string[] {
  const skip = new Set(exclude.map((v) => v.toLowerCase()));
  const q = query.trim().toLowerCase();
  const byKey = new Map<string, Map<string, number>>();
  for (const raw of values) {
    const v = clean(raw);
    const key = v.toLowerCase();
    if (!v || skip.has(key) || (q && !key.includes(q))) continue;
    const spellings = byKey.get(key) ?? new Map<string, number>();
    spellings.set(v, (spellings.get(v) ?? 0) + 1);
    byKey.set(key, spellings);
  }
  const ranked = [...byKey.values()].map((spellings) => {
    const [best] = [...spellings].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    const total = [...spellings.values()].reduce((s, n) => s + n, 0);
    return { value: best![0], total };
  });
  return ranked.sort((a, b) => b.total - a.total || a.value.localeCompare(b.value)).map((r) => r.value);
}
