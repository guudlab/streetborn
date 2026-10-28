import type { EconomyConfig } from './config.ts';
import { rng } from './random.ts';

// Form, morale, the pre-match choice, injuries, the weekly friend duel and achievements.
// Pure and seeded: the Edge Functions decide, the app only shows. Ratings are x10.

export type FormLevel = 'none' | 'cold' | 'normal' | 'good' | 'hot';
export type Choice = 'rest' | 'work' | 'hang';
export const CHOICES: readonly Choice[] = ['rest', 'work', 'hang'];

export interface Form { level: FormLevel; avg: number; ratings: number[] }

/** Form from the newest finished matches (ratings x10, any order is fine, only the first `formWindow` count). */
export function formFrom(ratings: number[], config: EconomyConfig): Form {
  const k = config.kariyer;
  const used = ratings.slice(0, k.formWindow);
  if (used.length < k.formMinMatches) return { level: 'none', avg: 0, ratings: used };
  const avg = Math.round(used.reduce((a, b) => a + b, 0) / used.length);
  const level: FormLevel = avg >= k.formHotFrom ? 'hot' : avg >= k.formGoodFrom ? 'good' : avg < k.formColdBelow ? 'cold' : 'normal';
  return { level, avg, ratings: used };
}

export const clampMorale = (v: number) => Math.max(0, Math.min(100, v));

export function moraleAfter(morale: number, result: 'W' | 'D' | 'L', config: EconomyConfig): number {
  const k = config.kariyer;
  return clampMorale(morale + (result === 'W' ? k.moraleWin : result === 'D' ? k.moraleDraw : k.moraleLoss));
}

/** Change a choice makes to morale and respect. */
export function choiceEffect(choice: Choice, config: EconomyConfig): { morale: number; respect: number } {
  const k = config.kariyer;
  return choice === 'rest' ? { morale: k.restMorale, respect: 0 }
    : choice === 'work' ? { morale: k.workMorale, respect: 0 }
    : { morale: k.hangMorale, respect: k.hangRespect };
}

/** Points added to the shooting stat for one match: form, morale and the "work" choice. */
export function shootingBonus(form: FormLevel, morale: number, choice: Choice | null, config: EconomyConfig): number {
  const k = config.kariyer;
  const byForm = form === 'hot' ? k.shootHot : form === 'good' ? k.shootGood : form === 'cold' ? k.shootCold : 0;
  const byMorale = morale >= k.moraleHighFrom ? k.shootMoraleHigh : morale < k.moraleLowBelow ? k.shootMoraleLow : 0;
  return byForm + byMorale + (choice === 'work' ? k.workShoot : 0);
}

export const INJURY_KINDS = ['ankle', 'muscle', 'knee'] as const;
export type InjuryKind = (typeof INJURY_KINDS)[number];

/** Injury risk per mille after a match. Low stamina is riskier; a day of rest halves it. */
export function injuryRisk(stamina: number, choice: Choice | null, config: EconomyConfig): number {
  const k = config.kariyer;
  const raw = Math.max(k.injuryMinRisk, k.injuryBase - (stamina - 40) * k.injuryPerStamina);
  return choice === 'rest' ? Math.max(k.injuryMinRisk, Math.trunc(raw / 2)) : raw;
}

/** The injury (if any) a finished match causes. The seed is the match id, so a retry rolls the same. */
export function rollInjury(seed: string, risk: number, config: EconomyConfig): { days: number; kind: InjuryKind } | null {
  const next = rng(`${seed}:injury`);
  if (next(1000) >= risk) return null;
  const long = next(100) < config.kariyer.injuryLongPct;
  return { days: long ? config.kariyer.injuryLongDays : config.kariyer.injuryShortDays, kind: INJURY_KINDS[next(INJURY_KINDS.length)]! };
}

// ---------------------------------------------------------------------------
// Weekly duel against a mahalle friend
// ---------------------------------------------------------------------------

/** Monday (YYYY-MM-DD) of the week a calendar day (YYYY-MM-DD) is in. */
export function weekStart(day: string): string {
  const ms = Date.parse(`${day}T00:00:00Z`);
  const dow = (new Date(ms).getUTCDay() + 6) % 7;
  return new Date(ms - dow * 86_400_000).toISOString().slice(0, 10);
}

export const addDays = (day: string, n: number) => new Date(Date.parse(`${day}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

/** Duel score: a goal counts two, an assist one. */
export const duelScore = (goals: number, assists: number) => goals * 2 + assists;

export interface Mate { id: string; level: number }

/** The mahalle friend with the closest level (ties by a seeded pick), or null when nobody else can be picked. */
export function pickRival(playerId: string, week: string, level: number, mates: Mate[]): string | null {
  const pool = mates.filter((m) => m.id !== playerId);
  if (pool.length === 0) return null;
  const gap = Math.min(...pool.map((m) => Math.abs(m.level - level)));
  const close = pool.filter((m) => Math.abs(m.level - level) === gap).sort((a, b) => (a.id < b.id ? -1 : 1));
  return close[rng(`${playerId}:${week}:rival`)(close.length)]!.id;
}

/** Kerem's score for a week: he keeps pace with a regular player of the same level. */
export function keremScore(playerId: string, week: string, level: number, config: EconomyConfig): number {
  const k = config.kariyer;
  return k.keremBase + level * k.keremPerLevel + rng(`${playerId}:${week}:kerem`)(k.keremVariance + 1);
}

export type DuelStatus = 'win' | 'lose' | 'draw' | 'void';

/** A week with fewer than `duelMinMatches` matches of your own does not count. */
export function duelResult(mine: { matches: number; score: number }, theirs: { score: number }, config: EconomyConfig): DuelStatus {
  if (mine.matches < config.kariyer.duelMinMatches) return 'void';
  return mine.score > theirs.score ? 'win' : mine.score < theirs.score ? 'lose' : 'draw';
}

// ---------------------------------------------------------------------------
// Achievements
// ---------------------------------------------------------------------------

/** Everything the server counts for the achievements. */
export interface AchievementStats {
  matches: number;
  goals: number;
  assists: number;
  bestMatchGoals: number;
  /** Highest match rating, x10. */
  bestRating: number;
  mahalleMatches: number;
  duelWins: number;
  contracts: number;
  seasonsDone: number;
  /** Best league place ever (1 = champion), 0 when no season ended. */
  bestPlace: number;
  level: number;
}

export interface Achievement {
  key: string;
  group: 'match' | 'mahalle' | 'club';
  coin: number;
  target: number;
  value: (s: AchievementStats) => number;
}

export const ACHIEVEMENTS: readonly Achievement[] = [
  { key: 'first_goal', group: 'match', coin: 50, target: 1, value: (s) => s.goals },
  { key: 'ten_matches', group: 'match', coin: 100, target: 10, value: (s) => s.matches },
  { key: 'hat_trick', group: 'match', coin: 150, target: 3, value: (s) => s.bestMatchGoals },
  { key: 'star_match', group: 'match', coin: 200, target: 90, value: (s) => s.bestRating },
  { key: 'fifty_matches', group: 'match', coin: 300, target: 50, value: (s) => s.matches },
  { key: 'hundred_goals', group: 'match', coin: 500, target: 100, value: (s) => s.goals },
  { key: 'first_mahalle', group: 'mahalle', coin: 50, target: 1, value: (s) => s.mahalleMatches },
  { key: 'ten_mahalle', group: 'mahalle', coin: 200, target: 10, value: (s) => s.mahalleMatches },
  { key: 'first_duel', group: 'mahalle', coin: 150, target: 1, value: (s) => s.duelWins },
  { key: 'five_duels', group: 'mahalle', coin: 400, target: 5, value: (s) => s.duelWins },
  { key: 'first_contract', group: 'club', coin: 200, target: 1, value: (s) => s.contracts },
  { key: 'season_done', group: 'club', coin: 150, target: 1, value: (s) => s.seasonsDone },
  { key: 'champion', group: 'club', coin: 600, target: 1, value: (s) => (s.bestPlace === 1 ? 1 : 0) },
  { key: 'level_10', group: 'club', coin: 150, target: 10, value: (s) => s.level },
  { key: 'level_20', group: 'club', coin: 400, target: 20, value: (s) => s.level },
];

/** Achievements the stats reach that are not unlocked yet. */
export function newAchievements(stats: AchievementStats, unlocked: ReadonlySet<string>): Achievement[] {
  return ACHIEVEMENTS.filter((a) => !unlocked.has(a.key) && a.value(stats) >= a.target);
}
