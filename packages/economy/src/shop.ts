import type { EconomyConfig, ShopConfig } from './config.ts';

// Gems, refills and rewarded ads (GDD v3.1 section 9). Gems buy time and looks,
// never strength: a refill only fills energy, and only twice a day.

/** Levels that pay level gems, up to `level` (5, 10, 15 … up to levelGemUntil). */
export function levelGemLevels(level: number, cfg: ShopConfig): number[] {
  const out: number[] = [];
  for (let l = cfg.levelGemEvery; l <= Math.min(level, cfg.levelGemUntil); l += cfg.levelGemEvery) out.push(l);
  return out;
}

/**
 * Coin a "coin ×2" ad pays for an energy match that paid `paid`. It counts toward
 * the daily cap like the match itself, so it is cut to the room left today.
 */
export function adDoubleCoin(paid: number, earnedToday: number, config: EconomyConfig, multiplierX100 = 100): number {
  const room = Math.max(0, Math.trunc((config.dailyMatchCoinCap * multiplierX100) / 100) - earnedToday);
  return Math.max(0, Math.min(paid, room));
}

export type AdReward = { kind: 'energy' } | { kind: 'double'; matchId: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The ad's custom data: `energy`, or `double:<match id>`. Null for anything else. */
export function parseAdReward(customData: string | null): AdReward | null {
  if (customData === 'energy') return { kind: 'energy' };
  const m = /^double:(.+)$/.exec(customData ?? '');
  return m && UUID.test(m[1]!) ? { kind: 'double', matchId: m[1]!.toLowerCase() } : null;
}
