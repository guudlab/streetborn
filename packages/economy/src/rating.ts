export interface RatingInput {
  chances: number;
  shots: number;
  shotsOnTarget: number;
  goals: number;
}

/** Match rating x10, from 30 (3.0) to 100 (10.0). Integer only, so client and server agree. */
export function computeRating({ chances, shots, shotsOnTarget, goals }: RatingInput): number {
  const missed = shots - shotsOnTarget;
  const skipped = chances - shots;
  const raw = 60 + goals * 10 + (shotsOnTarget - goals) * 2 - missed * 3 - skipped * 2;
  return Math.min(100, Math.max(30, raw));
}
