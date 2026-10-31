import { describe, expect, it } from 'vitest';
import {
  createRng, planMatch, simulateMatch, TIMING_TARGET, type ChanceInput, type MatchSetup, type Moment, type Rng, type Side,
} from '../../engine/src/index.ts';
import { DEFAULT_CONFIG } from './config.ts';
import { computeRating } from './rating.ts';
import { matchReward } from './rewards.ts';

// The live match (engine 4) must pay about what engine 3 paid: same coin formula, and
// win rates and coin per match close to engine 3 for the same player and the same hands.

interface Hands { aim(r: Rng): [number, number]; timing(r: Rng): number; read: number }
const ORTA: Hands = { aim: (r) => [(r.int(2) ? 1 : -1) * r.range(450, 900), r.range(100, 850)], timing: (r) => TIMING_TARGET + r.range(-200, 200), read: 75 };
const other = (s: Side): Side => (s === 'left' ? 'right' : 'left');

function input(m: Moment, chance: number, h: Hands, r: Rng): ChanceInput | null {
  const read = r.int(100) < h.read;
  if (m.kind === 'halftime') return null;
  if (m.kind === 'pass') return { chance, pass: read ? m.openSide! : other(m.openSide!), timing: h.timing(r) };
  if (m.kind === 'defense') return { chance, defense: read ? m.attackSide! : other(m.attackSide!), timing: h.timing(r) };
  if (m.kind === 'decision' && (read ? m.best : m.best === 'shot' ? 'pass' : 'shot') === 'pass') {
    return { chance, pass: read ? m.openSide! : other(m.openSide!), timing: h.timing(r) };
  }
  const [aim, lift] = h.aim(r);
  return { chance, shot: { aim, lift, power: h.timing(r) } };
}

function average(engineVersion: 3 | 4) {
  let coin = 0, wins = 0;
  const n = 1500;
  for (let seed = 1; seed <= n; seed++) {
    const s: MatchSetup = {
      engineVersion, seed, chances: DEFAULT_CONFIG.matchChances, shooting: 55, passing: 55, opponentGoalkeeping: 51, opponentAttack: 46,
      ...(engineVersion === 4 ? { pace: 50, role: (['bitirici', 'oyunKurucu', 'kanat'] as const)[seed % 3] } : {}),
    };
    const r = createRng(seed * 7 + 3);
    const inputs: ChanceInput[] = [];
    for (let k = 0; ; k++) {
      const m = planMatch(s, inputs).moments[k];
      if (!m) break;
      const i = input(m, k, ORTA, r);
      if (i) inputs.push(i);
    }
    const res = simulateMatch(s, inputs);
    coin += matchReward({ ...res, rating: computeRating(res) }, false, 0, DEFAULT_CONFIG).coin;
    if (res.result === 'W') wins++;
  }
  return { coin: coin / n, wins: (wins / n) * 100 };
}

describe('live match economy', () => {
  it('pays about what engine 3 paid', () => {
    const v3 = average(3), v4 = average(4);
    expect(Math.abs(v4.coin - v3.coin) / v3.coin).toBeLessThan(0.08);
    expect(Math.abs(v4.wins - v3.wins)).toBeLessThan(10);
  });

  it('rates the right call in a decision moment', () => {
    const base = { goals: 0, assists: 0, missed: 0, lost: 0, result: 'D' as const };
    expect(computeRating({ ...base, smartChoices: 2 }) - computeRating(base)).toBe(4);
  });
});
