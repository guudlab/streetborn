import type { EconomyConfig, TrainingConfig } from './config.ts';

// Training (GDD v3.1 section 6): drills (the mini games in drills.ts) and private
// sessions give AP; AP turns into
// stat points up to a cap that grows with level. The app shows these numbers and
// the `train` Edge Function applies them.

export type StatName = 'shooting' | 'passing' | 'pace' | 'stamina';
export const STAT_NAMES: readonly StatName[] = ['shooting', 'passing', 'pace', 'stamina'];

export type DrillGrade = 'perfect' | 'good' | 'miss';

/** AP needed for the next point of a stat at this value. */
export function apNeed(stat: number, cfg: TrainingConfig): number {
  return (cfg.apPerStat.find((s) => stat < s.below) ?? cfg.apPerStat[cfg.apPerStat.length - 1]!).ap;
}

export function statCap(level: number, cfg: TrainingConfig): number {
  return Math.min(cfg.statMax, cfg.statCapBase + Math.trunc((level * cfg.statCapPerLevelX10) / 10));
}

export function drillGain(grade: DrillGrade, cfg: TrainingConfig): { ap: number; xp: number } {
  if (grade === 'perfect') return { ap: cfg.drillPerfectAp, xp: cfg.drillPerfectXp };
  if (grade === 'good') return { ap: cfg.drillGoodAp, xp: cfg.drillGoodXp };
  return { ap: 0, xp: cfg.drillMissXp };
}

/** Coin price of a private session for a stat at this value. */
export function privateCost(stat: number, cfg: TrainingConfig): number {
  return cfg.privateCostBase + cfg.privateCostPerStat * Math.max(0, stat - 40);
}

/**
 * Adds AP to a stat and converts it to points. At the cap the AP waits (up to one
 * point's worth) and converts once a higher level lifts the cap.
 */
export function applyAp(stat: number, ap: number, gained: number, level: number, config: EconomyConfig): { stat: number; ap: number; ups: number } {
  const cfg = config.training;
  const cap = statCap(level, cfg);
  let s = stat, a = ap + gained, ups = 0;
  while (s < cap && a >= apNeed(s, cfg)) {
    a -= apNeed(s, cfg);
    s++;
    ups++;
  }
  if (s >= cap) a = Math.min(a, apNeed(s, cfg));
  return { stat: s, ap: a, ups };
}
