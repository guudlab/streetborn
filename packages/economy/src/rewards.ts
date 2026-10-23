import type { EconomyConfig } from './config.ts';

export interface RewardInput {
  goals: number;
  assists: number;
  /** x10 */
  rating: number;
  result: 'W' | 'D' | 'L';
}

export interface MatchReward {
  coin: number;
  xp: number;
  /** True when the daily cap cut the coin reward. */
  capped: boolean;
}

/**
 * Reward for a finished match. A flagged match pays only the participation base.
 * `earnedToday` is the coin this player already earned from matches today. A club
 * contract multiplies both the coin and the daily cap (GDD v3.1: ×1.5 to ×2).
 */
export function matchReward(
  report: RewardInput,
  flagged: boolean,
  earnedToday: number,
  config: EconomyConfig,
  multiplierX100 = 100,
): MatchReward {
  let coin = config.matchCoinBase;
  let xp = config.matchXpBase;

  if (!flagged) {
    coin += report.goals * config.coinPerGoal + report.assists * config.coinPerAssist;
    if (report.result === 'W') coin += config.winBonusCoin;
    if (report.rating >= config.ratingBonusFrom) coin += config.ratingBonusCoin;
    xp += report.goals * config.xpPerGoal + report.assists * config.xpPerAssist;
    xp += Math.trunc((Math.max(0, report.rating - 60) * config.xpPerRatingPoint) / 10);
  }

  coin = Math.trunc((coin * multiplierX100) / 100);
  const room = Math.max(0, Math.trunc((config.dailyMatchCoinCap * multiplierX100) / 100) - earnedToday);
  return { coin: Math.min(coin, room), xp, capped: coin > room };
}
