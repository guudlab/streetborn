// Spends energy and issues a match ticket (seed + chances). The client plays the
// match with this seed; match-finish validates the result against the ticket.
import { spendEnergy } from '../../../packages/economy/src/index.ts';
import { handle, HttpError, json } from '../_shared/http.ts';
import { admin, loadEconomyConfig, randomSeed, requirePlayer } from '../_shared/supabase.ts';

Deno.serve(handle(async (req) => {
  const playerId = await requirePlayer(req);
  const config = await loadEconomyConfig();
  const now = Date.now();

  const [{ data: wallet, error: walletError }, { data: player, error: playerError }, { data: stats, error: statsError }] =
    await Promise.all([
      admin.from('wallets').select('energy, energy_updated_at, version').eq('player_id', playerId).single(),
      admin.from('players').select('level').eq('id', playerId).single(),
      admin.from('player_stats').select('shooting').eq('player_id', playerId).single(),
    ]);
  if (walletError || playerError || statsError) throw walletError ?? playerError ?? statsError;

  const spent = spendEnergy(
    { energy: wallet.energy, updatedAt: Date.parse(wallet.energy_updated_at) },
    config.matchEnergyCost,
    now,
    config,
  );
  if (!spent) throw new HttpError(409, 'no_energy');

  // Placeholder opponent strength until the league table drives it.
  const opponentGoalkeeping = Math.min(95, 35 + player.level * 2);
  const seed = randomSeed();
  const expiresAt = now + config.ticketTtlSeconds * 1000;

  const { data: matchId, error } = await admin.rpc('begin_match', {
    p_player: playerId,
    p_expected_version: wallet.version,
    p_energy: spent.energy,
    p_energy_updated_at: new Date(spent.updatedAt).toISOString(),
    p_seed: seed,
    p_chances: config.matchChances,
    p_opponent_goalkeeping: opponentGoalkeeping,
    p_expires_at: new Date(expiresAt).toISOString(),
  });
  // Another request changed the wallet first; the client simply retries.
  if (error?.code === '40001') throw new HttpError(409, 'retry');
  if (error) throw error;

  return json({
    matchId,
    setup: { seed, chances: config.matchChances, shooting: stats.shooting, opponentGoalkeeping },
    expiresAt,
    energy: spent,
  });
}));
