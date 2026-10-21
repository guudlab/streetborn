import type { EconomyConfig } from './config.ts';
import type { MatchStats, MatchTicket } from './types.ts';

export type ValidationReason =
  | 'ticket_wrong_player'
  | 'ticket_not_open'
  | 'ticket_expired'
  | 'too_short'
  | 'conversion_too_high'
  | 'too_soon_after_last_match';

export interface ValidationContext {
  playerId: string;
  now: number;
  /** When this player's previous match finished, if any. */
  lastFinishedAt: number | null;
}

export interface ValidationResult {
  /** Hard failures: no reward at all, the report is rejected. */
  rejected: ValidationReason[];
  /** Soft failures: participation reward only, the match is flagged. */
  flagged: ValidationReason[];
}

/**
 * Checks a finished match. The stats come from the server replaying the
 * recorded inputs, so they are always consistent; what is left to check is
 * the ticket and whether the way it was played is believable.
 */
export function validateMatch(
  ticket: MatchTicket,
  stats: MatchStats,
  ctx: ValidationContext,
  config: EconomyConfig,
): ValidationResult {
  const rejected: ValidationReason[] = [];
  const flagged: ValidationReason[] = [];

  if (ticket.playerId !== ctx.playerId) rejected.push('ticket_wrong_player');
  if (ticket.status !== 'open') rejected.push('ticket_not_open');
  if (ctx.now > ticket.expiresAt) rejected.push('ticket_expired');
  if (rejected.length > 0) return { rejected, flagged };

  if (!Number.isInteger(stats.durationMs) || stats.durationMs < ticket.chances * config.minMsPerChance) {
    flagged.push('too_short');
  }
  if (stats.shots >= config.conversionCheckMinShots && stats.goals * 100 > stats.shots * config.maxConversionPct) {
    flagged.push('conversion_too_high');
  }
  if (ctx.lastFinishedAt !== null && ctx.now - ctx.lastFinishedAt < config.minMsBetweenMatches) {
    flagged.push('too_soon_after_last_match');
  }

  return { rejected, flagged };
}
