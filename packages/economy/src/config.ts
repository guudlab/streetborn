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

/** One amateur league level (GDD v3.1 section 7). Multipliers are x100 so the math stays integer. */
export interface LeagueTier {
  id: string;
  minLevel: number;
  coinMultiplierX100: number;
  weeklySalary: number;
  winBonus: number;
  goalBonus: number;
  champPrize: number;
  oppGoalkeeping: number;
  oppAttack: number;
}

export interface CareerConfig {
  /** Mahalle respect that unlocks a third, better first offer. */
  betterOfferRespect: number;
  firstContractGem: number;
  teams: number;
  /** Extra XP for every league match. */
  ligXpBonus: number;
  /** Season prize for places 1, 2, 3 as a share of the tier's champion prize. */
  placePrizePct: number[];
  /** Offers vary the tier salary by up to this much either way. */
  salaryVariancePct: number;
  trialMinRating: number;
  trialSalaryBonusPct: number;
  betterSalaryBonusPct: number;
  /** A club that takes a player its last coach did not want pays this share of the salary. */
  weakerSalaryPct: number;
  trustStart: number;
  trustRenewMin: number;
  trustPromoteMin: number;
  trustRatingHigh: number;
  trustRatingMid: number;
  trustRatingLow: number;
  trustMissed: number;
  tiers: LeagueTier[];
}

export interface TrainingConfig {
  freeDrillsPerDay: number;
  drillEnergyCost: number;
  /** AP and XP per drill grade. */
  drillPerfectAp: number;
  drillPerfectXp: number;
  drillGoodAp: number;
  drillGoodXp: number;
  drillMissXp: number;
  /** Timing quality (0..100) for a perfect and for a good drill. */
  drillPerfectFrom: number;
  drillGoodFrom: number;
  /** A drill faster than this is scored as a miss: no one hits the bar that quickly. */
  drillMinMs: number;
  privateSessionsPerDay: number;
  privateCostBase: number;
  privateCostPerStat: number;
  privateAp: number;
  privateXp: number;
  /** AP needed for the next stat point while the stat is below `below`. */
  apPerStat: { below: number; ap: number }[];
  /** Stat cap = statCapBase + level × statCapPerLevelX10 / 10, at most statMax. */
  statCapBase: number;
  statCapPerLevelX10: number;
  statMax: number;
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
  career: CareerConfig;
  training: TrainingConfig;

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

  // GDD v3.1 offer and league blocks.
  career: {
    betterOfferRespect: 60,
    firstContractGem: 20,
    teams: 8,
    ligXpBonus: 30,
    placePrizePct: [100, 60, 35],
    salaryVariancePct: 20,
    trialMinRating: 70,
    trialSalaryBonusPct: 10,
    betterSalaryBonusPct: 15,
    weakerSalaryPct: 80,
    trustStart: 50,
    trustRenewMin: 40,
    trustPromoteMin: 70,
    trustRatingHigh: 4,
    trustRatingMid: 1,
    trustRatingLow: -3,
    trustMissed: -6,
    tiers: [
      { id: 'ilce_amator', minLevel: 5, coinMultiplierX100: 150, weeklySalary: 700, winBonus: 40, goalBonus: 15, champPrize: 600, oppGoalkeeping: 70, oppAttack: 80 },
      { id: 'super_amator', minLevel: 12, coinMultiplierX100: 175, weeklySalary: 1050, winBonus: 60, goalBonus: 20, champPrize: 900, oppGoalkeeping: 75, oppAttack: 90 },
      { id: 'bolge_amator', minLevel: 20, coinMultiplierX100: 200, weeklySalary: 1400, winBonus: 80, goalBonus: 25, champPrize: 1200, oppGoalkeeping: 80, oppAttack: 100 },
    ],
  },

  // GDD v3.1 section 6.
  training: {
    freeDrillsPerDay: 3,
    drillEnergyCost: 1,
    drillPerfectAp: 2,
    drillPerfectXp: 30,
    drillGoodAp: 1,
    drillGoodXp: 20,
    drillMissXp: 8,
    drillPerfectFrom: 85,
    drillGoodFrom: 50,
    drillMinMs: 600,
    privateSessionsPerDay: 5,
    privateCostBase: 100,
    privateCostPerStat: 8,
    privateAp: 2,
    privateXp: 15,
    apPerStat: [{ below: 60, ap: 3 }, { below: 70, ap: 4 }, { below: 80, ap: 5 }, { below: 100, ap: 6 }],
    statCapBase: 50,
    statCapPerLevelX10: 15,
    statMax: 99,
  },

  matchChances: 3,
  ticketTtlSeconds: 20 * 60,
  minMsPerChance: 4_000,
  minMsBetweenMatches: 60_000,
  maxConversionPct: 90,
  conversionCheckMinShots: 5,
};
