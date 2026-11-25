/**
 * The campaign's players and their characters (decision E-1, DC-096).
 *
 * Player characters are creatures in the global library (role `pc`); a campaign lists its players
 * and links each to a character by the creature's id. Players who are not present stay in the
 * list but are not placed.
 *
 * Pure: ids and randomness are injected.
 */
import type { Point } from './geometry';
import type { Token } from './scene';
import type { Creature, Player } from './sidecar';

const SIZE_CELLS: Record<Creature['size'], number> = { tiny: 1, small: 1, medium: 1, large: 2, huge: 3, gargantuan: 4 };

function initialsOf(name: string): string {
  const parts = name.split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? '?') + (parts[1]?.[0] ?? parts[0]?.[1] ?? '')).toUpperCase();
}

/**
 * A new token of a library creature at `at`. `same` is how many tokens of this creature the scene
 * already has: monsters get a number ("Ghoul 2", "G2"), player characters keep their name.
 * Initiative is rolled: d20 + Dex modifier.
 */
export function tokenFromCreature(c: Creature, id: string, at: Point, same: number, random: () => number = Math.random): Token {
  const base = initialsOf(c.name);
  const numbered = same > 0 && c.role !== 'pc';
  const dex = Math.floor((c.abilities.dex - 10) / 2);
  return {
    id,
    name: numbered ? `${c.name} ${same + 1}` : c.name,
    label: (numbered ? `${base.slice(0, 1)}${same + 1}` : base).slice(0, 4),
    kind: c.role === 'pc' ? 'pc' : c.role === 'npc' ? 'npc' : 'monster',
    x: at.x,
    y: at.y,
    size: SIZE_CELLS[c.size] ?? 1,
    ringColor: c.token.ringColor,
    visionFt: c.senses.darkvision,
    lightFt: c.token.lightFt || undefined,
    hp: c.hp,
    maxHp: c.hp,
    ac: c.ac,
    initiative: 1 + Math.floor(random() * 20) + dex,
    conditions: [],
    creatureId: c.id,
  };
}

/** The characters of the players present, in list order (unlinked or missing ones left out). */
export function presentCharacters(players: readonly Player[], creatures: readonly Creature[]): Creature[] {
  const out: Creature[] = [];
  for (const p of players) {
    if (!p.present || !p.characterId) continue;
    const c = creatures.find((x) => x.id === p.characterId);
    if (c && !out.includes(c)) out.push(c);
  }
  return out;
}

/** `n` places in a row of cells centred on `at`. */
function row(n: number, at: Point, cell: number): Point[] {
  return Array.from({ length: n }, (_, i) => ({ x: at.x + (i - (n - 1) / 2) * cell, y: at.y }));
}

export interface PartyOptions {
  /** Centre of the row the characters stand in (map pixels). */
  at: Point;
  /** Width of a grid cell in map pixels. */
  cell: number;
  newId: (prefix: string) => string;
  random?: () => number;
}

/**
 * "Place party": tokens for the present players' characters that `scene` does not have yet.
 */
export function missingPartyTokens(players: readonly Player[], creatures: readonly Creature[], scene: readonly Token[], o: PartyOptions): Token[] {
  const missing = presentCharacters(players, creatures).filter((c) => !scene.some((t) => t.creatureId === c.id));
  const places = row(missing.length, o.at, o.cell);
  return missing.map((c, i) => tokenFromCreature(c, o.newId(c.id), places[i]!, 0, o.random));
}

/**
 * The party of a new scene: each present character in a row at `at`. A character that stands in
 * the scene played before comes with its hit points and conditions; the others are new.
 */
export function partyForNewScene(players: readonly Player[], creatures: readonly Creature[], before: readonly Token[], o: PartyOptions): Token[] {
  const chars = presentCharacters(players, creatures);
  const places = row(chars.length, o.at, o.cell);
  return chars.map((c, i) => {
    const prev = before.find((t) => t.creatureId === c.id);
    const p = places[i]!;
    return prev ? { ...structuredClone(prev), x: p.x, y: p.y } : tokenFromCreature(c, o.newId(c.id), p, 0, o.random);
  });
}

/** The player whose character a token is, if any. */
export function playerOfToken(players: readonly Player[], token: Pick<Token, 'creatureId' | 'kind'>): Player | undefined {
  if (token.kind !== 'pc' || !token.creatureId) return undefined;
  return players.find((p) => p.characterId === token.creatureId);
}
