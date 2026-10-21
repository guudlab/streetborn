export type Currency = 'coin' | 'gem';

/**
 * Where an item came from. The future chain layer only lets items whose source
 * is not 'coin' be released as NFTs, so this must be set on every grant.
 */
export type ItemSource = 'coin' | 'gem' | 'first_sale' | 'season' | 'achievement';

export type MatchStatus = 'open' | 'finished' | 'expired';

/** Server-side match row, created by match-start. Times are epoch milliseconds. */
export interface MatchTicket {
  matchId: string;
  playerId: string;
  seed: number;
  chances: number;
  issuedAt: number;
  expiresAt: number;
  status: MatchStatus;
}

/** What the client sends to match-finish. Rating is x10 (7.5 → 75). */
export interface MatchReport {
  matchId: string;
  shots: number;
  shotsOnTarget: number;
  goals: number;
  rating: number;
  durationMs: number;
  /** Hash of the recorded inputs, kept so a later replay can be matched to this report. */
  inputHash: string;
}
