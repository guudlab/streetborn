// Gem pack purchases through RevenueCat (react-native-purchases), on every platform.
// RevenueCat runs with the player id as its app user id, so the server can read the
// player's purchases (iap Edge Function) and match RevenueCat's webhook to the player.
// The app never says how many gems a purchase is worth; the server does.
//
// Keys (net/config.ts): the App Store / Play Store SDK keys on iOS/Android, or the
// Test Store key (test_…) everywhere, which simulates purchases without store
// accounts; the server pays Test Store purchases only while REVENUECAT_ALLOW_TEST_STORE
// is on. Products come from the current offering's packages (the only way on the
// web) and, on iOS/Android, from the store directly when no offering lists them.
// The SDK loads on first use, so the web build does not carry it from the start.
import { Platform } from 'react-native';
import type { PurchasesPackage, PurchasesStoreProduct } from 'react-native-purchases';

import { REVENUECAT_ANDROID_KEY, REVENUECAT_IOS_KEY, REVENUECAT_TEST_KEY } from './config.ts';

export type IapResult = 'ok' | 'cancelled' | 'pending' | 'error';

const API_KEY = REVENUECAT_TEST_KEY
  || (Platform.OS === 'ios' ? REVENUECAT_IOS_KEY : Platform.OS === 'android' ? REVENUECAT_ANDROID_KEY : '');
const NATIVE = Platform.OS === 'ios' || Platform.OS === 'android';

/** False until a RevenueCat key is set: the shop then keeps its prototype flow. */
export const iapAvailable = API_KEY.length > 0;

const sdk = () => import('react-native-purchases');

let user: string | null = null;
const packages = new Map<string, PurchasesPackage>();
const products = new Map<string, PurchasesStoreProduct>();

/** Configures RevenueCat once, and switches its user when another account signs in on this device. */
async function ready(playerId: string) {
  const { default: Purchases } = await sdk();
  if (user !== playerId) {
    if (user === null) Purchases.configure({ apiKey: API_KEY, appUserID: playerId });
    else await Purchases.logIn(playerId);
    user = playerId;
  }
  return Purchases;
}

async function load(ids: string[], playerId: string) {
  const Purchases = await ready(playerId);
  const { PRODUCT_CATEGORY } = await sdk();
  const offerings = await Purchases.getOfferings().catch(() => null);
  for (const p of offerings?.current?.availablePackages ?? []) {
    if (ids.includes(p.product.identifier)) packages.set(p.product.identifier, p);
  }
  const missing = ids.filter(id => !packages.has(id) && !products.has(id));
  if (NATIVE && missing.length > 0) {
    for (const p of await Purchases.getProducts(missing, PRODUCT_CATEGORY.NON_SUBSCRIPTION)) products.set(p.identifier, p);
  }
  return Purchases;
}

/** The store's own price label (local currency) for each gem pack product. */
export async function loadGemPrices(ids: string[], playerId: string): Promise<Record<string, string>> {
  if (!iapAvailable) return {};
  await load(ids, playerId);
  const out: Record<string, string> = {};
  for (const id of ids) {
    const product = packages.get(id)?.product ?? products.get(id);
    if (product) out[id] = product.priceString;
  }
  return out;
}

/** Opens the store's (or the Test Store's) purchase sheet. 'ok' means it charged; the server pays the gems. */
export async function buyStoreProduct(id: string, playerId: string): Promise<IapResult> {
  if (!iapAvailable) return 'error';
  const { PURCHASES_ERROR_CODE } = await sdk();
  try {
    const Purchases = packages.has(id) || products.has(id) ? await ready(playerId) : await load([id], playerId);
    const pkg = packages.get(id);
    const product = products.get(id);
    if (pkg) await Purchases.purchasePackage(pkg);
    else if (product) await Purchases.purchaseStoreProduct(product);
    else return 'error';
    return 'ok';
  } catch (e) {
    const code = (e as { code?: string }).code;
    if (code === PURCHASES_ERROR_CODE.PURCHASE_CANCELLED_ERROR) return 'cancelled';
    if (code === PURCHASES_ERROR_CODE.PAYMENT_PENDING_ERROR) return 'pending';
    console.warn('store purchase failed', e);
    return 'error';
  }
}
