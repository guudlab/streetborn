import { describe, expect, it } from 'vitest';
import {
  computeRating,
  currentEnergy,
  DEFAULT_CONFIG as config,
  matchReward,
  spendEnergy,
  validateMatchReport,
  type MatchReport,
  type MatchTicket,
} from './index.ts';

const NOW = 1_800_000_000_000;
const ticket: MatchTicket = {
  matchId: 'm1',
  playerId: 'p1',
  seed: 1,
  chances: 6,
  issuedAt: NOW - 120_000,
  expiresAt: NOW + 600_000,
  status: 'open',
};
const report = (over: Partial<MatchReport> = {}): MatchReport => {
  const base = { matchId: 'm1', shots: 5, shotsOnTarget: 3, goals: 2, durationMs: 90_000, inputHash: 'h' };
  const merged = { ...base, ...over };
  return { rating: computeRating({ chances: 6, ...merged }), ...merged };
};
const ctx = { playerId: 'p1', now: NOW, lastFinishedAt: null };

describe('validateMatchReport', () => {
  it('accepts a normal match', () => {
    expect(validateMatchReport(ticket, report(), ctx, config)).toEqual({ rejected: [], flagged: [] });
  });

  it('rejects another player, a closed or expired ticket', () => {
    expect(validateMatchReport(ticket, report(), { ...ctx, playerId: 'p2' }, config).rejected).toContain('ticket_wrong_player');
    expect(validateMatchReport({ ...ticket, status: 'finished' }, report(), ctx, config).rejected).toContain('ticket_not_open');
    expect(validateMatchReport(ticket, report(), { ...ctx, now: ticket.expiresAt + 1 }, config).rejected).toContain('ticket_expired');
  });

  it('rejects impossible stats', () => {
    for (const bad of [{ goals: 4, shotsOnTarget: 3 }, { shots: 7, shotsOnTarget: 3 }, { goals: -1 }, { shots: 2.5 }]) {
      expect(validateMatchReport(ticket, report(bad), ctx, config).rejected).toContain('stats_impossible');
    }
  });

  it('flags suspicious but possible matches', () => {
    expect(validateMatchReport(ticket, report({ durationMs: 5_000 }), ctx, config).flagged).toContain('too_short');
    expect(validateMatchReport(ticket, { ...report(), rating: 100 }, ctx, config).flagged).toContain('rating_mismatch');
    expect(validateMatchReport(ticket, report({ shots: 6, shotsOnTarget: 6, goals: 6 }), ctx, config).flagged).toContain('conversion_too_high');
    expect(validateMatchReport(ticket, report(), { ...ctx, lastFinishedAt: NOW - 10_000 }, config).flagged).toContain('too_soon_after_last_match');
  });
});

describe('matchReward', () => {
  it('pays goals and rating bonus for a clean match', () => {
    const r = matchReward({ goals: 2, rating: 80 }, false, 0, config);
    expect(r).toEqual({ coin: 20 + 30 + 20, xp: 30 + 20, capped: false });
  });

  it('pays only participation when flagged', () => {
    expect(matchReward({ goals: 5, rating: 100 }, true, 0, config)).toEqual({ coin: 20, xp: 30, capped: false });
  });

  it('respects the daily cap', () => {
    expect(matchReward({ goals: 2, rating: 80 }, false, config.dailyMatchCoinCap - 10, config)).toEqual({ coin: 10, xp: 50, capped: true });
    expect(matchReward({ goals: 2, rating: 80 }, false, config.dailyMatchCoinCap, config).coin).toBe(0);
  });
});

describe('computeRating', () => {
  it('stays within 3.0..10.0', () => {
    expect(computeRating({ chances: 6, shots: 6, shotsOnTarget: 6, goals: 6 })).toBe(100);
    expect(computeRating({ chances: 6, shots: 0, shotsOnTarget: 0, goals: 0 })).toBe(48);
    expect(computeRating({ chances: 30, shots: 30, shotsOnTarget: 0, goals: 0 })).toBe(30);
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
