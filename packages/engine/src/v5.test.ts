import { describe, expect, it } from 'vitest';
import {
  createRng, HALFTIME_MINUTE, momentCount, planMatch, playChance, simulateMatch, TIMING_TARGET,
  type ChanceInput, type MatchSetup, type Moment, type Rng, type Side,
} from './index.ts';

const v5: MatchSetup = {
  engineVersion: 5, seed: 987654321, chances: 3, shooting: 55, passing: 55, opponentGoalkeeping: 51, opponentAttack: 46, pace: 50, role: 'bitirici',
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

describe('engine 5 (attack chain)', () => {
  it('places the moments like engine 4 and keeps the clock moving', () => {
    for (let seed = 0; seed < 300; seed++) {
      const s = { ...v5, seed };
      const { moments, events, momentum } = planMatch(s, play({ ...v5, seed }, USTA));
      const plays = moments.filter((m) => m.kind !== 'halftime');
      expect(plays.length).toBeGreaterThanOrEqual(4);
      expect(plays.length).toBeLessThanOrEqual(7);
      expect(plays[0]!.kind).toBe('shot');
      expect(moments.filter((m) => m.kind === 'halftime').map((m) => m.minute)).toEqual([HALFTIME_MINUTE]);
      const minutes = moments.map((m) => m.minute);
      expect([...minutes].sort((a, b) => a - b)).toEqual(minutes);
      expect(momentCount(s)).toBe(moments.length);
      expect(momentum).toHaveLength(18);
      expect(momentum!.every((m) => m >= -2 && m <= 2)).toBe(true);
      // Something happens in every slice, on the pitch.
      const times = [0, ...events!.map((e) => e.minute), ...minutes, 90].sort((a, b) => a - b);
      for (let i = 1; i < times.length; i++) expect(times[i]! - times[i - 1]!).toBeLessThanOrEqual(8);
      expect(events!.every((e) => e.minute >= 1 && e.minute <= 90 && e.minute !== HALFTIME_MINUTE)).toBe(true);
      expect(events!.every((e) => e.x! >= 0 && e.x! <= 100 && e.y! >= 0 && e.y! <= 100)).toBe(true);
    }
  });

  it('tells how the ball gets to the player', () => {
    for (let seed = 0; seed < 300; seed++) {
      const { moments, events } = planMatch({ ...v5, seed, role: 'kanat' });
      for (const m of moments) {
        if (m.kind === 'halftime') continue;
        const lead = events!.filter((e) => e.minute < m.minute && e.minute >= m.minute - 2);
        expect(lead.length).toBeGreaterThanOrEqual(2);
        if (m.kind === 'defense') {
          expect(lead.every((e) => e.team === 'them')).toBe(true);
          // The radar shows him on the side the 3D forward takes: 'left' is the top touchline.
          const run = lead.find((e) => e.kind === 'attack')!;
          expect(run.y! < 50).toBe(m.attackSide === 'left');
          continue;
        }
        expect(lead.some((e) => e.me)).toBe(true);
        if (m.kind === 'freekick') expect(lead.some((e) => e.kind === 'foul' && e.team === 'us')).toBe(true);
        if (m.kind === 'penalty') expect(lead.some((e) => e.kind === 'penalty' && e.team === 'us')).toBe(true);
        if (m.kind === 'decision') {
          const cue = lead.find((e) => e.kind === 'run' || e.kind === 'space')!;
          expect(cue.kind).toBe(m.best === 'pass' ? 'run' : 'space');
          if (m.best === 'pass') expect(cue.who).toBe(m.mates![m.openSide === 'left' ? 0 : 1]);
        }
        if (m.kind === 'pass' || m.kind === 'decision') expect(new Set([m.mate, ...m.mates!]).size).toBe(3);
        if (m.kind !== 'pass') expect(m.spot).toBeDefined();
        // The step that hands the ball over happens in the lane of the shot.
        if (m.kind === 'shot' && m.spot !== 'center') expect(lead.find((e) => e.me)!.y! < 50).toBe(m.spot === 'left');
      }
    }
  });

  it('brings set pieces from fouls', () => {
    let set = 0;
    for (let seed = 0; seed < 300; seed++) {
      const { events } = planMatch({ ...v5, seed });
      for (const e of events!.filter((x) => x.set)) {
        set++;
        const foul = events!.find((f) => f.minute === e.minute - 1 && f.team === e.team && f.kind === (e.set === 'penalty' ? 'penalty' : 'foul'));
        expect(foul).toBeDefined();
      }
      expect(events!.filter((e) => e.kind === 'penalty' && e.team === 'them').length).toBeLessThanOrEqual(1);
    }
    expect(set).toBeGreaterThan(100);
  });

  it('gives every user a different match', () => {
    const story = (seed: number) => {
      const p = planMatch({ ...v5, seed });
      return [...p.moments.map((m) => `${m.minute}${m.kind}`), ...p.events!.map((e) => `${e.minute}${e.team}${e.kind}`)].join(' ');
    };
    expect(new Set(Array.from({ length: 500 }, (_, seed) => story(seed))).size).toBe(500);
  });

  it('never changes what came before a moment, and lets the moment change what comes after', () => {
    let changed = 0;
    for (let seed = 0; seed < 200; seed++) {
      const s = { ...v5, seed };
      const first = planMatch(s);
      const k = first.moments.findIndex((m) => m.kind === 'shot');
      const goal = planMatch(s, [{ chance: k, shot: { aim: 850, lift: 300, power: TIMING_TARGET } }]);
      const miss = planMatch(s, [{ chance: k, shot: { aim: 0, lift: 0, power: 0 } }]);
      expect(goal.moments.map((m) => m.minute)).toEqual(first.moments.map((m) => m.minute));
      const at = first.moments[k]!.minute;
      expect(goal.events!.filter((e) => e.minute < at)).toEqual(first.events!.filter((e) => e.minute < at));
      if (JSON.stringify(goal.events) !== JSON.stringify(miss.events)) changed++;
    }
    expect(changed).toBeGreaterThan(20);
  });

  it('replays the same result from the same inputs and matches playChance', () => {
    const inputs = play(v5, USTA);
    const a = simulateMatch(v5, inputs);
    expect(simulateMatch(v5, [...inputs].reverse())).toEqual(a);
    const plan = planMatch(v5, inputs);
    for (const input of inputs) expect(a.outcomes[input.chance]).toEqual(playChance(v5, plan, input));
    expect(a.us).toBe(a.goals + a.assists + a.mateGoals);
  });

  it('lets a strong opponent have the ball more', () => {
    const count = (gk: number, att: number) => {
      let attacks = 0, defense = 0;
      for (let seed = 0; seed < 800; seed++) {
        const p = planMatch({ ...v5, seed, opponentGoalkeeping: gk, opponentAttack: att });
        attacks += p.events!.filter((e) => e.team === 'them' && (e.kind === 'win' || e.kind === 'counter')).length;
        defense += p.moments.filter((m) => m.kind === 'defense').length;
      }
      return { attacks, defense };
    };
    const weak = count(35, 30), strong = count(70, 68);
    expect(strong.attacks).toBeGreaterThan(weak.attacks * 1.2);
    expect(strong.defense).toBeGreaterThan(weak.defense * 1.2);
  });

  it('shares the goals with the teammates', () => {
    let mine = 0, mates = 0;
    for (let seed = 0; seed < 1000; seed++) {
      const s = { ...v5, seed };
      const r = simulateMatch(s, play(s, USTA, 3));
      mine += r.goals + r.assists;
      mates += r.mateGoals;
    }
    expect(mates / (mine + mates)).toBeGreaterThan(0.2);
    expect(mates / (mine + mates)).toBeLessThan(0.45);
  });

  it('is decided by skill', () => {
    const wins = (hands: Hands) => {
      let w = 0;
      for (let seed = 0; seed < 2000; seed++) {
        const s = { ...v5, seed };
        if (simulateMatch(s, play(s, hands, 7)).result === 'W') w++;
      }
      return (w / 2000) * 100;
    };
    expect(wins(USTA) - wins(ACEMI)).toBeGreaterThan(25);
  });

  it('scores stored engine 5 matches the same forever', () => {
    const summary = [11, 222, 3333].map((seed) => {
      const s = { ...v5, seed };
      const inputs = play(s, USTA);
      const r = simulateMatch(s, inputs);
      const p = planMatch(s, inputs);
      return [r.goals, r.assists, r.mateGoals, r.us, r.them, p.moments.map((m) => `${m.minute}${m.kind.slice(0, 3)}`).join(','), r.outcomes.map((o) => o && o.outcome).join(','), p.events!.length].join(' ');
    });
    expect(summary).toMatchInlineSnapshot(`
      [
        "1 1 0 2 1 23sho,28dec,45hal,48dec,54def,73def goal,assist,,saved,stopped,survived 48",
        "2 1 1 4 1 8sho,34fre,45hal,54def,59fre,63def,73pas goal,goal,,survived,saved,survived,assist 44",
        "2 0 1 3 1 43sho,45hal,53sho,63def,73dec,89def goal,,saved,conceded,goal,stopped 45",
      ]
    `);
  });
});
