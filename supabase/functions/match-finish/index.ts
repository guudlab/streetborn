// Validates a finished match against its ticket and pays the reward. The client
// never says how much to pay; the reward is computed here from the stats.
import {
  matchReward,
  validateMatchReport,
  type MatchReport,
  type MatchTicket,
} from '../../../packages/economy/src/index.ts';
import { handle, HttpError, json } from '../_shared/http.ts';
import { admin, loadEconomyConfig, requirePlayer } from '../_shared/supabase.ts';

Deno.serve(handle(async (req) => {
  const playerId = await requirePlayer(req);
  const report = parseReport(await req.json().catch(() => null));
  const config = await loadEconomyConfig();
  const now = Date.now();

  const { data: match, error: matchError } = await admin
    .from('matches')
    .select('id, player_id, seed, chances, issued_at, expires_at, status')
    .eq('id', report.matchId)
    .maybeSingle();
  if (matchError) throw matchError;
  if (!match) throw new HttpError(404, 'match_not_found');

  const { data: last, error: lastError } = await admin
    .from('matches')
    .select('finished_at')
    .eq('player_id', playerId)
    .eq('status', 'finished')
    .order('finished_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (lastError) throw lastError;

  const ticket: MatchTicket = {
    matchId: match.id,
    playerId: match.player_id,
    seed: match.seed,
    chances: match.chances,
    issuedAt: Date.parse(match.issued_at),
    expiresAt: Date.parse(match.expires_at),
    status: match.status,
  };
  const result = validateMatchReport(ticket, report, {
    playerId,
    now,
    lastFinishedAt: last?.finished_at ? Date.parse(last.finished_at) : null,
  }, config);
  if (result.rejected.length > 0) throw new HttpError(422, 'rejected', result.rejected);

  const { data: earnedToday, error: earnedError } = await admin.rpc('match_coin_today', { p_player: playerId });
  if (earnedError) throw earnedError;

  const flagged = result.flagged.length > 0;
  const reward = matchReward(report, flagged, Number(earnedToday), config);

  const { data, error } = await admin.rpc('finish_match', {
    p_match: report.matchId,
    p_player: playerId,
    p_shots: report.shots,
    p_shots_on_target: report.shotsOnTarget,
    p_goals: report.goals,
    p_rating: report.rating,
    p_duration_ms: report.durationMs,
    p_input_hash: report.inputHash,
    p_flag_reasons: result.flagged,
    p_coin: reward.coin,
    p_xp: reward.xp,
  }).single<{ coin: number; xp: number; already_finished: boolean }>();
  if (error) throw error;

  return json({
    reward: data.already_finished ? null : reward,
    flagged,
    balance: { coin: data.coin, xp: data.xp },
  });
}));

function parseReport(body: unknown): MatchReport {
  const b = body as Record<string, unknown> | null;
  const isInt = (v: unknown): v is number => Number.isInteger(v);
  if (
    !b || typeof b.matchId !== 'string' || typeof b.inputHash !== 'string' ||
    !isInt(b.shots) || !isInt(b.shotsOnTarget) || !isInt(b.goals) || !isInt(b.rating) || !isInt(b.durationMs)
  ) {
    throw new HttpError(400, 'bad_report');
  }
  return {
    matchId: b.matchId,
    shots: b.shots,
    shotsOnTarget: b.shotsOnTarget,
    goals: b.goals,
    rating: b.rating,
    durationMs: b.durationMs,
    inputHash: b.inputHash.slice(0, 128),
  };
}
