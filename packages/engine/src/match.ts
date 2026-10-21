import { createRng, deriveSeed } from './prng.ts';
import { resolveShot, type ShotInput, type ShotOutcome } from './shot.ts';

/** Issued by the server in the match ticket. */
export interface MatchSetup {
  seed: number;
  /** Number of chances (pozisyon) the player gets in this match. */
  chances: number;
  shooting: number;
  opponentGoalkeeping: number;
}

/** One recorded player action. Chances the player did not take are simply absent. */
export interface ChanceInput {
  chance: number;
  shot: ShotInput;
}

export interface MatchResult {
  shots: number;
  shotsOnTarget: number;
  goals: number;
  /** Outcome per chance index; `null` when the chance was not taken. */
  outcomes: (ShotOutcome | null)[];
}

export class EngineInputError extends Error {}

/**
 * Plays a whole match from the seed and the recorded inputs.
 *
 * Pure and deterministic: the client calls it while the player plays, and the
 * server can call it again with the same arguments to replay and verify a match.
 */
export function simulateMatch(setup: MatchSetup, inputs: readonly ChanceInput[]): MatchResult {
  assertSetup(setup);
  const outcomes: (ShotOutcome | null)[] = Array.from({ length: setup.chances }, () => null);

  for (const input of inputs) {
    assertInput(setup, input, outcomes);
    const rng = createRng(deriveSeed(setup.seed, input.chance));
    outcomes[input.chance] = resolveShot(rng, input.shot, {
      shooting: setup.shooting,
      goalkeeping: setup.opponentGoalkeeping,
    });
  }

  let shots = 0;
  let shotsOnTarget = 0;
  let goals = 0;
  for (const outcome of outcomes) {
    if (outcome === null) continue;
    shots += 1;
    if (outcome === 'goal' || outcome === 'saved') shotsOnTarget += 1;
    if (outcome === 'goal') goals += 1;
  }

  return { shots, shotsOnTarget, goals, outcomes };
}

function assertSetup(setup: MatchSetup): void {
  if (!Number.isInteger(setup.seed) || setup.seed < 0 || setup.seed > 0xffffffff) {
    throw new EngineInputError('seed must be a uint32');
  }
  if (!Number.isInteger(setup.chances) || setup.chances < 1 || setup.chances > 30) {
    throw new EngineInputError('chances must be 1..30');
  }
  for (const skill of [setup.shooting, setup.opponentGoalkeeping]) {
    if (!Number.isInteger(skill) || skill < 1 || skill > 100) {
      throw new EngineInputError('skills must be integers 1..100');
    }
  }
}

function assertInput(setup: MatchSetup, input: ChanceInput, outcomes: (ShotOutcome | null)[]): void {
  const { chance, shot } = input;
  if (!Number.isInteger(chance) || chance < 0 || chance >= setup.chances) {
    throw new EngineInputError(`chance ${chance} is out of range`);
  }
  if (outcomes[chance] !== null) {
    throw new EngineInputError(`chance ${chance} was played twice`);
  }
  const inRange = (v: number, min: number, max: number) => Number.isInteger(v) && v >= min && v <= max;
  if (!inRange(shot.aim, -1000, 1000) || !inRange(shot.lift, 0, 1000) || !inRange(shot.power, 0, 1000)) {
    throw new EngineInputError(`chance ${chance} has an invalid shot`);
  }
}
