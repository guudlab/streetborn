import { describe, expect, it } from 'vitest';
import {
  checkName,
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
