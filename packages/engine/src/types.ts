import type { PassOutcome, ShotInput, ShotOutcome } from './shot.ts';

/**
 * 2: shots, passes and free kicks; the opponent's goals come from the seed alone.
 * 3: skill engine (GDD v3.1 "motor v2"): power timing, pass timing and defense moments.
 */
export type EngineVersion = 2 | 3;

/** Issued by the server in the match ticket. Skills are integers 1..100. */
export interface MatchSetup {
  /** Absent on tickets issued before engine 3, which are all engine 2. */
  engineVersion?: EngineVersion;
  seed: number;
  /** Number of attacking chances (pozisyon) the player gets in this match. */
  chances: number;
  shooting: number;
  passing: number;
  opponentGoalkeeping: number;
  /** How dangerous the opponent is; drives the goals the player's team concedes. */
  opponentAttack: number;
}

export type MomentKind = 'shot' | 'pass' | 'freekick' | 'defense';
export type Side = 'left' | 'right';

export interface Moment {
  kind: MomentKind;
  minute: number;
  /** Pass moments only: the side of the unmarked teammate. */
  openSide?: Side;
  /** Defense moments only (engine 3): where the forward goes; his shoulder drops to this side first. */
  attackSide?: Side;
}

/** What happens in a match apart from the player's actions. Derived from the seed alone. */
export interface MatchPlan {
  moments: Moment[];
  /** Minutes in which the opponent scores from attacks the player does not defend, ascending. */
  opponentGoals: number[];
}

/**
 * One recorded player action. `chance` is the index of the moment in the plan.
 * Moments the player did not play are simply absent.
 * Timings are where the player stopped the timing bar, 0..1000 (engine 3).
 */
export type ChanceInput =
  | { chance: number; shot: ShotInput }
  | { chance: number; pass: Side; timing?: number }
  | { chance: number; defense: Side; timing: number };

/** A defense moment: the player won the ball, or was beaten and the forward scored or missed. */
export type DefenseOutcome = 'stopped' | 'conceded' | 'survived';

export type ChanceOutcome =
  | { kind: 'shot' | 'freekick'; outcome: ShotOutcome; x: number; y: number; perfect?: boolean }
  | { kind: 'pass'; outcome: PassOutcome }
  | { kind: 'defense'; outcome: DefenseOutcome };

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
  /** Opponent attacks the player stopped in defense moments. */
  defenseStops: number;
  /** Shots taken with the assisted power option. */
  assistedShots: number;
  /** Team goals: the player's goals plus the teammates' goals from assists. */
  us: number;
  them: number;
  result: TeamResult;
  /** Outcome per moment index; `null` when the moment was not played. */
  outcomes: (ChanceOutcome | null)[];
}

export class EngineInputError extends Error {}
