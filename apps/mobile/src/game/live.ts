import type { ChanceOutcome, MatchEvent, MatchPlan, Moment, Side } from '@streetborn/engine';

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
  us: { goal: 3, save: 2, miss: 2, post: 1, corner: 2, card: 1, offside: 1, win: 3, counter: 1, attack: 3, foul: 2, penalty: 1, run: 1, space: 1, lost: 2 },
  them: { goal: 3, save: 2, miss: 2, post: 1, corner: 1, card: 1, offside: 1, win: 2, counter: 1, attack: 2, foul: 1, penalty: 1, run: 1, space: 1, lost: 2 },
};
/** Engine 5: the step that hands the ball to the player. */
const ME_VARIANTS: Partial<Record<MatchEvent['kind'], number>> = { win: 1, attack: 2, foul: 1, penalty: 1 };
/** "Rakip kontradan attı" only fits after a counter. */
const THEIR_COUNTER_GOAL = 1;

/**
 * The lane an engine 5 event happens in, always seen from our side (we attack toward x = 100,
 * y = 0 is our left), as the radar and the 3D cameras show it.
 */
export function laneOf(e: MatchEvent): 'left' | 'center' | 'right' {
  const y = e.y ?? 50;
  return y < 35 ? 'left' : y > 65 ? 'right' : 'center';
}

/** Can on the left, Mert on the right, when the plan does not name the teammates (engine 4 and older). */
const SIDE_MATE: Record<Side, string> = { left: DEFAULT_MATES[0], right: DEFAULT_MATES[1] };

/** The teammate on one side in a pass or decision moment: the same name the commentary used. */
export function sideMate(names: readonly string[], moment: Moment | undefined, side: Side): string {
  const who = moment?.mates?.[side === 'left' ? 0 : 1];
  return who === undefined ? SIDE_MATE[side] : names[who % names.length] ?? SIDE_MATE[side];
}

/** `opener` is the event that started this attack (engine 5), so a goal reads like the attack that led to it. */
export function eventLine(e: MatchEvent, names: readonly string[], opener?: MatchEvent): string {
  const vars = { name: names[e.who % names.length] ?? DEFAULT_MATES[0], lane: t(`live.lane.${laneOf(e)}`) };
  const meVariants = e.me ? ME_VARIANTS[e.kind] : undefined;
  if (meVariants) return t(`live.me.${e.kind}.${e.v % meVariants}` as Key, vars);
  if (e.set === 'penalty') return t(`live.${e.team}.penalty.${e.kind === 'goal' ? 'goal' : e.kind === 'save' ? 'save' : 'miss'}`, vars);
  if (e.set === 'freekick' && e.kind === 'goal') return t(`live.${e.team}.freekick.goal`, vars);
  let v = e.v % VARIANTS[e.team][e.kind];
  if (e.team === 'them' && e.kind === 'goal' && v === THEIR_COUNTER_GOAL && e.x !== undefined && opener?.kind !== 'counter') v = 0;
  return t(`live.${e.team}.${e.kind}.${v}` as Key, vars);
}

/** Mahalle matches: Burak abi has a word after every goal. */
export function burakLine(e: MatchEvent, names: readonly string[]): string | null {
  if (e.kind !== 'goal') return null;
  return e.team === 'us' ? t('live.burak.goal', { name: names[e.who % names.length] ?? DEFAULT_MATES[0] }) : t('live.burak.conceded');
}

/**
 * The feed line after one of the player's own moments. `shown` is what the 3D scene showed for
 * a shot (it plays some wide shots off the post), so the line says what the player just saw.
 */
export function myLine(o: ChanceOutcome | null, moment: Moment, passTo: string, shown?: 'goal' | 'save' | 'post' | 'miss'): string {
  if (!o) return moment.kind === 'defense' ? t('live.me.conceded') : t('live.me.skipped');
  switch (o.kind) {
    case 'halftime': return t('live.secondHalf');
    case 'pass': return o.outcome === 'assist' ? t('live.me.assist', { name: passTo }) : t('live.me.lost');
    case 'defense': return t(`live.me.${o.outcome}`);
    default:
      if (o.outcome === 'goal') return t('live.me.goal');
      if (shown === 'post') return t('live.me.post');
      return t(`live.me.${o.outcome}`);
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
