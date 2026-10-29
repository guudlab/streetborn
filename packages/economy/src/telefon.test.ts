import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG as config, PHONE_EVENTS, phoneEffect, phoneEvent, pickPhoneEvent } from './index.ts';

describe('phone events', () => {
  it('has unique keys and two answers that differ', () => {
    expect(new Set(PHONE_EVENTS.map((e) => e.key)).size).toBe(PHONE_EVENTS.length);
    for (const e of PHONE_EVENTS) expect(e.a).not.toEqual(e.b);
  });

  it('only gives coach trust in club events', () => {
    for (const e of PHONE_EVENTS) if (e.stage !== 'club') expect(e.a.t ?? e.b.t).toBeUndefined();
  });

  it('turns coin tiers into config amounts and drops trust outside a club', () => {
    expect(phoneEffect({ m: 6, c: -1 }, false, config)).toEqual({ morale: 6, respect: 0, trust: 0, coin: -config.kariyer.phoneCoinS });
    expect(phoneEffect({ c: 2 }, false, config).coin).toBe(config.kariyer.phoneCoinM);
    expect(phoneEffect({ t: 2 }, false, config).trust).toBe(0);
    expect(phoneEffect({ t: 2 }, true, config).trust).toBe(2);
  });

  it('waits for the first matches, then picks the same event for the same seed', () => {
    expect(pickPhoneEvent('p:2026-10-29', { club: false, matches: 0, recent: [] }, config)).toBeNull();
    const a = pickPhoneEvent('p:2026-10-29', { club: false, matches: 5, recent: [] }, config);
    expect(a).not.toBeNull();
    expect(pickPhoneEvent('p:2026-10-29', { club: false, matches: 5, recent: [] }, config)).toBe(a);
  });

  it('keeps club events for players with a contract and mahalle events for the rest', () => {
    for (let i = 0; i < 200; i++) {
      expect(pickPhoneEvent(`s${i}`, { club: false, matches: 5, recent: [] }, config)!.stage).not.toBe('club');
      expect(pickPhoneEvent(`s${i}`, { club: true, matches: 5, recent: [] }, config)!.stage).not.toBe('mahalle');
    }
  });

  it('skips recent events while fresh ones are left', () => {
    const recent = PHONE_EVENTS.filter((e) => e.stage !== 'club').map((e) => e.key).slice(1);
    const left = PHONE_EVENTS.find((e) => e.stage !== 'club')!.key;
    expect(pickPhoneEvent('x', { club: false, matches: 5, recent }, config)!.key).toBe(left);
    expect(phoneEvent(left)?.key).toBe(left);
  });
});
