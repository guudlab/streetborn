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

/** The server's replay of a finished match: what validation and rewards look at. */
export interface MatchStats {
  shots: number;
  goals: number;
  assists: number;
  /** x10 */
  rating: number;
  result: 'W' | 'D' | 'L';
  durationMs: number;
}
