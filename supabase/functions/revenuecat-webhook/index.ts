// RevenueCat webhook. RevenueCat calls this URL (no Supabase JWT; verify_jwt = false
// in supabase/config.toml) with the Authorization header value set in its dashboard.
// A gem pack purchase pays the gems from the economy config (never from the body);
// a refund (CANCELLATION of a consumable) takes them back. RevenueCat retries on
// errors, so a database error answers 500 and the store transaction id keeps the
// retry (and the app's own sync call) from paying twice.
//
// Environment: REVENUECAT_WEBHOOK_AUTH (the exact Authorization header value).
import { gemPackForProduct, parseRevenueCatEvent, sameSecret } from '../../../packages/economy/src/index.ts';
import { handle, HttpError, json } from '../_shared/http.ts';
import { admin, loadEconomyConfig } from '../_shared/supabase.ts';

const PURCHASE = new Set(['NON_RENEWING_PURCHASE', 'INITIAL_PURCHASE']);

Deno.serve(handle(async (req) => {
  const auth = Deno.env.get('REVENUECAT_WEBHOOK_AUTH');
  if (!auth) throw new HttpError(503, 'payments_off');
  if (!sameSecret(req.headers.get('Authorization') ?? '', auth)) throw new HttpError(401, 'unauthorized');

  const payload = await req.json().catch(() => null);
  const event = parseRevenueCatEvent(payload);
  if (!event) return json({ outcome: 'ignored' });

  let outcome = 'ignored';
  const p = event.purchase;
  const pack = p ? gemPackForProduct((await loadEconomyConfig()).shop.gemPacks, p.productId) : null;
  if (p && pack && PURCHASE.has(event.type) && event.playerId) {
    const { data, error } = await admin.rpc('grant_gem_purchase', {
      p_player: event.playerId, p_store: p.store, p_tx: p.transactionId, p_product: p.productId, p_gem: pack.gem, p_sandbox: p.sandbox,
    });
    if (error) throw error;
    outcome = data as string;
  } else if (p && pack && event.type === 'CANCELLATION') {
    // For a consumable, CANCELLATION means the store refunded it.
    const { data, error } = await admin.rpc('reverse_gem_purchase', { p_tx: p.transactionId });
    if (error) throw error;
    outcome = data === null ? 'nothing' : `reversed:${data}`;
  }

  const { error: logError } = await admin.from('payment_events').upsert({
    event_id: event.id, provider: 'revenuecat', type: event.type, transaction_id: p?.transactionId ?? null, outcome, payload,
  }, { onConflict: 'event_id', ignoreDuplicates: true });
  if (logError) console.error('payment_events', logError);
  return json({ outcome });
}));
