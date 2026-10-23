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
  coinPerAssist: number;
  /** Extra coin when the player's team wins. */
  winBonusCoin: number;
  /** Extra coin for a rating >= ratingBonusFrom (rating is x10, so 70 = 7.0). */
  ratingBonusCoin: number;
  ratingBonusFrom: number;
  matchXpBase: number;
  xpPerGoal: number;
  xpPerAssist: number;
  /** XP per full rating point above 6.0. */
  xpPerRatingPoint: number;
  /** Coin a player can earn from matches per day; the rest is cut. */
  dailyMatchCoinCap: number;
  /** Total XP for level n is xpCurveA · (n² − 1). */
  xpCurveA: number;
  levelCap: number;

  energyMax: number;
  /** Seconds to regenerate one energy point. */
  energyRegenSeconds: number;
  matchEnergyCost: number;
  /** Fixture matches (mahalle maçı, lig maçı): once a day each, outside the daily coin cap. */
  fixtureEnergyCost: number;

  /** The first amateur club offer needs this level and this many finished matches, some of them mahalle matches. */
  offerMinLevel: number;
  offerMinMatches: number;
  offerMinMahalleMatches: number;
  leagueSeasonDays: number;

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
  coinPerAssist: 10,
  winBonusCoin: 15,
  ratingBonusCoin: 20,
  ratingBonusFrom: 70,
  // XP follows GDD v2 (40 + 10/goal + 6/assist + 8 per rating point over 6.0).
  matchXpBase: 40,
  xpPerGoal: 10,
  xpPerAssist: 6,
  xpPerRatingPoint: 8,
  dailyMatchCoinCap: 600,
  // GDD v3.1 decisions (Kaan, 2026-10-23): 1A first offer, 2A season length, 3A XP curve, 4B fixture energy.
  xpCurveA: 60,
  levelCap: 60,

  energyMax: 5,
  energyRegenSeconds: 20 * 60,
  matchEnergyCost: 1,
  fixtureEnergyCost: 1,

  offerMinLevel: 5,
  offerMinMatches: 10,
  offerMinMahalleMatches: 3,
  leagueSeasonDays: 14,

  matchChances: 3,
  ticketTtlSeconds: 20 * 60,
  minMsPerChance: 4_000,
  minMsBetweenMatches: 60_000,
  maxConversionPct: 90,
  conversionCheckMinShots: 5,
};
