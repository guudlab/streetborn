import { describe, expect, it } from 'vitest';
import { clampTrust, DEFAULT_CONFIG as config, levelForXp, normalizeName, spendEnergy, xpNeed } from './index.ts';

/** Every number reachable from the config, with its path. */
function numbers(value: unknown, path = 'config'): [string, number][] {
  if (typeof value === 'number') return [[path, value]];
  if (Array.isArray(value)) return value.flatMap((v, i) => numbers(v, `${path}[${i}]`));
  if (value && typeof value === 'object') return Object.entries(value).flatMap(([k, v]) => numbers(v, `${path}.${k}`));
  return [];
}

describe('DEFAULT_CONFIG', () => {
  it('holds only whole, non-negative numbers (integer math, same on both runtimes)', () => {
    const all = numbers(config);
    expect(all.length).toBeGreaterThan(80);
    for (const [path, n] of all) {
      expect(Number.isInteger(n), path).toBe(true);
      // Respect and trust deltas are the only values allowed below zero.
      if (!/respect|trust/i.test(path)) expect(n, path).toBeGreaterThanOrEqual(0);
    }
  });

  it('keeps the mahalle block consistent', () => {
    const m = config.mahalle;
    expect(m.minMembers).toBeLessThanOrEqual(m.maxMembers);
    expect(m.slots).toBeLessThanOrEqual(m.maxMembers);
    expect(m.turnoutPct).toBeLessThanOrEqual(100);
    expect(m.fillOurWeights.reduce((a, b) => a + b, 0)).toBe(100);
    expect(m.fillTheirWeights.reduce((a, b) => a + b, 0)).toBe(100);
    expect(m.respectRatingHigh).toBeGreaterThan(m.respectRatingMid);
    expect(m.respectRatingMid).toBeGreaterThan(m.respectRatingLow);
  });

  it('keeps the club tiers climbing', () => {
    const { tiers, teams, placePrizePct } = config.career;
    expect(tiers.length).toBeGreaterThanOrEqual(3);
    // The league table needs the player plus seven NPC clubs and a 14 round season (twice each).
    expect(config.leagueSeasonDays).toBe((teams - 1) * 2);
    for (let i = 1; i < tiers.length; i++) {
      const [lo, hi] = [tiers[i - 1]!, tiers[i]!];
      expect(hi.minLevel, hi.id).toBeGreaterThan(lo.minLevel);
      expect(hi.coinMultiplierX100, hi.id).toBeGreaterThan(lo.coinMultiplierX100);
      expect(hi.weeklySalary, hi.id).toBeGreaterThan(lo.weeklySalary);
      expect(hi.champPrize, hi.id).toBeGreaterThan(lo.champPrize);
    }
    expect(tiers[0]!.minLevel).toBe(config.offerMinLevel);
    expect(tiers.every(t => t.coinMultiplierX100 > 100)).toBe(true);
    expect([...placePrizePct].sort((a, b) => b - a)).toEqual(placePrizePct);
    expect(new Set(tiers.map(t => t.id)).size).toBe(tiers.length);
    const c = config.career;
    expect(c.trustRenewMin).toBeLessThan(c.trustPromoteMin);
    expect(c.trustStart).toBeGreaterThanOrEqual(c.trustRenewMin);
  });

  it('keeps training thresholds ordered and the stat cap reachable', () => {
    const t = config.training;
    expect(t.drillPerfectFrom).toBeGreaterThan(t.drillGoodFrom);
    expect(t.drillPerfectAp).toBeGreaterThan(t.drillGoodAp);
    expect(t.drillPerfectXp).toBeGreaterThan(t.drillGoodXp);
    expect(t.drillGoodXp).toBeGreaterThan(t.drillMissXp);
    const belows = t.apPerStat.map(s => s.below);
    expect([...belows].sort((a, b) => a - b)).toEqual(belows);
    expect(belows.at(-1)).toBeGreaterThan(t.statMax);
    expect(t.statCapBase + Math.trunc((t.statCapPerLevelX10 * config.levelCap) / 10)).toBeGreaterThanOrEqual(t.statMax);
  });

  it('pays gems at the levels the shop says, and a refill is worth less than the start gift', () => {
    const s = config.shop;
    expect(s.levelGemUntil).toBeLessThanOrEqual(config.levelCap);
    expect(s.levelGemUntil % s.levelGemEvery).toBe(0);
    expect(s.refillGem * s.refillsPerDay).toBeGreaterThan(s.startGem);
    expect(s.adEnergyPerDay * s.adEnergy).toBeLessThan(config.energyMax);
  });

  it('gives a flagged match less than a clean one and makes the daily cap bind', () => {
    const best = config.matchCoinBase + config.coinPerGoal * config.matchChances + config.coinPerAssist * config.matchChances + config.winBonusCoin + config.ratingBonusCoin;
    expect(config.dailyMatchCoinCap).toBeGreaterThan(best);
    expect(config.dailyMatchCoinCap).toBeLessThan(best * config.energyMax * 3);
    expect(config.ratingBonusFrom).toBeLessThanOrEqual(100);
    expect(config.minMsPerChance).toBeGreaterThan(0);
    expect(config.ticketTtlSeconds * 1000).toBeGreaterThan(config.minMsBetweenMatches);
  });
});

describe('levels', () => {
  it('starts level 1 at zero XP and reaches the cap exactly at its XP', () => {
    expect(xpNeed(1)).toBe(0);
    expect(levelForXp(0)).toBe(1);
    expect(levelForXp(xpNeed(2) - 1)).toBe(1);
    expect(levelForXp(xpNeed(2))).toBe(2);
    expect(levelForXp(xpNeed(config.levelCap) - 1)).toBe(config.levelCap - 1);
    expect(levelForXp(xpNeed(config.levelCap))).toBe(config.levelCap);
    expect(levelForXp(Number.MAX_SAFE_INTEGER)).toBe(config.levelCap);
  });

  it('never skips a level and is monotonic', () => {
    let last = 1;
    for (let xp = 0; xp <= xpNeed(config.levelCap) + 100; xp += 37) {
      const level = levelForXp(xp);
      expect(level - last).toBeLessThanOrEqual(1);
      expect(level).toBeGreaterThanOrEqual(last);
      last = level;
    }
  });

  it('follows a custom curve from the config row', () => {
    const curve = { xpCurveA: 10, levelCap: 5 };
    expect(xpNeed(3, curve)).toBe(80);
    expect(levelForXp(79, curve)).toBe(2);
    expect(levelForXp(80, curve)).toBe(3);
    expect(levelForXp(1_000_000, curve)).toBe(5);
  });
});

describe('energy spending', () => {
  const T = 1_700_000_000_000;
  it('spends from full and starts the regen clock now', () => {
    expect(spendEnergy({ energy: config.energyMax, updatedAt: 1 }, 1, T, config)).toEqual({ energy: config.energyMax - 1, updatedAt: T });
  });

  it('keeps partial progress when not full and refuses when short', () => {
    const state = { energy: 2, updatedAt: T - 5 * 60_000 };
    expect(spendEnergy(state, 2, T, config)).toEqual({ energy: 0, updatedAt: T - 5 * 60_000 });
    expect(spendEnergy(state, 3, T, config)).toBeNull();
  });

  it('counts the energy regenerated since the last update before deciding', () => {
    const state = { energy: 0, updatedAt: T - config.energyRegenSeconds * 1000 * 2 - 1000 };
    expect(spendEnergy(state, 2, T, config)).toEqual({ energy: 0, updatedAt: T - 1000 });
    expect(spendEnergy(state, 3, T, config)).toBeNull();
  });
});

describe('small helpers', () => {
  it('clamps coach trust to 0..100', () => {
    expect([clampTrust(-5), clampTrust(0), clampTrust(55), clampTrust(100), clampTrust(240)]).toEqual([0, 0, 55, 100, 100]);
  });

  it('normalizes Turkish letters and look-alike digits', () => {
    expect(normalizeName('ÇAĞRI')).toBe('cagri');
    expect(normalizeName('Işık Öğretmen')).toBe('isik ogretmen');
    expect(normalizeName('s1k1')).toBe('siki');
    expect(normalizeName('p@$a')).toBe('pasa');
  });
});
