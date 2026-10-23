import type { EconomyConfig } from './config.ts';

/** Turkey has no daylight saving time since 2016, so a fixed +3 h offset is exact. */
const ISTANBUL_OFFSET_MS = 3 * 3_600_000;

/** Calendar day (YYYY-MM-DD) in Turkey for a timestamp; the mahalle match window is one such day. */
export function istanbulDay(ms: number): string {
  return new Date(ms + ISTANBUL_OFFSET_MS).toISOString().slice(0, 10);
}

/** One member's finished mahalle match of the day. */
export interface DayContribution {
  playerId: string;
  goals: number;
  assists: number;
  /** Goals the opponent scored in this member's match. */
  opponentGoals: number;
  /** x10 */
  rating: number;
}

export interface DayMember {
  playerId: string;
  /** Counts toward the turnout share: old enough and with enough matches. */
  real: boolean;
}

export interface DayPayout {
  playerId: string;
  coin: number;
  xp: number;
  respect: number;
}

export interface DaySettlement {
  ourGoals: number;
  theirGoals: number;
  result: 'W' | 'D' | 'L';
  /** Players whose contribution counted (best first). */
  counted: string[];
  /** Empty slots filled by NPC mahalle children. */
  fills: number;
  motm: string | null;
  turnout: boolean;
  payouts: DayPayout[];
}

export interface MahalleOpponent {
  name: string;
  goalkeeping: number;
  attack: number;
}

const OPPONENT_NAMES = [
  'Çınar Mahallesi', 'Yıldız Mahallesi', 'Değirmen Mahallesi', 'Tepe Mahallesi', 'Liman Mahallesi', 'Fidanlık Mahallesi',
  'Çamlık Mahallesi', 'Sahil Mahallesi', 'Kale Mahallesi', 'Pınar Mahallesi', 'Bahçe Mahallesi', 'Köprü Mahallesi',
];

/** FNV-1a, integer math only. */
function hash(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193);
  return h >>> 0;
}

/** mulberry32 seeded from text; returns ints in [0, n). */
function rng(seed: string): (n: number) => number {
  let a = hash(seed);
  return (n) => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return (((t ^ (t >>> 14)) >>> 0) % n);
  };
}

/** The NPC mahalle a mahalle faces on a day. Strength follows the average member level, with a small seeded spread. */
export function mahalleOpponent(mahalleId: string, day: string, avgLevel: number): MahalleOpponent {
  const next = rng(`${mahalleId}:${day}:opponent`);
  const spread = next(7) - 3;
  return {
    name: OPPONENT_NAMES[next(OPPONENT_NAMES.length)]!,
    goalkeeping: Math.max(1, Math.min(95, 35 + avgLevel * 2 + spread)),
    attack: Math.max(1, Math.min(95, 30 + avgLevel * 2 + spread)),
  };
}

function weighted(next: (n: number) => number, weights: readonly number[]): number {
  let roll = next(weights.reduce((a, b) => a + b, 0));
  for (let i = 0; i < weights.length; i++) {
    if (roll < weights[i]!) return i;
    roll -= weights[i]!;
  }
  return 0;
}

/**
 * Settles one mahalle day (GDD v3.1): the best `slots` contributions count, empty
 * slots are filled by seeded NPC children, and everyone who played gets the
 * mahalle bonus. Pure and deterministic for a (mahalle, day, inputs) triple.
 */
export function settleMahalleDay(
  input: { mahalleId: string; day: string; contributions: DayContribution[]; members: DayMember[] },
  config: EconomyConfig,
): DaySettlement {
  const cfg = config.mahalle;
  const ranked = [...input.contributions].sort((a, b) =>
    b.rating - a.rating || b.goals + b.assists - (a.goals + a.assists) || (a.playerId < b.playerId ? -1 : 1));
  const counted = ranked.slice(0, cfg.slots);

  let ourGoals = counted.reduce((sum, c) => sum + c.goals + c.assists, 0);
  let theirGoals = counted.reduce((sum, c) => sum + c.opponentGoals, 0);
  const fills = cfg.slots - counted.length;
  const next = rng(`${input.mahalleId}:${input.day}:fill`);
  for (let i = 0; i < fills; i++) {
    ourGoals += weighted(next, cfg.fillOurWeights);
    theirGoals += weighted(next, cfg.fillTheirWeights);
  }
  const result = ourGoals > theirGoals ? 'W' : ourGoals < theirGoals ? 'L' : 'D';

  const motm = ranked[0]?.playerId ?? null;
  const played = new Set(input.contributions.map((c) => c.playerId));
  const real = input.members.filter((m) => m.real);
  const realPlayed = real.filter((m) => played.has(m.playerId)).length;
  const turnout = real.length > 0 && realPlayed * 100 >= real.length * cfg.turnoutPct;

  const payouts = ranked.map((c): DayPayout => {
    let coin = result === 'W' ? cfg.winBonusCoin : result === 'D' ? cfg.drawBonusCoin : 0;
    if (turnout) coin += cfg.turnoutBonusCoin;
    let xp = result === 'W' ? cfg.winXp : 0;
    let respect = c.rating >= 70 ? cfg.respectRatingHigh : c.rating >= 60 ? cfg.respectRatingMid : cfg.respectRatingLow;
    if (result === 'W') respect += cfg.respectWin;
    if (c.playerId === motm) {
      xp += cfg.motmXp;
      respect += cfg.respectMotm;
    }
    return { playerId: c.playerId, coin, xp, respect };
  });

  return { ourGoals, theirGoals, result, counted: counted.map((c) => c.playerId), fills, motm, turnout, payouts };
}
