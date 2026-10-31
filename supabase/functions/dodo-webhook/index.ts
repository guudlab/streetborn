// Dodo Payments webhook. Dodo calls this URL (no Supabase JWT; verify_jwt = false in
// supabase/config.toml) for payment, refund and dispute events, signed with the
// endpoint's secret (Standard Webhooks). Only a verified payment.succeeded pays,
// and it pays the gems stored on our own pending row, never an amount from the
// body. Dodo retries until it gets a 2xx, so a database error answers 500 and the
// payment id keeps the retry from paying twice.
//
// Environment: DODO_PAYMENTS_WEBHOOK_KEY (whsec_..., from the Dodo dashboard).
import { parseDodoEvent, verifyWebhook } from '../../../packages/economy/src/index.ts';
import { handle, HttpError, json } from '../_shared/http.ts';
import { admin } from '../_shared/supabase.ts';

const REVERSE = new Set(['refund.succeeded', 'dispute.lost']);

Deno.serve(handle(async (req) => {
  const secret = Deno.env.get('DODO_PAYMENTS_WEBHOOK_KEY');
  if (!secret) throw new HttpError(503, 'payments_off');

  const raw = await req.text();
  const check = await verifyWebhook(secret, {
    id: req.headers.get('webhook-id'),
    timestamp: req.headers.get('webhook-timestamp'),
    signature: req.headers.get('webhook-signature'),
  }, raw, Math.floor(Date.now() / 1000));
  if (check !== 'ok') throw new HttpError(401, check);

  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return json({ outcome: 'ignored' });
  }
  const event = parseDodoEvent(payload);
  const webhookId = req.headers.get('webhook-id')!;
  if (!event) return json({ outcome: 'ignored' });

  let outcome = 'ignored';
  if (event.type === 'payment.succeeded' && event.purchaseId && event.paymentId) {
    const { data, error } = await admin.rpc('complete_gem_purchase', {
      p_purchase: event.purchaseId, p_payment: event.paymentId,
      p_session: event.checkoutSessionId, p_products: event.productIds,
    });
    if (error) throw error;
    outcome = data as string;
    if (outcome === 'mismatch' || outcome === 'unknown') console.error('dodo payment not matched', event);
  } else if (REVERSE.has(event.type) && event.paymentId) {
    const { data, error } = await admin.rpc('reverse_gem_purchase', { p_payment: event.paymentId });
    if (error) throw error;
    outcome = data === null ? 'nothing' : `reversed:${data}`;
  }

  // Audit row; a retried delivery keeps its first row.
  const { error: logError } = await admin.from('payment_events').upsert({
    webhook_id: webhookId, provider: 'dodo', type: event.type, payment_id: event.paymentId, outcome, payload,
  }, { onConflict: 'webhook_id', ignoreDuplicates: true });
  if (logError) console.error('payment_events', logError);
  return json({ outcome });
}));
