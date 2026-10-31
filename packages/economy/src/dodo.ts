// Dodo Payments (web gem packs). Dodo signs its webhooks with the Standard Webhooks
// scheme: HMAC-SHA256 over `${webhook-id}.${webhook-timestamp}.${raw body}` with the
// base64 secret after its `whsec_` prefix, sent as space separated `v1,<base64>`
// entries in `webhook-signature`. Uses WebCrypto, which Deno and Node both have.

import type { GemPack } from './config.ts';

/** How far a webhook's timestamp may be from now, as in the Standard Webhooks libraries. */
export const WEBHOOK_TOLERANCE_SECONDS = 5 * 60;

export interface WebhookHeaders {
  id: string | null;
  timestamp: string | null;
  signature: string | null;
}

export type WebhookCheck = 'ok' | 'missing' | 'stale' | 'bad_signature';

function bytesToBase64(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

function base64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
  const bin = atob(b64);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

/** Constant time for equal lengths; the length itself is not secret. */
function sameText(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** The `v1,<base64>` signature for a message, as Dodo would send it. */
export async function signWebhook(secret: string, id: string, timestamp: string, body: string): Promise<string> {
  const raw = base64ToBytes(secret.startsWith('whsec_') ? secret.slice('whsec_'.length) : secret);
  const key = await crypto.subtle.importKey('raw', raw, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${id}.${timestamp}.${body}`));
  return `v1,${bytesToBase64(new Uint8Array(mac))}`;
}

/** Checks a webhook against the endpoint secret. `body` must be the raw request text. */
export async function verifyWebhook(
  secret: string, headers: WebhookHeaders, body: string, nowSeconds: number,
): Promise<WebhookCheck> {
  const { id, timestamp, signature } = headers;
  if (!id || !timestamp || !signature) return 'missing';
  const ts = Number(timestamp);
  if (!/^\d+$/.test(timestamp) || Math.abs(nowSeconds - ts) > WEBHOOK_TOLERANCE_SECONDS) return 'stale';
  let expected: string;
  try {
    expected = (await signWebhook(secret, id, timestamp, body)).slice('v1,'.length);
  } catch {
    return 'bad_signature';
  }
  for (const entry of signature.split(' ')) {
    const [version, sig] = entry.split(',');
    if (version === 'v1' && sig && sameText(sig, expected)) return 'ok';
  }
  return 'bad_signature';
}

/**
 * Pack id → Dodo product id, from `gem_80=pdt_abc,gem_450=pdt_def`.
 * Product ids differ between Dodo's test and live mode, so they come from the
 * deploy environment together with the API key, not from the economy config.
 */
export function parseProductMap(text: string | undefined | null): Map<string, string> {
  const map = new Map<string, string>();
  for (const part of (text ?? '').split(/[,\s]+/)) {
    const [pack, product] = part.split('=');
    if (pack && product) map.set(pack.trim(), product.trim());
  }
  return map;
}

export function findGemPack(packs: readonly GemPack[], id: unknown): GemPack | null {
  return typeof id === 'string' ? packs.find((p) => p.id === id) ?? null : null;
}

/** What the webhook needs from a Dodo event; anything else is ignored. */
export interface DodoEvent {
  type: string;
  paymentId: string | null;
  checkoutSessionId: string | null;
  purchaseId: string | null;
  productIds: string[];
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function parseDodoEvent(payload: unknown): DodoEvent | null {
  if (!payload || typeof payload !== 'object') return null;
  const p = payload as { type?: unknown; data?: Record<string, unknown> };
  if (typeof p.type !== 'string' || !p.data || typeof p.data !== 'object') return null;
  const d = p.data;
  const metadata = (d.metadata && typeof d.metadata === 'object' ? d.metadata : {}) as Record<string, unknown>;
  const purchaseId = typeof metadata.purchase_id === 'string' && UUID.test(metadata.purchase_id) ? metadata.purchase_id : null;
  const cart = Array.isArray(d.product_cart) ? d.product_cart as Array<{ product_id?: unknown }> : [];
  return {
    type: p.type,
    paymentId: typeof d.payment_id === 'string' ? d.payment_id : null,
    checkoutSessionId: typeof d.checkout_session_id === 'string' ? d.checkout_session_id : null,
    purchaseId,
    productIds: cart.map((c) => c.product_id).filter((x): x is string => typeof x === 'string'),
  };
}
