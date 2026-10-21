/** Total XP needed to reach level n (GDD v2): 100 · n^1.5, rounded. */
export function xpNeed(level: number): number {
  return Math.round(100 * Math.pow(level, 1.5));
}

/** The level a player with this much total XP has reached (never below 1). */
export function levelForXp(xp: number): number {
  let level = 1;
  while (xp >= xpNeed(level + 1)) level++;
  return level;
}
