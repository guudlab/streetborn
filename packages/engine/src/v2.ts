// Engine 2: kept unchanged so matches stored with engine_version 2 replay to the
// same result. New matches use engine 3 (v3.ts).
import { createRng, deriveSeed, type Rng } from './prng.ts';
import { clamp, resolvePass, resolveShotDetail } from './shot.ts';
import {
  EngineInputError, type ChanceInput, type ChanceOutcome, type MatchPlan, type MatchSetup, type Moment, type MomentKind, type Side,
} from './types.ts';

export const PLAN_STREAM = 1_000_000;
/** Keepers get a small edge on free kicks (the wall, a set position). */
export const FREEKICK_KEEPER_BONUS = 10;

export function planV2(setup: MatchSetup): MatchPlan {
  const rng = createRng(deriveSeed(setup.seed, PLAN_STREAM));

  // One moment per equal slice of the 90 minutes, the first one always a shot.
  const slice = Math.trunc(84 / setup.chances);
  const moments: Moment[] = [];
  for (let i = 0; i < setup.chances; i++) {
    const minute = 5 + i * slice + rng.int(Math.max(1, slice - 2));
    const roll = rng.int(100);
    const kind: MomentKind = i === 0 ? 'shot' : roll < 35 ? 'pass' : roll < 55 ? 'freekick' : 'shot';
    moments.push(kind === 'pass' ? { kind, minute, openSide: pickSide(rng) } : { kind, minute });
  }

  // Up to three opponent chances; stronger opponents convert more of them.
  const convert = clamp(10 + Math.trunc(setup.opponentAttack / 3), 10, 60);
  const opponentGoals: number[] = [];
  for (let i = 0; i < 3; i++) {
    const minute = 3 + rng.int(86);
    if (rng.int(100) < convert) opponentGoals.push(minute);
  }
  opponentGoals.sort((a, b) => a - b);

  return { moments, opponentGoals };
}

export function playV2(setup: MatchSetup, plan: MatchPlan, input: ChanceInput): ChanceOutcome {
  const moment = plan.moments[input.chance];
  if (!moment) throw new EngineInputError(`chance ${input.chance} is out of range`);
  const rng = createRng(deriveSeed(setup.seed, input.chance));
  if ('pass' in input) {
    return { kind: 'pass', outcome: resolvePass(rng, input.pass === moment.openSide, setup.passing) };
  }
  if (!('shot' in input)) throw new EngineInputError(`chance ${input.chance} expects a shot`);
  const freekick = moment.kind === 'freekick';
  // Free kicks reward passing technique too (curl over the wall).
  const shooting = freekick ? clamp(setup.shooting + Math.trunc((setup.passing - 50) * 2 / 5), 1, 100) : setup.shooting;
  const goalkeeping = freekick ? clamp(setup.opponentGoalkeeping + FREEKICK_KEEPER_BONUS, 1, 100) : setup.opponentGoalkeeping;
  const d = resolveShotDetail(rng, input.shot, { shooting, goalkeeping });
  return { kind: moment.kind === 'freekick' ? 'freekick' : 'shot', outcome: d.outcome, x: d.x, y: d.y };
}

export function assertInputV2(plan: MatchPlan, input: ChanceInput): void {
  const { chance } = input;
  const kind = plan.moments[chance]!.kind;
  if ('pass' in input) {
    if (kind !== 'pass' || (input.pass !== 'left' && input.pass !== 'right')) {
      throw new EngineInputError(`chance ${chance} has an invalid pass`);
    }
    return;
  }
  if (kind === 'pass' || !('shot' in input)) {
    throw new EngineInputError(`chance ${chance} expects a pass`);
  }
  assertShot(chance, input.shot);
}

export function assertShot(chance: number, shot: { aim: number; lift: number; power: number }): void {
  if (!inRange(shot.aim, -1000, 1000) || !inRange(shot.lift, 0, 1000) || !inRange(shot.power, 0, 1000)) {
    throw new EngineInputError(`chance ${chance} has an invalid shot`);
  }
}

export const inRange = (v: unknown, min: number, max: number) => Number.isInteger(v) && (v as number) >= min && (v as number) <= max;

export function pickSide(rng: Rng): Side {
  return rng.int(2) === 0 ? 'left' : 'right';
}
