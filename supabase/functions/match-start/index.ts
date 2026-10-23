// Spends energy and issues a match ticket (seed + setup). The client plays the
// match with this setup; match-finish replays the recorded inputs to score it.
import { ENGINE_VERSION, planMatch, type MatchSetup } from '../../../packages/engine/src/index.ts';
import { istanbulDay, mahalleOpponent, spendEnergy } from '../../../packages/economy/src/index.ts';
import { handle, HttpError, json } from '../_shared/http.ts';
import { admin, loadEconomyConfig, randomSeed, requirePlayer } from '../_shared/supabase.ts';

Deno.serve(handle(async (req) => {
  const playerId = await requirePlayer(req);
  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const mahalleMatch = body.kind === 'mahalle';
  const config = await loadEconomyConfig();
  const now = Date.now();

  const [{ data: wallet, error: walletError }, { data: player, error: playerError }, { data: stats, error: statsError }] =
    await Promise.all([
      admin.from('wallets').select('energy, energy_updated_at, version').eq('player_id', playerId).single(),
      admin.from('players').select('level').eq('id', playerId).single(),
      admin.from('player_stats').select('shooting, passing').eq('player_id', playerId).single(),
    ]);
  if (walletError || playerError || statsError) throw walletError ?? playerError ?? statsError;

  const spent = spendEnergy(
    { energy: wallet.energy, updatedAt: Date.parse(wallet.energy_updated_at) },
    mahalleMatch ? config.fixtureEnergyCost : config.matchEnergyCost,
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
  const setup: MatchSetup = {
    engineVersion: ENGINE_VERSION,
    seed: randomSeed(),
    chances: config.matchChances,
    shooting: stats.shooting,
    passing: stats.passing,
    opponentGoalkeeping: opponent.goalkeeping,
    opponentAttack: opponent.attack,
  };
  planMatch(setup); // throws on a bad setup before energy is spent
  const expiresAt = now + config.ticketTtlSeconds * 1000;

  const { data: matchId, error } = await admin.rpc(mahalleMatch ? 'begin_mahalle_match' : 'begin_match', {
    p_player: playerId,
    p_expected_version: wallet.version,
    p_energy: spent.energy,
    p_energy_updated_at: new Date(spent.updatedAt).toISOString(),
    p_engine_version: ENGINE_VERSION,
    p_seed: setup.seed,
    p_chances: setup.chances,
    p_shooting: setup.shooting,
    p_passing: setup.passing,
    p_opponent_goalkeeping: setup.opponentGoalkeeping,
    p_opponent_attack: setup.opponentAttack,
    p_expires_at: new Date(expiresAt).toISOString(),
    ...(mahalleMatch ? { p_opponent: opponent } : {}),
  });
  // Another request changed the wallet first; the client simply retries.
  if (error?.code === '40001') throw new HttpError(409, 'retry');
  if (error?.message === 'not_member') throw new HttpError(403, 'not_member');
  if (error?.message === 'already_played') throw new HttpError(409, 'already_played');
  if (error) throw error;

  return json({ matchId, setup, expiresAt, energy: spent, ...(mahalleMatch ? { opponentName: opponent.name } : {}) });
}));
