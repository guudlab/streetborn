import type { EconomyConfig } from './config.ts';
import { leagueSchedule } from './career.ts';
import { dayPayouts, halfScore, NPC_MAHALLE_NAMES, resultOf, type DayContribution, type DayMember, type DaySettlement } from './mahalle.ts';
import { rng } from './random.ts';

// Mahalle Ligi (phase 1): every Monday the active mahalleler are split into groups of
// eight, and each day of the week a mahalle plays one other team of its group (single
// round robin, 7 rounds). Empty places go to bot mahalleler. A day's match has two
// halves: our members' matches (their goals for us, goals conceded for the rival) and
// the rival's members' matches. Pure and seeded, so the server settles and the app draws
// the same table.

export const LIG_TEAMS = 8;
export const LIG_ROUNDS = LIG_TEAMS - 1;

const EMBLEMS = ['shield', 'circle', 'diamond'] as const;
const COLORS = ['lime', 'blue', 'red', 'purple', 'teal', 'white'] as const;

/** A mahalle that can join this week's league. `level` is the average member level. */
export interface LigEntry {
  mahalleId: string;
  name: string;
  emblem: string;
  color: string;
  level: number;
}

/** One place in a group: a real mahalle (mahalleId) or a bot (botKey). */
export interface LigTeam {
  slot: number;
  mahalleId: string | null;
  botKey: string | null;
  name: string;
  emblem: string;
  color: string;
  level: number;
}

export interface LigFixture {
  round: number;
  home: number;
  away: number;
}

export interface LigGroup {
  no: number;
  teams: LigTeam[];
  fixtures: LigFixture[];
}

/** The 28 matches of a group: the first half of the double round robin, so every pair meets once. */
export function ligFixtures(): LigFixture[] {
  return leagueSchedule(LIG_TEAMS).slice(0, LIG_ROUNDS)
    .flatMap((round, r) => round.map(([home, away]) => ({ round: r, home, away })));
}

/** The slot a team faces in a round. */
export function ligRival(slot: number, round: number): number {
  const f = ligFixtures().find((x) => x.round === round && (x.home === slot || x.away === slot))!;
  return f.home === slot ? f.away : f.home;
}

/** The round (0 = Monday .. 6 = Sunday) a day is in a week, or -1 outside it. */
export function ligRound(week: string, day: string): number {
  const r = Math.round((Date.parse(`${day}T00:00:00Z`) - Date.parse(`${week}T00:00:00Z`)) / 86_400_000);
  return r >= 0 && r < LIG_ROUNDS ? r : -1;
}

/** Opponent strength in a member's match, from the rival team's level (fixed for the week). */
export function ligOpponent(team: Pick<LigTeam, 'name' | 'level'>): { name: string; goalkeeping: number; attack: number } {
  return {
    name: team.name,
    goalkeeping: Math.max(1, Math.min(95, 35 + team.level * 2)),
    attack: Math.max(1, Math.min(95, 30 + team.level * 2)),
  };
}

const sameName = (a: string, b: string) => a.toLocaleLowerCase('tr') === b.toLocaleLowerCase('tr');

/**
 * Splits the week's entries into groups of eight. Similar levels play together: entries
 * are sorted by level and cut into as many groups as needed, with sizes that differ by
 * at most one. Each group is topped up with bot mahalleler at the group's average level,
 * then its slots are shuffled with the week's seed so the fixture order is fair.
 */
export function formLigGroups(week: string, entries: LigEntry[]): LigGroup[] {
  const sorted = [...entries].sort((a, b) => b.level - a.level || (a.mahalleId < b.mahalleId ? -1 : 1));
  const count = Math.ceil(sorted.length / LIG_TEAMS);
  const groups: LigGroup[] = [];
  let at = 0;
  for (let g = 0; g < count; g++) {
    const size = Math.floor(sorted.length / count) + (g < sorted.length % count ? 1 : 0);
    const real = sorted.slice(at, at + size);
    at += size;
    const level = Math.max(1, Math.round(real.reduce((sum, e) => sum + e.level, 0) / Math.max(1, real.length)));
    const next = rng(`${week}:g${g}:bots`);
    const names = NPC_MAHALLE_NAMES.filter((n) => !real.some((e) => sameName(e.name, n)));
    const bots: Omit<LigTeam, 'slot'>[] = [];
    for (let i = 0; bots.length < LIG_TEAMS - real.length; i++) {
      const name = names.length > 0 ? names.splice(next(names.length), 1)[0]! : `Mahalle ${i + 1}`;
      const spread = next(3) - 1;
      bots.push({
        mahalleId: null, botKey: `bot${i}`, name,
        emblem: EMBLEMS[next(EMBLEMS.length)]!, color: COLORS[next(COLORS.length)]!, level: Math.max(1, level + spread),
      });
    }
    const pool: Omit<LigTeam, 'slot'>[] = [
      ...real.map((e) => ({ mahalleId: e.mahalleId, botKey: null, name: e.name, emblem: e.emblem, color: e.color, level: Math.max(1, Math.round(e.level)) })),
      ...bots,
    ];
    const shuffle = rng(`${week}:g${g}:order`);
    for (let i = pool.length - 1; i > 0; i--) {
      const j = shuffle(i + 1);
      [pool[i], pool[j]] = [pool[j]!, pool[i]!];
    }
    groups.push({ no: g, teams: pool.map((t, slot) => ({ ...t, slot })), fixtures: ligFixtures() });
  }
  return groups;
}

/** One team's side of a league day: its members' finished mahalle matches (none for a bot). */
export interface LigSide {
  /** The mahalle id, or a stable key for a bot (`<group id>:<bot key>`); seeds the NPC children. */
  key: string;
  contributions: DayContribution[];
  members: DayMember[];
}

export interface LigSideSettlement extends DaySettlement {
  /** Score of our members' matches [us, them] and of the rival's [us, them]. */
  halves: { ours: [number, number]; theirs: [number, number] };
}

export interface LigMatchSettlement {
  homeGoals: number;
  awayGoals: number;
  home: LigSideSettlement;
  away: LigSideSettlement;
}

/**
 * Settles one league match of a day in two halves. Each half is one side's own
 * matches: the best seven count and NPC children fill the empty slots, exactly like
 * the NPC mahalle day. A side that did not play at all (or a bot) is all NPC children.
 */
export function settleLigMatch(input: { day: string; home: LigSide; away: LigSide }, config: EconomyConfig): LigMatchSettlement {
  const h = halfScore(`${input.home.key}:${input.day}:lig`, input.home.contributions, config);
  const a = halfScore(`${input.away.key}:${input.day}:lig`, input.away.contributions, config);
  const homeGoals = h.ours + a.theirs;
  const awayGoals = a.ours + h.theirs;
  const side = (own: typeof h, other: typeof h, us: number, them: number, members: DayMember[]): LigSideSettlement => {
    const result = resultOf(us, them);
    const { motm, turnout, payouts } = dayPayouts(own.ranked, result, members, config);
    return {
      ourGoals: us, theirGoals: them, result, counted: own.counted.map((c) => c.playerId), fills: own.fills,
      motm, turnout, payouts, halves: { ours: [own.ours, own.theirs], theirs: [other.theirs, other.ours] },
    };
  };
  return {
    homeGoals,
    awayGoals,
    home: side(h, a, homeGoals, awayGoals, input.home.members),
    away: side(a, h, awayGoals, homeGoals, input.away.members),
  };
}

export interface LigResult {
  round: number;
  home: number;
  away: number;
  homeGoals: number;
  awayGoals: number;
}

export interface LigRow {
  slot: number;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  points: number;
}

/** Group standings from the settled matches: 3 points a win, 1 a draw; then goal difference, goals, slot. */
export function ligTable(results: LigResult[]): LigRow[] {
  const rows: LigRow[] = Array.from({ length: LIG_TEAMS }, (_, slot) => ({
    slot, played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0, points: 0,
  }));
  const add = (slot: number, gf: number, ga: number) => {
    const r = rows[slot];
    if (!r) return;
    r.played++; r.goalsFor += gf; r.goalsAgainst += ga;
    if (gf > ga) { r.won++; r.points += 3; } else if (gf === ga) { r.drawn++; r.points += 1; } else r.lost++;
  };
  for (const m of results) {
    add(m.home, m.homeGoals, m.awayGoals);
    add(m.away, m.awayGoals, m.homeGoals);
  }
  return rows.sort((x, y) =>
    y.points - x.points || (y.goalsFor - y.goalsAgainst) - (x.goalsFor - x.goalsAgainst) || y.goalsFor - x.goalsFor || x.slot - y.slot);
}
