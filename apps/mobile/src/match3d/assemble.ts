import type { Gltf, MatchEnv } from './scene.d.ts';

// Turns the parsed models, keyed by name, into the scene's `G`. Keys `mate0…`, `opp0…` and
// `fan0…` become the lists `mates`, `opps` and `fans`; every other key is used as is. The
// browser build and the iOS WebView bundle both call this, so they cannot disagree.
const LISTS = { mate: 'mates', opp: 'opps', fan: 'fans' } as const;
const LIST_KEY = /^(mate|opp|fan)(\d+)$/;

export function assembleG(byKey: Record<string, Gltf>): MatchEnv['G'] {
  const G: Record<string, unknown> = {};
  const lists: Record<string, [number, Gltf][]> = { mates: [], opps: [], fans: [] };
  for (const [k, g] of Object.entries(byKey)) {
    const m = LIST_KEY.exec(k);
    if (m) lists[LISTS[m[1] as keyof typeof LISTS]]!.push([Number(m[2]), g]);
    else G[k] = g;
  }
  for (const [name, items] of Object.entries(lists)) G[name] = items.sort((a, b) => a[0] - b[0]).map(x => x[1]);
  return G as unknown as MatchEnv['G'];
}
