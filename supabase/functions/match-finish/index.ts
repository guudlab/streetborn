// Scores a finished match by replaying the recorded inputs against the ticket,
// then pays the reward. The client never reports stats or amounts.
import {
  ENGINE_VERSIONS,
  EngineInputError,
  simulateMatch,
  type ChanceInput,
  type EngineVersion,
  type MatchSetup,
  type Side,
} from '../../../packages/engine/src/index.ts';
import {
  computeRating,
  levelForXp,
  matchReward,
  validateMatch,
  type MatchTicket,
} from '../../../packages/economy/src/index.ts';
import { handle, HttpError, json } from '../_shared/http.ts';
import { admin, loadEconomyConfig, requirePlayer } from '../_shared/supabase.ts';

Deno.serve(handle(async (req) => {
  const playerId = await requirePlayer(req);
  const body = parseBody(await req.json().catch(() => null));
  const config = await loadEconomyConfig();
  const now = Date.now();

  const { data: match, error: matchError } = await admin
    .from('matches')
    .select('id, player_id, kind, engine_version, seed, chances, shooting, passing, opponent_goalkeeping, opponent_attack, issued_at, expires_at, status')
    .eq('id', body.matchId)
    .maybeSingle();
  if (matchError) throw matchError;
  if (!match) throw new HttpError(404, 'match_not_found');
  if (!ENGINE_VERSIONS.includes(match.engine_version)) throw new HttpError(409, 'old_ticket');

  // Each match replays with the engine it was issued with.
  const setup: MatchSetup = {
    ...(match.engine_version === 2 ? {} : { engineVersion: match.engine_version as EngineVersion }),
    seed: Number(match.seed),
    chances: match.chances,
    shooting: match.shooting,
    passing: match.passing,
    opponentGoalkeeping: match.opponent_goalkeeping,
    opponentAttack: match.opponent_attack,
  };
  let sim;
  try {
    sim = simulateMatch(setup, body.inputs);
  } catch (e) {
    if (e instanceof EngineInputError) throw new HttpError(422, 'bad_inputs', e.message);
    throw e;
  }
  const rating = computeRating(sim);

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
    seed: setup.seed,
    chances: match.chances,
    issuedAt: Date.parse(match.issued_at),
    expiresAt: Date.parse(match.expires_at),
    status: match.status,
  };
  // The client's clock can lie; never believe a longer match than the server saw.
  const durationMs = Math.min(body.durationMs, now - ticket.issuedAt);
  const check = validateMatch(ticket, { ...sim, rating, durationMs }, {
    playerId,
    now,
    lastFinishedAt: last?.finished_at ? Date.parse(last.finished_at) : null,
  }, config);
  if (check.rejected.length > 0) throw new HttpError(422, 'rejected', check.rejected);

  // The daily coin cap counts energy matches only; mahalle matches pay under their own ledger reason.
  const [{ data: earnedToday, error: earnedError }, { data: player, error: playerError }] = await Promise.all([
    admin.rpc('match_coin_today', { p_player: playerId }),
    admin.from('players').select('xp').eq('id', playerId).single(),
  ]);
  if (earnedError || playerError) throw earnedError ?? playerError;

  const flagged = check.flagged.length > 0;
  const reward = matchReward({ ...sim, rating }, flagged, match.kind === 'mahalle' ? 0 : Number(earnedToday), config);

  const { data, error } = await admin.rpc('finish_match', {
    p_match: match.id,
    p_player: playerId,
    p_shots: sim.shots,
    p_shots_on_target: sim.shotsOnTarget,
    p_goals: sim.goals,
    p_assists: sim.assists,
    p_team_goals: sim.us,
    p_opponent_goals: sim.them,
    p_rating: rating,
    p_duration_ms: durationMs,
    p_inputs: body.inputs,
    p_flag_reasons: check.flagged,
    p_coin: reward.coin,
    p_xp: reward.xp,
    p_level: levelForXp(Number(player.xp) + reward.xp, config),
  }).single<{ coin: number; xp: number; level: number; already_finished: boolean }>();
  if (error) throw error;

  return json({
    result: { ...sim, rating },
    reward: data.already_finished ? null : reward,
    flagged,
    player: { coin: Number(data.coin), xp: Number(data.xp), level: data.level },
  });
}));

function parseBody(body: unknown): { matchId: string; inputs: ChanceInput[]; durationMs: number } {
  const b = body as Record<string, unknown> | null;
  if (!b || typeof b.matchId !== 'string' || !Array.isArray(b.inputs) || b.inputs.length > 14 || !Number.isInteger(b.durationMs)) {
    throw new HttpError(400, 'bad_body');
  }
  // Keep only the known fields; the engine validates the values.
  const inputs = b.inputs.map((raw): ChanceInput => {
    const i = raw as Record<string, unknown>;
    const chance = i?.chance as number;
    const timing = i?.timing as number;
    if (typeof i?.defense === 'string') return { chance, defense: i.defense as Side, timing };
    if (typeof i?.pass === 'string') {
      return i.timing === undefined ? { chance, pass: i.pass as Side } : { chance, pass: i.pass as Side, timing };
    }
    const s = i?.shot as Record<string, unknown> | undefined;
    if (!s) throw new HttpError(400, 'bad_body');
    const shot = { aim: s.aim as number, lift: s.lift as number, power: s.power as number };
    return { chance, shot: s.assisted === undefined ? shot : { ...shot, assisted: s.assisted as boolean } };
  });
  return { matchId: b.matchId, inputs, durationMs: b.durationMs as number };
}
