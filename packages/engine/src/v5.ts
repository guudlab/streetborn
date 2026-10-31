// Engine 5, the attack chain ("atak zinciri", 2026-10-31).
//
// Engine 4 rolled each slice on its own: a goal, a save or nothing, with the same odds for
// both teams. Engine 5 plays every five-minute slice as one attack that runs in two or
// three steps: the ball is won, carried into the final third, then a shot, a foul or a lost
// ball. The commentary tells each step and the radar puts the ball where the step says.
//
// - Who attacks depends on the two teams' strength, the momentum and the clock, so a strong
//   opponent has the ball more and gets more defense moments against the player.
// - Free kicks and penalties come from fouls, for both teams.
// - The player's moments are the last step of one of our attacks: a teammate wins the ball
//   and hands it on, so the commentary always says how it got to him. Decision moments say
//   one step earlier what they call for (a teammate's run, or space in front of goal).
// - Teammates score about a third of our goals, and the team that scores presses for a while.
//
// The player's moments resolve exactly as in engine 4. Still a pure function of the setup and
// the inputs: a slice only depends on the moments before it.
import { createRng, deriveSeed, type Rng } from './prng.ts';
import { clamp } from './shot.ts';
import { pickSide } from './v2.ts';
import { skippedDefenseV3 } from './v3.ts';
import { MIX, MIX_KINDS, PACE_EXTRA_MAX, PACE_EXTRA_MIN, SLICES, HALFTIME_MINUTE, TACTIC, assertInputV4, playMomentV4 } from './v4.ts';
import {
  EngineInputError, type ChanceInput, type ChanceOutcome, type MatchEvent, type MatchPlan, type MatchSetup, type Moment,
  type Role, type Side, type Spot, type Tactic,
} from './types.ts';

const HALF = 9;
const KICKOFF_STREAM = 3_000_000;
const SLICE_STREAM = 3_000_100;

// Tuned by simulation against engine 4 (2026-10-31); see canli-mac.test.ts in the economy package.

/** Defense moments: one, a second one this often (percent, from the opponent's attack), a third against strong sides. */
const SECOND_DEFENSE_OFFSET = 25;
const THIRD_DEFENSE_FROM = 62;
const THIRD_DEFENSE = 35;

/** Who has the ball in a slice without the player: our share in percent. */
const SHARE_BASE = 50;
const SHARE_MOMENTUM = 7;
const SHARE_MIN = 22;
const SHARE_MAX = 78;

/** How an attack ends (percent): the ball is lost, a foul, otherwise a shot. */
const LOST = 38;
const FOUL = 16;
/** A foul is a penalty this often (percent); each team gets at most one. */
const PENALTY_FOUL = 8;
/** A foul brings a card this often (percent). */
const FOUL_CARD = 30;

/** Shots from attacks without the player: base percent, moved by skill gaps, tactics and momentum. */
const MATE_BASE = 18;
const THEIR_BASE = 37;
const CONVERT_MOMENTUM = 2;
const CONVERT_MIN = 8;
const CONVERT_MAX = 50;
/** Free kicks score this share of an open shot's chance (percent); penalties a fixed chance less the keeper. */
const FREEKICK_SHARE = 45;
const PENALTY_BASE = 78;

const MOMENTUM_MAX = 2;

/** Where each lane runs on the radar (y), for the attacking team. */
const LANE_Y: Record<Spot, number> = { left: 22, center: 50, right: 78 };
const SPOTS: readonly Spot[] = ['left', 'center', 'right'];

interface State {
  us: number;
  them: number;
  momentum: number;
  /** Slices since the momentum last moved; it settles back toward 0 every second one. */
  calm: number;
  /** The player lost the ball: the next slice without him is their counter. */
  counter: boolean;
  tactic: Tactic | null;
  penalty: { us: boolean; them: boolean; mine: boolean };
  attacks: number;
}

export interface RunV5 {
  plan: MatchPlan;
  outcomes: (ChanceOutcome | null)[];
}

export function runV5(setup: MatchSetup, inputs: readonly ChanceInput[]): RunV5 {
  const byChance = new Map<number, ChanceInput>();
  for (const input of inputs) {
    const { chance } = input;
    if (!Number.isInteger(chance) || chance < 0) throw new EngineInputError(`chance ${chance} is out of range`);
    if (byChance.has(chance)) throw new EngineInputError(`chance ${chance} was played twice`);
    byChance.set(chance, input);
  }

  const kick = createRng(deriveSeed(setup.seed, KICKOFF_STREAM));
  const pace = setup.pace ?? 50;
  const attacking = setup.chances + (kick.int(100) < clamp(pace - 30, PACE_EXTRA_MIN, PACE_EXTRA_MAX) ? 1 : 0);
  const defending = 1
    + (kick.int(100) < clamp(setup.opponentAttack + SECOND_DEFENSE_OFFSET, 30, 95) ? 1 : 0)
    + (setup.opponentAttack >= THIRD_DEFENSE_FROM && kick.int(100) < THIRD_DEFENSE ? 1 : 0);
  const order = Array.from({ length: SLICES }, (_, i) => i);
  for (let i = 0; i < attacking + defending; i++) {
    const j = i + kick.int(SLICES - i);
    [order[i], order[j]] = [order[j]!, order[i]!];
  }
  const mine = order.slice(0, attacking + defending).sort((a, b) => a - b);
  const defense = new Set<number>();
  while (defense.size < defending) defense.add(mine[1 + kick.int(mine.length - 1)]!);

  const team = Math.trunc((setup.shooting + setup.passing) / 2);
  const opponent = Math.trunc((setup.opponentGoalkeeping + setup.opponentAttack) / 2);
  const role: Role = setup.role ?? 'bitirici';
  const s: State = { us: 0, them: 0, momentum: 0, calm: 0, counter: false, tactic: null, penalty: { us: false, them: false, mine: false }, attacks: 0 };
  const moments: Moment[] = [];
  const outcomes: (ChanceOutcome | null)[] = [];
  const events: MatchEvent[] = [];
  const mateGoals: number[] = [];
  const opponentGoals: number[] = [];
  const momentum: number[] = [];

  const push = (moment: Moment) => {
    const chance = moments.length;
    moments.push(moment);
    const input = byChance.get(chance);
    if (input) assertInputV4(moment, input);
    const o = input ? playMomentV4(setup, moment, chance, input) : null;
    outcomes.push(o);
    return { chance, o };
  };
  const swing = (toward: 1 | -1) => { s.momentum = clamp(s.momentum + toward, -MOMENTUM_MAX, MOMENTUM_MAX); s.calm = 0; };
  /** Events carry the radar position for the attacking team; theirs run toward x = 0. */
  const ev = (minute: number, t: 'us' | 'them', kind: MatchEvent['kind'], who: number, v: number, x: number, y: number, extra?: Partial<MatchEvent>) => {
    events.push({ minute, team: t, kind, who, v, x: t === 'us' ? x : 100 - x, y: t === 'us' ? y : 100 - y, ...extra });
  };

  for (let slice = 0; slice < SLICES; slice++) {
    if (slice === HALF) {
      const { o } = push({ kind: 'halftime', minute: HALFTIME_MINUTE });
      s.tactic = o?.kind === 'halftime' ? o.outcome : null;
    }
    momentum.push(s.momentum);
    const rng = createRng(deriveSeed(setup.seed, SLICE_STREAM + slice));
    const tactic = slice >= HALF && s.tactic ? TACTIC[s.tactic] : null;
    // Three steps a minute apart; the slice covers 5·slice+1 .. 5·slice+5 and never reaches 45.
    const m0 = slice * 5 + 1 + rng.int(2) + (slice === 0 ? 1 : 0);
    const goalsBefore = s.us + s.them;

    if (mine.includes(slice)) {
      if (defense.has(slice)) {
        // The forward comes down the side he will take on the player: `attackSide` is seen from
        // the player (the 3D defense camera), so on the radar 'left' is the top touchline.
        const attackSide = pickSide(rng);
        ev(m0, 'them', s.counter ? 'counter' : 'win', rng.int(4), rng.int(4), 40 + rng.int(15), 30 + rng.int(40));
        s.counter = false;
        ev(m0 + 1, 'them', 'attack', rng.int(4), rng.int(4), 62 + rng.int(10), 100 - LANE_Y[attackSide]);
        const { chance, o } = push({ kind: 'defense', minute: m0 + 2, attackSide });
        const d = o?.kind === 'defense' ? o.outcome : skippedDefenseV3(setup, chance);
        if (d === 'conceded') { s.them++; swing(-1); }
        if (d === 'stopped') swing(1);
      } else {
        const moment = attackMoment(rng, s, role, m0, slice, ev);
        const { o } = push(moment);
        if (o && (o.outcome === 'goal' || o.outcome === 'assist')) { s.us++; swing(1); }
        else if (o?.kind === 'pass' && o.outcome === 'lost') s.counter = true;
      }
    } else {
      // Nobody passes to the player in this slice: one attack by either side.
      const late = slice >= 12 && s.us < s.them ? 10 : slice >= 14 && s.us > s.them ? -10 : 0;
      const share = clamp(
        SHARE_BASE + Math.trunc((team - opponent) / 3) + s.momentum * SHARE_MOMENTUM + (tactic ? tactic.us - tactic.them : 0) + late,
        SHARE_MIN, SHARE_MAX,
      );
      const t: 'us' | 'them' = s.counter ? 'them' : rng.int(100) < share ? 'us' : 'them';
      const convert = t === 'us'
        ? MATE_BASE + Math.trunc((team - setup.opponentGoalkeeping) / 3) + (tactic?.mate ?? 0) + s.momentum * CONVERT_MOMENTUM
        : THEIR_BASE + Math.trunc((setup.opponentAttack - team) / 3) + (tactic?.their ?? 0) - s.momentum * CONVERT_MOMENTUM;
      const scored = attack(rng, s, t, m0, clamp(convert, CONVERT_MIN, CONVERT_MAX), setup.opponentGoalkeeping, ev);
      s.counter = false;
      if (scored) {
        if (t === 'us') { s.us++; mateGoals.push(scored); swing(1); }
        else { s.them++; opponentGoals.push(scored); swing(-1); }
      }
    }
    if (s.us + s.them === goalsBefore && ++s.calm >= 2) {
      s.momentum -= Math.sign(s.momentum);
      s.calm = 0;
    }
  }

  return { plan: { moments, opponentGoals, mateGoals, events, momentum }, outcomes };
}

type Emit = (minute: number, t: 'us' | 'them', kind: MatchEvent['kind'], who: number, v: number, x: number, y: number, extra?: Partial<MatchEvent>) => void;

/** One attack without the player. Returns the minute of the goal, or 0. */
function attack(rng: Rng, s: State, t: 'us' | 'them', m0: number, convert: number, keeper: number, ev: Emit): number {
  const who = rng.int(4), v = rng.int(4), lane = SPOTS[rng.int(3)]!, y = LANE_Y[lane];
  ev(m0, t, s.counter ? 'counter' : 'win', who, v, 35 + rng.int(20), 30 + rng.int(40));
  const r = rng.int(100);
  const by = rng.int(4);
  if (r < LOST) {
    ev(m0 + 1, t, rng.int(3) ? 'lost' : 'offside', by, v, 68 + rng.int(15), y);
    return 0;
  }
  if (r < LOST + FOUL) {
    const fouled = by;
    const other = t === 'us' ? 'them' : 'us';
    if (!s.penalty[t] && rng.int(100) < PENALTY_FOUL) {
      s.penalty[t] = true;
      ev(m0 + 1, t, 'penalty', fouled, v, 92, 50);
      if (rng.int(100) < FOUL_CARD) ev(m0 + 1, other, 'card', rng.int(4), v, 92, 50);
      const odds = t === 'us' ? PENALTY_BASE - Math.trunc((keeper - 50) / 4) : PENALTY_BASE;
      return finish(rng, t, m0 + 2, odds, 89, 50, 'penalty', ev);
    }
    const fx = 70 + rng.int(12);
    ev(m0 + 1, t, 'foul', fouled, v, fx, y);
    if (rng.int(100) < FOUL_CARD) ev(m0 + 1, other, 'card', rng.int(4), v, fx, y);
    return finish(rng, t, m0 + 2, Math.trunc((convert * FREEKICK_SHARE) / 100) + 4, fx, y, 'freekick', ev);
  }
  ev(m0 + 1, t, 'attack', by, v, 65 + rng.int(15), y);
  return finish(rng, t, m0 + 2, convert, 84 + rng.int(8), clamp(y + rng.int(21) - 10, 15, 85), undefined, ev);
}

/** The shot at the end of an attack: a goal (returns its minute), or saved, wide, the post or a corner. */
function finish(rng: Rng, t: 'us' | 'them', minute: number, odds: number, x: number, y: number, set: 'freekick' | 'penalty' | undefined, ev: Emit): number {
  const who = rng.int(4), v = rng.int(4);
  const extra = set ? { set } : undefined;
  if (rng.int(100) < odds) {
    ev(minute, t, 'goal', who, v, 100, 50, extra);
    return minute;
  }
  const r = rng.int(100);
  const kind = r < 45 ? 'save' : r < 75 ? 'miss' : r < 85 ? 'post' : set === 'penalty' ? 'save' : 'corner';
  ev(minute, t, kind, who, v, x, y, extra);
  return 0;
}

/**
 * One of the player's attacking moments and the steps that bring the ball to him:
 * a teammate wins it, then hands it on, wins a free kick or a penalty, or (decision
 * moments) makes a run or finds the space open.
 */
function attackMoment(rng: Rng, s: State, role: Role, m0: number, slice: number, ev: Emit): Moment {
  const first = s.attacks === 0;
  s.attacks++;
  let kind = MIX_KINDS[0]!;
  if (!first) {
    const weights = MIX[role].slice();
    if (s.penalty.mine) weights[4] = 0;
    if (slice >= 14 && s.us <= s.them) weights[0] = weights[0]! * 2;
    let roll = rng.int(weights.reduce((a, b) => a + b, 0));
    let k = 0;
    while (roll >= weights[k]!) roll -= weights[k++]!;
    kind = MIX_KINDS[k]!;
  }
  // Three different teammates: who wins the ball, and the two around the player.
  const crew = [0, 1, 2, 3];
  for (let i = 0; i < 3; i++) {
    const j = i + rng.int(4 - i);
    [crew[i], crew[j]] = [crew[j]!, crew[i]!];
  }
  const [a, b, c] = crew as [number, number, number, number];
  const v = rng.int(4);
  const spot = SPOTS[rng.int(3)]!;
  const minute = m0 + 2;
  switch (kind) {
    case 'pass': {
      const openSide = pickSide(rng);
      ev(m0, 'us', 'win', a, v, 35 + rng.int(15), 40 + rng.int(20));
      ev(m0 + 1, 'us', 'attack', a, v, 50 + rng.int(10), 50, { me: true });
      return { kind, minute, openSide, mate: a, mates: [b, c] };
    }
    case 'decision': {
      const openSide = pickSide(rng);
      const best = rng.int(2) ? 'shot' as const : 'pass' as const;
      const mates: [number, number] = [b, c];
      ev(m0, 'us', 'win', a, v, 50 + rng.int(12), 45 + rng.int(10), { me: true });
      if (best === 'pass') ev(m0 + 1, 'us', 'run', mates[openSide === 'left' ? 0 : 1], v, 80, openSide === 'left' ? 25 : 75);
      else ev(m0 + 1, 'us', 'space', a, v, 76, LANE_Y[spot]);
      return { kind, minute, openSide, best, spot, mate: a, mates };
    }
    case 'freekick': {
      const fk: Spot = spot;
      ev(m0, 'us', 'attack', a, v, 62 + rng.int(8), LANE_Y[fk]);
      ev(m0 + 1, 'us', 'foul', b, v, 76, LANE_Y[fk], { me: true });
      return { kind, minute, spot: fk, mate: b };
    }
    case 'penalty': {
      s.penalty.mine = true;
      ev(m0, 'us', 'attack', a, v, 70 + rng.int(8), LANE_Y[spot]);
      ev(m0 + 1, 'us', 'penalty', b, v, 92, 50, { me: true });
      return { kind, minute, spot: 'center', mate: b };
    }
    default: {
      ev(m0, 'us', 'win', a, v, 40 + rng.int(15), 30 + rng.int(40));
      ev(m0 + 1, 'us', 'attack', b, v, 68 + rng.int(8), LANE_Y[spot], { me: true });
      return { kind: 'shot', minute, spot, mate: b };
    }
  }
}
