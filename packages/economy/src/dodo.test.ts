import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG, findGemPack, parseDodoEvent, parseProductMap, signWebhook, verifyWebhook } from './index.ts';

// A Standard Webhooks style secret: whsec_ + base64 of random bytes.
const RAW = Buffer.from('streetborn-test-secret-0123456789');
const SECRET = `whsec_${RAW.toString('base64')}`;
const BODY = JSON.stringify({ type: 'payment.succeeded', data: { payment_id: 'pay_1' } });
const NOW = 1_793_000_000;

/** Independent reference: Node's HMAC, the way the standardwebhooks package signs. */
function reference(id: string, ts: number, body: string): string {
  return `v1,${createHmac('sha256', RAW).update(`${id}.${ts}.${body}`).digest('base64')}`;
}

describe('dodo webhook signature', () => {
  it('signs like the Standard Webhooks reference', async () => {
    expect(await signWebhook(SECRET, 'msg_1', String(NOW), BODY)).toBe(reference('msg_1', NOW, BODY));
  });

  it('accepts a good signature, also among several', async () => {
    const sig = reference('msg_1', NOW, BODY);
    expect(await verifyWebhook(SECRET, { id: 'msg_1', timestamp: String(NOW), signature: sig }, BODY, NOW)).toBe('ok');
    expect(await verifyWebhook(SECRET, { id: 'msg_1', timestamp: String(NOW), signature: `v1,AAAA ${sig}` }, BODY, NOW + 60)).toBe('ok');
  });

  it('refuses a changed body, id, timestamp or secret', async () => {
    const sig = reference('msg_1', NOW, BODY);
    const h = { id: 'msg_1', timestamp: String(NOW), signature: sig };
    expect(await verifyWebhook(SECRET, h, BODY.replace('pay_1', 'pay_2'), NOW)).toBe('bad_signature');
    expect(await verifyWebhook(SECRET, { ...h, id: 'msg_2' }, BODY, NOW)).toBe('bad_signature');
    expect(await verifyWebhook(`whsec_${Buffer.from('other').toString('base64')}`, h, BODY, NOW)).toBe('bad_signature');
    expect(await verifyWebhook(SECRET, { ...h, signature: sig.replace('v1,', 'v2,') }, BODY, NOW)).toBe('bad_signature');
  });

  it('refuses old, future and missing headers', async () => {
    const sig = reference('msg_1', NOW, BODY);
    expect(await verifyWebhook(SECRET, { id: 'msg_1', timestamp: String(NOW), signature: sig }, BODY, NOW + 301)).toBe('stale');
    expect(await verifyWebhook(SECRET, { id: 'msg_1', timestamp: String(NOW), signature: sig }, BODY, NOW - 301)).toBe('stale');
    expect(await verifyWebhook(SECRET, { id: 'msg_1', timestamp: 'abc', signature: sig }, BODY, NOW)).toBe('stale');
    expect(await verifyWebhook(SECRET, { id: null, timestamp: String(NOW), signature: sig }, BODY, NOW)).toBe('missing');
  });
});

describe('dodo helpers', () => {
  it('reads the product map', () => {
    const m = parseProductMap('gem_80=pdt_a, gem_450=pdt_b\ngem_1000=pdt_c,broken');
    expect([...m]).toEqual([['gem_80', 'pdt_a'], ['gem_450', 'pdt_b'], ['gem_1000', 'pdt_c']]);
    expect(parseProductMap(undefined).size).toBe(0);
  });

  it('finds only configured packs', () => {
    expect(findGemPack(DEFAULT_CONFIG.shop.gemPacks, 'gem_450')?.gem).toBe(450);
    expect(findGemPack(DEFAULT_CONFIG.shop.gemPacks, 'gem_999')).toBeNull();
    expect(findGemPack(DEFAULT_CONFIG.shop.gemPacks, 450)).toBeNull();
  });

  it('parses the parts of a payment event the webhook uses', () => {
    const id = '0b6f2a52-6a55-4c1c-9a59-5bb3a1c0e7d1';
    expect(parseDodoEvent({
      type: 'payment.succeeded',
      data: { payment_id: 'pay_1', checkout_session_id: 'cks_1', metadata: { purchase_id: id }, product_cart: [{ product_id: 'pdt_a', quantity: 1 }] },
    })).toEqual({ type: 'payment.succeeded', paymentId: 'pay_1', checkoutSessionId: 'cks_1', purchaseId: id, productIds: ['pdt_a'] });
    expect(parseDodoEvent({ type: 'refund.succeeded', data: { payment_id: 'pay_1', metadata: { purchase_id: 'nope' } } })?.purchaseId).toBeNull();
    expect(parseDodoEvent('x')).toBeNull();
  });
});
