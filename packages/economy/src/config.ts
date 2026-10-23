/**
 * Economy parameters. The live values are stored in the Supabase `config` table
 * so they can be tuned without an app release; these defaults seed that table
 * and are used in tests. Every number here is an assumption to be tuned with
 * soft launch data.
 */
export interface MahalleConfig {
  minMembers: number;
  maxMembers: number;
  /** Contributions that count toward the day's score; empty slots are filled by NPC "mahalle çocukları". */
  slots: number;
  winBonusCoin: number;
  drawBonusCoin: number;
  winXp: number;
  turnoutBonusCoin: number;
  /** Share of real members (percent) that must have played for the turnout bonus. */
  turnoutPct: number;
  /** A member counts as real after this many hours in the mahalle and this many finished matches. */
  realMemberMinAgeHours: number;
  realMemberMinMatches: number;
  motmXp: number;
  respectRatingHigh: number;
  respectRatingMid: number;
  respectRatingLow: number;
  respectWin: number;
  respectMotm: number;
  respectCheer: number;
  cheersPerDay: number;
  cheersReceivedMax: number;
  cheerXpReceiver: number;
  cheerXpGiver: number;
  /** Weights (percent) of an NPC slot adding 0, 1 or 2 goals for the mahalle / against it. */
  fillOurWeights: [number, number, number];
  fillTheirWeights: [number, number, number];
}

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

  mahalle: MahalleConfig;

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

  // GDD v3.1 mahalle block. The fill weights are tuned so a mahalle of NPCs only wins about 60% of days.
  mahalle: {
    minMembers: 2,
    maxMembers: 12,
    slots: 7,
    winBonusCoin: 40,
    drawBonusCoin: 15,
    winXp: 25,
    turnoutBonusCoin: 20,
    turnoutPct: 50,
    realMemberMinAgeHours: 24,
    realMemberMinMatches: 3,
    motmXp: 15,
    respectRatingHigh: 4,
    respectRatingMid: 1,
    respectRatingLow: -2,
    respectWin: 2,
    respectMotm: 3,
    respectCheer: 1,
    cheersPerDay: 3,
    cheersReceivedMax: 3,
    cheerXpReceiver: 10,
    cheerXpGiver: 5,
    fillOurWeights: [30, 50, 20],
    fillTheirWeights: [45, 40, 15],
  },

  matchChances: 3,
  ticketTtlSeconds: 20 * 60,
  minMsPerChance: 4_000,
  minMsBetweenMatches: 60_000,
  maxConversionPct: 90,
  conversionCheckMinShots: 5,
};
