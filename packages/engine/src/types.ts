import type { PassOutcome, ShotInput, ShotOutcome } from './shot.ts';

/**
 * 2: shots, passes and free kicks; the opponent's goals come from the seed alone.
 * 3: skill engine (GDD v3.1 "motor v2"): power timing, pass timing and defense moments.
 * 4: live match: 90 simulated minutes with commentary; the player plays the key moments,
 *    and what he does there changes the rest of the match.
 * 5: attack chain: every five minutes one team attacks in two or three steps the
 *    commentary and the radar follow; set pieces come from fouls, the player's moments
 *    are the last step of an attack, and the opponent's strength sets who has the ball.
 */
export type EngineVersion = 2 | 3 | 4 | 5;

/** The player's position (character creation); engine 4 picks the mix of moments from it. */
export type Role = 'bitirici' | 'oyunKurucu' | 'kanat';
export const ROLES: readonly Role[] = ['bitirici', 'oyunKurucu', 'kanat'];

/** Engine 5: a lane of the pitch, seen from the attacking team. */
export type Spot = 'left' | 'center' | 'right';

/** Engine 4: the half-time call. No call plays the second half balanced. */
export type Tactic = 'push' | 'hold';

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
  /** Engine 4: pace, 1..100. Fast players get on the ball more often. */
  pace?: number;
  /** Engine 4: the position, which sets the mix of moments. */
  role?: Role;
}

/**
 * Engine 4 adds `penalty`, `decision` (the player picks a shot or a pass) and
 * `halftime` (the half-time call, not a play).
 */
export type MomentKind = 'shot' | 'pass' | 'freekick' | 'defense' | 'penalty' | 'decision' | 'halftime';
export type Side = 'left' | 'right';

export interface Moment {
  kind: MomentKind;
  minute: number;
  /** Pass and decision moments: the side of the unmarked teammate. */
  openSide?: Side;
  /** Decision moments (engine 4): what the situation calls for; the other choice is harder. */
  best?: 'shot' | 'pass';
  /** Defense moments only (engine 3): where the forward goes; his shoulder drops to this side first. */
  attackSide?: Side;
  /** Engine 5: where the shot or the free kick is taken from. */
  spot?: Spot;
  /** Engine 5: the teammate who set the moment up (0..3), for the commentary and the scene. */
  mate?: number;
  /** Engine 5, pass and decision moments: the teammates on the left and on the right (0..3). */
  mates?: [number, number];
}

/**
 * Something that happens without the player (engine 4), for the commentary.
 * Engine 5 also tells how each attack gets there: `win` (the ball is won), `counter`,
 * `attack` (into the final third), `foul` (a free kick), `penalty` (a foul in the box),
 * `run` and `space` (what a decision moment calls for) and `lost` (the attack dies).
 */
export interface MatchEvent {
  minute: number;
  team: 'us' | 'them';
  kind: 'goal' | 'save' | 'miss' | 'post' | 'corner' | 'card' | 'offside'
    | 'win' | 'counter' | 'attack' | 'foul' | 'penalty' | 'run' | 'space' | 'lost';
  /** Which teammate (or opponent) it was, 0..3. */
  who: number;
  /** Which line of commentary tells it, 0..3. */
  v: number;
  /** Engine 5: where the ball is, 0..100 on both axes; we attack toward x = 100, y = 0 is the top touchline. */
  x?: number;
  y?: number;
  /** Engine 5: the shot came from a set piece. */
  set?: 'freekick' | 'penalty';
  /** Engine 5: this step hands the ball to the player; his moment follows. */
  me?: boolean;
}

/**
 * What happens in a match apart from the player's actions. Engines 2 and 3 derive it
 * from the seed alone; engine 4 also from the moments played so far.
 */
export interface MatchPlan {
  moments: Moment[];
  /** Minutes in which the opponent scores from attacks the player does not defend, ascending. */
  opponentGoals: number[];
  /** Engine 4: minutes in which a teammate scores on his own, ascending. */
  mateGoals?: number[];
  /** Engine 4: everything that happens off the player's moments, by minute. */
  events?: MatchEvent[];
  /** Engine 5: who is pressing at the start of each five-minute slice, −2..2 (positive: us). */
  momentum?: number[];
}

/**
 * One recorded player action. `chance` is the index of the moment in the plan.
 * Moments the player did not play are simply absent.
 * Timings are where the player stopped the timing bar, 0..1000 (engine 3).
 */
export type ChanceInput =
  | { chance: number; shot: ShotInput }
  | { chance: number; pass: Side; timing?: number }
  | { chance: number; defense: Side; timing: number }
  | { chance: number; tactic: Tactic };

/** A defense moment: the player won the ball, or was beaten and the forward scored or missed. */
export type DefenseOutcome = 'stopped' | 'conceded' | 'survived';

/** `smart` is set on decision moments: whether the player made the call the situation asked for. */
export type ChanceOutcome =
  | { kind: 'shot' | 'freekick' | 'penalty'; outcome: ShotOutcome; x: number; y: number; perfect?: boolean; smart?: boolean }
  | { kind: 'pass'; outcome: PassOutcome; smart?: boolean }
  | { kind: 'defense'; outcome: DefenseOutcome }
  | { kind: 'halftime'; outcome: Tactic };

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
  /** Engine 4: goals the teammates scored on their own. */
  mateGoals: number;
  /** Engine 4: decision moments where the player made the right call. */
  smartChoices: number;
  /** Team goals: the player's goals, the teammates' goals from assists and (engine 4) their own goals. */
  us: number;
  them: number;
  result: TeamResult;
  /** Outcome per moment index; `null` when the moment was not played. */
  outcomes: (ChanceOutcome | null)[];
}

export class EngineInputError extends Error {}
