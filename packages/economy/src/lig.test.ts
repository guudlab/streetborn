import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CONFIG as config,
  formLigGroups,
  LIG_ROUNDS,
  LIG_TEAMS,
  ligFixtures,
  ligOpponent,
  ligRival,
  ligRound,
  ligTable,
  settleLigMatch,
  settleMahalleDay,
  type DayContribution,
  type LigEntry,
} from './index.ts';

const WEEK = '2026-11-09'; // a Monday
const entry = (id: string, level: number, name = `M ${id}`): LigEntry => ({ mahalleId: id, name, emblem: 'shield', color: 'lime', level });
const c = (playerId: string, goals: number, assists: number, opponentGoals: number, rating: number): DayContribution =>
  ({ playerId, goals, assists, opponentGoals, rating });

describe('mahalle ligi fixtures', () => {
  it('pairs every team with every other team exactly once in 7 rounds', () => {
    const f = ligFixtures();
    expect(f).toHaveLength((LIG_TEAMS * LIG_ROUNDS) / 2);
    const pairs = new Set(f.map((x) => [x.home, x.away].sort().join('-')));
    expect(pairs.size).toBe(28);
    for (let r = 0; r < LIG_ROUNDS; r++) {
      const slots = f.filter((x) => x.round === r).flatMap((x) => [x.home, x.away]).sort();
      expect(slots).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    }
  });

  it('finds the rival both ways and maps days to rounds', () => {
    for (let r = 0; r < LIG_ROUNDS; r++) {
      for (let s = 0; s < LIG_TEAMS; s++) expect(ligRival(ligRival(s, r), r)).toBe(s);
    }
    expect(ligRound(WEEK, '2026-11-09')).toBe(0);
    expect(ligRound(WEEK, '2026-11-15')).toBe(6);
    expect(ligRound(WEEK, '2026-11-16')).toBe(-1);
    expect(ligRound(WEEK, '2026-11-08')).toBe(-1);
  });

  it('scales the opponent with the rival level', () => {
    expect(ligOpponent({ name: 'X', level: 5 })).toEqual({ name: 'X', goalkeeping: 45, attack: 40 });
    expect(ligOpponent({ name: 'X', level: 60 }).goalkeeping).toBe(95);
  });
});

describe('mahalle ligi groups', () => {
  it('fills a lone mahalle with seven bots and keeps the result seeded', () => {
    const groups = formLigGroups(WEEK, [entry('a', 4, 'Çınar Mahallesi')]);
    expect(groups).toHaveLength(1);
    const teams = groups[0]!.teams;
    expect(teams.map((t) => t.slot)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(teams.filter((t) => t.mahalleId === 'a')).toHaveLength(1);
    const bots = teams.filter((t) => t.botKey);
    expect(bots).toHaveLength(7);
    // Bot names are unique and never copy a real mahalle of the group.
    expect(new Set(bots.map((b) => b.name)).size).toBe(7);
    expect(bots.some((b) => b.name === 'Çınar Mahallesi')).toBe(false);
    for (const b of bots) expect(Math.abs(b.level - 4)).toBeLessThanOrEqual(1);
    expect(formLigGroups(WEEK, [entry('a', 4, 'Çınar Mahallesi')])).toEqual(groups);
  });

  it('splits into even groups of similar level', () => {
    const entries = Array.from({ length: 10 }, (_, i) => entry(`m${i}`, i + 1));
    const groups = formLigGroups(WEEK, entries);
    expect(groups).toHaveLength(2);
    const real = groups.map((g) => g.teams.filter((t) => t.mahalleId).map((t) => t.level).sort((a, b) => a - b));
    expect(real.map((r) => r.length)).toEqual([5, 5]);
    expect(real[0]).toEqual([6, 7, 8, 9, 10]); // strongest first
    expect(real[1]).toEqual([1, 2, 3, 4, 5]);
    const all = groups.flatMap((g) => g.teams.filter((t) => t.mahalleId).map((t) => t.mahalleId));
    expect(new Set(all).size).toBe(10);
  });

  it('makes no group from no entries and full groups need no bots', () => {
    expect(formLigGroups(WEEK, [])).toEqual([]);
    const groups = formLigGroups(WEEK, Array.from({ length: 16 }, (_, i) => entry(`m${i}`, 3)));
    expect(groups).toHaveLength(2);
    expect(groups.every((g) => g.teams.every((t) => t.mahalleId))).toBe(true);
  });
});

describe('mahalle ligi match', () => {
  const day = '2026-11-10';
  const members = (ids: string[]) => ids.map((playerId) => ({ playerId, real: true }));

  it('adds the two halves into one score from both sides', () => {
    const home = { key: 'h', contributions: [c('a', 2, 1, 0, 80), c('b', 1, 0, 1, 65)], members: members(['a', 'b']) };
    const away = { key: 'w', contributions: [c('x', 0, 0, 3, 50)], members: members(['x', 'y']) };
    const s = settleLigMatch({ day, home, away }, config);
    expect(s.home.ourGoals).toBe(s.homeGoals);
    expect(s.away.ourGoals).toBe(s.awayGoals);
    expect(s.home.theirGoals).toBe(s.awayGoals);
    // Halves seen from each side mirror each other and add up to the score.
    expect(s.home.halves.ours).toEqual([s.away.halves.theirs[1], s.away.halves.theirs[0]]);
    expect(s.home.halves.ours[0] + s.home.halves.theirs[0]).toBe(s.homeGoals);
    expect(s.home.halves.ours[1] + s.home.halves.theirs[1]).toBe(s.awayGoals);
    // Our own half holds at least the goals and assists we scored.
    expect(s.home.halves.ours[0]).toBeGreaterThanOrEqual(4);
    // Goals the rival conceded in their matches count for us.
    expect(s.home.halves.theirs[0]).toBeGreaterThanOrEqual(3);
    expect(s.home.fills).toBe(config.mahalle.slots - 2);
    expect(s.home.motm).toBe('a');
    expect(s.away.payouts.map((p) => p.playerId)).toEqual(['x']);
    expect(settleLigMatch({ day, home, away }, config)).toEqual(s);
    if (s.home.result === 'W') expect(s.away.result).toBe('L');
    if (s.home.result === 'D') expect(s.away.result).toBe('D');
  });

  it('settles a bot pair with NPC children only and pays nobody', () => {
    const s = settleLigMatch({ day, home: { key: 'g:bot0', contributions: [], members: [] }, away: { key: 'g:bot1', contributions: [], members: [] } }, config);
    expect(s.home.payouts).toEqual([]);
    expect(s.away.payouts).toEqual([]);
    expect(s.home.fills).toBe(config.mahalle.slots);
  });

  it('rewards playing: a full squad of decent players beats bots most days', () => {
    let wins = 0;
    for (let i = 0; i < 1000; i++) {
      const squad = Array.from({ length: 7 }, (_, k) => c(`p${k}`, 1, 1, 1, 65));
      const s = settleLigMatch({ day, home: { key: `m${i}`, contributions: squad, members: [] }, away: { key: `b${i}`, contributions: [], members: [] } }, config);
      if (s.home.result === 'W') wins++;
    }
    expect(wins / 1000).toBeGreaterThan(0.8);
  });

  it('leaves the NPC mahalle day unchanged', () => {
    // Same seed and draw order as before the league refactor.
    const d = settleMahalleDay({ mahalleId: 'm1', day: '2026-10-23', contributions: [], members: [] }, config);
    expect(d.fills).toBe(config.mahalle.slots);
    expect(d.counted).toEqual([]);
  });
});

describe('mahalle ligi table', () => {
  it('ranks by points, goal difference, goals, then slot', () => {
    const rows = ligTable([
      { round: 0, home: 0, away: 1, homeGoals: 5, awayGoals: 3 },
      { round: 0, home: 2, away: 3, homeGoals: 4, awayGoals: 4 },
      { round: 1, home: 1, away: 2, homeGoals: 9, awayGoals: 2 },
    ]);
    expect(rows.map((r) => r.slot).slice(0, 4)).toEqual([1, 0, 3, 2]);
    expect(rows[0]).toMatchObject({ slot: 1, played: 2, won: 1, lost: 1, points: 3, goalsFor: 12, goalsAgainst: 7 });
    expect(rows).toHaveLength(LIG_TEAMS);
  });
});
