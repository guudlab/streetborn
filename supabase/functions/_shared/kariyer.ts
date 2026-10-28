// Server side of the career features (packages/economy/src/kariyer.ts): reads the state
// that match-start needs, applies a finished match, unlocks achievements and settles the
// weekly friend duel. Amounts and results are computed here, never taken from the client.
import {
  ACHIEVEMENTS,
  addDays,
  duelResult,
  duelScore,
  formFrom,
  injuryRisk,
  istanbulDay,
  keremScore,
  moraleAfter,
  newAchievements,
  pickRival,
  rollInjury,
  weekStart,
  type AchievementStats,
  type Choice,
  type EconomyConfig,
  type Form,
  type InjuryKind,
} from '../../../packages/economy/src/index.ts';
import { admin } from './supabase.ts';

export interface KariyerState {
  morale: number;
  injury: { until: number; kind: InjuryKind } | null;
  /** Today's pre-match choice, until a finished match uses it up. */
  choice: Choice | null;
  /** True once a choice was made today, used up or not. */
  choseToday: boolean;
  form: Form;
}

export async function loadState(playerId: string, now: number, config: EconomyConfig): Promise<KariyerState> {
  const [{ data: durum, error: durumError }, { data: rows, error: ratingsError }] = await Promise.all([
    admin.from('kariyer_durum').select('morale, injury_until, injury_kind, choice, choice_day').eq('player_id', playerId).maybeSingle(),
    admin.from('matches').select('rating').eq('player_id', playerId).eq('status', 'finished').eq('flagged', false)
      .order('finished_at', { ascending: false }).limit(config.kariyer.formWindow),
  ]);
  if (durumError || ratingsError) throw durumError ?? ratingsError;
  const today = istanbulDay(now);
  const until = durum?.injury_until ? Date.parse(durum.injury_until) : 0;
  return {
    morale: durum?.morale ?? config.kariyer.moraleStart,
    injury: until > now ? { until, kind: durum!.injury_kind as InjuryKind } : null,
    choice: durum?.choice_day === today ? (durum.choice as Choice | null) : null,
    choseToday: durum?.choice_day === today,
    form: formFrom((rows ?? []).map((r) => r.rating as number), config),
  };
}

/** Morale and a possible injury after a finished match. Safe to repeat for the same match. */
export async function afterMatch(
  playerId: string, matchId: string, result: 'W' | 'D' | 'L', now: number, config: EconomyConfig,
): Promise<{ morale: number; injury: { days: number; kind: InjuryKind } | null }> {
  const [state, { data: stats, error }] = await Promise.all([
    loadState(playerId, now, config),
    admin.from('player_stats').select('stamina').eq('player_id', playerId).single(),
  ]);
  if (error) throw error;
  const morale = moraleAfter(state.morale, result, config);
  const injury = rollInjury(matchId, injuryRisk(stats.stamina, state.choice, config), config);
  const { error: rpcError } = await admin.rpc('kariyer_mac_sonrasi', {
    p_player: playerId, p_match: matchId, p_morale_delta: morale - state.morale,
    p_injury_days: injury?.days ?? 0, p_injury_kind: injury?.kind ?? null,
  });
  if (rpcError) throw rpcError;
  return { morale, injury };
}

export interface Unlocked { key: string; coin: number }

/** Pays and records the achievements the player's numbers reach now. */
export async function unlockAchievements(playerId: string): Promise<{ unlocked: Unlocked[]; stats: AchievementStats; have: Set<string> }> {
  const [{ data: stats, error: statsError }, { data: rows, error: rowsError }] = await Promise.all([
    admin.rpc('basarim_ozet', { p_player: playerId }),
    admin.from('basarimlar').select('key').eq('player_id', playerId),
  ]);
  if (statsError || rowsError) throw statsError ?? rowsError;
  const have = new Set<string>((rows ?? []).map((r) => r.key));
  const fresh = newAchievements(stats as AchievementStats, have);
  let unlocked: Unlocked[] = [];
  if (fresh.length > 0) {
    const { data: keys, error } = await admin.rpc('basarim_ac', {
      p_player: playerId, p_rows: fresh.map((a) => ({ key: a.key, coin: a.coin })),
    });
    if (error) throw error;
    unlocked = fresh.filter((a) => (keys as string[]).includes(a.key)).map((a) => ({ key: a.key, coin: a.coin }));
    for (const u of unlocked) have.add(u.key);
  }
  return { unlocked, stats: stats as AchievementStats, have };
}

// ---------------------------------------------------------------------------
// Weekly duel
// ---------------------------------------------------------------------------

export interface WeekScore { matches: number; goals: number; assists: number; score: number }

const WEEK_MS = 7 * 86_400_000;
/** A week starts Monday 00:00 in Turkey (UTC+3, no daylight saving). */
const weekStartMs = (week: string) => Date.parse(`${week}T00:00:00+03:00`);

export async function weekScore(playerId: string, week: string): Promise<WeekScore> {
  const from = weekStartMs(week);
  const { data, error } = await admin.from('matches').select('goals, assists')
    .eq('player_id', playerId).eq('status', 'finished').eq('flagged', false)
    .gte('finished_at', new Date(from).toISOString()).lt('finished_at', new Date(from + WEEK_MS).toISOString());
  if (error) throw error;
  const goals = (data ?? []).reduce((a, m) => a + (m.goals ?? 0), 0);
  const assists = (data ?? []).reduce((a, m) => a + (m.assists ?? 0), 0);
  return { matches: data?.length ?? 0, goals, assists, score: duelScore(goals, assists) };
}

/** Kerem as a week score: goals and assists that add up to his seeded score. */
function keremWeek(playerId: string, week: string, level: number, config: EconomyConfig): WeekScore {
  const score = keremScore(playerId, week, level, config);
  const goals = Math.trunc((score * 2) / 5);
  return { matches: config.kariyer.duelMinMatches, goals, assists: score - goals * 2, score };
}

export interface SettledDuel { week: string; status: string; coin: number; respect: number; rivalNick: string | null }

/** Settles every open duel of earlier weeks. Returns the ones closed now. */
export async function settleDuels(playerId: string, currentWeek: string, level: number, config: EconomyConfig): Promise<SettledDuel[]> {
  const { data: open, error } = await admin.from('rakip_hafta').select('week, rival_id')
    .eq('player_id', playerId).eq('status', 'open').lt('week', currentWeek).order('week').limit(8);
  if (error) throw error;
  const settled: SettledDuel[] = [];
  for (const row of open ?? []) {
    const mine = await weekScore(playerId, row.week);
    let theirs: WeekScore;
    let rivalNick: string | null = null;
    if (row.rival_id) {
      theirs = await weekScore(row.rival_id, row.week);
      const { data: rival } = await admin.from('players').select('nick').eq('id', row.rival_id).maybeSingle();
      rivalNick = rival?.nick ?? null;
    } else {
      theirs = keremWeek(playerId, row.week, level, config);
    }
    const status = duelResult(mine, theirs, config);
    const k = config.kariyer;
    const { data: closed, error: closeError } = await admin.rpc('rakip_kapat', {
      p_player: playerId, p_week: row.week, p_status: status, p_coin: k.duelWinCoin, p_respect: k.duelWinRespect,
    });
    if (closeError) throw closeError;
    if (closed) settled.push({ week: row.week, status, coin: status === 'win' ? k.duelWinCoin : 0, respect: status === 'win' ? k.duelWinRespect : 0, rivalNick });
  }
  return settled;
}

export interface DuelView {
  week: string;
  daysLeft: number;
  rival: { kind: 'friend' | 'npc'; id: string | null; nick: string | null; level: number };
  me: WeekScore;
  them: WeekScore;
  record: { win: number; lose: number; draw: number };
}

/** This week's duel: opens it on first sight, picking the mahalle friend closest in level (Kerem when nobody else is there). */
export async function currentDuel(playerId: string, now: number, level: number, config: EconomyConfig): Promise<DuelView> {
  const today = istanbulDay(now);
  const week = weekStart(today);

  const { data: member, error: memberError } = await admin.from('mahalle_uye').select('mahalle_id').eq('player_id', playerId).maybeSingle();
  if (memberError) throw memberError;
  let mates: { id: string; level: number }[] = [];
  if (member) {
    const [{ data: members, error: membersError }, { data: blocks, error: blocksError }] = await Promise.all([
      admin.from('mahalle_uye').select('player_id').eq('mahalle_id', member.mahalle_id),
      admin.from('blocks').select('blocker_id, blocked_id').or(`blocker_id.eq.${playerId},blocked_id.eq.${playerId}`),
    ]);
    if (membersError || blocksError) throw membersError ?? blocksError;
    const hidden = new Set((blocks ?? []).flatMap((b) => [b.blocker_id, b.blocked_id]));
    const ids = (members ?? []).map((m) => m.player_id).filter((id) => id === playerId || !hidden.has(id));
    const { data: levels, error: levelsError } = await admin.from('players').select('id, level').in('id', ids);
    if (levelsError) throw levelsError;
    mates = (levels ?? []).map((l) => ({ id: l.id, level: l.level }));
  }
  const { data: opened, error: openError } = await admin.rpc('rakip_ac', {
    p_player: playerId, p_week: week, p_rival: pickRival(playerId, week, level, mates),
  });
  if (openError) throw openError;
  const rivalId = (opened as { rivalId: string | null }).rivalId;

  const me = await weekScore(playerId, week);
  let rival: DuelView['rival'];
  let them: WeekScore;
  if (rivalId) {
    const { data: row } = await admin.from('players').select('nick, level').eq('id', rivalId).maybeSingle();
    rival = { kind: 'friend', id: rivalId, nick: row?.nick ?? null, level: row?.level ?? level };
    them = await weekScore(rivalId, week);
  } else {
    rival = { kind: 'npc', id: null, nick: null, level: level + 1 };
    // Kerem plays out the week with you: his score grows towards the final one day by day.
    const full = keremWeek(playerId, week, level, config);
    const dayOfWeek = Math.max(1, (Date.parse(`${today}T00:00:00Z`) - Date.parse(`${week}T00:00:00Z`)) / 86_400_000 + 1);
    const score = Math.trunc((full.score * dayOfWeek) / 7);
    const goals = Math.trunc((score * 2) / 5);
    them = { matches: Math.min(full.matches, dayOfWeek), goals, assists: score - goals * 2, score };
  }

  const { data: history, error: historyError } = await admin.from('rakip_hafta').select('status').eq('player_id', playerId);
  if (historyError) throw historyError;
  const count = (s: string) => (history ?? []).filter((h) => h.status === s).length;
  const daysLeft = Math.round((Date.parse(`${addDays(week, 7)}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
  return { week, daysLeft, rival, me, them, record: { win: count('win'), lose: count('lose'), draw: count('draw') } };
}

export { ACHIEVEMENTS };
