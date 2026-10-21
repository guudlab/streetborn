import { createRng, deriveSeed, type Rng } from './prng.ts';
import {
  clamp, resolvePass, resolveShotDetail, type PassOutcome, type ShotInput, type ShotOutcome,
} from './shot.ts';

/** Bump when a change alters the outcome of an existing seed + inputs. */
export const ENGINE_VERSION = 2;

/** Issued by the server in the match ticket. Skills are integers 1..100. */
export interface MatchSetup {
  seed: number;
  /** Number of chances (pozisyon) the player gets in this match. */
  chances: number;
  shooting: number;
  passing: number;
  opponentGoalkeeping: number;
  /** How dangerous the opponent is; drives the goals the player's team concedes. */
  opponentAttack: number;
}

export type MomentKind = 'shot' | 'pass' | 'freekick';
export type Side = 'left' | 'right';

export interface Moment {
  kind: MomentKind;
  minute: number;
  /** Pass moments only: the side of the unmarked teammate. */
  openSide?: Side;
}

/** What happens in a match apart from the player's actions. Derived from the seed alone. */
export interface MatchPlan {
  moments: Moment[];
  /** Minutes in which the opponent scores, ascending. */
  opponentGoals: number[];
}

/** One recorded player action. Chances the player did not take are simply absent. */
export type ChanceInput =
  | { chance: number; shot: ShotInput }
  | { chance: number; pass: Side };

export type ChanceOutcome =
  | { kind: 'shot' | 'freekick'; outcome: ShotOutcome; x: number; y: number }
  | { kind: 'pass'; outcome: PassOutcome };

export type TeamResult = 'W' | 'D' | 'L';

export interface MatchResult {
  shots: number;
  shotsOnTarget: number;
  goals: number;
  assists: number;
  /** Shots that did not go in. */
  missed: number;
  /** Passes that lost the ball. */
  lost: number;
  /** Team goals: the player's goals plus the teammates' goals from assists. */
  us: number;
  them: number;
  result: TeamResult;
  /** Outcome per chance index; `null` when the chance was not taken. */
  outcomes: (ChanceOutcome | null)[];
}

export class EngineInputError extends Error {}

const PLAN_STREAM = 1_000_000;
/** Keepers get a small edge on free kicks (the wall, a set position). */
const FREEKICK_KEEPER_BONUS = 10;

/** The moments and opponent goals of a match. Same seed, same plan, on every device. */
export function planMatch(setup: MatchSetup): MatchPlan {
  assertSetup(setup);
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

/**
 * Plays a whole match from the seed and the recorded inputs.
 *
 * Pure and deterministic: the client calls it while the player plays, and the
 * server calls it again with the same arguments to compute the real result.
 */
export function simulateMatch(setup: MatchSetup, inputs: readonly ChanceInput[]): MatchResult {
  const plan = planMatch(setup);
  const outcomes: (ChanceOutcome | null)[] = Array.from({ length: setup.chances }, () => null);

  for (const input of inputs) {
    assertInput(setup, plan, input, outcomes);
    outcomes[input.chance] = playChance(setup, plan, input);
  }

  let shots = 0, shotsOnTarget = 0, goals = 0, assists = 0, lost = 0;
  for (const o of outcomes) {
    if (o === null) continue;
    if (o.kind === 'pass') {
      if (o.outcome === 'assist') assists += 1;
      else lost += 1;
      continue;
    }
    shots += 1;
    if (o.outcome === 'goal' || o.outcome === 'saved') shotsOnTarget += 1;
    if (o.outcome === 'goal') goals += 1;
  }

  const us = goals + assists;
  const them = plan.opponentGoals.length;
  const result: TeamResult = us > them ? 'W' : us === them ? 'D' : 'L';
  return { shots, shotsOnTarget, goals, assists, missed: shots - goals, lost, us, them, result, outcomes };
}

/** Resolves one chance. Exposed so the client can show each outcome as it is played. */
export function playChance(setup: MatchSetup, plan: MatchPlan, input: ChanceInput): ChanceOutcome {
  const moment = plan.moments[input.chance];
  if (!moment) throw new EngineInputError(`chance ${input.chance} is out of range`);
  const rng = createRng(deriveSeed(setup.seed, input.chance));
  if ('pass' in input) {
    return { kind: 'pass', outcome: resolvePass(rng, input.pass === moment.openSide, setup.passing) };
  }
  const freekick = moment.kind === 'freekick';
  // Free kicks reward passing technique too (curl over the wall).
  const shooting = freekick ? clamp(setup.shooting + Math.trunc((setup.passing - 50) * 2 / 5), 1, 100) : setup.shooting;
  const goalkeeping = freekick ? clamp(setup.opponentGoalkeeping + FREEKICK_KEEPER_BONUS, 1, 100) : setup.opponentGoalkeeping;
  const d = resolveShotDetail(rng, input.shot, { shooting, goalkeeping });
  return { kind: moment.kind === 'freekick' ? 'freekick' : 'shot', outcome: d.outcome, x: d.x, y: d.y };
}

function pickSide(rng: Rng): Side {
  return rng.int(2) === 0 ? 'left' : 'right';
}

function assertSetup(setup: MatchSetup): void {
  if (!Number.isInteger(setup.seed) || setup.seed < 0 || setup.seed > 0xffffffff) {
    throw new EngineInputError('seed must be a uint32');
  }
  if (!Number.isInteger(setup.chances) || setup.chances < 1 || setup.chances > 12) {
    throw new EngineInputError('chances must be 1..12');
  }
  for (const skill of [setup.shooting, setup.passing, setup.opponentGoalkeeping, setup.opponentAttack]) {
    if (!Number.isInteger(skill) || skill < 1 || skill > 100) {
      throw new EngineInputError('skills must be integers 1..100');
    }
  }
}

function assertInput(setup: MatchSetup, plan: MatchPlan, input: ChanceInput, outcomes: (ChanceOutcome | null)[]): void {
  const { chance } = input;
  if (!Number.isInteger(chance) || chance < 0 || chance >= setup.chances) {
    throw new EngineInputError(`chance ${chance} is out of range`);
  }
  if (outcomes[chance] !== null) {
    throw new EngineInputError(`chance ${chance} was played twice`);
  }
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
  const { shot } = input;
  const inRange = (v: number, min: number, max: number) => Number.isInteger(v) && v >= min && v <= max;
  if (!inRange(shot.aim, -1000, 1000) || !inRange(shot.lift, 0, 1000) || !inRange(shot.power, 0, 1000)) {
    throw new EngineInputError(`chance ${chance} has an invalid shot`);
  }
}
