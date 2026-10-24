import { describe, expect, it } from 'vitest';
import {
  createRng, deriveSeed, ENGINE_VERSION, ENGINE_VERSIONS, gradeTiming, momentCount, planMatch, simulateMatch, TIMING_TARGET,
  type ChanceInput, type MatchSetup, type Side,
} from './index.ts';

const base: MatchSetup = { engineVersion: 3, seed: 1, chances: 3, shooting: 55, passing: 50, opponentGoalkeeping: 50, opponentAttack: 40 };
const other = (side: Side): Side => (side === 'left' ? 'right' : 'left');

/** A fixed player: corner shots with the power at the target, the open teammate, the right slide. */
function steady(s: MatchSetup): ChanceInput[] {
  return planMatch(s).moments.map((m, chance): ChanceInput => {
    if (m.kind === 'pass') return { chance, pass: m.openSide!, timing: TIMING_TARGET };
    if (m.kind === 'defense') return { chance, defense: m.attackSide!, timing: TIMING_TARGET };
    return { chance, shot: { aim: chance % 2 ? -800 : 800, lift: 300 + chance * 100, power: TIMING_TARGET } };
  });
}

describe('engine 3 replay', () => {
  it('still scores stored engine 3 matches exactly as before', () => {
    // Locks engine 3 the way engine.test.ts locks engine 2: a stored match must replay to what it paid.
    const summary = [11, 222, 3333, 44444].map((seed) => {
      const s = { ...base, seed };
      const plan = planMatch(s);
      const r = simulateMatch(s, steady(s));
      return [
        plan.moments.map((m) => `${m.kind}@${m.minute}`).join(','),
        `goals-against@${plan.opponentGoals.join('/')}`,
        r.us, r.them, r.goals, r.assists, r.defenseStops,
        r.outcomes.map((o) => o && o.outcome).join(','),
      ].join(' ');
    });
    expect(summary).toMatchInlineSnapshot(`
      [
        "shot@14,shot@28,defense@44,defense@58,shot@78 goals-against@8 3 2 3 0 1 goal,goal,stopped,conceded,goal",
        "shot@14,defense@25,pass@48,defense@57,shot@82 goals-against@54 2 1 1 1 1 goal,stopped,assist,survived,saved",
        "shot@15,pass@30,defense@48,pass@63,defense@76 goals-against@ 3 0 1 2 2 goal,assist,stopped,assist,stopped",
        "shot@17,shot@29,pass@50,defense@55,defense@73 goals-against@27/34 3 2 2 1 2 goal,goal,assist,stopped,stopped",
      ]
    `)
  });

  it('replays the same inputs to the same result however often it runs', () => {
    const s = { ...base, seed: 987654 };
    const inputs = steady(s);
    const first = simulateMatch(s, inputs);
    for (let i = 0; i < 5; i++) expect(simulateMatch(s, inputs)).toEqual(first);
  });
});

describe('engine versions', () => {
  it('plays new matches with the newest version and can replay every older one', () => {
    expect(ENGINE_VERSIONS).toContain(ENGINE_VERSION);
    expect(Math.max(...ENGINE_VERSIONS)).toBe(ENGINE_VERSION);
    for (const engineVersion of ENGINE_VERSIONS) {
      const s = { ...base, engineVersion };
      expect(planMatch(s).moments.length).toBe(momentCount(s));
    }
  });

  it('treats a ticket without a version as engine 2', () => {
    const { engineVersion: _drop, ...legacy } = base;
    expect(planMatch(legacy)).toEqual(planMatch({ ...base, engineVersion: 2 }));
    expect(momentCount(legacy)).toBe(base.chances);
    expect(momentCount(base)).toBe(base.chances + 2);
  });
});

describe('plans', () => {
  it('come from the seed and the opponent alone, never from the player skills', () => {
    for (const engineVersion of ENGINE_VERSIONS) {
      for (const seed of [5, 50, 500, 5000]) {
        const weak = { ...base, engineVersion, seed, shooting: 1, passing: 1 };
        const strong = { ...base, engineVersion, seed, shooting: 100, passing: 100 };
        expect(planMatch(strong)).toEqual(planMatch(weak));
      }
    }
  });

  it('keeps moments in order inside the 90 minutes and opponent goals ascending', () => {
    for (const engineVersion of ENGINE_VERSIONS) {
      for (let seed = 1; seed <= 200; seed++) {
        const plan = planMatch({ ...base, engineVersion, seed, chances: 6, opponentAttack: 95 });
        const minutes = plan.moments.map((m) => m.minute);
        expect([...minutes].sort((a, b) => a - b)).toEqual(minutes);
        for (const m of minutes) { expect(m).toBeGreaterThanOrEqual(1); expect(m).toBeLessThanOrEqual(90); }
        expect([...plan.opponentGoals].sort((a, b) => a - b)).toEqual(plan.opponentGoals);
        for (const g of plan.opponentGoals) { expect(g).toBeGreaterThanOrEqual(1); expect(g).toBeLessThanOrEqual(90); }
      }
    }
  });

  it('give engine 3 matches both a left and a right side to read', () => {
    const sides = new Set<Side>();
    for (let seed = 1; seed <= 100; seed++) {
      for (const m of planMatch({ ...base, seed }).moments) {
        if (m.attackSide) sides.add(m.attackSide);
        if (m.openSide) sides.add(m.openSide);
      }
    }
    expect([...sides].sort()).toEqual(['left', 'right']);
  });
});

describe('results are whole numbers', () => {
  it('with integer shot positions, so the server and every phone agree', () => {
    for (let seed = 1; seed <= 60; seed++) {
      const s = { ...base, seed, chances: 5 };
      const r = simulateMatch(s, steady(s));
      for (const n of [r.shots, r.shotsOnTarget, r.goals, r.assists, r.missed, r.lost, r.defenseStops, r.us, r.them]) expect(Number.isInteger(n)).toBe(true);
      for (const o of r.outcomes) {
        if (o && (o.kind === 'shot' || o.kind === 'freekick')) { expect(Number.isInteger(o.x)).toBe(true); expect(Number.isInteger(o.y)).toBe(true); }
      }
    }
  });

  it('with a result letter that follows the score', () => {
    for (let seed = 1; seed <= 120; seed++) {
      const s = { ...base, seed, chances: 4 };
      const r = simulateMatch(s, steady(s));
      expect(r.result).toBe(r.us > r.them ? 'W' : r.us < r.them ? 'L' : 'D');
    }
  });

  it('with the player never scoring more than the team', () => {
    for (let seed = 1; seed <= 120; seed++) {
      const s = { ...base, seed, chances: 5 };
      const r = simulateMatch(s, steady(s));
      expect(r.us).toBeGreaterThanOrEqual(r.goals);
      expect(r.us).toBe(r.goals + r.assists);
    }
  });
});

describe('prng and timing edges', () => {
  it('derives stable, well spread seeds', () => {
    expect(deriveSeed(1, 0)).toBe(deriveSeed(1, 0));
    const seeds = new Set<number>();
    for (let seed = 0; seed < 50; seed++) for (let i = 0; i < 20; i++) seeds.add(deriveSeed(seed, i));
    expect(seeds.size).toBe(1000);
    for (const v of seeds) { expect(Number.isInteger(v)).toBe(true); expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThan(2 ** 32); }
  });

  it('accepts seeds beyond 32 bits and negative ones by wrapping them', () => {
    expect(createRng(2 ** 32 + 5).nextU32()).toBe(createRng(5).nextU32());
    expect(createRng(-1).nextU32()).toBe(createRng(2 ** 32 - 1).nextU32());
  });

  it('refuses ranges that are not whole numbers or are empty', () => {
    const r = createRng(1);
    expect(() => r.int(0)).toThrow(RangeError);
    expect(() => r.int(2.5)).toThrow(RangeError);
    expect(() => r.int(-3)).toThrow(RangeError);
    expect(() => r.range(5, 4)).toThrow(RangeError);
    expect(() => r.range(0.5, 3)).toThrow(RangeError);
    expect(r.range(7, 7)).toBe(7);
  });

  it('grades the timing target as the best and the far ends as the worst', () => {
    const best = gradeTiming(TIMING_TARGET);
    const worst = [gradeTiming(0), gradeTiming(1000)];
    expect(best).not.toEqual(worst[0]);
    expect(worst[0]).toEqual(worst[1]);
  });
});
