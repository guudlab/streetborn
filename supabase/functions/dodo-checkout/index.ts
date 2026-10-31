// Starts a web gem pack purchase through Dodo Payments' hosted checkout.
// The client names a pack; the gem count comes from the economy config and the
// price from the Dodo product, so the client sends no amount. The pending row's
// id rides in the payment metadata and `dodo-webhook` pays the gems from that row.
// Only linked (non-anonymous) accounts can pay, so a purchase is never lost with
// a browser's anonymous session.
//
// Environment (set by the Deploy Supabase workflow):
//   DODO_PAYMENTS_API_KEY   secret API key of the Dodo mode below
//   DODO_PAYMENTS_ENV       test_mode (default) or live_mode
//   DODO_GEM_PRODUCTS       pack → product ids, e.g. gem_80=pdt_a,gem_450=pdt_b,gem_1000=pdt_c
//   SITE_URL                where Dodo sends the player back (the web build)
import { findGemPack, parseProductMap } from '../../../packages/economy/src/index.ts';
import { handle, HttpError, json } from '../_shared/http.ts';
import { admin, loadEconomyConfig, requireUser } from '../_shared/supabase.ts';

const BASE = { test_mode: 'https://test.dodopayments.com', live_mode: 'https://live.dodopayments.com' } as const;
const DEFAULT_SITE = 'https://streetborn.guudlab.workers.dev';
/** Open checkouts one player may start in ten minutes. */
const PENDING_LIMIT = 5;

Deno.serve(handle(async (req) => {
  const user = await requireUser(req);
  if (user.is_anonymous) throw new HttpError(403, 'link_account');

  const apiKey = Deno.env.get('DODO_PAYMENTS_API_KEY');
  const products = parseProductMap(Deno.env.get('DODO_GEM_PRODUCTS'));
  if (!apiKey || products.size === 0) throw new HttpError(503, 'payments_off');
  const mode = Deno.env.get('DODO_PAYMENTS_ENV') === 'live_mode' ? 'live_mode' : 'test_mode';

  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const pack = findGemPack((await loadEconomyConfig()).shop.gemPacks, body.pack);
  const productId = pack ? products.get(pack.id) : undefined;
  if (!pack || !productId) throw new HttpError(404, 'not_for_sale');

  const { count, error: countError } = await admin.from('gem_purchases')
    .select('id', { count: 'exact', head: true })
    .eq('player_id', user.id).eq('status', 'pending')
    .gte('created_at', new Date(Date.now() - 10 * 60_000).toISOString());
  if (countError) throw countError;
  if ((count ?? 0) >= PENDING_LIMIT) throw new HttpError(429, 'limit');

  const { data: row, error } = await admin.from('gem_purchases')
    .insert({ player_id: user.id, pack: pack.id, gem: pack.gem, product_id: productId, test_mode: mode === 'test_mode' })
    .select('id').single();
  if (error) throw error;

  const site = (Deno.env.get('SITE_URL') || DEFAULT_SITE).replace(/\/+$/, '');
  const res = await fetch(`${BASE[mode]}/checkouts`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      product_cart: [{ product_id: productId, quantity: 1 }],
      ...(user.email ? { customer: { email: user.email } } : {}),
      return_url: `${site}/dukkan?odeme=${row.id}`,
      cancel_url: `${site}/dukkan`,
      metadata: { purchase_id: row.id, player_id: user.id, pack: pack.id },
    }),
  });
  const session = await res.json().catch(() => null) as { session_id?: string; checkout_url?: string | null } | null;
  if (!res.ok || !session?.session_id || !session.checkout_url) {
    console.error('dodo checkout failed', res.status, session);
    await admin.from('gem_purchases').delete().eq('id', row.id).eq('status', 'pending');
    throw new HttpError(502, 'checkout_failed');
  }
  const { error: saveError } = await admin.from('gem_purchases')
    .update({ checkout_session_id: session.session_id }).eq('id', row.id);
  if (saveError) throw saveError;
  return json({ purchaseId: row.id, url: session.checkout_url });
}));
