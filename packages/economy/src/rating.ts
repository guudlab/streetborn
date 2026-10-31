export interface RatingInput {
  goals: number;
  assists: number;
  /** Shots that did not go in. */
  missed: number;
  /** Passes that lost the ball. */
  lost: number;
  result: 'W' | 'D' | 'L';
  /** Engine 3: attacks stopped in defense moments. */
  defenseStops?: number;
  /** Engine 3: shots taken with the assisted power option. */
  assistedShots?: number;
  /** Engine 4: decision moments where the player made the right call. */
  smartChoices?: number;
}

/** Each stopped attack adds 0.5 (GDD v3.1 4.1). */
export const RATING_PER_DEFENSE_STOP = 5;
/** Engine 4: the right call in a decision moment (shot or pass) adds 0.2. */
export const RATING_PER_SMART_CHOICE = 2;
/** A match with any assisted shot is rated at most 7.0, so assisted play stays an accessibility option. */
export const ASSISTED_RATING_CAP = 70;

/**
 * Match rating x10 (GDD v2, v3.1): starts at 6.0, goal +1.0, assist +0.7, missed
 * chance −0.5, turnover −0.3, stopped attack +0.5, right call +0.2, team result ±0.3; clamped to
 * 1.0..10.0, and to 7.0 when a shot was assisted. Integer only, so client and server agree.
 */
export function computeRating({ goals, assists, missed, lost, result, defenseStops = 0, assistedShots = 0, smartChoices = 0 }: RatingInput): number {
  const team = result === 'W' ? 3 : result === 'L' ? -3 : 0;
  const raw = 60 + goals * 10 + assists * 7 - missed * 5 - lost * 3 + defenseStops * RATING_PER_DEFENSE_STOP
    + smartChoices * RATING_PER_SMART_CHOICE + team;
  const max = assistedShots > 0 ? ASSISTED_RATING_CAP : 100;
  return Math.min(max, Math.max(10, raw));
}
