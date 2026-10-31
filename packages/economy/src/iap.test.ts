import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG, gemPackForProduct, isTestStore, parseRevenueCatEvent, revenueCatPurchases, sameSecret } from './index.ts';

const PLAYER = '0b6f2a52-6a55-4c1c-9a59-5bb3a1c0e7d1';

describe('store purchases', () => {
  it('maps store products to configured gem packs only', () => {
    expect(gemPackForProduct(DEFAULT_CONFIG.shop.gemPacks, 'gem_450')?.gem).toBe(450);
    expect(gemPackForProduct(DEFAULT_CONFIG.shop.gemPacks, 'sezon_kart')).toBeNull();
    expect(gemPackForProduct(DEFAULT_CONFIG.shop.gemPacks, undefined)).toBeNull();
  });

  it('spots the Test Store in both spellings', () => {
    expect(isTestStore('TEST_STORE')).toBe(true);
    expect(isTestStore('test_store')).toBe(true);
    expect(isTestStore('APP_STORE')).toBe(false);
  });

  it('compares secrets', () => {
    expect(sameSecret('Bearer abc', 'Bearer abc')).toBe(true);
    expect(sameSecret('Bearer abc', 'Bearer abd')).toBe(false);
    expect(sameSecret('Bearer abc', 'Bearer abcd')).toBe(false);
  });

  it('parses a RevenueCat purchase event', () => {
    expect(parseRevenueCatEvent({
      api_version: '1.0',
      event: {
        id: 'evt_1', type: 'NON_RENEWING_PURCHASE', app_user_id: PLAYER, original_app_user_id: PLAYER, aliases: [PLAYER],
        product_id: 'gem_80', transaction_id: '2000000123', store: 'APP_STORE', environment: 'SANDBOX',
      },
    })).toEqual({
      id: 'evt_1', type: 'NON_RENEWING_PURCHASE', playerId: PLAYER,
      purchase: { productId: 'gem_80', transactionId: '2000000123', store: 'APP_STORE', sandbox: true },
      cancelReason: null,
    });
  });

  it('finds the player among aliases and skips anonymous ids', () => {
    const e = parseRevenueCatEvent({ event: { id: 'e', type: 'CANCELLATION', app_user_id: '$RCAnonymousID:abc', aliases: ['$RCAnonymousID:abc', PLAYER], product_id: 'gem_80', transaction_id: 'GPA.1', cancel_reason: 'CUSTOMER_SUPPORT', environment: 'PRODUCTION' } });
    expect(e?.playerId).toBe(PLAYER);
    expect(e?.purchase?.sandbox).toBe(false);
    expect(e?.cancelReason).toBe('CUSTOMER_SUPPORT');
    expect(parseRevenueCatEvent({ event: { id: 't', type: 'TEST', app_user_id: 'x' } })).toEqual({ id: 't', type: 'TEST', playerId: null, purchase: null, cancelReason: null });
    expect(parseRevenueCatEvent({ nope: 1 })).toBeNull();
    expect(parseRevenueCatEvent(null)).toBeNull();
  });

  it('lists consumable purchases from a subscriber answer', () => {
    expect(revenueCatPurchases({
      subscriber: {
        non_subscriptions: {
          gem_80: [
            { id: 'a', store_transaction_id: 'GPA.1', store: 'play_store', is_sandbox: false },
            { id: 'b', store_transaction_id: 'GPA.2', store: 'play_store', is_sandbox: true },
          ],
          gem_450: [{ id: 'c' }],
        },
      },
    })).toEqual([
      { productId: 'gem_80', transactionId: 'GPA.1', store: 'play_store', sandbox: false },
      { productId: 'gem_80', transactionId: 'GPA.2', store: 'play_store', sandbox: true },
    ]);
    expect(revenueCatPurchases({ subscriber: {} })).toEqual([]);
  });
});
