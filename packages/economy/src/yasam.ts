import type { LifestyleConfig, LifestyleItem } from './config.ts';

// Yaşam (GDD v3.1 section 8.1, Kaan 2026-11-08): the house, ride and land a player buys with
// coin and shows off on their profile, their mahalle card and at kick-off. Status only: nothing
// here touches a match, a stat, energy or a ranking. The halısaha is the one item that pays,
// a fixed amount of coin a day, granted by the server. Coin-bought items keep source 'coin'
// and never leave the game (Kaan 2026-11-08: the metaverse gets its own series).

export type LifeGroup = LifestyleItem['group'];

/** What a player shows: the dearest item they own in each group. The free room is everyone's home. */
export interface LifeShowcase { ev: string; ulasim: string | null; arsa: string | null }

/** Items the player owns: the free ones from their level, plus the ones bought (ids from the inventory). */
export function ownedLifestyle(bought: readonly string[], level: number, cfg: LifestyleConfig): LifestyleItem[] {
  const have = new Set(bought);
  return cfg.items.filter((i) => have.has(i.id) || (i.price === 0 && level >= i.unlockLevel));
}

export function lifeShowcase(bought: readonly string[], cfg: LifestyleConfig): LifeShowcase {
  const best = (group: LifeGroup) => {
    let top: LifestyleItem | null = null;
    for (const i of ownedLifestyle(bought, 0, cfg)) {
      if (i.group === group && (!top || i.price > top.price)) top = i;
    }
    return top?.id ?? null;
  };
  const free = cfg.items.find((i) => i.group === 'ev' && i.price === 0);
  return { ev: best('ev') ?? free?.id ?? 'ev_oda', ulasim: best('ulasim'), arsa: best('arsa') };
}

/** The single dearest item a player owns, for small badges (a mahalle member card). Null for none. */
export function lifeTop(bought: readonly string[], cfg: LifestyleConfig): string | null {
  let top: LifestyleItem | null = null;
  for (const i of cfg.items) if (bought.includes(i.id) && i.price > 0 && (!top || i.price > top.price)) top = i;
  return top?.id ?? null;
}

export type LifeBuyCheck = 'ok' | 'not_for_sale' | 'owned' | 'locked' | 'needs' | 'no_coin';

/** Whether the player can buy `id` now. The server checks the same rules again. */
export function lifeBuyCheck(id: string, s: { level: number; coins: number; bought: readonly string[] }, cfg: LifestyleConfig): LifeBuyCheck {
  const item = cfg.items.find((i) => i.id === id);
  if (!item || item.price <= 0) return 'not_for_sale';
  if (s.bought.includes(id)) return 'owned';
  if (s.level < item.unlockLevel) return 'locked';
  if (item.requires && !s.bought.includes(item.requires)) return 'needs';
  if (s.coins < item.price) return 'no_coin';
  return 'ok';
}

/** Coin the halısaha pays for `days` whole days since the last collection: one day's income each, up to the cap. */
export function halisahaPayout(days: number, cfg: LifestyleConfig): number {
  return Math.max(0, Math.min(Math.trunc(days), cfg.halisahaMaxAccrualDays)) * cfg.halisahaIncomePerDay;
}
