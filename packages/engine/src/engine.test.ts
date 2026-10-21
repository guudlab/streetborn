import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  createRng, deriveSeed, EngineInputError, planMatch, playChance, simulateMatch, type ChanceInput, type MatchSetup,
} from './index.ts';

describe('prng', () => {
  it('produces a fixed sequence for a fixed seed', () => {
    const a = createRng(42);
    const b = createRng(42);
    const seqA = Array.from({ length: 5 }, () => a.nextU32());
    expect(Array.from({ length: 5 }, () => b.nextU32())).toEqual(seqA);
    // Locks the algorithm: changing it would break replays of stored matches.
    expect(seqA).toMatchInlineSnapshot(`
      [
        2581720956,
        1925393290,
        3661312704,
        2876485805,
        750819978,
      ]
    `);
  });

  it('keeps range() inside its bounds', () => {
    const rng = createRng(7);
    for (let i = 0; i < 10_000; i++) {
      const v = rng.range(-5, 5);
      expect(v).toBeGreaterThanOrEqual(-5);
      expect(v).toBeLessThanOrEqual(5);
    }
  });

  it('derives different seeds per chance', () => {
    expect(new Set([0, 1, 2, 3].map((i) => deriveSeed(1, i))).size).toBe(4);
  });
});

const setup: MatchSetup = { seed: 123456789, chances: 6, shooting: 55, passing: 50, opponentGoalkeeping: 50, opponentAttack: 40 };

/** A plausible input for every chance of a plan: shots at a corner, passes to the open side. */
function inputsFor(s: MatchSetup, skip: number[] = []): ChanceInput[] {
  return planMatch(s).moments.flatMap((m, chance): ChanceInput[] => {
    if (skip.includes(chance)) return [];
    if (m.kind === 'pass') return [{ chance, pass: m.openSide! }];
    return [{ chance, shot: { aim: chance % 2 ? -800 : 800, lift: 300 + chance * 100, power: 700 } }];
  });
}

describe('planMatch', () => {
  it('is deterministic and starts with a shot', () => {
    expect(planMatch(setup)).toEqual(planMatch(setup));
    for (let seed = 0; seed < 200; seed++) {
      const plan = planMatch({ ...setup, seed });
      expect(plan.moments[0]!.kind).toBe('shot');
      expect(plan.moments).toHaveLength(setup.chances);
      const minutes = plan.moments.map((m) => m.minute);
      expect([...minutes].sort((a, b) => a - b)).toEqual(minutes);
      expect(minutes.every((m) => m >= 1 && m <= 89)).toBe(true);
      expect(plan.opponentGoals.length).toBeLessThanOrEqual(3);
      for (const m of plan.moments) expect(m.kind === 'pass' ? ['left', 'right'] : [undefined]).toContain(m.openSide);
    }
  });

  it('gives every kind of moment over many seeds', () => {
    const kinds = new Set<string>();
    for (let seed = 0; seed < 100; seed++) for (const m of planMatch({ ...setup, seed }).moments) kinds.add(m.kind);
    expect([...kinds].sort()).toEqual(['freekick', 'pass', 'shot']);
  });

  it('lets stronger opponents score more', () => {
    const total = (opponentAttack: number) => {
      let n = 0;
      for (let seed = 0; seed < 2000; seed++) n += planMatch({ ...setup, seed, opponentAttack }).opponentGoals.length;
      return n;
    };
    expect(total(90)).toBeGreaterThan(total(10));
  });
});

describe('simulateMatch', () => {
  const inputs = inputsFor(setup);

  it('is deterministic for the same seed and inputs', () => {
    expect(simulateMatch(setup, inputs)).toEqual(simulateMatch(setup, inputs));
  });

  it('does not depend on input order', () => {
    expect(simulateMatch(setup, [...inputs].reverse())).toEqual(simulateMatch(setup, inputs));
  });

  it('keeps the counts consistent', () => {
    for (let seed = 0; seed < 500; seed++) {
      const s = { ...setup, seed };
      const r = simulateMatch(s, inputsFor(s, [seed % 6]));
      expect(r.goals).toBeLessThanOrEqual(r.shotsOnTarget);
      expect(r.shotsOnTarget).toBeLessThanOrEqual(r.shots);
      expect(r.missed).toBe(r.shots - r.goals);
      expect(r.shots + r.assists + r.lost).toBe(setup.chances - 1);
      expect(r.us).toBe(r.goals + r.assists);
      expect(r.result).toBe(r.us > r.them ? 'W' : r.us === r.them ? 'D' : 'L');
    }
  });

  it('matches playChance for every chance', () => {
    const plan = planMatch(setup);
    const r = simulateMatch(setup, inputs);
    for (const input of inputs) expect(r.outcomes[input.chance]).toEqual(playChance(setup, plan, input));
  });

  it('rewards skill: a strong shooter scores more over many matches', () => {
    const total = (shooting: number) => {
      let goals = 0;
      for (let seed = 0; seed < 2000; seed++) {
        const s = { ...setup, seed, shooting };
        goals += simulateMatch(s, inputsFor(s)).goals;
      }
      return goals;
    };
    expect(total(90)).toBeGreaterThan(total(20));
  });

  it('rewards passing to the open teammate', () => {
    let open = 0, marked = 0;
    for (let seed = 0; seed < 2000; seed++) {
      const s = { ...setup, seed };
      const plan = planMatch(s);
      const chance = plan.moments.findIndex((m) => m.kind === 'pass');
      if (chance < 0) continue;
      const side = plan.moments[chance]!.openSide!;
      if (playChance(s, plan, { chance, pass: side }).outcome === 'assist') open++;
      if (playChance(s, plan, { chance, pass: side === 'left' ? 'right' : 'left' }).outcome === 'assist') marked++;
    }
    expect(open).toBeGreaterThan(marked * 2);
  });

  it('rejects invalid, mismatched or duplicated inputs', () => {
    const plan = planMatch(setup);
    const passAt = plan.moments.findIndex((m) => m.kind === 'pass');
    const shotAt = plan.moments.findIndex((m) => m.kind !== 'pass');
    const shot = { aim: 0, lift: 0, power: 0 };
    expect(() => simulateMatch(setup, [{ chance: 6, shot }])).toThrow(EngineInputError);
    expect(() => simulateMatch(setup, [{ chance: shotAt, shot: { ...shot, aim: 1001 } }])).toThrow(EngineInputError);
    expect(() => simulateMatch(setup, [{ chance: shotAt, pass: 'left' }])).toThrow(EngineInputError);
    if (passAt >= 0) expect(() => simulateMatch(setup, [{ chance: passAt, shot }])).toThrow(EngineInputError);
    expect(() => simulateMatch(setup, [inputs[0]!, inputs[0]!])).toThrow(EngineInputError);
    expect(() => simulateMatch({ ...setup, seed: -1 }, inputs)).toThrow(EngineInputError);
    expect(() => simulateMatch({ ...setup, passing: 0 }, inputs)).toThrow(EngineInputError);
  });
});

describe('purity', () => {
  it('never uses Math.random or Date in engine sources', () => {
    const dir = import.meta.dirname;
    for (const file of readdirSync(dir).filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'))) {
      // Comments may mention the banned APIs; only code is checked.
      const src = readFileSync(join(dir, file), 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
      expect(src, file).not.toMatch(/Math\.random|Date\.now|new Date/);
    }
  });
});
