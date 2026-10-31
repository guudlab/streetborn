import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  createRng, deriveSeed, EngineInputError, gradeTiming, momentCount, planMatch, playChance, simulateMatch, skippedDefense, TIMING_TARGET,
  type ChanceInput, type MatchSetup, type Rng, type Side,
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

describe('engine 2 replay', () => {
  it('still scores stored engine 2 matches exactly as before', () => {
    // Locks engine 2: a stored match must replay to the result it was paid for.
    const summary = [11, 222, 3333, 44444].map((seed) => {
      const s = { ...setup, seed };
      const r = simulateMatch(s, inputsFor(s));
      return [r.goals, r.assists, r.lost, r.us, r.them, r.outcomes.map((o) => o && o.outcome).join(',')].join(' ');
    });
    expect(summary).toMatchInlineSnapshot(`
      [
        "3 1 1 4 0 wide,assist,goal,goal,goal,lost",
        "5 1 0 6 1 goal,goal,assist,goal,goal,goal",
        "2 3 0 5 0 goal,goal,assist,saved,assist,assist",
        "5 1 0 6 2 goal,goal,goal,assist,goal,goal",
      ]
    `);
  });

  it('rejects engine 3 inputs', () => {
    const plan = planMatch(setup);
    const at = plan.moments.findIndex((m) => m.kind !== 'pass');
    expect(() => simulateMatch(setup, [{ chance: at, defense: 'left', timing: 750 }])).toThrow(EngineInputError);
  });
});

const v3: MatchSetup = { ...setup, engineVersion: 3, chances: 3 };
const other = (side: Side): Side => (side === 'left' ? 'right' : 'left');

interface Hands { aim(r: Rng): [number, number]; timing(r: Rng): number; read: number }
const ACEMI: Hands = { aim: (r) => [r.range(-950, 950), r.range(50, 950)], timing: (r) => r.range(0, 1000), read: 50 };
const USTA: Hands = { aim: (r) => [(r.int(2) ? 1 : -1) * r.range(750, 880), r.range(100, 800)], timing: (r) => TIMING_TARGET + r.range(-50, 50), read: 95 };

/** Plays every moment of an engine 3 match the way a player with these hands would. */
function play3(s: MatchSetup, hands: Hands, salt = 0): ChanceInput[] {
  const r = createRng(s.seed + salt);
  return planMatch(s).moments.map((m, chance): ChanceInput => {
    const read = r.int(100) < hands.read;
    if (m.kind === 'pass') return { chance, pass: read ? m.openSide! : other(m.openSide!), timing: hands.timing(r) };
    if (m.kind === 'defense') return { chance, defense: read ? m.attackSide! : other(m.attackSide!), timing: hands.timing(r) };
    const [aim, lift] = hands.aim(r);
    return { chance, shot: { aim, lift, power: hands.timing(r) } };
  });
}

describe('engine 3 (skill)', () => {
  it('plans the chances plus two defense moments, the first moment a shot', () => {
    expect(planMatch(v3)).toEqual(planMatch(v3));
    for (let seed = 0; seed < 300; seed++) {
      const s = { ...v3, seed, chances: 1 + (seed % 6) };
      const { moments } = planMatch(s);
      expect(moments).toHaveLength(momentCount(s));
      expect(moments).toHaveLength(s.chances + 2);
      expect(moments[0]!.kind).toBe('shot');
      expect(moments.filter((m) => m.kind === 'defense')).toHaveLength(2);
      const minutes = moments.map((m) => m.minute);
      expect([...minutes].sort((a, b) => a - b)).toEqual(minutes);
      for (const m of moments) {
        expect(m.kind === 'defense' ? ['left', 'right'] : [undefined]).toContain(m.attackSide);
        expect(m.kind === 'pass' ? ['left', 'right'] : [undefined]).toContain(m.openSide);
      }
      expect(planMatch(s).opponentGoals.length).toBeLessThanOrEqual(2);
    }
  });

  it('grades timing around the target', () => {
    expect(gradeTiming(TIMING_TARGET)).toBe('perfect');
    expect(gradeTiming(TIMING_TARGET + 60)).toBe('perfect');
    expect(gradeTiming(TIMING_TARGET - 150)).toBe('timed');
    expect(gradeTiming(TIMING_TARGET + 151)).toBe('off');
    expect(gradeTiming(0)).toBe('off');
  });

  /** Goal rate of one shot moment over many seeds. */
  const shotRate = (shot: { aim: number; lift: number; power: number; assisted?: boolean }) => {
    let goals = 0, perfect = 0;
    for (let seed = 0; seed < 4000; seed++) {
      const s = { ...v3, seed };
      const o = playChance(s, planMatch(s), { chance: 0, shot });
      if (o.kind === 'shot' && o.outcome === 'goal') goals++;
      if (o.kind === 'shot' && o.perfect) perfect++;
    }
    return { goals: goals / 4000, perfect: perfect / 4000 };
  };

  it('rewards power timing: a perfect release scores far more than a mistimed one', () => {
    const corner = { aim: 800, lift: 600 };
    const perfect = shotRate({ ...corner, power: TIMING_TARGET });
    const late = shotRate({ ...corner, power: 1000 });
    expect(perfect.perfect).toBe(1);
    expect(late.perfect).toBe(0);
    expect(perfect.goals).toBeGreaterThan(late.goals + 0.2);
  });

  it('lets the keeper read shots at the middle', () => {
    const middle = shotRate({ aim: 0, lift: 300, power: TIMING_TARGET });
    const corner = shotRate({ aim: 800, lift: 600, power: TIMING_TARGET });
    expect(corner.goals).toBeGreaterThan(middle.goals + 0.15);
  });

  it('never makes an assisted shot perfect', () => {
    const assisted = shotRate({ aim: 800, lift: 600, power: TIMING_TARGET, assisted: true });
    expect(assisted.perfect).toBe(0);
    expect(assisted.goals).toBeLessThan(shotRate({ aim: 800, lift: 600, power: TIMING_TARGET }).goals);
  });

  it('rewards reading the open teammate and releasing the pass on time', () => {
    const rate = (open: boolean, timing: number) => {
      let n = 0, assists = 0;
      for (let seed = 0; seed < 4000; seed++) {
        const s = { ...v3, seed };
        const plan = planMatch(s);
        const chance = plan.moments.findIndex((m) => m.kind === 'pass');
        if (chance < 0) continue;
        const side = plan.moments[chance]!.openSide!;
        n++;
        if (playChance(s, plan, { chance, pass: open ? side : other(side), timing }).outcome === 'assist') assists++;
      }
      return assists / n;
    };
    const timed = rate(true, TIMING_TARGET), late = rate(true, 0), wrong = rate(false, TIMING_TARGET);
    expect(timed).toBeGreaterThan(0.7);
    expect(timed).toBeGreaterThan(late + 0.08);
    expect(wrong).toBeLessThan(0.15);
  });

  it('stops about 70% of attacks when read and timed, 35% when late, 10% on the wrong side', () => {
    const rate = (read: boolean, timing: number) => {
      let n = 0, stops = 0;
      for (let seed = 0; seed < 4000; seed++) {
        const s = { ...v3, seed };
        const plan = planMatch(s);
        const chance = plan.moments.findIndex((m) => m.kind === 'defense');
        const side = plan.moments[chance]!.attackSide!;
        n++;
        if (playChance(s, plan, { chance, defense: read ? side : other(side), timing }).outcome === 'stopped') stops++;
      }
      return (stops / n) * 100;
    };
    expect(rate(true, TIMING_TARGET)).toBeCloseTo(70, -1);
    expect(rate(true, 0)).toBeCloseTo(35, -1);
    expect(rate(false, TIMING_TARGET)).toBeCloseTo(10, -1);
  });

  it('keeps the counts consistent and counts unplayed defense moments against the player', () => {
    for (let seed = 0; seed < 500; seed++) {
      const s = { ...v3, seed };
      const plan = planMatch(s);
      const inputs = play3(s, USTA).filter((i) => i.chance !== seed % plan.moments.length);
      const r = simulateMatch(s, inputs);
      const conceded = r.outcomes.filter((o) => o?.kind === 'defense' && o.outcome === 'conceded').length;
      expect(r.missed).toBe(r.shots - r.goals);
      expect(r.us).toBe(r.goals + r.assists);
      expect(r.them).toBeGreaterThanOrEqual(plan.opponentGoals.length + conceded);
      expect(r.them).toBeLessThanOrEqual(plan.opponentGoals.length + 2);
      expect(r.defenseStops).toBe(r.outcomes.filter((o) => o?.kind === 'defense' && o.outcome === 'stopped').length);
      expect(r.result).toBe(r.us > r.them ? 'W' : r.us === r.them ? 'D' : 'L');
      expect(simulateMatch(s, [...inputs].reverse())).toEqual(r);
    }
  });

  it('shows a skipped defense moment with the outcome the result counts', () => {
    for (let seed = 0; seed < 300; seed++) {
      const s = { ...v3, seed };
      const plan = planMatch(s);
      const skipped = plan.moments.flatMap((m, i) => (m.kind === 'defense' ? [i] : []));
      const r = simulateMatch(s, play3(s, USTA).filter((i) => !skipped.includes(i.chance)));
      const conceded = skipped.filter((i) => skippedDefense(s, i) === 'conceded').length;
      expect(r.them).toBe(plan.opponentGoals.length + conceded);
      expect(r.defenseStops).toBe(0);
    }
  });

  it('counts assisted shots for the rating cap', () => {
    const inputs = play3(v3, USTA).map((i) => ('shot' in i ? { ...i, shot: { ...i.shot, assisted: true } } : i));
    expect(simulateMatch(v3, inputs).assistedShots).toBe(inputs.filter((i) => 'shot' in i).length);
    expect(simulateMatch(setup, inputsFor(setup).map((i) => ('shot' in i ? { ...i, shot: { ...i.shot, assisted: true } } : i))).assistedShots).toBe(0);
  });

  it('is decided by skill: skilled hands win far more often than random ones with the same stats', () => {
    const wins = (hands: Hands) => {
      let w = 0;
      for (let seed = 0; seed < 3000; seed++) {
        const s = { ...v3, seed, shooting: 45, passing: 45, opponentGoalkeeping: 41, opponentAttack: 36 };
        if (simulateMatch(s, play3(s, hands, 7)).result === 'W') w++;
      }
      return (w / 3000) * 100;
    };
    // GDD v3.1 4.1 expects a 34-46 point gap; the luck-driven engine 2 had at most 11.
    expect(wins(USTA) - wins(ACEMI)).toBeGreaterThan(30);
  });

  it('rejects missing timings, mismatched moments and unknown versions', () => {
    const plan = planMatch(v3);
    const defenseAt = plan.moments.findIndex((m) => m.kind === 'defense');
    const passAt = plan.moments.findIndex((m) => m.kind === 'pass');
    const shot = { aim: 0, lift: 0, power: 750 };
    expect(() => simulateMatch(v3, [{ chance: defenseAt, shot }])).toThrow(EngineInputError);
    expect(() => simulateMatch(v3, [{ chance: defenseAt, defense: 'left', timing: 1001 }])).toThrow(EngineInputError);
    expect(() => simulateMatch(v3, [{ chance: 0, defense: 'left', timing: 500 }])).toThrow(EngineInputError);
    expect(() => simulateMatch(v3, [{ chance: plan.moments.length, shot }])).toThrow(EngineInputError);
    if (passAt >= 0) expect(() => simulateMatch(v3, [{ chance: passAt, pass: 'left' }])).toThrow(EngineInputError);
    expect(() => planMatch({ ...v3, engineVersion: 5 as 3 })).toThrow(EngineInputError);
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
