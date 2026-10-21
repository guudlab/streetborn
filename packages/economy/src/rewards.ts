import type { EconomyConfig } from './config.ts';
import type { MatchReport } from './types.ts';

export interface MatchReward {
  coin: number;
  xp: number;
  /** True when the daily cap cut the coin reward. */
  capped: boolean;
}

/**
 * Reward for a finished match. A flagged match pays only the participation base.
 * `earnedToday` is the coin this player already earned from matches today.
 */
export function matchReward(
  report: Pick<MatchReport, 'goals' | 'rating'>,
  flagged: boolean,
  earnedToday: number,
  config: EconomyConfig,
): MatchReward {
  let coin = config.matchCoinBase;
  let xp = config.matchXpBase;

  if (!flagged) {
    coin += report.goals * config.coinPerGoal;
    if (report.rating >= config.ratingBonusFrom) coin += config.ratingBonusCoin;
    xp += report.goals * config.xpPerGoal;
  }

  const room = Math.max(0, config.dailyMatchCoinCap - earnedToday);
  return { coin: Math.min(coin, room), xp, capped: coin > room };
}
