/**
 * Deterministic 32-bit PRNG (mulberry32).
 *
 * Only integer operations (`Math.imul`, shifts, xor), so the same seed yields the
 * same sequence on iOS, Android and the Deno server. `Math.random` must never be
 * used anywhere in this package.
 */
export interface Rng {
  /** Next unsigned 32-bit integer. */
  nextU32(): number;
  /** Integer in [0, maxExclusive). */
  int(maxExclusive: number): number;
  /** Integer in [min, max], both inclusive. */
  range(min: number, max: number): number;
}

export function createRng(seed: number): Rng {
  let state = seed >>> 0;

  const nextU32 = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return (t ^ (t >>> 14)) >>> 0;
  };

  // Modulo bias is below 1e-6 for the small ranges the engine uses.
  const int = (maxExclusive: number): number => {
    if (!Number.isInteger(maxExclusive) || maxExclusive <= 0) {
      throw new RangeError(`int(): maxExclusive must be a positive integer, got ${maxExclusive}`);
    }
    return nextU32() % maxExclusive;
  };

  const range = (min: number, max: number): number => {
    if (!Number.isInteger(min) || !Number.isInteger(max) || max < min) {
      throw new RangeError(`range(): invalid bounds [${min}, ${max}]`);
    }
    return min + int(max - min + 1);
  };

  return { nextU32, int, range };
}

/** Mixes a match seed with a chance index so each chance has an independent stream. */
export function deriveSeed(seed: number, index: number): number {
  let h = (seed ^ Math.imul(index + 1, 0x9e3779b1)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}
