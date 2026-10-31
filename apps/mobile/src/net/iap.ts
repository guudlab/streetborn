// Store purchases: web build. Gem packs are App Store / Google Play products sold
// through RevenueCat (iap.native.ts); the web has no store, so it keeps the
// shop's prototype flow.

export type IapResult = 'ok' | 'cancelled' | 'pending' | 'error';

export const iapAvailable = false;

export async function loadGemPrices(_ids: string[], _playerId: string): Promise<Record<string, string>> {
  return {};
}

export async function buyStoreProduct(_id: string, _playerId: string): Promise<IapResult> {
  return 'error';
}
