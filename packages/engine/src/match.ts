import { EngineInputError, type ChanceInput, type ChanceOutcome, type DefenseOutcome, type EngineVersion, type MatchPlan, type MatchResult, type MatchSetup, type TeamResult } from './types.ts';
import { assertInputV2, planV2, playV2 } from './v2.ts';
import { assertInputV3, momentCountV3, planV3, playV3, skippedDefenseV3 } from './v3.ts';
import { assertInputV4, assertSetupV4, playMomentV4, runV4 } from './v4.ts';
import { runV5 } from './v5.ts';

/**
 * The version new matches are played with. Bump when a change alters the
 * outcome of an existing seed + inputs, and keep the old path for replays.
 */
export const ENGINE_VERSION: EngineVersion = 5;
/** Versions this build can still replay. */
export const ENGINE_VERSIONS: readonly EngineVersion[] = [2, 3, 4, 5];

const versionOf = (setup: MatchSetup): EngineVersion => setup.engineVersion ?? 2;

/**
 * Number of moments in a match: the chances, plus the defense moments from engine 3 on.
 * Engines 4 and 5 fix the count at kick-off (it includes the half-time call).
 */
export function momentCount(setup: MatchSetup): number {
  const v = versionOf(setup);
  return v >= 4 ? planMatch(setup).moments.length : v === 3 ? momentCountV3(setup.chances) : setup.chances;
}

/**
 * The moments and opponent goals of a match. Same seed, same plan, on every device.
 * Engines 4 and 5 play the match on with the inputs so far: what comes after a moment depends
 * on how it went, what comes before it never changes.
 */
export function planMatch(setup: MatchSetup, inputs: readonly ChanceInput[] = []): MatchPlan {
  assertSetup(setup);
  const v = versionOf(setup);
  return v === 5 ? runV5(setup, inputs).plan : v === 4 ? runV4(setup, inputs).plan : v === 3 ? planV3(setup) : planV2(setup);
}

/**
 * Plays a whole match from the seed and the recorded inputs.
 *
 * Pure and deterministic: the client calls it while the player plays, and the
 * server calls it again with the same arguments to compute the real result.
 */
export function simulateMatch(setup: MatchSetup, inputs: readonly ChanceInput[]): MatchResult {
  assertSetup(setup);
  const v = versionOf(setup);
  let plan: MatchPlan;
  let outcomes: (ChanceOutcome | null)[];
  if (v >= 4) {
    ({ plan, outcomes } = v === 5 ? runV5(setup, inputs) : runV4(setup, inputs));
    const stray = inputs.find((i) => i.chance >= plan.moments.length);
    if (stray) throw new EngineInputError(`chance ${stray.chance} is out of range`);
  } else {
    plan = planMatch(setup);
    outcomes = Array.from({ length: plan.moments.length }, () => null);
    for (const input of inputs) {
      assertInput(setup, plan, input, outcomes);
      outcomes[input.chance] = playChance(setup, plan, input);
    }
  }

  let shots = 0, shotsOnTarget = 0, goals = 0, assists = 0, lost = 0, defenseStops = 0, conceded = 0, smartChoices = 0;
  for (const [i, o] of outcomes.entries()) {
    // An unplayed defense moment still happens; the player just was not there.
    const defense = o?.kind === 'defense' ? o.outcome : plan.moments[i]!.kind === 'defense' ? skippedDefenseV3(setup, i) : null;
    if (defense === 'stopped' && o) defenseStops += 1;
    if (defense === 'conceded') conceded += 1;
    if (o === null || o.kind === 'defense' || o.kind === 'halftime') continue;
    if (o.smart) smartChoices += 1;
    if (o.kind === 'pass') {
      if (o.outcome === 'assist') assists += 1;
      else lost += 1;
      continue;
    }
    shots += 1;
    if (o.outcome === 'goal' || o.outcome === 'saved') shotsOnTarget += 1;
    if (o.outcome === 'goal') goals += 1;
  }
  const assistedShots = inputs.filter((i) => 'shot' in i && i.shot.assisted === true).length;

  const mateGoals = plan.mateGoals?.length ?? 0;
  const us = goals + assists + mateGoals;
  const them = plan.opponentGoals.length + conceded;
  const result: TeamResult = us > them ? 'W' : us === them ? 'D' : 'L';
  return {
    shots, shotsOnTarget, goals, assists, missed: shots - goals, lost, defenseStops,
    assistedShots: v >= 3 ? assistedShots : 0,
    mateGoals, smartChoices,
    us, them, result, outcomes,
  };
}

/**
 * What happens in a defense moment the player let pass. The same outcome
 * simulateMatch counts, so the client can show it as the match goes on.
 */
export function skippedDefense(setup: MatchSetup, chance: number): DefenseOutcome {
  return skippedDefenseV3(setup, chance);
}

/** Resolves one moment. Exposed so the client can show each outcome as it is played. */
export function playChance(setup: MatchSetup, plan: MatchPlan, input: ChanceInput): ChanceOutcome {
  const v = versionOf(setup);
  if (v >= 4) {
    // Engine 5 resolves the player's moments exactly as engine 4.
    const moment = plan.moments[input.chance];
    if (!moment) throw new EngineInputError(`chance ${input.chance} is out of range`);
    assertInputV4(moment, input);
    return playMomentV4(setup, moment, input.chance, input);
  }
  return v === 3 ? playV3(setup, plan, input) : playV2(setup, plan, input);
}

function assertSetup(setup: MatchSetup): void {
  if (setup.engineVersion !== undefined && !ENGINE_VERSIONS.includes(setup.engineVersion)) {
    throw new EngineInputError(`engine version ${setup.engineVersion} is not supported`);
  }
  if (!Number.isInteger(setup.seed) || setup.seed < 0 || setup.seed > 0xffffffff) {
    throw new EngineInputError('seed must be a uint32');
  }
  if (!Number.isInteger(setup.chances) || setup.chances < 1 || setup.chances > 12) {
    throw new EngineInputError('chances must be 1..12');
  }
  if (versionOf(setup) >= 4) assertSetupV4(setup);
  for (const skill of [setup.shooting, setup.passing, setup.opponentGoalkeeping, setup.opponentAttack]) {
    if (!Number.isInteger(skill) || skill < 1 || skill > 100) {
      throw new EngineInputError('skills must be integers 1..100');
    }
  }
}

function assertInput(setup: MatchSetup, plan: MatchPlan, input: ChanceInput, outcomes: (ChanceOutcome | null)[]): void {
  const { chance } = input;
  if (!Number.isInteger(chance) || chance < 0 || chance >= plan.moments.length) {
    throw new EngineInputError(`chance ${chance} is out of range`);
  }
  if (outcomes[chance] !== null) {
    throw new EngineInputError(`chance ${chance} was played twice`);
  }
  if (versionOf(setup) === 3) assertInputV3(plan, input);
  else assertInputV2(plan, input);
}
