import { describe, expect, it } from 'vitest';
import {
  ACHIEVEMENTS,
  addDays,
  choiceEffect,
  DEFAULT_CONFIG as config,
  duelResult,
  duelScore,
  formFrom,
  injuryRisk,
  keremScore,
  moraleAfter,
  newAchievements,
  pickRival,
  rollInjury,
  shootingBonus,
  weekStart,
  type AchievementStats,
} from './index.ts';

describe('form and morale', () => {
  it('needs a couple of matches before it shows', () => {
    expect(formFrom([80], config).level).toBe('none');
    expect(formFrom([], config).level).toBe('none');
  });

  it('follows the average of the newest five ratings', () => {
    expect(formFrom([80, 80, 70], config).level).toBe('hot');
    expect(formFrom([70, 66, 64], config).level).toBe('good');
    expect(formFrom([60, 60, 60], config).level).toBe('normal');
    expect(formFrom([50, 50, 60], config).level).toBe('cold');
    // Older matches than the window do not count.
    expect(formFrom([80, 80, 80, 80, 80, 10, 10, 10], config).level).toBe('hot');
  });

  it('moves morale by the result and keeps it in 0..100', () => {
    expect(moraleAfter(60, 'W', config)).toBe(65);
    expect(moraleAfter(60, 'L', config)).toBe(56);
    expect(moraleAfter(99, 'W', config)).toBe(100);
    expect(moraleAfter(2, 'L', config)).toBe(0);
  });

  it('adds form, morale and the work choice to the shooting stat', () => {
    expect(shootingBonus('none', 60, null, config)).toBe(0);
    expect(shootingBonus('hot', 85, 'work', config)).toBe(3 + 1 + 2);
    expect(shootingBonus('cold', 20, null, config)).toBe(-3 - 2);
    expect(shootingBonus('normal', 60, 'rest', config)).toBe(0);
  });

  it('gives each choice its own effect', () => {
    expect(choiceEffect('rest', config)).toEqual({ morale: 10, respect: 0 });
    expect(choiceEffect('hang', config).respect).toBe(2);
    expect(choiceEffect('work', config).morale).toBeLessThan(0);
  });
});

describe('injury', () => {
  it('is riskier with low stamina, and rest halves it', () => {
    expect(injuryRisk(40, null, config)).toBe(60);
    expect(injuryRisk(80, null, config)).toBe(20);
    expect(injuryRisk(99, null, config)).toBe(config.kariyer.injuryMinRisk);
    expect(injuryRisk(40, 'rest', config)).toBe(30);
  });

  it('rolls the same for the same match and is rare', () => {
    expect(rollInjury('m1', 60, config)).toEqual(rollInjury('m1', 60, config));
    let hits = 0;
    for (let i = 0; i < 2000; i++) {
      const r = rollInjury(`match-${i}`, 60, config);
      if (r) {
        hits++;
        expect([1, 2]).toContain(r.days);
      }
    }
    expect(hits).toBeGreaterThan(60);
    expect(hits).toBeLessThan(200);
    expect(rollInjury('m1', 0, config)).toBeNull();
  });
});

describe('weekly duel', () => {
  it('finds Monday of the week', () => {
    expect(weekStart('2026-10-28')).toBe('2026-10-26');
    expect(weekStart('2026-10-26')).toBe('2026-10-26');
    expect(weekStart('2026-11-01')).toBe('2026-10-26');
    expect(addDays('2026-10-26', 7)).toBe('2026-11-02');
  });

  it('picks the closest level, never yourself, and null when alone', () => {
    const mates = [{ id: 'a', level: 5 }, { id: 'b', level: 9 }, { id: 'me', level: 8 }, { id: 'c', level: 20 }];
    expect(pickRival('me', '2026-10-26', 8, mates)).toBe('b');
    expect(pickRival('me', '2026-10-26', 8, [{ id: 'me', level: 8 }])).toBeNull();
    const tie = [{ id: 'a', level: 7 }, { id: 'b', level: 9 }];
    expect(['a', 'b']).toContain(pickRival('me', '2026-10-26', 8, tie));
    expect(pickRival('me', '2026-10-26', 8, tie)).toBe(pickRival('me', '2026-10-26', 8, tie));
  });

  it('scores a goal two and an assist one', () => {
    expect(duelScore(3, 2)).toBe(8);
  });

  it('keeps Kerem near a regular player of the same level', () => {
    for (const level of [5, 12, 20]) {
      const s = keremScore('p1', '2026-10-26', level, config);
      expect(s).toBeGreaterThanOrEqual(8 + level);
      expect(s).toBeLessThanOrEqual(8 + level + 7);
    }
    expect(keremScore('p1', '2026-10-26', 7, config)).toBe(keremScore('p1', '2026-10-26', 7, config));
  });

  it('does not count a week with too few matches', () => {
    expect(duelResult({ matches: 2, score: 99 }, { score: 1 }, config)).toBe('void');
    expect(duelResult({ matches: 3, score: 10 }, { score: 9 }, config)).toBe('win');
    expect(duelResult({ matches: 3, score: 9 }, { score: 9 }, config)).toBe('draw');
    expect(duelResult({ matches: 5, score: 4 }, { score: 9 }, config)).toBe('lose');
  });
});

describe('achievements', () => {
  const zero: AchievementStats = {
    matches: 0, goals: 0, assists: 0, bestMatchGoals: 0, bestRating: 0, mahalleMatches: 0, duelWins: 0,
    contracts: 0, seasonsDone: 0, bestPlace: 0, level: 1,
  };

  it('has unique keys', () => {
    expect(new Set(ACHIEVEMENTS.map((a) => a.key)).size).toBe(ACHIEVEMENTS.length);
  });

  it('unlocks nothing for a new player', () => {
    expect(newAchievements(zero, new Set())).toEqual([]);
  });

  it('unlocks what the stats reach, once', () => {
    const stats = { ...zero, matches: 12, goals: 4, bestMatchGoals: 3, level: 10 };
    const keys = newAchievements(stats, new Set()).map((a) => a.key);
    expect(keys).toEqual(expect.arrayContaining(['first_goal', 'ten_matches', 'hat_trick', 'level_10']));
    expect(keys).not.toContain('fifty_matches');
    expect(newAchievements(stats, new Set(keys)).length).toBe(0);
  });

  it('counts only a first place as champion', () => {
    expect(newAchievements({ ...zero, bestPlace: 2 }, new Set()).map((a) => a.key)).not.toContain('champion');
    expect(newAchievements({ ...zero, bestPlace: 1 }, new Set()).map((a) => a.key)).toContain('champion');
  });
});
