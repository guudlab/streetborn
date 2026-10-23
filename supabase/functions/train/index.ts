// One training session. A drill sends the timing quality (0..100) and how long it
// took; the first drills of the day are free, then each costs energy. A private
// session costs coin by the stat's value. AP, stat points, XP and every amount
// are computed here; the client never sends them.
import {
  STAT_NAMES,
  applyAp,
  drillGain,
  drillGrade,
  levelForXp,
  privateCost,
  spendEnergy,
  type StatName,
} from '../../../packages/economy/src/index.ts';
import { handle, HttpError, json } from '../_shared/http.ts';
import { admin, loadEconomyConfig, requirePlayer } from '../_shared/supabase.ts';

const SQL_ERRORS: Record<string, number> = { limit: 429, no_coin: 402 };

Deno.serve(handle(async (req) => {
  const playerId = await requirePlayer(req);
  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const stat = body.stat as StatName;
  const kind = body.kind === 'private' ? 'private' : 'drill';
  if (!STAT_NAMES.includes(stat)) throw new HttpError(400, 'bad_stat');
  if (kind === 'drill' && (!Number.isInteger(body.quality) || (body.quality as number) < 0 || (body.quality as number) > 100
    || !Number.isInteger(body.durationMs) || (body.durationMs as number) < 0)) {
    throw new HttpError(400, 'bad_body');
  }
  const config = await loadEconomyConfig();
  const tc = config.training;

  const [{ data: stats, error: statsError }, { data: player, error: playerError }, { data: wallet, error: walletError }, { data: today, error: todayError }] =
    await Promise.all([
      admin.from('player_stats').select(`${stat}, ap_${stat}`).eq('player_id', playerId).single(),
      admin.from('players').select('xp, level').eq('id', playerId).single(),
      admin.from('wallets').select('coin, energy, energy_updated_at, version').eq('player_id', playerId).single(),
      admin.from('training_log').select('kind').eq('player_id', playerId).eq('day', await todayIstanbul()),
    ]);
  if (statsError || playerError || walletError || todayError) throw statsError ?? playerError ?? walletError ?? todayError;
  const row = stats as unknown as Record<string, number>;
  const value = row[stat]!, ap = row[`ap_${stat}`]!;
  const used = (k: string) => (today ?? []).filter((t) => t.kind === k).length;

  let logKind: 'free' | 'energy' | 'private';
  let gain: { ap: number; xp: number };
  let grade: string | null = null;
  let coin = 0;
  let limit: number | null = null;
  let energy = { energy: wallet.energy, updatedAt: Date.parse(wallet.energy_updated_at) };

  if (kind === 'private') {
    logKind = 'private';
    limit = tc.privateSessionsPerDay;
    coin = privateCost(value, tc);
    if (Number(wallet.coin) < coin) throw new HttpError(402, 'no_coin');
    gain = { ap: tc.privateAp, xp: tc.privateXp };
  } else {
    const g = drillGrade(body.quality as number, body.durationMs as number, tc);
    grade = g;
    gain = drillGain(g, tc);
    if (used('free') < tc.freeDrillsPerDay) {
      logKind = 'free';
      limit = tc.freeDrillsPerDay;
    } else {
      logKind = 'energy';
      const spent = spendEnergy(energy, tc.drillEnergyCost, Date.now(), config);
      if (!spent) throw new HttpError(409, 'no_energy');
      energy = spent;
    }
  }

  const xpAfter = Number(player.xp) + gain.xp;
  const level = levelForXp(xpAfter, config);
  // The cap follows the level the player reaches with this session's XP.
  const after = applyAp(value, ap, gain.ap, Math.max(player.level, level), config);

  const { error } = await admin.rpc('apply_training', {
    p_player: playerId, p_kind: logKind, p_stat: stat, p_grade: grade,
    p_expected_stat: value, p_expected_ap: ap, p_stat_after: after.stat, p_ap_after: after.ap,
    p_ap: gain.ap, p_xp: gain.xp, p_level: level, p_coin: coin, p_limit: limit,
    p_expected_version: wallet.version, p_energy: energy.energy, p_energy_updated_at: new Date(energy.updatedAt).toISOString(),
  });
  if (error?.code === '40001') throw new HttpError(409, 'retry');
  if (error && SQL_ERRORS[error.message]) throw new HttpError(SQL_ERRORS[error.message]!, error.message);
  if (error) throw error;

  return json({
    grade, ap: gain.ap, xp: gain.xp, coin,
    stat: { name: stat, before: value, after: after.stat, ap: after.ap },
    player: { xp: xpAfter, level: Math.max(player.level, level), coin: Number(wallet.coin) - coin },
    energy: logKind === 'energy' ? energy : null,
  });
}));

async function todayIstanbul(): Promise<string> {
  const { data, error } = await admin.rpc('mahalle_today');
  if (error) throw error;
  return data as string;
}
