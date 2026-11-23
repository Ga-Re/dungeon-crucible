// How tokens look until the creature library brings pictures (T-107a, DM decision 2026-11-21):
// a coloured disc with the token's initials and a ring. Pure helpers, so they are tested without
// a GPU.

/**
 * Fill colours of placeholder tokens: muted, distinct, each with white initials readable on it
 * (contrast ≥ 4.5:1). Drawn over the map, so independent of the DM window's theme.
 */
export const TOKEN_COLORS = [
  "#7a3b3b",
  "#3b5a7a",
  "#3f6b46",
  "#6b4f2a",
  "#5b3f7a",
  "#2f6a6a",
  "#7a3b62",
  "#4a4f5a",
] as const;

/** The ring around a token. */
export const TOKEN_RING = "#e8d3a3";

/** The ring around a selected token in the DM window (T-107b): the accent, bright on any map. */
export const TOKEN_SELECTED_RING = "#ffb627";

/** The ring of the token whose turn it is (T-111c), on the TV and in the DM window. */
export const TOKEN_ACTIVE_RING = "#fff2a8";

/** How long a moved token glides to its new place, in milliseconds (T-233b). */
export const TOKEN_GLIDE_MS = 250;

/** How opaque the DM window draws a token hidden from the players (T-107b). */
export const TOKEN_HIDDEN_ALPHA = 0.45;

/**
 * The resolution token labels are rasterised at for a camera `zoom` on an output of
 * `outputResolution` (T-107b): the next power of two at or above their product, from 1 to 8, so
 * initials stay sharp when zoomed in and are re-rasterised only on a doubling, not every step.
 */
export function labelResolution(
  zoom: number,
  outputResolution: number,
): number {
  const wanted = Math.max(1, zoom * outputResolution);
  return Math.min(8, 2 ** Math.ceil(Math.log2(wanted)));
}

/** A colour for `id`, the same on every device and every start (a small string hash). */
export function tokenColor(id: string): string {
  let hash = 0;
  for (const char of id) hash = (hash * 31 + (char.codePointAt(0) ?? 0)) >>> 0;
  return TOKEN_COLORS[hash % TOKEN_COLORS.length] ?? TOKEN_COLORS[0];
}

/**
 * The initials shown on a token: the first letter of its first two words, a number kept whole
 * ("Goblin 12" → "G12"); `""` without a name (the players may not see it).
 */
export function tokenInitials(name: string | undefined): string {
  const words = (name ?? "").trim().split(/\s+/).filter(Boolean);
  const [first, second] = words;
  if (!first) return "";
  const head = firstLetter(first);
  if (!second) return head;
  return /^\d+$/.test(second)
    ? `${head}${second}`
    : `${head}${firstLetter(second)}`;
}

/** The first letter as the reader sees it (umlauts, accents, emoji kept whole), upper case. */
function firstLetter(word: string): string {
  const [first] = new Intl.Segmenter().segment(word);
  return first?.segment.toUpperCase() ?? "";
}
