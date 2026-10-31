// The app calls this right after a store purchase (and on shop open) to collect its
// gems without waiting for RevenueCat's webhook. The server reads the player's
// purchases from RevenueCat's REST API with its secret key, so the client sends
// nothing but its JWT; the gem count comes from the economy config.
//
// Environment: REVENUECAT_SECRET_KEY (RevenueCat → Project settings → API keys, secret);
// REVENUECAT_ALLOW_TEST_STORE=1 pays Test Store (simulated, free) purchases too, for testing only.
import { gemPackForProduct, isTestStore, revenueCatPurchases } from '../../../packages/economy/src/index.ts';
import { handle, HttpError, json } from '../_shared/http.ts';
import { admin, loadEconomyConfig, requirePlayer } from '../_shared/supabase.ts';

Deno.serve(handle(async (req) => {
  const playerId = await requirePlayer(req);
  const key = Deno.env.get('REVENUECAT_SECRET_KEY');
  if (!key) throw new HttpError(503, 'payments_off');

  const res = await fetch(`https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(playerId)}`, {
    headers: { Authorization: `Bearer ${key}`, Accept: 'application/json' },
  });
  if (!res.ok) {
    console.error('revenuecat subscriber', res.status, await res.text().catch(() => ''));
    throw new HttpError(502, 'store_unreachable');
  }
  const packs = (await loadEconomyConfig()).shop.gemPacks;
  const allowTest = Deno.env.get('REVENUECAT_ALLOW_TEST_STORE') === '1';
  let paid = 0;
  for (const p of revenueCatPurchases(await res.json())) {
    const pack = gemPackForProduct(packs, p.productId);
    if (!pack || (isTestStore(p.store) && !allowTest)) continue;
    const { data, error } = await admin.rpc('grant_gem_purchase', {
      p_player: playerId, p_store: p.store, p_tx: p.transactionId, p_product: p.productId, p_gem: pack.gem, p_sandbox: p.sandbox,
    });
    if (error) throw error;
    if (data === 'paid') paid += pack.gem;
  }
  const { data: wallet, error } = await admin.from('wallets').select('gem').eq('player_id', playerId).single();
  if (error) throw error;
  return json({ paid, gem: Number(wallet.gem) });
}));
