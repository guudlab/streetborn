// Scores a finished match by replaying the recorded inputs against the ticket,
// then pays the reward. The client never reports stats or amounts.
import {
  ENGINE_VERSIONS,
  EngineInputError,
  simulateMatch,
  type ChanceInput,
  type EngineVersion,
  type MatchSetup,
  type Role,
  type Side,
  type Tactic,
} from '../../../packages/engine/src/index.ts';
import {
  computeRating,
  leagueReward,
  levelForXp,
  matchReward,
  validateMatch,
  type MatchTicket,
} from '../../../packages/economy/src/index.ts';
import { handle, HttpError, json } from '../_shared/http.ts';
import { afterMatch, unlockAchievements } from '../_shared/kariyer.ts';
import { admin, loadEconomyConfig, requirePlayer } from '../_shared/supabase.ts';

Deno.serve(handle(async (req) => {
  const playerId = await requirePlayer(req);
  const body = parseBody(await req.json().catch(() => null));
  const config = await loadEconomyConfig();
  const now = Date.now();

  const { data: match, error: matchError } = await admin
    .from('matches')
    .select('id, player_id, kind, engine_version, seed, chances, shooting, passing, opponent_goalkeeping, opponent_attack, setup_extra, issued_at, expires_at, status')
    .eq('id', body.matchId)
    .maybeSingle();
  if (matchError) throw matchError;
  if (!match) throw new HttpError(404, 'match_not_found');
  if (!ENGINE_VERSIONS.includes(match.engine_version)) throw new HttpError(409, 'old_ticket');

  // Each match replays with the engine it was issued with.
  const setupExtra = match.setup_extra as { pace?: number; role?: Role } | null;
  const setup: MatchSetup = {
    ...(match.engine_version === 2 ? {} : { engineVersion: match.engine_version as EngineVersion }),
    seed: Number(match.seed),
    chances: match.chances,
    shooting: match.shooting,
    passing: match.passing,
    opponentGoalkeeping: match.opponent_goalkeeping,
    opponentAttack: match.opponent_attack,
    ...(match.engine_version === 4 ? { pace: setupExtra?.pace, role: setupExtra?.role } : {}),
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

  // The daily coin cap counts energy matches only; the other kinds pay under their own ledger reasons.
  const [{ data: earnedToday, error: earnedError }, { data: player, error: playerError }, { data: contract, error: contractError }] =
    await Promise.all([
      admin.rpc('match_coin_today', { p_player: playerId }),
      admin.from('players').select('xp').eq('id', playerId).single(),
      admin.from('contracts').select('tier, active').eq('player_id', playerId).maybeSingle(),
    ]);
  if (earnedError || playerError || contractError) throw earnedError ?? playerError ?? contractError;

  const flagged = check.flagged.length > 0;
  const report = { ...sim, rating };
  let reward: { coin: number; xp: number; capped: boolean };
  let extra: { trustDelta?: number; trialPassed?: boolean } = {};
  if (match.kind === 'league' && contract) {
    // League match: club multiplier, win and goal bonus, +30 XP, coach trust.
    const league = leagueReward(report, flagged, contract.tier, config);
    reward = { coin: league.coin, xp: league.xp, capped: false };
    extra = { trustDelta: league.trustDelta };
  } else if (match.kind === 'energy') {
    // A club contract multiplies energy match coin and the daily cap; mahalle matches never.
    const multiplier = contract?.active ? config.career.tiers[contract.tier]!.coinMultiplierX100 : 100;
    reward = matchReward(report, flagged, Number(earnedToday), config, multiplier);
  } else {
    reward = matchReward(report, flagged, 0, config);
    if (match.kind === 'trial') extra = { trialPassed: !flagged && rating >= config.career.trialMinRating };
  }

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
    p_extra: extra,
  }).single<{ coin: number; xp: number; level: number; already_finished: boolean }>();
  if (error) throw error;

  // Morale, a possible injury and new achievements. A retried finish pays and counts nothing twice.
  let kariyer: { morale: number; injury: { days: number; kind: string } | null; unlocked: { key: string; coin: number }[] } | null = null;
  let bonusCoin = 0;
  if (!data.already_finished) {
    const after = await afterMatch(playerId, match.id, sim.result, now, config);
    const { unlocked } = await unlockAchievements(playerId);
    bonusCoin = unlocked.reduce((sum, u) => sum + u.coin, 0);
    kariyer = { morale: after.morale, injury: after.injury, unlocked };
  }

  return json({
    result: { ...sim, rating },
    reward: data.already_finished ? null : reward,
    flagged,
    ...extra,
    kariyer,
    player: { coin: Number(data.coin) + bonusCoin, xp: Number(data.xp), level: data.level },
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
    if (typeof i?.tactic === 'string') return { chance, tactic: i.tactic as Tactic };
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
