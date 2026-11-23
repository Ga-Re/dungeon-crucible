/**
 * D&D 5e (2024 rules, SRD 5.2) helpers: modifiers, proficiency, saving throws,
 * challenge rating XP and the 2024 encounter XP budget.
 */

export const ABILITIES = ['str', 'dex', 'con', 'int', 'wis', 'cha'] as const;
export type Ability = (typeof ABILITIES)[number];
export type AbilityScores = Record<Ability, number>;

export function abilityModifier(score: number): number {
  return Math.floor((score - 10) / 2);
}

/** Character proficiency bonus by level (1–20). */
export function proficiencyBonusForLevel(level: number): number {
  if (!Number.isInteger(level) || level < 1 || level > 20) throw new Error('Level must be 1–20');
  return 2 + Math.floor((level - 1) / 4);
}

/** Challenge ratings as written in stat blocks. */
export const CHALLENGE_RATINGS = [
  '0', '1/8', '1/4', '1/2', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12', '13', '14', '15',
  '16', '17', '18', '19', '20', '21', '22', '23', '24', '25', '26', '27', '28', '29', '30',
] as const;
export type ChallengeRating = (typeof CHALLENGE_RATINGS)[number];

const CR_XP: Record<ChallengeRating, number> = {
  '0': 10, '1/8': 25, '1/4': 50, '1/2': 100, '1': 200, '2': 450, '3': 700, '4': 1100, '5': 1800,
  '6': 2300, '7': 2900, '8': 3900, '9': 5000, '10': 5900, '11': 7200, '12': 8400, '13': 10000,
  '14': 11500, '15': 13000, '16': 15000, '17': 18000, '18': 20000, '19': 22000, '20': 25000,
  '21': 33000, '22': 41000, '23': 50000, '24': 62000, '25': 75000, '26': 90000, '27': 105000,
  '28': 120000, '29': 135000, '30': 155000,
};

export function xpForCr(cr: ChallengeRating): number {
  return CR_XP[cr];
}

export function crToNumber(cr: ChallengeRating): number {
  if (cr.includes('/')) {
    const [a, b] = cr.split('/').map(Number);
    return a / b;
  }
  return Number(cr);
}

/** Monster proficiency bonus by CR. */
export function proficiencyBonusForCr(cr: ChallengeRating): number {
  const n = crToNumber(cr);
  if (n < 5) return 2;
  return 2 + Math.floor((Math.ceil(n) - 1) / 4);
}

export function savingThrowBonus(score: number, proficient: boolean, pb: number): number {
  return abilityModifier(score) + (proficient ? pb : 0);
}

export type EncounterDifficulty = 'low' | 'moderate' | 'high';

/**
 * XP budget per character by level (2024 Dungeon Master's Guide, "Combat
 * Encounter Difficulty"). Index 0 = level 1.
 */
export const XP_BUDGET_2024: readonly { low: number; moderate: number; high: number }[] = [
  { low: 50, moderate: 75, high: 100 },
  { low: 100, moderate: 150, high: 200 },
  { low: 150, moderate: 225, high: 400 },
  { low: 250, moderate: 375, high: 500 },
  { low: 500, moderate: 750, high: 1100 },
  { low: 600, moderate: 1000, high: 1400 },
  { low: 750, moderate: 1300, high: 1700 },
  { low: 1000, moderate: 1700, high: 2100 },
  { low: 1300, moderate: 2000, high: 2600 },
  { low: 1600, moderate: 2300, high: 3100 },
  { low: 1900, moderate: 2900, high: 4100 },
  { low: 2200, moderate: 3700, high: 4700 },
  { low: 2600, moderate: 4200, high: 5400 },
  { low: 2900, moderate: 4900, high: 6200 },
  { low: 3300, moderate: 5400, high: 7800 },
  { low: 3800, moderate: 6100, high: 9800 },
  { low: 4500, moderate: 7200, high: 11700 },
  { low: 5000, moderate: 8700, high: 14200 },
  { low: 5500, moderate: 10700, high: 17200 },
  { low: 6400, moderate: 13200, high: 22000 },
];

export interface EncounterEvaluation {
  monsterXp: number;
  budget: { low: number; moderate: number; high: number };
  /** Highest difficulty whose budget the monsters reach; 'trivial' below Low, 'beyond' above High. */
  rating: 'trivial' | EncounterDifficulty | 'beyond';
}

/** 2024 rules: sum the party's per-character budgets; no group-size multiplier. */
export function evaluateEncounter(partyLevels: readonly number[], monsters: readonly { cr: ChallengeRating; count: number }[]): EncounterEvaluation {
  const budget = { low: 0, moderate: 0, high: 0 };
  for (const lvl of partyLevels) {
    const row = XP_BUDGET_2024[lvl - 1];
    if (!row) throw new Error(`Invalid character level ${lvl}`);
    budget.low += row.low;
    budget.moderate += row.moderate;
    budget.high += row.high;
  }
  const monsterXp = monsters.reduce((s, m) => s + xpForCr(m.cr) * Math.max(0, m.count), 0);
  let rating: EncounterEvaluation['rating'] = 'trivial';
  if (monsterXp > budget.high) rating = 'beyond';
  else if (monsterXp > budget.moderate) rating = 'high';
  else if (monsterXp > budget.low) rating = 'moderate';
  else if (monsterXp > 0 && monsterXp >= budget.low * 0.5) rating = 'low';
  return { monsterXp, budget, rating };
}

/** 2024 conditions. Exhaustion stacks 1–6. */
export const CONDITIONS = [
  'blinded', 'charmed', 'deafened', 'exhaustion', 'frightened', 'grappled', 'incapacitated', 'invisible',
  'paralyzed', 'petrified', 'poisoned', 'prone', 'restrained', 'stunned', 'unconscious',
] as const;
export type Condition = (typeof CONDITIONS)[number];

/** 2024 Exhaustion: −2 per level to D20 Tests, −5 ft Speed per level, death at level 6. */
export function exhaustionEffects(level: number): { d20Penalty: number; speedPenalty: number; dead: boolean } {
  const l = Math.max(0, Math.min(6, Math.floor(level)));
  return { d20Penalty: -2 * l, speedPenalty: -5 * l, dead: l >= 6 };
}
