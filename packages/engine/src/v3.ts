// Engine 3, the skill engine (GDD v3.1 section 4.1, "motor v2" in the design docs).
//
// What the player's hands decide, on top of the trained stats:
// - shots: the spread shrinks with power-bar timing, a perfect release makes the
//   keeper 20 points worse, and the keeper reads shots aimed at the middle;
// - passes: picking the open teammate and releasing on time;
// - defense: two of the opponent's four attacks are played by the player, who reads
//   the forward's shoulder and times the slide.
import { createRng, deriveSeed } from './prng.ts';
import { clamp, type ShotInput, type ShotOutcome } from './shot.ts';
import { assertShot, FREEKICK_KEEPER_BONUS, inRange, pickSide, PLAN_STREAM } from './v2.ts';
import {
  EngineInputError, type ChanceInput, type ChanceOutcome, type DefenseOutcome, type MatchPlan, type MatchSetup, type Moment, type MomentKind,
  type Side,
} from './types.ts';

/** Timing bars (shot power, pass, slide) are 0..1000; this is the ideal stop. */
export const TIMING_TARGET = 750;
/** |timing − target| within this is perfect: on a shot the keeper is beaten more often. */
export const PERFECT_WINDOW = 60;
/** |timing − target| within this is on time: the pass and slide bonuses apply. */
export const TIMED_WINDOW = 150;

/** Attacks the opponent gets, and how many of them the player defends. */
export const OPPONENT_ATTACKS = 4;
export const DEFENSE_MOMENTS = 2;

const OPPONENT_CONVERT_BASE = 20;
/** A forward who beats the defender is through on goal. */
const BEATEN_CONVERT_BASE = 40;
const STOP_READ_TIMED = 70;
const STOP_READ_ONLY = 35;
const STOP_WRONG = 10;

const SAVE_BASE = 70;
const SPREAD_PER_MISSING_STAT = 2;
const TIMING_SPREAD_DIV = 2;
const PERFECT_KEEPER_MALUS = 20;
/** Assisted shots behave like a release this far from the target: never perfect. */
const ASSISTED_TIMING_ERROR = 100;

const PASS_OPEN_BASE = 65;
const PASS_TIMING_BONUS = 15;
const PASS_WRONG = 10;

export type TimingGrade = 'perfect' | 'timed' | 'off';

export function gradeTiming(timing: number): TimingGrade {
  const error = Math.abs(timing - TIMING_TARGET);
  return error <= PERFECT_WINDOW ? 'perfect' : error <= TIMED_WINDOW ? 'timed' : 'off';
}

/** Total moments in an engine 3 match: the player's chances plus the defense moments. */
export const momentCountV3 = (chances: number) => chances + DEFENSE_MOMENTS;

export function planV3(setup: MatchSetup): MatchPlan {
  const rng = createRng(deriveSeed(setup.seed, PLAN_STREAM));
  const n = momentCountV3(setup.chances);

  // Two of the slots after the first (always a shot) are defense moments.
  const d1 = 1 + rng.int(n - 1);
  let d2 = 1 + rng.int(n - 2);
  if (d2 >= d1) d2 += 1;

  const slice = Math.trunc(84 / n);
  const moments: Moment[] = [];
  for (let i = 0; i < n; i++) {
    const minute = 5 + i * slice + rng.int(Math.max(1, slice - 2));
    if (i === d1 || i === d2) {
      moments.push({ kind: 'defense', minute, attackSide: pickSide(rng) });
      continue;
    }
    const roll = rng.int(100);
    const kind: MomentKind = i === 0 ? 'shot' : roll < 35 ? 'pass' : roll < 55 ? 'freekick' : 'shot';
    moments.push(kind === 'pass' ? { kind, minute, openSide: pickSide(rng) } : { kind, minute });
  }

  // The attacks the player does not defend.
  const convert = clamp(OPPONENT_CONVERT_BASE + Math.trunc(setup.opponentAttack / 5), 10, 60);
  const opponentGoals: number[] = [];
  for (let i = 0; i < OPPONENT_ATTACKS - DEFENSE_MOMENTS; i++) {
    const minute = 3 + rng.int(86);
    if (rng.int(100) < convert) opponentGoals.push(minute);
  }
  opponentGoals.sort((a, b) => a - b);

  return { moments, opponentGoals };
}

export function playV3(setup: MatchSetup, plan: MatchPlan, input: ChanceInput): ChanceOutcome {
  const moment = plan.moments[input.chance];
  if (!moment) throw new EngineInputError(`chance ${input.chance} is out of range`);
  const rng = createRng(deriveSeed(setup.seed, input.chance));

  if ('defense' in input) {
    return { kind: 'defense', outcome: resolveDefense(rng, setup, moment, input.defense, input.timing) };
  }
  if ('pass' in input) {
    const timed = gradeTiming(input.timing ?? 0) !== 'off';
    const chance = input.pass === moment.openSide
      ? clamp(PASS_OPEN_BASE + Math.trunc((setup.passing - 50) / 2) + (timed ? PASS_TIMING_BONUS : 0), 10, 95)
      : PASS_WRONG;
    return { kind: 'pass', outcome: rng.int(100) < chance ? 'assist' : 'lost' };
  }

  const freekick = moment.kind === 'freekick';
  // Free kicks reward passing technique too (curl over the wall); keepers get the wall.
  const shooting = freekick ? clamp(setup.shooting + Math.trunc((setup.passing - 50) * 2 / 5), 1, 100) : setup.shooting;
  const goalkeeping = freekick ? clamp(setup.opponentGoalkeeping + FREEKICK_KEEPER_BONUS, 1, 100) : setup.opponentGoalkeeping;
  return { kind: freekick ? 'freekick' : 'shot', ...resolveSkillShot(rng, input.shot, shooting, goalkeeping) };
}

/** A defense moment the player did not play: the forward runs at a defender who guessed. */
export function skippedDefenseV3(setup: MatchSetup, chance: number): DefenseOutcome {
  return beaten(createRng(deriveSeed(setup.seed, chance)), setup, STOP_WRONG);
}

function resolveSkillShot(rng: ReturnType<typeof createRng>, shot: ShotInput, shooting: number, goalkeeping: number) {
  const error = shot.assisted ? ASSISTED_TIMING_ERROR : Math.abs(shot.power - TIMING_TARGET);
  const perfect = error <= PERFECT_WINDOW;
  const spread = (100 - shooting) * SPREAD_PER_MISSING_STAT + Math.trunc(error / TIMING_SPREAD_DIV);

  const x = shot.aim + rng.range(-spread, spread);
  const y = shot.lift + rng.range(-spread, spread);
  const miss = (outcome: ShotOutcome) => ({ outcome, x, y, perfect });
  if (x < -1000 || x > 1000) return miss('wide');
  if (y > 1000) return miss('over');

  // The keeper covers the middle; corners beat him, a perfect strike beats him more often.
  const corner = Math.trunc(Math.max(Math.abs(x), Math.max(y, 0)) / 10); // 0..100
  const saveChance = clamp(
    SAVE_BASE + Math.trunc((goalkeeping - 50) / 2) - Math.trunc((corner * 45) / 100) - (perfect ? PERFECT_KEEPER_MALUS : 0),
    5, 95,
  );
  return miss(rng.int(100) < saveChance ? 'saved' : 'goal');
}

function resolveDefense(rng: ReturnType<typeof createRng>, setup: MatchSetup, moment: Moment, side: Side, timing: number): DefenseOutcome {
  const stop = side !== moment.attackSide ? STOP_WRONG : gradeTiming(timing) !== 'off' ? STOP_READ_TIMED : STOP_READ_ONLY;
  return beaten(rng, setup, stop);
}

function beaten(rng: ReturnType<typeof createRng>, setup: MatchSetup, stopChance: number): DefenseOutcome {
  if (rng.int(100) < stopChance) return 'stopped';
  const convert = clamp(BEATEN_CONVERT_BASE + Math.trunc(setup.opponentAttack / 4), 20, 85);
  return rng.int(100) < convert ? 'conceded' : 'survived';
}

export function assertInputV3(plan: MatchPlan, input: ChanceInput): void {
  const { chance } = input;
  const kind = plan.moments[chance]!.kind;
  if ('defense' in input) {
    if (kind !== 'defense' || (input.defense !== 'left' && input.defense !== 'right') || !inRange(input.timing, 0, 1000)) {
      throw new EngineInputError(`chance ${chance} has an invalid defense`);
    }
    return;
  }
  if ('pass' in input) {
    if (kind !== 'pass' || (input.pass !== 'left' && input.pass !== 'right') || !inRange(input.timing, 0, 1000)) {
      throw new EngineInputError(`chance ${chance} has an invalid pass`);
    }
    return;
  }
  if ((kind !== 'shot' && kind !== 'freekick') || !('shot' in input)) {
    throw new EngineInputError(`chance ${chance} expects a ${kind}`);
  }
  assertShot(chance, input.shot);
  if (input.shot.assisted !== undefined && typeof input.shot.assisted !== 'boolean') {
    throw new EngineInputError(`chance ${chance} has an invalid shot`);
  }
}
