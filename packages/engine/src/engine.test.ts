import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createRng, deriveSeed, EngineInputError, simulateMatch, type ChanceInput, type MatchSetup } from './index.ts';

const setup: MatchSetup = { seed: 123456789, chances: 6, shooting: 55, opponentGoalkeeping: 50 };
const inputs: ChanceInput[] = [
  { chance: 0, shot: { aim: 800, lift: 300, power: 700 } },
  { chance: 2, shot: { aim: -600, lift: 900, power: 900 } },
  { chance: 3, shot: { aim: 0, lift: 100, power: 500 } },
  { chance: 5, shot: { aim: 950, lift: 950, power: 1000 } },
];

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

describe('simulateMatch', () => {
  it('is deterministic for the same seed and inputs', () => {
    expect(simulateMatch(setup, inputs)).toEqual(simulateMatch(setup, inputs));
  });

  it('does not depend on input order', () => {
    expect(simulateMatch(setup, [...inputs].reverse())).toEqual(simulateMatch(setup, inputs));
  });

  it('keeps goals <= shots on target <= shots', () => {
    for (let seed = 0; seed < 500; seed++) {
      const r = simulateMatch({ ...setup, seed }, inputs);
      expect(r.goals).toBeLessThanOrEqual(r.shotsOnTarget);
      expect(r.shotsOnTarget).toBeLessThanOrEqual(r.shots);
      expect(r.shots).toBe(inputs.length);
    }
  });

  it('rewards skill: a strong shooter scores more over many matches', () => {
    const total = (shooting: number) => {
      let goals = 0;
      for (let seed = 0; seed < 2000; seed++) goals += simulateMatch({ ...setup, seed, shooting }, inputs).goals;
      return goals;
    };
    expect(total(90)).toBeGreaterThan(total(20));
  });

  it('rejects invalid or duplicated inputs', () => {
    expect(() => simulateMatch(setup, [{ chance: 6, shot: { aim: 0, lift: 0, power: 0 } }])).toThrow(EngineInputError);
    expect(() => simulateMatch(setup, [{ chance: 0, shot: { aim: 1001, lift: 0, power: 0 } }])).toThrow(EngineInputError);
    expect(() => simulateMatch(setup, [inputs[0]!, inputs[0]!])).toThrow(EngineInputError);
    expect(() => simulateMatch({ ...setup, seed: -1 }, inputs)).toThrow(EngineInputError);
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
