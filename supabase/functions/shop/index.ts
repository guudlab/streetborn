// The player's own shop actions: `refill` fills energy for gems (twice a day),
// `buy` buys a catalog item at its catalog price, `boots` buys a pair of krampon
// at its config price (coin only, from its unlock level), `equip` wears or takes
// off an owned item. Prices and limits come from the server; the client sends none.
import { currentEnergy } from '../../../packages/economy/src/index.ts';
import { handle, HttpError, json } from '../_shared/http.ts';
import { admin, loadEconomyConfig, requirePlayer } from '../_shared/supabase.ts';

const SQL_ERRORS: Record<string, number> = { limit: 429, no_gem: 402, no_coin: 402, owned: 409, not_for_sale: 404, not_owned: 404, locked: 403 };
const ITEM = /^[a-z0-9_]{1,40}$/;

function fail(error: { message: string; code?: string } | null) {
  if (!error) return;
  if (error.code === '40001') throw new HttpError(409, 'retry');
  const status = SQL_ERRORS[error.message];
  if (status) throw new HttpError(status, error.message);
  throw error;
}

Deno.serve(handle(async (req) => {
  const playerId = await requirePlayer(req);
  const body = await req.json().catch(() => ({})) as Record<string, unknown>;

  if (body.action === 'refill') {
    const config = await loadEconomyConfig();
    const { data: wallet, error } = await admin
      .from('wallets').select('gem, energy, energy_updated_at, version').eq('player_id', playerId).single();
    if (error) throw error;
    const now = Date.now();
    const energy = currentEnergy({ energy: wallet.energy, updatedAt: Date.parse(wallet.energy_updated_at) }, now, config);
    if (energy.energy >= config.energyMax) throw new HttpError(409, 'full');
    if (Number(wallet.gem) < config.shop.refillGem) throw new HttpError(402, 'no_gem');
    fail((await admin.rpc('refill_energy', {
      p_player: playerId, p_cost: config.shop.refillGem, p_limit: config.shop.refillsPerDay,
      p_expected_version: wallet.version, p_energy: config.energyMax,
    })).error);
    return json({
      gem: Number(wallet.gem) - config.shop.refillGem,
      energy: { energy: config.energyMax, updatedAt: now },
    });
  }

  const itemId = typeof body.itemId === 'string' ? body.itemId : '';
  if (!ITEM.test(itemId)) throw new HttpError(400, 'bad_item');

  if (body.action === 'buy') {
    const { data, error } = await admin.rpc('buy_item', { p_player: playerId, p_item: itemId });
    fail(error);
    return json(data);
  }

  if (body.action === 'boots') {
    const boots = (await loadEconomyConfig()).training.boots.find((b) => b.id === itemId);
    if (!boots) throw new HttpError(404, 'not_for_sale');
    const { data, error } = await admin.rpc('buy_boots', {
      p_player: playerId, p_item: itemId, p_price: boots.price, p_uses: boots.uses, p_min_level: boots.unlockLevel,
    });
    fail(error);
    return json(data);
  }

  if (body.action === 'equip') {
    fail((await admin.rpc('equip_item', { p_player: playerId, p_item: itemId, p_on: body.on !== false })).error);
    return json({ ok: true });
  }

  throw new HttpError(400, 'bad_action');
}));
