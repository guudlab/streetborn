// Seeded randomness for server-side settlement (mahalle days, NPC leagues). Integer
// math only, so the app and the Edge Functions compute the same results.

/** FNV-1a, integer math only. */
export function hash(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193);
  return h >>> 0;
}

/** mulberry32 seeded from text; returns ints in [0, n). */
export function rng(seed: string): (n: number) => number {
  let a = hash(seed);
  return (n) => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return (((t ^ (t >>> 14)) >>> 0) % n);
  };
}

/** Picks an index with the given integer weights. */
export function weighted(next: (n: number) => number, weights: readonly number[]): number {
  let roll = next(weights.reduce((a, b) => a + b, 0));
  for (let i = 0; i < weights.length; i++) {
    if (roll < weights[i]!) return i;
    roll -= weights[i]!;
  }
  return 0;
}
