import { DEFAULT_CONFIG, type EconomyConfig } from './config.ts';

type Curve = Pick<EconomyConfig, 'xpCurveA' | 'levelCap'>;

/** Total XP needed to reach level n (GDD v3.1, Kaan's decision 3A): a · (n² − 1), so level 1 starts at 0. */
export function xpNeed(level: number, curve: Curve = DEFAULT_CONFIG): number {
  return curve.xpCurveA * (level * level - 1);
}

/** The level a player with this much total XP has reached (1 .. levelCap). */
export function levelForXp(xp: number, curve: Curve = DEFAULT_CONFIG): number {
  let level = 1;
  while (level < curve.levelCap && xp >= xpNeed(level + 1, curve)) level++;
  return level;
}
