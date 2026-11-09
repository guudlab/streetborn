// Test mode tools. Works only for a player whose `players.test_mode` the owner switched on
// in the database; everyone else gets 403. Actions: `status`, `days` (skip league days),
// `coin`, `gem`, `level`, `energy`, `trust`. The client sends a plain number; coin and gem
// still go through grant_currency() and leave a ledger row with reason 'dev'.
import { levelForXp, xpNeed } from '../../../packages/economy/src/index.ts';
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
    default:
      throw new HttpError(400, 'bad_action');
  }
}));

function fail2<T>(res: { data: T; error: { message: string } | null }): T {
  fail(res.error);
  return res.data;
}
