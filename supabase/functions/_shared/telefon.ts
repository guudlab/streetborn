// The day's phone event (packages/economy telefon.ts): it shows up after the first finished
// match of the Turkish day and stays until the day ends. Picked from a seed of player and
// day, so every request that day sees the same one until it is answered.
import {
  istanbulDay,
  phoneEffect,
  phoneEvent,
  pickPhoneEvent,
  type EconomyConfig,
  type PhoneEffect,
  type PhoneEvent,
  type PhoneSender,
} from '../../../packages/economy/src/index.ts';
import { admin } from './supabase.ts';

export interface PhoneView {
  day: string;
  key: string;
  from: PhoneSender;
  a: PhoneEffect;
  b: PhoneEffect;
  /** The answer given today (0 = a, 1 = b), or null while it waits. */
  answer: 0 | 1 | null;
}

export async function phoneToday(playerId: string, now: number, config: EconomyConfig): Promise<{ view: PhoneView | null; event: PhoneEvent | null; club: boolean }> {
  const day = istanbulDay(now);
  const dayStart = new Date(Date.parse(`${day}T00:00:00+03:00`)).toISOString();
  const [answers, total, today, contract] = await Promise.all([
    admin.from('telefon_cevap').select('day, event_key, answer').eq('player_id', playerId)
      .order('day', { ascending: false }).limit(config.kariyer.phoneRecentDays),
    admin.from('matches').select('id', { count: 'exact', head: true }).eq('player_id', playerId).eq('status', 'finished'),
    admin.from('matches').select('id', { count: 'exact', head: true }).eq('player_id', playerId).eq('status', 'finished').gte('finished_at', dayStart),
    admin.from('contracts').select('active').eq('player_id', playerId).maybeSingle(),
  ]);
  const error = answers.error ?? total.error ?? today.error ?? contract.error;
  if (error) throw error;
  const club = !!contract.data?.active;
  const rows = answers.data ?? [];
  const answered = rows.find((r) => r.day === day);

  let event: PhoneEvent | null = null;
  if (answered) event = phoneEvent(answered.event_key) ?? null;
  else if ((today.count ?? 0) > 0) {
    event = pickPhoneEvent(`${playerId}:${day}`, { club, matches: total.count ?? 0, recent: rows.map((r) => r.event_key) }, config);
  }
  if (!event) return { view: null, event: null, club };
  return {
    view: {
      day, key: event.key, from: event.from,
      a: phoneEffect(event.a, club, config), b: phoneEffect(event.b, club, config),
      answer: answered ? (answered.answer as 0 | 1) : null,
    },
    event,
    club,
  };
}
