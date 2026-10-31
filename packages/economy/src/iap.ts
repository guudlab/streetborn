// Store purchases (App Store / Google Play) through RevenueCat. The app configures
// RevenueCat with the player id as app user id, so every purchase names its player.
// Gems are paid on the server from two sources that may arrive in either order:
// RevenueCat's webhook and the app's sync call (which reads the player's purchases
// from RevenueCat's REST API). Both key the payment on the store transaction id.

import type { GemPack } from './config.ts';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** One consumable purchase of a player, as the server pays it. */
export interface StorePurchase {
  productId: string;
  transactionId: string;
  store: string;
  sandbox: boolean;
}

export function gemPackForProduct(packs: readonly GemPack[], productId: unknown): GemPack | null {
  return typeof productId === 'string' ? packs.find((p) => p.id === productId) ?? null : null;
}

/** RevenueCat's simulated store (webhook: TEST_STORE, REST: test_store). Free purchases. */
export function isTestStore(store: string): boolean {
  return store.toUpperCase() === 'TEST_STORE';
}

/** Constant time for equal lengths; the length itself is not secret. */
export function sameSecret(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** What the webhook needs from a RevenueCat event; null when the body is not one. */
export interface RevenueCatEvent {
  id: string;
  type: string;
  /** The player: the first UUID among app_user_id, original_app_user_id and aliases. */
  playerId: string | null;
  purchase: StorePurchase | null;
  cancelReason: string | null;
}

const str = (v: unknown): string | null => (typeof v === 'string' && v.length > 0 ? v : null);

export function parseRevenueCatEvent(body: unknown): RevenueCatEvent | null {
  const e = (body as { event?: Record<string, unknown> } | null)?.event;
  if (!e || typeof e !== 'object') return null;
  const id = str(e.id);
  const type = str(e.type);
  if (!id || !type) return null;
  const ids = [e.app_user_id, e.original_app_user_id, ...(Array.isArray(e.aliases) ? e.aliases : [])];
  const playerId = ids.find((x): x is string => typeof x === 'string' && UUID.test(x)) ?? null;
  const productId = str(e.product_id);
  const transactionId = str(e.transaction_id);
  return {
    id,
    type,
    playerId,
    purchase: productId && transactionId
      ? { productId, transactionId, store: str(e.store) ?? 'UNKNOWN', sandbox: e.environment === 'SANDBOX' }
      : null,
    cancelReason: str(e.cancel_reason),
  };
}

/**
 * The consumable purchases in a RevenueCat REST `GET /v1/subscribers/{id}` answer
 * (`subscriber.non_subscriptions`: product id → list of purchases).
 */
export function revenueCatPurchases(body: unknown): StorePurchase[] {
  const non = (body as { subscriber?: { non_subscriptions?: unknown } } | null)?.subscriber?.non_subscriptions;
  if (!non || typeof non !== 'object') return [];
  const out: StorePurchase[] = [];
  for (const [productId, list] of Object.entries(non as Record<string, unknown>)) {
    if (!Array.isArray(list)) continue;
    for (const p of list as Array<Record<string, unknown>>) {
      const transactionId = str(p?.store_transaction_id);
      if (!transactionId) continue;
      out.push({ productId, transactionId, store: str(p.store) ?? 'UNKNOWN', sandbox: p.is_sandbox === true });
    }
  }
  return out;
}
