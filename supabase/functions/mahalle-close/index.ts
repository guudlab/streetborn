// Settles every mahalle day that has ended, then on Mondays forms the week's Mahalle
// Ligi groups. Runs from the schedule in .github/workflows/mahalle-close.yml shortly
// after 00:00 Turkey time and is safe to run again: a closed day, a settled league
// round and an already grouped week are all skipped.
import {
  formLigGroups,
  istanbulDay,
  levelForXp,
  ligOpponent,
  ligRound,
  settleLigMatch,
  settleMahalleDay,
  weekStart,
  type DayContribution,
  type DayMember,
  type DayPayout,
  type EconomyConfig,
  type LigSide,
  type LigSideSettlement,
} from '../../../packages/economy/src/index.ts';
import { handle, HttpError, json } from '../_shared/http.ts';
import { admin, loadEconomyConfig } from '../_shared/supabase.ts';

interface Row {
  mahalle_id: string;
  day: string;
  player_id: string;
  xp: number;
  is_real: boolean;
  played: boolean;
  goals: number | null;
  assists: number | null;
  opponent_goals: number | null;
  rating: number | null;
}

Deno.serve(handle(async (req) => {
  // Only the schedule (service role key) may call this.
  const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '');
  if (!token || token !== Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')) throw new HttpError(401, 'unauthorized');

  const config = await loadEconomyConfig();
  const { data, error } = await admin.rpc('mahalle_to_settle', {
    p_min_age_hours: config.mahalle.realMemberMinAgeHours,
    p_min_matches: config.mahalle.realMemberMinMatches,
  });
  if (error) throw error;

  const groups = new Map<string, Row[]>();
  for (const row of (data ?? []) as Row[]) {
    const key = `${row.mahalle_id}|${row.day}`;
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }

  let settled = 0;
  for (const [key, rows] of groups) {
    const [mahalleId, day] = key.split('|') as [string, string];
    const contributions: DayContribution[] = rows.filter((r) => r.played).map((r) => ({
      playerId: r.player_id, goals: r.goals!, assists: r.assists!, opponentGoals: r.opponent_goals!, rating: r.rating!,
    }));
    const members: DayMember[] = rows.map((r) => ({ playerId: r.player_id, real: r.is_real }));
    const settlement = settleMahalleDay({ mahalleId, day, contributions, members }, config);
    const xpOf = new Map(rows.map((r) => [r.player_id, Number(r.xp)]));

    const { data: done, error: settleError } = await admin.rpc('settle_mahalle_day', {
      p_mahalle: mahalleId,
      p_day: day,
      p_our: settlement.ourGoals,
      p_their: settlement.theirGoals,
      p_result: settlement.result,
      p_summary: {
        counted: settlement.counted, fills: settlement.fills, motm: settlement.motm, turnout: settlement.turnout,
        payouts: settlement.payouts.map((p) => ({ player: p.playerId, coin: p.coin, xp: p.xp, respect: p.respect })),
      },
      p_payouts: settlement.payouts.map((p) => ({
        player: p.playerId, coin: p.coin, xp: p.xp, respect: p.respect,
        level: levelForXp((xpOf.get(p.playerId) ?? 0) + p.xp, config),
      })),
    });
    if (settleError) throw settleError;
    if (done) settled++;
  }
  const league = await settleLeague(config);
  const formed = await formGroups(config);
  return json({ settled, groups: groups.size, league, formed });
}));

// ---------------------------------------------------------------------------
// Mahalle Ligi
// ---------------------------------------------------------------------------

interface PendingTeam { slot: number; mahalleId: string | null; botKey: string | null; name: string; emblem: string; color: string; level: number }
interface PendingRound {
  grup: string;
  round: number;
  day: string;
  teams: PendingTeam[];
  fixtures: { home: number; away: number }[];
  members: { mahalleId: string; playerId: string; xp: number; real: boolean }[];
  contributions: (DayContribution & { mahalleId: string; xp: number })[];
}

/** Closes every ended league round: four matches per group and day, each in two halves. */
async function settleLeague(config: EconomyConfig): Promise<number> {
  const { data, error } = await admin.rpc('lig_to_settle', {
    p_min_age_hours: config.mahalle.realMemberMinAgeHours,
    p_min_matches: config.mahalle.realMemberMinMatches,
    p_limit: 500,
  });
  if (error) throw error;

  let settled = 0;
  for (const round of (data ?? []) as PendingRound[]) {
    const xpOf = new Map<string, number>([
      ...round.members.map((m): [string, number] => [m.playerId, Number(m.xp)]),
      ...round.contributions.map((c): [string, number] => [c.playerId, Number(c.xp)]),
    ]);
    const team = (slot: number) => round.teams.find((t) => t.slot === slot)!;
    // A bot (or a mahalle closed during the week) is all NPC children.
    const side = (slot: number): LigSide => {
      const t = team(slot);
      if (!t.mahalleId) return { key: `${round.grup}:${t.botKey ?? `s${slot}`}`, contributions: [], members: [] };
      return {
        key: t.mahalleId,
        contributions: round.contributions.filter((c) => c.mahalleId === t.mahalleId).map((c) => ({
          playerId: c.playerId, goals: c.goals, assists: c.assists, opponentGoals: c.opponentGoals, rating: c.rating,
        })),
        members: round.members.filter((m) => m.mahalleId === t.mahalleId).map((m) => ({ playerId: m.playerId, real: m.real })),
      };
    };
    const payout = (p: DayPayout) => ({
      player: p.playerId, coin: p.coin, xp: p.xp, respect: p.respect, level: levelForXp((xpOf.get(p.playerId) ?? 0) + p.xp, config),
    });
    const dayOf = (own: PendingTeam, rival: PendingTeam, s: LigSideSettlement) => ({
      mahalle: own.mahalleId,
      opponent: { ...ligOpponent(rival), emblem: rival.emblem, color: rival.color, bot: rival.mahalleId === null },
      our: s.ourGoals,
      their: s.theirGoals,
      result: s.result,
      summary: {
        counted: s.counted, fills: s.fills, motm: s.motm, turnout: s.turnout, halves: s.halves,
        payouts: s.payouts.map((p) => ({ player: p.playerId, coin: p.coin, xp: p.xp, respect: p.respect })),
      },
      payouts: s.payouts.map(payout),
    });

    const matches = [];
    const days = [];
    for (const f of round.fixtures) {
      const s = settleLigMatch({ day: round.day, home: side(f.home), away: side(f.away) }, config);
      // Both halves from the home side: [home, away] in the home side's matches, then in the away side's.
      matches.push({ home: f.home, away: f.away, homeGoals: s.homeGoals, awayGoals: s.awayGoals, detail: { home: s.home.halves.ours, away: s.home.halves.theirs } });
      const home = team(f.home), away = team(f.away);
      if (home.mahalleId) days.push(dayOf(home, away, s.home));
      if (away.mahalleId) days.push(dayOf(away, home, s.away));
    }
    const { data: done, error: settleError } = await admin.rpc('settle_lig_tur', {
      p_grup: round.grup, p_round: round.round, p_matches: matches, p_days: days,
    });
    if (settleError) throw settleError;
    if (done) settled++;
  }
  return settled;
}

/** On Monday: splits the active mahalleler into the week's groups of eight. */
async function formGroups(config: EconomyConfig): Promise<number> {
  const today = istanbulDay(Date.now());
  const week = weekStart(today);
  if (ligRound(week, today) !== 0) return 0;
  const { data, error } = await admin.rpc('lig_adaylari', {
    p_week: week,
    p_min_age_hours: config.mahalle.realMemberMinAgeHours,
    p_min_matches: config.mahalle.realMemberMinMatches,
    p_min_real: config.mahalle.ligMinRealMembers,
    p_active_days: config.mahalle.ligActiveDays,
  });
  if (error) throw error;
  const entries = ((data ?? []) as { mahalle_id: string; name: string; emblem: string; color: string; level: number }[])
    .map((e) => ({ mahalleId: e.mahalle_id, name: e.name, emblem: e.emblem, color: e.color, level: e.level }));
  const groups = formLigGroups(week, entries);
  if (groups.length === 0) return 0;
  const { data: made, error: formError } = await admin.rpc('lig_kur', { p_week: week, p_groups: groups });
  if (formError) throw formError;
  return made as number;
}
