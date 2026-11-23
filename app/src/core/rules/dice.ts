/**
 * Dice expressions: "1d20+5", "2d6 + 1d4 - 1", "4d6kh3", "2d20kl1".
 * The German "W" (Würfel) is accepted as well: "1W20+5".
 */

export type Rng = () => number;

export interface DieTerm {
  kind: 'dice';
  sign: 1 | -1;
  count: number;
  sides: number;
  keep?: { mode: 'high' | 'low'; n: number };
}

export interface ConstTerm {
  kind: 'const';
  sign: 1 | -1;
  value: number;
}

export type Term = DieTerm | ConstTerm;

export interface RollResult {
  expression: string;
  total: number;
  terms: { term: Term; rolls: number[]; kept: number[]; subtotal: number }[];
  /** Natural result when the expression is a single d20 (after keep), for crit display. */
  natural20?: number;
}

const MAX_DICE = 200;
const MAX_SIDES = 1000;

export function parseDice(expr: string): Term[] {
  const src = expr.replace(/\s+/g, '').toLowerCase().replace(/w/g, 'd');
  if (!src) throw new Error('Empty dice expression');
  const re = /([+-]?)(?:(\d*)d(\d+)(?:k([hl])(\d+))?|(\d+))/gy;
  const terms: Term[] = [];
  let pos = 0;
  while (pos < src.length) {
    re.lastIndex = pos;
    const m = re.exec(src);
    if (!m || m[0] === '' || (terms.length > 0 && m[1] === '')) throw new Error(`Invalid dice expression: ${expr}`);
    const sign = m[1] === '-' ? -1 : 1;
    if (m[6] !== undefined) {
      terms.push({ kind: 'const', sign, value: Number(m[6]) });
    } else {
      const count = m[2] === '' ? 1 : Number(m[2]);
      const sides = Number(m[3]);
      if (count < 1 || count > MAX_DICE) throw new Error(`Dice count must be 1–${MAX_DICE}`);
      if (sides < 2 || sides > MAX_SIDES) throw new Error(`Die sides must be 2–${MAX_SIDES}`);
      const t: DieTerm = { kind: 'dice', sign, count, sides };
      if (m[4]) {
        const n = Number(m[5]);
        if (n < 1 || n > count) throw new Error('Keep count out of range');
        t.keep = { mode: m[4] === 'h' ? 'high' : 'low', n };
      }
      terms.push(t);
    }
    pos = re.lastIndex;
  }
  return terms;
}

export function rollDice(expr: string, rng: Rng = Math.random): RollResult {
  const terms = parseDice(expr);
  const out: RollResult = { expression: expr, total: 0, terms: [] };
  for (const term of terms) {
    if (term.kind === 'const') {
      const subtotal = term.sign * term.value;
      out.terms.push({ term, rolls: [], kept: [], subtotal });
      out.total += subtotal;
      continue;
    }
    const rolls = Array.from({ length: term.count }, () => 1 + Math.floor(rng() * term.sides));
    let kept = rolls;
    if (term.keep) {
      const sorted = [...rolls].sort((a, b) => (term.keep!.mode === 'high' ? b - a : a - b));
      kept = sorted.slice(0, term.keep.n);
    }
    const subtotal = term.sign * kept.reduce((a, b) => a + b, 0);
    out.terms.push({ term, rolls, kept, subtotal });
    out.total += subtotal;
  }
  const dice = out.terms.filter((t) => t.term.kind === 'dice');
  if (dice.length === 1 && (dice[0].term as DieTerm).sides === 20 && dice[0].kept.length === 1) {
    out.natural20 = dice[0].kept[0];
  }
  return out;
}

/** d20 test with Advantage/Disadvantage (2024: they cancel each other out). */
export function d20Test(modifier: number, opts: { advantage?: boolean; disadvantage?: boolean } = {}, rng: Rng = Math.random) {
  const adv = !!opts.advantage && !opts.disadvantage;
  const dis = !!opts.disadvantage && !opts.advantage;
  const a = 1 + Math.floor(rng() * 20);
  const b = adv || dis ? 1 + Math.floor(rng() * 20) : a;
  const natural = adv ? Math.max(a, b) : dis ? Math.min(a, b) : a;
  return { rolls: adv || dis ? [a, b] : [a], natural, total: natural + modifier };
}
