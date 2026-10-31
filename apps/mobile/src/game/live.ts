import type { ChanceOutcome, MatchEvent, MatchPlan, Moment } from '@streetborn/engine';

import { t, type Key } from '../i18n/index.ts';

// The live match (engine 4): what the commentary says between the player's moments.
// Display only: every line comes from the plan the engine played.

/** Teammates when the mahalle has nobody else yet (the 3D pass moments use Can and Mert too). */
export const DEFAULT_MATES = ['Can', 'Mert', 'Emre', 'Barış'] as const;

/** Four teammate names: the other mahalle members first, then the defaults. */
export function mateNames(members: readonly { nick: string | null }[] | undefined, myNick: string): string[] {
  const nicks = (members ?? []).filter(m => m.nick && m.nick !== myNick).map(m => m.nick!);
  return [...nicks, ...DEFAULT_MATES].slice(0, 4);
}

/** Events strictly between two minutes. Engine 2 and 3 plans only know the opponent's goals. */
export function eventsBetween(plan: MatchPlan, from: number, to: number): MatchEvent[] {
  const all = plan.events ?? plan.opponentGoals.map((minute): MatchEvent => ({ minute, team: 'them', kind: 'goal', who: 0, v: minute }));
  return all.filter(e => e.minute > from && e.minute < to);
}

/** Lines per event: how many variants each one has (see live.* in i18n). */
const VARIANTS: Record<MatchEvent['team'], Record<MatchEvent['kind'], number>> = {
  us: { goal: 3, save: 2, miss: 2, post: 1, corner: 2, card: 1, offside: 1 },
  them: { goal: 3, save: 2, miss: 2, post: 1, corner: 1, card: 1, offside: 1 },
};

export function eventLine(e: MatchEvent, names: readonly string[]): string {
  const key = `live.${e.team}.${e.kind}.${e.v % VARIANTS[e.team][e.kind]}` as Key;
  return t(key, { name: names[e.who % names.length] ?? DEFAULT_MATES[0] });
}

/** Mahalle matches: Burak abi has a word after every goal. */
export function burakLine(e: MatchEvent, names: readonly string[]): string | null {
  if (e.kind !== 'goal') return null;
  return e.team === 'us' ? t('live.burak.goal', { name: names[e.who % names.length] ?? DEFAULT_MATES[0] }) : t('live.burak.conceded');
}

/** The feed line after one of the player's own moments. */
export function myLine(o: ChanceOutcome | null, moment: Moment, passTo: string): string {
  if (!o) return moment.kind === 'defense' ? t('live.me.conceded') : t('live.me.skipped');
  switch (o.kind) {
    case 'halftime': return t('live.secondHalf');
    case 'pass': return o.outcome === 'assist' ? t('live.me.assist', { name: passTo }) : t('live.me.lost');
    case 'defense': return t(`live.me.${o.outcome}`);
    default: return o.outcome === 'goal' ? t('live.me.goal') : t('live.me.shotMiss');
  }
}

export type Pin = { minute: number; kind: 'mine' | 'mineGood' | 'goal' | 'conceded' };

/** The match strip on the result screen: the player's moments, and the goals he was not part of. */
export function storyPins(plan: MatchPlan, outcomes: readonly (ChanceOutcome | null)[], unplayedConceded: (chance: number) => boolean): Pin[] {
  const pins: Pin[] = [];
  plan.moments.forEach((m, i) => {
    if (m.kind === 'halftime') return;
    const o = outcomes[i];
    const good = !!o && (o.outcome === 'goal' || o.outcome === 'assist' || o.outcome === 'stopped');
    pins.push({ minute: m.minute, kind: good ? 'mineGood' : 'mine' });
    if (m.kind === 'defense' && (o ? o.outcome === 'conceded' : unplayedConceded(i))) pins.push({ minute: m.minute, kind: 'conceded' });
  });
  for (const minute of plan.mateGoals ?? []) pins.push({ minute, kind: 'goal' });
  for (const minute of plan.opponentGoals) pins.push({ minute, kind: 'conceded' });
  return pins.sort((a, b) => a.minute - b.minute);
}
