/**
 * Economy parameters. The live values are stored in the Supabase `config` table
 * so they can be tuned without an app release; these defaults seed that table
 * and are used in tests. Every number here is an assumption to be tuned with
 * soft launch data.
 */
export interface EconomyConfig {
  /** Coin every finished match pays, even a flagged one. */
  matchCoinBase: number;
  coinPerGoal: number;
  /** Extra coin for a rating >= ratingBonusFrom (rating is x10, so 75 = 7.5). */
  ratingBonusCoin: number;
  ratingBonusFrom: number;
  matchXpBase: number;
  xpPerGoal: number;
  /** Coin a player can earn from matches per day; the rest is cut. */
  dailyMatchCoinCap: number;

  energyMax: number;
  /** Seconds to regenerate one energy point. */
  energyRegenSeconds: number;
  matchEnergyCost: number;

  matchChances: number;
  ticketTtlSeconds: number;
  /** Shortest believable time to play one chance. */
  minMsPerChance: number;
  /** Shortest believable gap between two finished matches. */
  minMsBetweenMatches: number;
  /** Goals / shots above this (with enough shots) is flagged for review. */
  maxConversionPct: number;
  conversionCheckMinShots: number;
}

export const DEFAULT_CONFIG: EconomyConfig = {
  matchCoinBase: 20,
  coinPerGoal: 15,
  ratingBonusCoin: 20,
  ratingBonusFrom: 75,
  matchXpBase: 30,
  xpPerGoal: 10,
  dailyMatchCoinCap: 600,

  energyMax: 5,
  energyRegenSeconds: 20 * 60,
  matchEnergyCost: 1,

  matchChances: 6,
  ticketTtlSeconds: 20 * 60,
  minMsPerChance: 4_000,
  minMsBetweenMatches: 60_000,
  maxConversionPct: 90,
  conversionCheckMinShots: 5,
};
