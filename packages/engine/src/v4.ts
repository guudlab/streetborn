// Engine 4, the live match ("Canlı maç", design doc 2026-10-31).
//
// The 90 minutes run as eighteen five-minute slices. Most slices are played out by the
// teammates and the opponent alone and only feed the commentary; in a few the ball comes
// to the player and he plays the moment (the engine 3 scenes, plus penalties, decision
// moments where he picks a shot or a pass, and a half-time call).
//
// What makes every match different: the seed places the player's moments and rolls every
// slice; the stats, the position and the pace decide how many moments he gets and of what
// kind; and each moment he plays changes the score and the momentum, which the slices
// after it read. The whole match is still a pure function of the setup and the inputs, so
// the server replays it exactly: a slice only depends on the moments before it.
import { createRng, deriveSeed, type Rng } from './prng.ts';
import { clamp } from './shot.ts';
import { assertShot, inRange, pickSide } from './v2.ts';
import {
  gradeTiming, PASS_OPEN_BASE, PASS_TIMING_BONUS, PASS_WRONG, playV3, resolveSkillShot, skippedDefenseV3,
} from './v3.ts';
import {
  EngineInputError, ROLES, type ChanceInput, type ChanceOutcome, type MatchEvent, type MatchPlan, type MatchSetup, type Moment,
  type MomentKind, type Role, type Tactic,
} from './types.ts';

/** Five-minute slices in 90 minutes; the second half starts with slice 9. */
export const SLICES = 18;
const HALF = 9;
export const HALFTIME_MINUTE = 45;

const KICKOFF_STREAM = 2_000_000;
const SLICE_STREAM = 2_000_100;

// Tuned by simulation against engine 3 (2026-10-31): over the same players and hands,
// win rates stay within about 8 points and coin within about 5% (bitirici a little more).

/** Defense moments: one, and a second one this often (percent). */
const SECOND_DEFENSE = 75;
/** One extra attacking moment for fast players: chance = pace − 30, 10..60 percent. */
export const PACE_EXTRA_MIN = 10;
export const PACE_EXTRA_MAX = 60;
/** Goals from slices without the player: base percent per attack, plus team vs keeper / their attack. */
const MATE_BASE = 12;
const THEIR_BASE = 20;

/** Attacking moment mix per position: shot, pass, decision, free kick, penalty (weights). */
export const MIX: Record<Role, readonly [number, number, number, number, number]> = {
  bitirici: [42, 15, 22, 15, 6],
  oyunKurucu: [15, 35, 30, 15, 5],
  kanat: [25, 25, 35, 10, 5],
};
export const MIX_KINDS: readonly MomentKind[] = ['shot', 'pass', 'decision', 'freekick', 'penalty'];

/** Penalties: the keeper is this much worse than in open play. */
const PENALTY_KEEPER_MALUS = 10;
/** The wrong call in a decision moment: a crowded shot (keeper better) or a pass into traffic. */
const WRONG_CALL_KEEPER_BONUS = 15;
const WRONG_CALL_PASS_MALUS = 20;

/** Slices without a player moment: attack chances (percent) and how momentum, tactics and the clock move them. */
const ATTACK_BASE = 24;
const MOMENTUM_STEP = 5;
const MOMENTUM_MAX = 2;
const COUNTER_BONUS = 25;
export const TACTIC: Record<Tactic, { us: number; them: number; mate: number; their: number }> = {
  push: { us: 10, them: 6, mate: 3, their: 0 },
  hold: { us: -8, them: -10, mate: 0, their: -4 },
};

interface State {
  us: number;
  them: number;
  /** Who is pressing: positive for us. */
  momentum: number;
  /** The player lost the ball: the next slice opens with their counter. */
  counter: boolean;
  tactic: Tactic | null;
  penalty: boolean;
  attacks: number;
}

export interface RunV4 {
  plan: MatchPlan;
  /** Outcome per moment; `null` when the moment was not played. */
  outcomes: (ChanceOutcome | null)[];
}

/**
 * Plays the whole match with the inputs given so far. Moments without an input are
 * treated as not played; their outcome is `null` (a defense moment still happens).
 */
export function runV4(setup: MatchSetup, inputs: readonly ChanceInput[]): RunV4 {
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
  const defending = 1 + (kick.int(100) < SECOND_DEFENSE ? 1 : 0);
  // The player's slices, spread over the match by a partial shuffle.
  const order = Array.from({ length: SLICES }, (_, i) => i);
  for (let i = 0; i < attacking + defending; i++) {
    const j = i + kick.int(SLICES - i);
    [order[i], order[j]] = [order[j]!, order[i]!];
  }
  const mine = order.slice(0, attacking + defending).sort((a, b) => a - b);
  // Defense in any of them but the first, which is always a shot.
  const defense = new Set<number>();
  while (defense.size < defending) defense.add(mine[1 + kick.int(mine.length - 1)]!);

  const team = Math.trunc((setup.shooting + setup.passing) / 2);
  const role: Role = setup.role ?? 'bitirici';
  const s: State = { us: 0, them: 0, momentum: 0, counter: false, tactic: null, penalty: false, attacks: 0 };
  const moments: Moment[] = [];
  const outcomes: (ChanceOutcome | null)[] = [];
  const events: MatchEvent[] = [];
  const mateGoals: number[] = [];
  const opponentGoals: number[] = [];

  const push = (moment: Moment) => {
    const chance = moments.length;
    moments.push(moment);
    const input = byChance.get(chance);
    if (input) assertInputV4(moment, input);
    const o = input ? playMomentV4(setup, moment, chance, input) : null;
    outcomes.push(o);
    return { chance, o };
  };

  for (let slice = 0; slice < SLICES; slice++) {
    if (slice === HALF) {
      const { o } = push({ kind: 'halftime', minute: HALFTIME_MINUTE });
      s.tactic = o?.kind === 'halftime' ? o.outcome : null;
    }
    const rng = createRng(deriveSeed(setup.seed, SLICE_STREAM + slice));
    const tactic = slice >= HALF && s.tactic ? TACTIC[s.tactic] : null;
    // Minutes 1..90: a slice covers 5·slice+1 .. 5·slice+5; a moment never lands on 45.
    const minute = slice * 5 + 1 + rng.int(4) + (slice === 0 ? 1 : 0);

    if (mine.includes(slice)) {
      const moment = defense.has(slice)
        ? { kind: 'defense' as const, minute, attackSide: pickSide(rng) }
        : attackMoment(rng, s, role, minute, slice);
      const { chance, o } = push(moment);
      if (moment.kind === 'defense') {
        const d = o?.kind === 'defense' ? o.outcome : skippedDefenseV3(setup, chance);
        if (d === 'conceded') { s.them++; s.momentum = clamp(s.momentum + 1, -MOMENTUM_MAX, MOMENTUM_MAX); }
        if (d === 'stopped') s.momentum = clamp(s.momentum + 1, -MOMENTUM_MAX, MOMENTUM_MAX);
      } else if (o && (o.outcome === 'goal' || o.outcome === 'assist')) {
        s.us++;
        s.momentum = clamp(s.momentum - 1, -MOMENTUM_MAX, MOMENTUM_MAX); // they come at us
      } else if (o?.kind === 'pass' && o.outcome === 'lost') {
        s.counter = true;
      }
      continue;
    }

    // Nobody passes to the player in this slice: the teammates and the opponent play it.
    const late = slice >= 12 && s.us < s.them ? { us: 8, them: 3 } : slice >= 14 && s.us > s.them ? { us: -6, them: 6 } : { us: 0, them: 0 };
    const pUs = clamp(ATTACK_BASE + s.momentum * MOMENTUM_STEP + (tactic?.us ?? 0) + late.us, 5, 60);
    const pThem = clamp(ATTACK_BASE - s.momentum * MOMENTUM_STEP + (tactic?.them ?? 0) + late.them + (s.counter ? COUNTER_BONUS : 0), 5, 70);
    s.counter = false;
    const roll = rng.int(100);
    const who = rng.int(4), v = rng.int(4), r = rng.int(100);
    if (roll < pUs) {
      const convert = clamp(MATE_BASE + Math.trunc((team - setup.opponentGoalkeeping) / 3) + (tactic?.mate ?? 0), 6, 40);
      if (r < convert) {
        s.us++; mateGoals.push(minute);
        s.momentum = clamp(s.momentum - 1, -MOMENTUM_MAX, MOMENTUM_MAX);
        events.push({ minute, team: 'us', kind: 'goal', who, v });
      } else {
        events.push({ minute, team: 'us', kind: missKind(rng), who, v });
      }
    } else if (roll < pUs + pThem) {
      const convert = clamp(THEIR_BASE + Math.trunc(setup.opponentAttack / 4) + (tactic?.their ?? 0), 6, 40);
      if (r < convert) {
        s.them++; opponentGoals.push(minute);
        s.momentum = clamp(s.momentum + 1, -MOMENTUM_MAX, MOMENTUM_MAX);
        events.push({ minute, team: 'them', kind: 'goal', who, v });
      } else {
        events.push({ minute, team: 'them', kind: missKind(rng), who, v });
      }
    } else if (r < 30) {
      events.push({ minute, team: rng.int(2) ? 'us' : 'them', kind: rng.int(3) ? 'card' : 'offside', who, v });
    }
  }

  return { plan: { moments, opponentGoals, mateGoals, events }, outcomes };
}

/** Saved, wide, off the post, or out for a corner. */
function missKind(rng: Rng): MatchEvent['kind'] {
  const r = rng.int(100);
  return r < 45 ? 'save' : r < 75 ? 'miss' : r < 85 ? 'post' : 'corner';
}

function attackMoment(rng: Rng, s: State, role: Role, minute: number, slice: number): Moment {
  const first = s.attacks === 0;
  s.attacks++;
  if (first) return { kind: 'shot', minute };
  const weights = MIX[role].slice();
  if (s.penalty) weights[4] = 0;
  // Late on and not ahead, the ball goes to the striker.
  if (slice >= 14 && s.us <= s.them) weights[0] = weights[0]! * 2;
  let roll = rng.int(weights.reduce((a, b) => a + b, 0));
  let k = 0;
  while (roll >= weights[k]!) roll -= weights[k++]!;
  const kind = MIX_KINDS[k]!;
  if (kind === 'penalty') s.penalty = true;
  if (kind === 'pass') return { kind, minute, openSide: pickSide(rng) };
  if (kind === 'decision') return { kind, minute, openSide: pickSide(rng), best: rng.int(2) ? 'shot' : 'pass' };
  return { kind, minute };
}

/** Resolves one moment. Depends on the setup, the moment and the input only, never on the match state. */
export function playMomentV4(setup: MatchSetup, moment: Moment, chance: number, input: ChanceInput): ChanceOutcome {
  if ('tactic' in input) return { kind: 'halftime', outcome: input.tactic };
  if (moment.kind === 'penalty' && 'shot' in input) {
    const rng = createRng(deriveSeed(setup.seed, chance));
    const keeper = clamp(setup.opponentGoalkeeping - PENALTY_KEEPER_MALUS, 1, 100);
    return { kind: 'penalty', ...resolveSkillShot(rng, input.shot, setup.shooting, keeper) };
  }
  if (moment.kind === 'decision') {
    const rng = createRng(deriveSeed(setup.seed, chance));
    if ('shot' in input) {
      const smart = moment.best === 'shot';
      const keeper = clamp(setup.opponentGoalkeeping + (smart ? 0 : WRONG_CALL_KEEPER_BONUS), 1, 100);
      return { kind: 'shot', ...resolveSkillShot(rng, input.shot, setup.shooting, keeper), smart };
    }
    if ('pass' in input) {
      const smart = moment.best === 'pass';
      const timed = gradeTiming(input.timing ?? 0) !== 'off';
      const odds = input.pass === moment.openSide
        ? clamp(PASS_OPEN_BASE + Math.trunc((setup.passing - 50) / 2) + (timed ? PASS_TIMING_BONUS : 0) - (smart ? 0 : WRONG_CALL_PASS_MALUS), 10, 95)
        : PASS_WRONG;
      return { kind: 'pass', outcome: rng.int(100) < odds ? 'assist' : 'lost', smart };
    }
  }
  // Shots, free kicks, passes and defense moments resolve exactly as in engine 3.
  return playV3(setup, { moments: indexed(moment, chance), opponentGoals: [] }, input);
}

/** A sparse moment list with `moment` at `chance`, for the engine 3 resolver. */
function indexed(moment: Moment, chance: number): Moment[] {
  const list: Moment[] = [];
  list[chance] = moment;
  return list;
}

export function assertInputV4(moment: Moment, input: ChanceInput): void {
  const { chance } = input;
  const kind = moment.kind;
  if ('tactic' in input) {
    if (kind !== 'halftime' || (input.tactic !== 'push' && input.tactic !== 'hold')) throw new EngineInputError(`chance ${chance} has an invalid tactic`);
    return;
  }
  if ('defense' in input) {
    if (kind !== 'defense' || (input.defense !== 'left' && input.defense !== 'right') || !inRange(input.timing, 0, 1000)) {
      throw new EngineInputError(`chance ${chance} has an invalid defense`);
    }
    return;
  }
  if ('pass' in input) {
    if ((kind !== 'pass' && kind !== 'decision') || (input.pass !== 'left' && input.pass !== 'right') || !inRange(input.timing, 0, 1000)) {
      throw new EngineInputError(`chance ${chance} has an invalid pass`);
    }
    return;
  }
  if (!('shot' in input) || (kind !== 'shot' && kind !== 'freekick' && kind !== 'penalty' && kind !== 'decision')) {
    throw new EngineInputError(`chance ${chance} expects a ${kind}`);
  }
  assertShot(chance, input.shot);
  if (input.shot.assisted !== undefined && typeof input.shot.assisted !== 'boolean') {
    throw new EngineInputError(`chance ${chance} has an invalid shot`);
  }
}

export function assertSetupV4(setup: MatchSetup): void {
  if (setup.chances > 8) throw new EngineInputError('chances must be 1..8 in engine 4');
  if (setup.pace !== undefined && (!Number.isInteger(setup.pace) || setup.pace < 1 || setup.pace > 100)) {
    throw new EngineInputError('pace must be an integer 1..100');
  }
  if (setup.role !== undefined && !ROLES.includes(setup.role)) throw new EngineInputError('unknown role');
}
