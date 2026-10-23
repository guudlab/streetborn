export { DEFAULT_CONFIG, type EconomyConfig } from './config.ts';
export type { Currency, ItemSource, MatchStatus, MatchTicket, MatchStats } from './types.ts';
export { computeRating, ASSISTED_RATING_CAP, RATING_PER_DEFENSE_STOP, type RatingInput } from './rating.ts';
export { xpNeed, levelForXp } from './levels.ts';
export {
  validateMatch,
  type ValidationReason,
  type ValidationContext,
  type ValidationResult,
} from './validate.ts';
export { matchReward, type MatchReward, type RewardInput } from './rewards.ts';
export { currentEnergy, spendEnergy, type EnergyState } from './energy.ts';
