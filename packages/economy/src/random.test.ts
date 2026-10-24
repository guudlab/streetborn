import { describe, expect, it } from 'vitest';
import { hash, rng, weighted } from './random.ts';

describe('seeded randomness', () => {
  it('hashes text with FNV-1a, so stored seeds keep their meaning', () => {
    // Reference vectors of the 32-bit FNV-1a function.
    expect(hash('')).toBe(0x811c9dc5);
    expect(hash('a')).toBe(0xe40c292c);
    expect(hash('foobar')).toBe(0xbf9cf968);
  });

  it('hashes the characters, not their bytes, and stays an unsigned 32-bit integer', () => {
    for (const text of ['ç', 'Çınaraltı', 'ğüşiöç', 'x'.repeat(500)]) {
      const h = hash(text);
      expect(Number.isInteger(h)).toBe(true);
      expect(h).toBeGreaterThanOrEqual(0);
      expect(h).toBeLessThan(2 ** 32);
    }
    expect(hash('ı')).not.toBe(hash('i'));
  });

  it('produces a fixed sequence per seed text', () => {
    // Locks the algorithm: mahalle days and NPC leagues are settled from these values.
    const next = rng('streetborn');
    expect(Array.from({ length: 6 }, () => next(1000))).toEqual([771, 573, 995, 867, 127, 516]);
    const again = rng('streetborn');
    expect(Array.from({ length: 6 }, () => again(1000))).toEqual([771, 573, 995, 867, 127, 516]);
  });

  it('keeps each stream independent and different seeds apart', () => {
    const a = rng('a');
    const b = rng('b');
    const first = Array.from({ length: 8 }, () => a(1_000_000));
    // Drawing from b does not disturb a: a fresh a repeats exactly.
    Array.from({ length: 20 }, () => b(1_000_000));
    const replay = rng('a');
    expect(Array.from({ length: 8 }, () => replay(1_000_000))).toEqual(first);
    expect(first).not.toEqual(Array.from({ length: 8 }, () => rng('b')(1_000_000)));
  });

  it('stays inside [0, n) and reaches every value of a small range', () => {
    const next = rng('range');
    const seen = new Set<number>();
    for (let i = 0; i < 2000; i++) {
      const v = next(7);
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(7);
      seen.add(v);
    }
    expect(seen.size).toBe(7);
    expect(rng('one')(1)).toBe(0);
  });

  it('picks by weight, never a zero-weight entry, and falls back to the first one', () => {
    const next = rng('weights');
    const counts = [0, 0, 0, 0];
    for (let i = 0; i < 20_000; i++) counts[weighted(next, [30, 0, 50, 20])]!++;
    expect(counts[1]).toBe(0);
    // 30 / 50 / 20 percent, within sampling noise.
    expect(counts[0]! / 20_000).toBeGreaterThan(0.28);
    expect(counts[0]! / 20_000).toBeLessThan(0.32);
    expect(counts[2]! / 20_000).toBeGreaterThan(0.48);
    expect(counts[2]! / 20_000).toBeLessThan(0.52);
    expect(counts[3]! / 20_000).toBeGreaterThan(0.18);
    expect(counts[3]! / 20_000).toBeLessThan(0.22);
    expect(weighted(() => 0, [0, 0, 0])).toBe(0);
    expect(weighted(() => 0, [5])).toBe(0);
  });
});
