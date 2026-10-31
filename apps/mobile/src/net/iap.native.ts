// Store purchases on iOS/Android through RevenueCat (react-native-purchases).
// RevenueCat runs with the player id as its app user id, so the server can read
// the player's purchases (iap Edge Function) and match RevenueCat's webhook to the
// player. The app never says how many gems a purchase is worth; the server does.
// Needs a development or store build (not Expo Go) and the public SDK keys below.
import { Platform } from 'react-native';
import Purchases, { PRODUCT_CATEGORY, PURCHASES_ERROR_CODE, type PurchasesStoreProduct } from 'react-native-purchases';

import { REVENUECAT_ANDROID_KEY, REVENUECAT_IOS_KEY } from './config.ts';

export type IapResult = 'ok' | 'cancelled' | 'pending' | 'error';

const API_KEY = Platform.OS === 'ios' ? REVENUECAT_IOS_KEY : Platform.OS === 'android' ? REVENUECAT_ANDROID_KEY : '';

/** False until the RevenueCat keys are set: the shop then keeps its prototype flow. */
export const iapAvailable = API_KEY.length > 0;

let user: string | null = null;
const products = new Map<string, PurchasesStoreProduct>();

/** Configures RevenueCat once, and switches its user when another account signs in on this device. */
async function ready(playerId: string): Promise<void> {
  if (user === playerId) return;
  if (user === null) Purchases.configure({ apiKey: API_KEY, appUserID: playerId });
  else await Purchases.logIn(playerId);
  user = playerId;
}

/** The store's own price label (local currency) for each gem pack product. */
export async function loadGemPrices(ids: string[], playerId: string): Promise<Record<string, string>> {
  if (!iapAvailable) return {};
  await ready(playerId);
  const list = await Purchases.getProducts(ids, PRODUCT_CATEGORY.NON_SUBSCRIPTION);
  const out: Record<string, string> = {};
  for (const p of list) {
    products.set(p.identifier, p);
    out[p.identifier] = p.priceString;
  }
  return out;
}

/** Opens the store's purchase sheet. 'ok' means the store charged; the server pays the gems. */
export async function buyStoreProduct(id: string, playerId: string): Promise<IapResult> {
  if (!iapAvailable) return 'error';
  try {
    await ready(playerId);
    let product = products.get(id);
    if (!product) {
      [product] = await Purchases.getProducts([id], PRODUCT_CATEGORY.NON_SUBSCRIPTION);
      if (!product) return 'error';
      products.set(id, product);
    }
    await Purchases.purchaseStoreProduct(product);
    return 'ok';
  } catch (e) {
    const code = (e as { code?: string }).code;
    if (code === PURCHASES_ERROR_CODE.PURCHASE_CANCELLED_ERROR) return 'cancelled';
    if (code === PURCHASES_ERROR_CODE.PAYMENT_PENDING_ERROR) return 'pending';
    console.warn('store purchase failed', e);
    return 'error';
  }
}
