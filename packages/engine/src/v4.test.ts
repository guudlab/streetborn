import { describe, expect, it } from 'vitest';
import {
  createRng, EngineInputError, HALFTIME_MINUTE, momentCount, planMatch, playChance, simulateMatch, TIMING_TARGET,
  type ChanceInput, type MatchSetup, type Moment, type Rng, type Side,
} from './index.ts';

const v4: MatchSetup = {
  engineVersion: 4, seed: 987654321, chances: 3, shooting: 55, passing: 55, opponentGoalkeeping: 51, opponentAttack: 46, pace: 50, role: 'bitirici',
};
const other = (side: Side): Side => (side === 'left' ? 'right' : 'left');

interface Hands { aim(r: Rng): [number, number]; timing(r: Rng): number; read: number }
const ACEMI: Hands = { aim: (r) => [r.range(-950, 950), r.range(50, 950)], timing: (r) => r.range(0, 1000), read: 50 };
const USTA: Hands = { aim: (r) => [(r.int(2) ? 1 : -1) * r.range(750, 880), r.range(100, 800)], timing: (r) => TIMING_TARGET + r.range(-50, 50), read: 95 };

function inputFor(m: Moment, chance: number, hands: Hands, r: Rng): ChanceInput | null {
  const read = r.int(100) < hands.read;
  if (m.kind === 'halftime') return null;
  if (m.kind === 'pass') return { chance, pass: read ? m.openSide! : other(m.openSide!), timing: hands.timing(r) };
  if (m.kind === 'defense') return { chance, defense: read ? m.attackSide! : other(m.attackSide!), timing: hands.timing(r) };
  if (m.kind === 'decision' && (read ? m.best : m.best === 'shot' ? 'pass' : 'shot') === 'pass') {
    return { chance, pass: read ? m.openSide! : other(m.openSide!), timing: hands.timing(r) };
  }
  const [aim, lift] = hands.aim(r);
  return { chance, shot: { aim, lift, power: hands.timing(r) } };
}

/** Plays a match moment by moment, as the app does: re-plan after each input. */
function play(s: MatchSetup, hands: Hands, salt = 0): ChanceInput[] {
  const r = createRng(s.seed + salt);
  const inputs: ChanceInput[] = [];
  for (let k = 0; ; k++) {
    const m = planMatch(s, inputs).moments[k];
    if (!m) return inputs;
    const i = inputFor(m, k, hands, r);
    if (i) inputs.push(i);
  }
}

describe('engine 4 (live match)', () => {
  it('places 4 to 6 player moments and the half-time call, the first one a shot', () => {
    for (let seed = 0; seed < 300; seed++) {
      const s = { ...v4, seed };
      const { moments, events } = planMatch(s);
      const plays = moments.filter((m) => m.kind !== 'halftime');
      expect(plays.length).toBeGreaterThanOrEqual(4);
      expect(plays.length).toBeLessThanOrEqual(6);
      expect(plays[0]!.kind).toBe('shot');
      expect(moments.filter((m) => m.kind === 'halftime').map((m) => m.minute)).toEqual([HALFTIME_MINUTE]);
      expect(plays.filter((m) => m.kind === 'defense').length).toBeGreaterThanOrEqual(1);
      expect(plays.filter((m) => m.kind === 'penalty').length).toBeLessThanOrEqual(1);
      const minutes = moments.map((m) => m.minute);
      expect([...minutes].sort((a, b) => a - b)).toEqual(minutes);
      expect(minutes.every((m) => m >= 1 && m <= 90)).toBe(true);
      expect(events!.every((e) => e.minute >= 1 && e.minute <= 90 && !minutes.includes(e.minute))).toBe(true);
      expect(momentCount(s)).toBe(moments.length);
    }
  });

  it('gives every user a different match', () => {
    const story = (seed: number) => {
      const p = planMatch({ ...v4, seed });
      return [...p.moments.map((m) => `${m.minute}${m.kind}`), ...p.events!.map((e) => `${e.minute}${e.team}${e.kind}`)].join(' ');
    };
    const stories = new Set(Array.from({ length: 500 }, (_, seed) => story(seed)));
    expect(stories.size).toBe(500);
  });

  it('never changes what came before a moment, and lets the moment change what comes after', () => {
    let changed = 0;
    for (let seed = 0; seed < 200; seed++) {
      const s = { ...v4, seed };
      const first = planMatch(s);
      const k = first.moments.findIndex((m) => m.kind === 'shot');
      const goal = planMatch(s, [{ chance: k, shot: { aim: 850, lift: 300, power: TIMING_TARGET } }]);
      const miss = planMatch(s, [{ chance: k, shot: { aim: 0, lift: 0, power: 0 } }]);
      // The moments themselves are fixed at kick-off.
      expect(goal.moments.map((m) => m.minute)).toEqual(first.moments.map((m) => m.minute));
      const at = first.moments[k]!.minute;
      expect(goal.events!.filter((e) => e.minute < at)).toEqual(first.events!.filter((e) => e.minute < at));
      if (JSON.stringify(goal.events) !== JSON.stringify(miss.events)) changed++;
    }
    expect(changed).toBeGreaterThan(20);
  });

  it('replays the same result from the same inputs and matches playChance', () => {
    const inputs = play(v4, USTA);
    const a = simulateMatch(v4, inputs);
    expect(simulateMatch(v4, [...inputs].reverse())).toEqual(a);
    const plan = planMatch(v4, inputs);
    for (const input of inputs) expect(a.outcomes[input.chance]).toEqual(playChance(v4, plan, input));
    expect(a.us).toBe(a.goals + a.assists + a.mateGoals);
    expect(a.mateGoals).toBe(plan.mateGoals!.length);
  });

  it('counts the right calls in decision moments', () => {
    for (let seed = 0; seed < 300; seed++) {
      const s = { ...v4, seed, role: 'kanat' as const };
      const plan = planMatch(s);
      const at = plan.moments.findIndex((m) => m.kind === 'decision');
      if (at < 0) continue;
      const m = plan.moments[at]!;
      const smart: ChanceInput = m.best === 'pass'
        ? { chance: at, pass: m.openSide!, timing: TIMING_TARGET }
        : { chance: at, shot: { aim: 800, lift: 300, power: TIMING_TARGET } };
      expect(simulateMatch(s, [smart]).smartChoices).toBe(1);
      const wrong: ChanceInput = m.best === 'shot'
        ? { chance: at, pass: m.openSide!, timing: TIMING_TARGET }
        : { chance: at, shot: { aim: 800, lift: 300, power: TIMING_TARGET } };
      expect(simulateMatch(s, [wrong]).smartChoices).toBe(0);
      return;
    }
    throw new Error('no decision moment in 300 seeds');
  });

  it('gives each position its own mix of moments', () => {
    const count = (role: 'bitirici' | 'oyunKurucu', kind: string) => {
      let n = 0;
      for (let seed = 0; seed < 1000; seed++) n += planMatch({ ...v4, seed, role }).moments.filter((m) => m.kind === kind).length;
      return n;
    };
    // Every match opens with a shot, so the shot mix shows less.
    expect(count('bitirici', 'shot')).toBeGreaterThan(count('oyunKurucu', 'shot') * 1.3);
    expect(count('oyunKurucu', 'pass')).toBeGreaterThan(count('bitirici', 'pass') * 1.5);
  });

  it('lets the half-time call change the second half', () => {
    let pushUs = 0, holdUs = 0;
    for (let seed = 0; seed < 600; seed++) {
      const s = { ...v4, seed };
      const half = planMatch(s).moments.findIndex((m) => m.kind === 'halftime');
      const second = (tactic: 'push' | 'hold') =>
        planMatch(s, [{ chance: half, tactic }]).events!.filter((e) => e.minute > HALFTIME_MINUTE && e.team === 'us' && e.kind !== 'card' && e.kind !== 'offside').length;
      pushUs += second('push');
      holdUs += second('hold');
    }
    expect(pushUs).toBeGreaterThan(holdUs * 1.3);
  });

  it('is decided by skill', () => {
    const wins = (hands: Hands) => {
      let w = 0;
      for (let seed = 0; seed < 2000; seed++) {
        const s = { ...v4, seed };
        if (simulateMatch(s, play(s, hands, 7)).result === 'W') w++;
      }
      return (w / 2000) * 100;
    };
    expect(wins(USTA) - wins(ACEMI)).toBeGreaterThan(25);
  });

  it('rejects inputs that do not fit the moment', () => {
    const plan = planMatch(v4);
    const half = plan.moments.findIndex((m) => m.kind === 'halftime');
    const defense = plan.moments.findIndex((m) => m.kind === 'defense');
    const shot = { aim: 0, lift: 0, power: 750 };
    expect(() => simulateMatch(v4, [{ chance: half, shot }])).toThrow(EngineInputError);
    expect(() => simulateMatch(v4, [{ chance: defense, tactic: 'push' }])).toThrow(EngineInputError);
    expect(() => simulateMatch(v4, [{ chance: half, tactic: 'attack' as 'push' }])).toThrow(EngineInputError);
    expect(() => simulateMatch(v4, [{ chance: defense, shot }])).toThrow(EngineInputError);
    const first = plan.moments.findIndex((m) => m.kind === 'shot');
    expect(() => simulateMatch(v4, [{ chance: first, shot }, { chance: first, shot }])).toThrow(EngineInputError);
    expect(() => simulateMatch(v4, [{ chance: plan.moments.length, shot }])).toThrow(EngineInputError);
    expect(() => simulateMatch(v4, [{ chance: -1, shot }])).toThrow(EngineInputError);
    expect(() => planMatch({ ...v4, chances: 9 })).toThrow(EngineInputError);
    expect(() => planMatch({ ...v4, role: 'kaleci' as 'kanat' })).toThrow(EngineInputError);
    expect(() => planMatch({ ...v4, pace: 0 })).toThrow(EngineInputError);
  });

  it('still scores stored engine 4 matches exactly as before', () => {
    // Locks engine 4: a stored match must replay to the result it was paid for.
    const summary = [11, 222, 3333].map((seed) => {
      const s = { ...v4, seed };
      const r = simulateMatch(s, play(s, USTA));
      const p = planMatch(s, play(s, USTA));
      return [r.goals, r.assists, r.mateGoals, r.us, r.them, p.moments.map((m) => `${m.minute}${m.kind.slice(0, 3)}`).join(','), r.outcomes.map((o) => o && o.outcome).join(',')].join(' ');
    });
    expect(summary).toMatchInlineSnapshot(`
      [
        "2 1 1 4 2 8sho,12pas,23def,33def,45hal,47sho goal,assist,stopped,conceded,,goal",
        "4 0 0 4 2 33sho,45hal,49fre,71fre,78def,81sho goal,,goal,goal,stopped,goal",
        "1 2 0 3 2 2sho,38dec,45hal,57def,66dec,77def goal,assist,,conceded,assist,stopped",
      ]
    `);
  });
});
