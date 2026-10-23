// Settles every mahalle day that has ended. Runs from the schedule in
// .github/workflows/mahalle-close.yml shortly after 00:00 Turkey time and is safe
// to run again: a closed day is skipped by settle_mahalle_day.
import { levelForXp, settleMahalleDay, type DayContribution, type DayMember } from '../../../packages/economy/src/index.ts';
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
  return json({ settled, groups: groups.size });
}));
