// Test mode tools. Works only for a player whose `players.test_mode` the owner switched on
// in the database; everyone else gets 403. Actions: `status`, `days` (skip league days),
// `coin`, `gem`, `level`, `energy`, `trust`, `resetDay` (today's limits), `injury`, `morale`, `respect`,
// `stats`, `offer` (a club offer at a tier) and `resetCareer`. The client sends a plain number; coin and gem
// still go through grant_currency() and leave a ledger row with reason 'dev'.
import { CLUBS, levelForXp, xpNeed } from '../../../packages/economy/src/index.ts';
import { handle, HttpError, json } from '../_shared/http.ts';
import { admin, loadEconomyConfig, requirePlayer } from '../_shared/supabase.ts';

const int = (v: unknown, min: number, max: number): number => {
  if (typeof v !== 'number' || !Number.isInteger(v) || v < min || v > max) throw new HttpError(400, 'bad_value');
  return v;
};

function fail(error: { message: string } | null) {
  if (!error) return;
  if (error.message === 'forbidden') throw new HttpError(403, 'forbidden');
  throw error;
}

Deno.serve(handle(async (req) => {
  const playerId = await requirePlayer(req);
  const body = await req.json().catch(() => ({})) as { action?: unknown; value?: unknown };

  const { data, error } = await admin.from('players').select('test_mode').eq('id', playerId).single();
  if (error) throw error;
  if (!data.test_mode) throw new HttpError(403, 'forbidden');

  const config = await loadEconomyConfig();
  switch (body.action) {
    case 'status':
      return json({ enabled: true });
    case 'days':
      fail((await admin.rpc('dev_skip_days', { p_player: playerId, p_days: int(body.value, 1, 30) })).error);
      return json({ ok: true });
    case 'coin':
    case 'gem': {
      const balance = fail2(await admin.rpc('dev_grant', { p_player: playerId, p_currency: body.action, p_amount: int(body.value, -1_000_000, 1_000_000) }));
      return json({ balance: Number(balance) });
    }
    case 'level': {
      const level = int(body.value, 1, config.levelCap);
      fail((await admin.rpc('dev_set_level', { p_player: playerId, p_level: level, p_xp: xpNeed(level, config) })).error);
      return json({ level: levelForXp(xpNeed(level, config), config) });
    }
    case 'energy':
      fail((await admin.rpc('dev_fill_energy', { p_player: playerId, p_energy: config.energyMax })).error);
      return json({ ok: true });
    case 'trust':
      fail((await admin.rpc('dev_set_trust', { p_player: playerId, p_trust: int(body.value, 0, 100) })).error);
      return json({ ok: true });
    case 'resetDay':
      fail((await admin.rpc('dev_reset_day', { p_player: playerId })).error);
      return json({ ok: true });
    case 'injury':
      fail((await admin.rpc('dev_injury', { p_player: playerId, p_on: int(body.value, 0, 1) === 1 })).error);
      return json({ ok: true });
    case 'morale':
      fail((await admin.rpc('dev_set_morale', { p_player: playerId, p_morale: int(body.value, 0, 100) })).error);
      return json({ ok: true });
    case 'respect':
      fail((await admin.rpc('dev_set_respect', { p_player: playerId, p_respect: int(body.value, 0, 100_000) })).error);
      return json({ ok: true });
    case 'stats':
      fail((await admin.rpc('dev_set_stats', { p_player: playerId, p_value: int(body.value, 1, 100) })).error);
      return json({ ok: true });
    case 'offer': {
      // value: tier 0..2 of the amateur ladder; the club and the salary come from the config.
      const tier = int(body.value, 0, config.career.tiers.length - 1);
      const club = CLUBS[tier]![Math.floor(Math.random() * CLUBS[tier]!.length)]!;
      const { error } = await admin.rpc('dev_offer', {
        p_player: playerId, p_kind: 'direct', p_tier: tier, p_club_key: club.key, p_club_name: club.name,
        p_salary: config.career.tiers[tier]!.weeklySalary,
      });
      fail(error);
      return json({ ok: true });
    }
    case 'resetCareer':
      fail((await admin.rpc('dev_reset_career', { p_player: playerId })).error);
      return json({ ok: true });
    default:
      throw new HttpError(400, 'bad_action');
  }
}));

function fail2<T>(res: { data: T; error: { message: string } | null }): T {
  fail(res.error);
  return res.data;
}
