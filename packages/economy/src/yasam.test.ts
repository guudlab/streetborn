import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG, halisahaPayout, lifeBuyCheck, lifeShowcase, lifeTop, ownedLifestyle } from './index.ts';

const cfg = DEFAULT_CONFIG.lifestyle;

describe('yaşam', () => {
  it('everyone has the free room; bought items add to it', () => {
    expect(ownedLifestyle([], 1, cfg).map((i) => i.id)).toEqual(['ev_oda']);
    expect(ownedLifestyle(['bisiklet'], 5, cfg).map((i) => i.id)).toEqual(['ev_oda', 'bisiklet']);
  });

  it('shows the dearest item of each group, whatever the order it was bought in', () => {
    expect(lifeShowcase([], cfg)).toEqual({ ev: 'ev_oda', ulasim: null, arsa: null });
    expect(lifeShowcase(['araba', 'bisiklet', 'ev_daire', 'arsa', 'halisaha'], cfg))
      .toEqual({ ev: 'ev_daire', ulasim: 'araba', arsa: 'halisaha' });
    expect(lifeTop(['araba', 'bisiklet'], cfg)).toBe('araba');
    expect(lifeTop([], cfg)).toBeNull();
  });

  it('checks level, the arsa before the halısaha, ownership and coin', () => {
    const s = { level: 20, coins: 20000, bought: [] as string[] };
    expect(lifeBuyCheck('ev_oda', s, cfg)).toBe('not_for_sale');
    expect(lifeBuyCheck('nope', s, cfg)).toBe('not_for_sale');
    expect(lifeBuyCheck('ev_villa', s, cfg)).toBe('locked');
    expect(lifeBuyCheck('halisaha', s, cfg)).toBe('needs');
    expect(lifeBuyCheck('halisaha', { ...s, bought: ['arsa'] }, cfg)).toBe('ok');
    expect(lifeBuyCheck('halisaha', { ...s, coins: 100, bought: ['arsa'] }, cfg)).toBe('no_coin');
    expect(lifeBuyCheck('arsa', { ...s, bought: ['arsa'] }, cfg)).toBe('owned');
  });

  it('pays a day of halısaha income per whole day, up to the cap', () => {
    expect(halisahaPayout(0, cfg)).toBe(0);
    expect(halisahaPayout(1, cfg)).toBe(cfg.halisahaIncomePerDay);
    expect(halisahaPayout(9, cfg)).toBe(cfg.halisahaIncomePerDay * cfg.halisahaMaxAccrualDays);
    expect(halisahaPayout(-2, cfg)).toBe(0);
  });
});
