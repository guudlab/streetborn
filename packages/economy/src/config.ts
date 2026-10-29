import type { DrillName } from './drills.ts';

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

export interface BootsItem { id: string; price: number; uses: number; unlockLevel: number }

export interface TrainingConfig {
  freeDrillsPerDay: number;
  drillEnergyCost: number;
  /** AP and XP per drill grade. */
  drillPerfectAp: number;
  drillPerfectXp: number;
  drillGoodAp: number;
  drillGoodXp: number;
  drillMissXp: number;
  /** Mini game score for 1, 2 and 3 stars (3 stars pay the perfect grade, 2 the good one). */
  drillStars: Record<DrillName, [number, number, number]>;
  /** Best scores for the bronze, silver and gold usta badge (profile only, no reward). */
  drillBadges: Record<DrillName, [number, number, number]>;
  /** The mini games get harder (tier 1 and 2) once the stat reaches these values. */
  drillTierFrom: [number, number];
  /** A started drill has to be finished within this many seconds. */
  drillSessionSeconds: number;
  /** Extra AP for a 3-star drill while the player has boots with talim left; every drill wears them by 1. */
  bootPerfectAp: number;
  /** Krampon: coin price, how many drills they last, and the level that unlocks them. Coin only. */
  boots: BootsItem[];
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

/** Gems, energy refills and rewarded ads (GDD v3.1 section 9). */
export interface ShopConfig {
  /** Paid once to every new account. */
  startCoin: number;
  startGem: number;
  /** levelGem gems at every levelGemEvery levels, up to levelGemUntil. */
  levelGemEvery: number;
  levelGem: number;
  levelGemUntil: number;
  /** A gem refill sets energy to full. */
  refillGem: number;
  refillsPerDay: number;
  /** Rewarded ad: +adEnergy energy, adEnergyPerDay times a day. */
  adEnergy: number;
  adEnergyPerDay: number;
  /** Rewarded ad that pays an energy match's coin once more; counts toward the daily coin cap. */
  adDoublePerDay: number;
  /** The double has to be watched this soon after the match. */
  adDoubleWindowMinutes: number;
  /** One-time coin for Burak abi's first jobs (first match, first training, joining a mahalle). Paid once per account. */
  jobsCoin: number;
}

/** Lifestyle items (ev, ulaşım, arsa): status only, no match or stat effect (GDD v3.1 section 8.1). */
export interface LifestyleItem {
  id: string;
  group: 'ev' | 'ulasim' | 'arsa';
  price: number;
  unlockLevel: number;
  /** Another item that has to be owned first (halısaha needs the arsa). */
  requires?: string;
}

export interface LifestyleConfig {
  items: LifestyleItem[];
  /** Only the halısaha pays coin, granted by the server once a day. */
  halisahaIncomePerDay: number;
  halisahaMaxAccrualDays: number;
}

/** Form, morale, pre-match choice, injury and the weekly friend duel (kariyer.ts). All numbers are assumptions. */
export interface KariyerConfig {
  /** Form comes from the last `formWindow` finished matches, once at least `formMinMatches` exist. Ratings are x10. */
  formWindow: number;
  formMinMatches: number;
  formHotFrom: number;
  formGoodFrom: number;
  formColdBelow: number;
  /** Shooting stat added for a match (the stat is clamped to 1..100 by the caller). */
  shootHot: number;
  shootGood: number;
  shootCold: number;
  moraleStart: number;
  moraleWin: number;
  moraleDraw: number;
  moraleLoss: number;
  moraleHighFrom: number;
  moraleLowBelow: number;
  shootMoraleHigh: number;
  shootMoraleLow: number;
  /** Pre-match choice (once a day): moral change, shooting bonus of the next match, respect. */
  restMorale: number;
  workMorale: number;
  workShoot: number;
  hangMorale: number;
  hangRespect: number;
  /** Injury risk per mille after a match: base minus (stamina − 40) × perStamina/10, at least minRisk. */
  injuryBase: number;
  injuryPerStamina: number;
  injuryMinRisk: number;
  /** Chance (percent) of the longer injury; the rest are the short one. */
  injuryLongPct: number;
  injuryShortDays: number;
  injuryLongDays: number;
  /** Coin for a massage that ends an injury at once. */
  massageCost: number;
  /** Weekly duel against a mahalle friend (Kerem, an NPC, when nobody else is in the mahalle). */
  duelMinMatches: number;
  duelWinCoin: number;
  duelWinRespect: number;
  /** Kerem's weekly score: base + level × perLevel + a seeded 0..variance. */
  keremBase: number;
  keremPerLevel: number;
  keremVariance: number;
  /** Phone events (telefon.ts): none before this many finished matches; events seen in the last `phoneRecentDays` answers are skipped. */
  phoneMinMatches: number;
  phoneRecentDays: number;
  /** Coin an answer gives or costs, by tier 1..3. */
  phoneCoinS: number;
  phoneCoinM: number;
  phoneCoinL: number;
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
  shop: ShopConfig;
  lifestyle: LifestyleConfig;
  kariyer: KariyerConfig;

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
    // Mini game scores: cans down, pass points, obstacles passed, steps climbed.
    drillStars: { shooting: [2, 4, 6], passing: [10, 28, 56], pace: [12, 18, 24], stamina: [36, 50, 60], defense: [4, 7, 9] },
  drillBadges: { shooting: [4, 5, 6], passing: [40, 70, 100], pace: [18, 22, 24], stamina: [50, 60, 66], defense: [7, 9, 10] },
    drillTierFrom: [60, 80],
    drillSessionSeconds: 10 * 60,
    // Antrenman doc decision 7 (Kaan, 2026-10-29): same +1 AP at every tier, the tiers only last longer.
    bootPerfectAp: 1,
    boots: [
      { id: 'krampon_mahalle', price: 500, uses: 25, unlockLevel: 3 },
      { id: 'krampon_cim', price: 1200, uses: 60, unlockLevel: 8 },
      { id: 'krampon_pro', price: 2500, uses: 150, unlockLevel: 15 },
    ],
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

  // GDD v3.1 section 9 (refill 20 gems, at most 2 a day: Kaan approved).
  shop: {
    startCoin: 300,
    startGem: 30,
    levelGemEvery: 5,
    levelGem: 10,
    levelGemUntil: 30,
    refillGem: 20,
    refillsPerDay: 2,
    adEnergy: 1,
    adEnergyPerDay: 3,
    adDoublePerDay: 2,
    adDoubleWindowMinutes: 30,
    jobsCoin: 150,
  },

  // GDD v3.1 section 8.1 (Kaan, 2026-10-23): status only; prices are assumptions.
  lifestyle: {
    items: [
      { id: 'ev_oda', group: 'ev', price: 0, unlockLevel: 1 },
      { id: 'bisiklet', group: 'ulasim', price: 400, unlockLevel: 3 },
      { id: 'ev_daire', group: 'ev', price: 4000, unlockLevel: 10 },
      { id: 'araba', group: 'ulasim', price: 7000, unlockLevel: 12 },
      { id: 'arsa', group: 'arsa', price: 6000, unlockLevel: 15 },
      { id: 'halisaha', group: 'arsa', price: 15000, unlockLevel: 18, requires: 'arsa' },
      { id: 'ev_villa', group: 'ev', price: 40000, unlockLevel: 25 },
      { id: 'spor_araba', group: 'ulasim', price: 30000, unlockLevel: 28 },
    ],
    halisahaIncomePerDay: 200,
    halisahaMaxAccrualDays: 3,
  },

  kariyer: {
    formWindow: 5,
    formMinMatches: 2,
    formHotFrom: 75,
    formGoodFrom: 65,
    formColdBelow: 55,
    shootHot: 3,
    shootGood: 1,
    shootCold: -3,
    moraleStart: 60,
    moraleWin: 5,
    moraleDraw: 0,
    moraleLoss: -4,
    moraleHighFrom: 80,
    moraleLowBelow: 30,
    shootMoraleHigh: 1,
    shootMoraleLow: -2,
    restMorale: 10,
    workMorale: -3,
    workShoot: 2,
    hangMorale: 5,
    hangRespect: 2,
    injuryBase: 60,
    injuryPerStamina: 1,
    injuryMinRisk: 10,
    injuryLongPct: 25,
    injuryShortDays: 1,
    injuryLongDays: 2,
    massageCost: 200,
    duelMinMatches: 3,
    duelWinCoin: 300,
    duelWinRespect: 3,
    keremBase: 8,
    keremPerLevel: 1,
    keremVariance: 7,
    phoneMinMatches: 3,
    phoneRecentDays: 20,
    phoneCoinS: 50,
    phoneCoinM: 100,
    phoneCoinL: 200,
  },

  matchChances: 3,
  ticketTtlSeconds: 20 * 60,
  minMsPerChance: 4_000,
  minMsBetweenMatches: 60_000,
  maxConversionPct: 90,
  conversionCheckMinShots: 5,
};
