import type { EconomyConfig } from './config.ts';
import { computeRating } from './rating.ts';
import type { MatchReport, MatchTicket } from './types.ts';

export type ValidationReason =
  | 'ticket_wrong_player'
  | 'ticket_not_open'
  | 'ticket_expired'
  | 'stats_impossible'
  | 'too_short'
  | 'rating_mismatch'
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

/** MVP plausibility checks for a finished match (see the architecture doc). */
export function validateMatchReport(
  ticket: MatchTicket,
  report: MatchReport,
  ctx: ValidationContext,
  config: EconomyConfig,
): ValidationResult {
  const rejected: ValidationReason[] = [];
  const flagged: ValidationReason[] = [];

  if (ticket.playerId !== ctx.playerId) rejected.push('ticket_wrong_player');
  if (ticket.status !== 'open') rejected.push('ticket_not_open');
  if (ctx.now > ticket.expiresAt) rejected.push('ticket_expired');

  const counts = [report.shots, report.shotsOnTarget, report.goals];
  const wellFormed = counts.every((n) => Number.isInteger(n) && n >= 0);
  if (!wellFormed || report.goals > report.shotsOnTarget || report.shotsOnTarget > report.shots || report.shots > ticket.chances) {
    rejected.push('stats_impossible');
  }
  if (rejected.length > 0) return { rejected, flagged };

  if (!Number.isInteger(report.durationMs) || report.durationMs < ticket.chances * config.minMsPerChance) {
    flagged.push('too_short');
  }
  if (report.rating !== computeRating({ chances: ticket.chances, ...report })) {
    flagged.push('rating_mismatch');
  }
  if (report.shots >= config.conversionCheckMinShots && report.goals * 100 > report.shots * config.maxConversionPct) {
    flagged.push('conversion_too_high');
  }
  if (ctx.lastFinishedAt !== null && ctx.now - ctx.lastFinishedAt < config.minMsBetweenMatches) {
    flagged.push('too_soon_after_last_match');
  }

  return { rejected, flagged };
}
