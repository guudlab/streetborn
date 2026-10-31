// Spends energy and issues a match ticket (seed + setup). The client plays the
// match with this setup; match-finish replays the recorded inputs to score it.
import { ENGINE_VERSION, planMatch, ROLES, type EngineVersion, type MatchSetup, type Role } from '../../../packages/engine/src/index.ts';
import {
  dailyDrill,
  istanbulDay,
  leagueSchedule,
  shootingBonus,
  mahalleOpponent,
  playerOpponent,
  spendEnergy,
  type LeagueTeam,
} from '../../../packages/economy/src/index.ts';
import { handle, HttpError, json } from '../_shared/http.ts';
import { loadState } from '../_shared/kariyer.ts';
import { admin, loadEconomyConfig, randomSeed, requirePlayer } from '../_shared/supabase.ts';

Deno.serve(handle(async (req) => {
  const playerId = await requirePlayer(req);
  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const kind = ['mahalle', 'league', 'trial'].includes(body.kind as string) ? body.kind as 'mahalle' | 'league' | 'trial' : 'energy';
  const mahalleMatch = kind === 'mahalle';
  const fixture = kind !== 'energy';
  // Builds from before the live match do not send `engine` and keep playing engine 3.
  const engineVersion: EngineVersion = body.engine === ENGINE_VERSION ? ENGINE_VERSION : 3;
  const config = await loadEconomyConfig();
  const now = Date.now();

  const [{ data: wallet, error: walletError }, { data: player, error: playerError }, { data: stats, error: statsError }] =
    await Promise.all([
      admin.from('wallets').select('energy, energy_updated_at, version').eq('player_id', playerId).single(),
      admin.from('players').select('level, character').eq('id', playerId).single(),
      admin.from('player_stats').select('shooting, passing, pace').eq('player_id', playerId).single(),
    ]);
  if (walletError || playerError || statsError) throw walletError ?? playerError ?? statsError;

  // Form, morale and the day's "work" choice move the shooting stat for this match; the ticket stores
  // the result, so match-finish replays with the same number. An injured player rests from friendlies.
  const state = await loadState(playerId, now, config);
  if (state.injury && kind === 'energy') throw new HttpError(409, 'injured', { until: state.injury.until });
  // 3 stars today on the drill of the day or on omuz oku count as "work" for the mahalle match (they do not add up).
  let choice = state.choice;
  if (mahalleMatch) {
    const day = istanbulDay(now);
    const { data: prep, error: prepError } = await admin.from('training_log').select('id')
      .eq('player_id', playerId).eq('day', day).in('stat', [dailyDrill(day), 'defense']).eq('stars', 3).limit(1);
    if (prepError) throw prepError;
    if (prep?.length) choice = 'work';
  }
  const shooting = Math.max(1, Math.min(100, stats.shooting + shootingBonus(state.form.level, state.morale, choice, config)));

  const spent = spendEnergy(
    { energy: wallet.energy, updatedAt: Date.parse(wallet.energy_updated_at) },
    fixture ? config.fixtureEnergyCost : config.matchEnergyCost,
    now,
    config,
  );
  if (!spent) throw new HttpError(409, 'no_energy');

  // Energy matches use a placeholder opponent strength until the league table drives it.
  let opponent = { name: '', goalkeeping: Math.min(95, 35 + player.level * 2), attack: Math.min(95, 30 + player.level * 2) };
  if (mahalleMatch) {
    // The whole mahalle faces the same NPC mahalle today; its strength follows the average member level.
    const { data: membership, error: membershipError } = await admin
      .from('mahalle_uye').select('mahalle_id').eq('player_id', playerId).maybeSingle();
    if (membershipError) throw membershipError;
    if (!membership) throw new HttpError(403, 'not_member');
    const day = istanbulDay(now);
    const { data: gun, error: gunError } = await admin
      .from('mahalle_gun').select('opponent').eq('mahalle_id', membership.mahalle_id).eq('day', day).maybeSingle();
    if (gunError) throw gunError;
    if (gun) {
      opponent = gun.opponent;
    } else {
      const { data: members, error: membersError } = await admin
        .from('mahalle_uye').select('player_id').eq('mahalle_id', membership.mahalle_id);
      if (membersError) throw membersError;
      const { data: rows, error: levelsError } = await admin
        .from('players').select('level').in('id', (members ?? []).map((m) => m.player_id));
      if (levelsError) throw levelsError;
      const levels: number[] = (rows ?? []).map((r) => r.level);
      const avg = Math.round(levels.reduce((a, b) => a + b, 0) / Math.max(1, levels.length));
      opponent = mahalleOpponent(membership.mahalle_id, day, avg);
    }
  }
  let league: { season: string; round: number } | null = null;
  let offerId: string | null = null;
  if (kind === 'league') {
    // Today's round of the player's season; the opponent is that round's NPC club.
    const { data: contract, error: contractError } = await admin
      .from('contracts').select('active, season_id, league_seasons(start_day, teams, status)').eq('player_id', playerId).maybeSingle();
    if (contractError) throw contractError;
    const season = contract?.league_seasons as unknown as { start_day: string; teams: LeagueTeam[]; status: string } | null;
    if (!contract?.active || !contract.season_id || !season || season.status !== 'active') throw new HttpError(403, 'no_contract');
    const round = Math.round((Date.parse(`${istanbulDay(now)}T00:00:00Z`) - Date.parse(`${season.start_day}T00:00:00Z`)) / 86_400_000);
    if (round < 0 || round >= leagueSchedule(season.teams.length).length) throw new HttpError(409, 'season_over');
    const rival = season.teams[playerOpponent(season.teams.length, round)]!;
    opponent = { name: rival.name, goalkeeping: rival.goalkeeping, attack: rival.attack };
    league = { season: contract.season_id, round };
  } else if (kind === 'trial') {
    // The trial club plays at its tier's opponent strength.
    offerId = typeof body.offerId === 'string' ? body.offerId : null;
    const { data: offer, error: offerError } = offerId
      ? await admin.from('offers').select('tier, club_name, kind, status').eq('id', offerId).eq('player_id', playerId).maybeSingle()
      : { data: null, error: null };
    if (offerError) throw offerError;
    if (!offer || offer.kind !== 'trial' || offer.status !== 'open') throw new HttpError(404, 'not_found');
    const tier = config.career.tiers[offer.tier]!;
    opponent = { name: offer.club_name, goalkeeping: tier.oppGoalkeeping, attack: tier.oppAttack };
  }
  // Engine 4 also reads the pace and the position (character creation; bitirici when unset).
  const position = (player.character as { position?: string } | null)?.position;
  const role: Role = ROLES.includes(position as Role) ? position as Role : 'bitirici';
  const setup: MatchSetup = {
    engineVersion,
    seed: randomSeed(),
    chances: config.matchChances,
    shooting,
    passing: stats.passing,
    opponentGoalkeeping: opponent.goalkeeping,
    opponentAttack: opponent.attack,
    ...(engineVersion === 4 ? { pace: stats.pace, role } : {}),
  };
  planMatch(setup); // throws on a bad setup before energy is spent
  const expiresAt = now + config.ticketTtlSeconds * 1000;

  const rpc = mahalleMatch ? 'begin_mahalle_match' : fixture ? 'begin_fixture_match' : 'begin_match';
  const { data: matchId, error } = await admin.rpc(rpc, {
    p_player: playerId,
    p_expected_version: wallet.version,
    p_energy: spent.energy,
    p_energy_updated_at: new Date(spent.updatedAt).toISOString(),
    p_engine_version: engineVersion,
    p_seed: setup.seed,
    p_chances: setup.chances,
    p_shooting: setup.shooting,
    p_passing: setup.passing,
    p_opponent_goalkeeping: setup.opponentGoalkeeping,
    p_opponent_attack: setup.opponentAttack,
    p_expires_at: new Date(expiresAt).toISOString(),
    ...(mahalleMatch ? { p_opponent: opponent } : {}),
    ...(kind === 'league' || kind === 'trial'
      ? { p_kind: kind, p_season: league?.season ?? null, p_round: league?.round ?? null, p_offer: offerId }
      : {}),
  });
  // Another request changed the wallet first; the client simply retries.
  if (error?.code === '40001') throw new HttpError(409, 'retry');
  if (error?.message === 'not_member') throw new HttpError(403, 'not_member');
  if (error?.message === 'already_played') throw new HttpError(409, 'already_played');
  if (error?.message === 'no_contract') throw new HttpError(403, 'no_contract');
  if (error?.message === 'not_found') throw new HttpError(404, 'not_found');
  if (error) throw error;
  if (engineVersion === 4) {
    // Stored next to the ticket; if this fails the client never gets the ticket, as with any lost reply.
    const { error: extraError } = await admin.from('matches').update({ setup_extra: { pace: setup.pace, role: setup.role } }).eq('id', matchId);
    if (extraError) throw extraError;
  }

  return json({ matchId, setup, expiresAt, energy: spent, ...(fixture ? { opponentName: opponent.name } : {}) });
}));
