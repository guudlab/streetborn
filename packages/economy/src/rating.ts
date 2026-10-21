export interface RatingInput {
  goals: number;
  assists: number;
  /** Shots that did not go in. */
  missed: number;
  /** Passes that lost the ball. */
  lost: number;
  result: 'W' | 'D' | 'L';
}

/**
 * Match rating x10 (GDD v2): starts at 6.0, goal +1.0, assist +0.7, missed
 * chance −0.5, turnover −0.3, team result ±0.3; clamped to 1.0..10.0.
 * Integer only, so client and server agree.
 */
export function computeRating({ goals, assists, missed, lost, result }: RatingInput): number {
  const team = result === 'W' ? 3 : result === 'L' ? -3 : 0;
  const raw = 60 + goals * 10 + assists * 7 - missed * 5 - lost * 3 + team;
  return Math.min(100, Math.max(10, raw));
}
