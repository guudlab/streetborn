import { describe, expect, it } from 'vitest';
import {
  apNeed,
  applyAp,
  drillGain,
  drillGrade,
  privateCost,
  statCap,
  checkName,
  dailySalary,
  firstOffers,
  leagueReward,
  leagueSchedule,
  leagueTable,
  leagueTeams,
  offerReady,
  playerOpponent,
  seasonEndOffers,
  seasonPrize,
  computeRating,
  currentEnergy,
  DEFAULT_CONFIG as config,
  levelForXp,
  istanbulDay,
  mahalleOpponent,
  matchReward,
  settleMahalleDay,
  spendEnergy,
  validateMatch,
  xpNeed,
  type MatchStats,
  type MatchTicket,
} from './index.ts';

const NOW = 1_800_000_000_000;
const ticket: MatchTicket = {
  matchId: 'm1',
  playerId: 'p1',
  seed: 1,
  chances: 3,
  issuedAt: NOW - 120_000,
  expiresAt: NOW + 600_000,
  status: 'open',
};
const stats = (over: Partial<MatchStats> = {}): MatchStats => ({
  shots: 2, goals: 1, assists: 1, rating: 75, result: 'W', durationMs: 90_000, ...over,
});
const ctx = { playerId: 'p1', now: NOW, lastFinishedAt: null };

describe('validateMatch', () => {
  it('accepts a normal match', () => {
    expect(validateMatch(ticket, stats(), ctx, config)).toEqual({ rejected: [], flagged: [] });
  });

  it('rejects another player, a closed or expired ticket', () => {
    expect(validateMatch(ticket, stats(), { ...ctx, playerId: 'p2' }, config).rejected).toContain('ticket_wrong_player');
    expect(validateMatch({ ...ticket, status: 'finished' }, stats(), ctx, config).rejected).toContain('ticket_not_open');
    expect(validateMatch(ticket, stats(), { ...ctx, now: ticket.expiresAt + 1 }, config).rejected).toContain('ticket_expired');
  });

  it('flags suspicious but possible matches', () => {
    expect(validateMatch(ticket, stats({ durationMs: 5_000 }), ctx, config).flagged).toContain('too_short');
    expect(validateMatch({ ...ticket, chances: 6 }, stats({ shots: 6, goals: 6 }), ctx, config).flagged).toContain('conversion_too_high');
    expect(validateMatch(ticket, stats(), { ...ctx, lastFinishedAt: NOW - 10_000 }, config).flagged).toContain('too_soon_after_last_match');
  });
});

describe('matchReward', () => {
  it('pays goals, assists, the win and the rating bonus for a clean match', () => {
    const r = matchReward({ goals: 1, assists: 1, rating: 75, result: 'W' }, false, 0, config);
    expect(r).toEqual({ coin: 20 + 15 + 10 + 15 + 20, xp: 40 + 10 + 6 + 12, capped: false });
  });

  it('pays only participation when flagged', () => {
    expect(matchReward({ goals: 3, assists: 0, rating: 100, result: 'W' }, true, 0, config)).toEqual({ coin: 20, xp: 40, capped: false });
  });

  it('respects the daily cap', () => {
    const r = { goals: 1, assists: 0, rating: 60, result: 'D' } as const;
    expect(matchReward(r, false, config.dailyMatchCoinCap - 10, config)).toEqual({ coin: 10, xp: 50, capped: true });
    expect(matchReward(r, false, config.dailyMatchCoinCap, config).coin).toBe(0);
  });
});

describe('computeRating', () => {
  it('follows GDD v2 and stays within 1.0..10.0', () => {
    expect(computeRating({ goals: 1, assists: 1, missed: 1, lost: 0, result: 'W' })).toBe(75);
    expect(computeRating({ goals: 0, assists: 0, missed: 0, lost: 0, result: 'D' })).toBe(60);
    expect(computeRating({ goals: 9, assists: 0, missed: 0, lost: 0, result: 'W' })).toBe(100);
    expect(computeRating({ goals: 0, assists: 0, missed: 12, lost: 0, result: 'L' })).toBe(10);
  });

  it('adds 0.5 per stopped attack and caps assisted matches at 7.0', () => {
    expect(computeRating({ goals: 1, assists: 0, missed: 0, lost: 0, result: 'W', defenseStops: 2 })).toBe(83);
    expect(computeRating({ goals: 2, assists: 0, missed: 0, lost: 0, result: 'W', assistedShots: 1 })).toBe(70);
    expect(computeRating({ goals: 0, assists: 0, missed: 1, lost: 0, result: 'D', assistedShots: 1 })).toBe(55);
  });
});

describe('levels', () => {
  it('uses 60 · (n² − 1) up to the level cap', () => {
    expect(xpNeed(1)).toBe(0);
    expect(xpNeed(5)).toBe(1440);
    expect(levelForXp(0)).toBe(1);
    expect(levelForXp(1439)).toBe(4);
    expect(levelForXp(1440)).toBe(5);
    expect(levelForXp(10_000_000)).toBe(config.levelCap);
    expect(levelForXp(1440, { xpCurveA: 100, levelCap: 60 })).toBe(3);
  });
});

describe('energy', () => {
  const step = config.energyRegenSeconds * 1000;

  it('regenerates from server time and keeps partial progress', () => {
    const s = currentEnergy({ energy: 1, updatedAt: NOW }, NOW + 2 * step + 1_000, config);
    expect(s).toEqual({ energy: 3, updatedAt: NOW + 2 * step });
  });

  it('caps at max and restarts the clock when full', () => {
    expect(currentEnergy({ energy: 0, updatedAt: NOW }, NOW + 99 * step, config)).toEqual({ energy: config.energyMax, updatedAt: NOW + 99 * step });
  });

  it('cannot go negative', () => {
    expect(spendEnergy({ energy: 0, updatedAt: NOW }, 1, NOW, config)).toBeNull();
    expect(spendEnergy({ energy: 5, updatedAt: NOW - step }, 1, NOW, config)).toEqual({ energy: 4, updatedAt: NOW });
  });
});

describe('checkName', () => {
  it('accepts Turkish names and short tags', () => {
    expect(checkName('Çınaraltı', 'mahalle')).toBeNull();
    expect(checkName('Efe_10', 'nick')).toBeNull();
    expect(checkName('Karagümrük Gençler', 'mahalle')).toBeNull();
  });
  it('enforces length and characters', () => {
    expect(checkName('E', 'nick')).toBe('too_short');
    expect(checkName('a'.repeat(15), 'nick')).toBe('too_long');
    expect(checkName('a'.repeat(15), 'mahalle')).toBeNull();
    expect(checkName('Efe <3', 'nick')).toBe('bad_chars');
  });
  it('blocks swear words, also with swapped letters, but not words that merely contain them', () => {
    expect(checkName('Orospu FC', 'mahalle')).toBe('blocked');
    expect(checkName('0rospu', 'nick')).toBe('blocked');
    expect(checkName('amk takım', 'mahalle')).toBe('blocked');
    expect(checkName('Sikke Sokak', 'mahalle')).toBeNull();
    expect(checkName('Akıncılar', 'mahalle')).toBeNull();
  });
});

describe('mahalle day', () => {
  const m = config.mahalle;
  const c = (playerId: string, goals: number, assists: number, opponentGoals: number, rating: number) =>
    ({ playerId, goals, assists, opponentGoals, rating });

  it('uses the Turkey calendar day', () => {
    expect(istanbulDay(Date.UTC(2026, 9, 23, 20, 59))).toBe('2026-10-23');
    expect(istanbulDay(Date.UTC(2026, 9, 23, 21, 0))).toBe('2026-10-24');
  });

  it('is deterministic and keeps the opponent in range', () => {
    const a = mahalleOpponent('m1', '2026-10-23', 6);
    expect(mahalleOpponent('m1', '2026-10-23', 6)).toEqual(a);
    expect(a.goalkeeping).toBeGreaterThanOrEqual(44);
    expect(a.attack).toBeLessThanOrEqual(95);
  });

  it('counts the best slots, fills the rest and pays everyone who played', () => {
    const contributions = [c('a', 2, 1, 0, 90), c('b', 0, 0, 2, 55), c('c', 1, 0, 1, 70)];
    const members = ['a', 'b', 'c', 'd'].map((playerId) => ({ playerId, real: true }));
    const day = settleMahalleDay({ mahalleId: 'm1', day: '2026-10-23', contributions, members }, config);
    expect(day.fills).toBe(m.slots - 3);
    expect(day.counted).toEqual(['a', 'c', 'b']);
    expect(day.motm).toBe('a');
    expect(day.turnout).toBe(true); // 3 of 4 real members played
    expect(day.payouts.map((p) => p.playerId)).toEqual(['a', 'c', 'b']);
    expect(settleMahalleDay({ mahalleId: 'm1', day: '2026-10-23', contributions, members }, config)).toEqual(day);
    if (day.result === 'W') expect(day.payouts[0]).toMatchObject({ coin: m.winBonusCoin + m.turnoutBonusCoin, xp: m.winXp + m.motmXp });
    expect(day.payouts[2]!.respect).toBe(m.respectRatingLow + (day.result === 'W' ? m.respectWin : 0));
  });

  it('drops the best-of rule beyond the slot count and skips turnout without real members', () => {
    const contributions = Array.from({ length: 9 }, (_, i) => c(`p${i}`, 1, 0, 0, 60 + i));
    const day = settleMahalleDay({ mahalleId: 'm2', day: '2026-10-23', contributions, members: [] }, config);
    expect(day.counted).toHaveLength(m.slots);
    expect(day.counted[0]).toBe('p8');
    expect(day.fills).toBe(0);
    expect(day.ourGoals).toBe(m.slots);
    expect(day.turnout).toBe(false);
    expect(day.payouts).toHaveLength(9); // extra players still get the bonus
  });

  it('lets a mahalle of NPC children win about 60% of days', () => {
    let wins = 0;
    for (let i = 0; i < 4000; i++) {
      const d = settleMahalleDay({ mahalleId: `m${i}`, day: '2026-10-23', contributions: [], members: [] }, config);
      if (d.result === 'W') wins++;
    }
    expect(wins / 4000).toBeGreaterThan(0.55);
    expect(wins / 4000).toBeLessThan(0.65);
  });
});

describe('club career', () => {
  const cc = config.career;

  it('multiplies energy match coin and the daily cap under contract', () => {
    const plain = matchReward({ goals: 1, assists: 0, rating: 75, result: 'W' }, false, 0, config);
    const club = matchReward({ goals: 1, assists: 0, rating: 75, result: 'W' }, false, 0, config, 150);
    expect(club.coin).toBe(Math.trunc(plain.coin * 1.5));
    expect(matchReward({ goals: 1, assists: 0, rating: 75, result: 'W' }, false, 850, config, 150).coin).toBe(50);
  });

  it('needs level, matches and mahalle matches for the first offer', () => {
    expect(offerReady({ level: 5, matches: 10, mahalleMatches: 3 }, config)).toBe(true);
    expect(offerReady({ level: 5, matches: 10, mahalleMatches: 2 }, config)).toBe(false);
    expect(offerReady({ level: 4, matches: 30, mahalleMatches: 9 }, config)).toBe(false);
  });

  it('offers a direct and a trial contract, and a better one at high respect', () => {
    const low = firstOffers('p1', 10, config);
    expect(low.map((o) => o.kind)).toEqual(['direct', 'trial']);
    expect(new Set(low.map((o) => o.clubKey)).size).toBe(2);
    const high = firstOffers('p1', cc.betterOfferRespect, config);
    expect(high.map((o) => o.kind)).toEqual(['direct', 'trial', 'better']);
    for (const o of high) {
      expect(o.salaryWeekly).toBeGreaterThanOrEqual(cc.tiers[0]!.weeklySalary * 0.8);
      expect(o.salaryWeekly).toBeLessThanOrEqual(cc.tiers[0]!.weeklySalary * 1.4);
    }
    expect(firstOffers('p1', 10, config)).toEqual(low);
  });

  it('renews, promotes or sends to a weaker club by coach trust', () => {
    const cur = { tier: 0, clubKey: 'kartaltepe', clubName: 'Kartaltepe SK', level: 12 };
    expect(seasonEndOffers('s', { ...cur, trust: 39 }, config).map((o) => o.kind)).toEqual(['weaker']);
    expect(seasonEndOffers('s', { ...cur, trust: 39 }, config)[0]!.clubKey).not.toBe('kartaltepe');
    expect(seasonEndOffers('s', { ...cur, trust: 55 }, config).map((o) => o.kind)).toEqual(['renew']);
    const up = seasonEndOffers('s', { ...cur, trust: 75 }, config);
    expect(up.map((o) => o.kind)).toEqual(['renew', 'promote']);
    expect(up[1]!.tier).toBe(1);
    expect(seasonEndOffers('s', { ...cur, trust: 75, level: 11 }, config).map((o) => o.kind)).toEqual(['renew']);
  });

  it('plays every team twice in 14 rounds, the player every round', () => {
    const rounds = leagueSchedule(8);
    expect(rounds).toHaveLength(14);
    const pairs = new Map<string, number>();
    for (const round of rounds) {
      expect(new Set(round.flat()).size).toBe(8);
      for (const [h, a] of round) pairs.set(`${h}-${a}`, (pairs.get(`${h}-${a}`) ?? 0) + 1);
    }
    expect(pairs.size).toBe(56); // every ordered pair once: home and away
    expect(new Set(rounds.map((_, r) => playerOpponent(8, r))).size).toBe(7);
  });

  it('builds a consistent table from player results and seeded NPC games', () => {
    const teams = leagueTeams('season1', 0, { key: 'kartaltepe', name: 'Kartaltepe SK' }, config);
    expect(teams).toHaveLength(8);
    expect(teams[0]!.key).toBe('kartaltepe');
    expect(new Set(teams.map((t) => t.key)).size).toBe(8);
    const results = Object.fromEntries(Array.from({ length: 14 }, (_, r) => [r, { us: 3, them: 0 }]));
    const table = leagueTable('season1', teams, results, 14);
    expect(table[0]!.index).toBe(0);
    expect(table[0]!.points).toBe(42);
    expect(table.reduce((a, r) => a + r.played, 0)).toBe(8 * 14);
    expect(table.reduce((a, r) => a + r.goalsFor - r.goalsAgainst, 0)).toBe(0);
    expect(leagueTable('season1', teams, results, 14)).toEqual(table);
  });

  it('pays league matches with multiplier, bonuses, XP and trust', () => {
    const r = leagueReward({ goals: 2, assists: 0, rating: 80, result: 'W' }, false, 0, config);
    const base = matchReward({ goals: 2, assists: 0, rating: 80, result: 'W' }, false, 0, config);
    expect(r.coin).toBe(Math.trunc(base.coin * 1.5) + cc.tiers[0]!.winBonus + 2 * cc.tiers[0]!.goalBonus);
    expect(r.xp).toBe(base.xp + cc.ligXpBonus);
    expect(r.trustDelta).toBe(cc.trustRatingHigh);
    expect(leagueReward({ goals: 0, assists: 0, rating: 50, result: 'L' }, false, 0, config).trustDelta).toBe(cc.trustRatingLow);
    expect(seasonPrize(1, 0, config)).toBe(600);
    expect(seasonPrize(3, 0, config)).toBe(210);
    expect(seasonPrize(4, 0, config)).toBe(0);
    expect(dailySalary(700)).toBe(100);
  });
});

describe('training', () => {
  const tc = config.training;

  it('follows the GDD tables', () => {
    expect([45, 60, 70, 85].map((s) => apNeed(s, tc))).toEqual([3, 4, 5, 6]);
    expect([5, 12, 20, 30, 60].map((l) => statCap(l, tc))).toEqual([57, 68, 80, 95, 99]);
    expect([45, 55, 60, 65].map((s) => privateCost(s, tc))).toEqual([140, 220, 260, 300]);
  });

  it('grades drills and ignores implausibly fast ones', () => {
    expect(drillGrade(90, 2000, tc)).toBe('perfect');
    expect(drillGrade(60, 2000, tc)).toBe('good');
    expect(drillGrade(20, 2000, tc)).toBe('miss');
    expect(drillGrade(100, 100, tc)).toBe('miss');
    expect(drillGain('perfect', tc)).toEqual({ ap: 2, xp: 30 });
  });

  it('turns AP into points and holds them at the cap', () => {
    expect(applyAp(45, 2, 2, 5, config)).toEqual({ stat: 46, ap: 1, ups: 1 });
    expect(applyAp(59, 2, 6, 10, config)).toEqual({ stat: 61, ap: 1, ups: 2 }); // 3 AP for 59→60, 4 for 60→61
    expect(applyAp(57, 0, 20, 5, config)).toEqual({ stat: 57, ap: 3, ups: 0 }); // level 5 cap is 57
    expect(applyAp(57, 3, 0, 6, config)).toEqual({ stat: 58, ap: 0, ups: 1 }); // the cap rose to 59
  });
});
