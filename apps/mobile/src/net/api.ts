import AsyncStorage from '@react-native-async-storage/async-storage';
import type { ChanceInput, MatchResult, MatchSetup } from '@streetborn/engine';

import type { Character } from '../game/character.ts';
import { SESSION_KEY } from './config.ts';

// The Supabase client (~250 KB) loads on first use, not with the app, so the
// first screen can show without it.
const client = () => import('./supabase.ts').then(m => m.supabase);

export interface Profile {
  playerId: string;
  level: number;
  xp: number;
  coin: number;
  gem: number;
  energy: number;
  energyUpdatedAt: number;
  stats: { shooting: number; passing: number; pace: number; stamina: number };
  /** AP collected toward each stat's next point. */
  ap: { shooting: number; passing: number; pace: number; stamina: number };
  /** Nickname and new-player choices saved by profile-set; null before character creation. */
  nick?: string | null;
  character?: Partial<Character> | null;
}

export interface Ticket {
  matchId: string; setup: MatchSetup; expiresAt: number; energy: { energy: number; updatedAt: number };
  /** Mahalle matches only: the NPC mahalle the whole mahalle faces today. */
  opponentName?: string;
}

export interface FinishResponse {
  result: MatchResult & { rating: number };
  reward: { coin: number; xp: number; capped: boolean } | null;
  flagged: boolean;
  /** League matches: the coach trust change. */
  trustDelta?: number;
  /** Trial matches: whether the rating reached the trial bar. */
  trialPassed?: boolean;
  /** Morale, a possible injury and achievements unlocked by this match (null for a retried finish). */
  kariyer?: { morale: number; injury: { days: number; kind: InjuryKind } | null; unlocked: { key: string; coin: number }[] } | null;
  player: { coin: number; xp: number; level: number };
}

export class ApiError extends Error {
  constructor(public code: string) { super(code); }
}

/**
 * The player id of the session stored on this device, read straight from storage
 * (no network call, no Supabase client). Null for a new player.
 * On the web, AsyncStorage and supabase-js both use localStorage.
 */
export async function storedPlayerId(): Promise<string | null> {
  const raw = await AsyncStorage.getItem(SESSION_KEY);
  if (!raw) return null;
  const id = (JSON.parse(raw) as { user?: { id?: string } }).user?.id;
  return typeof id === 'string' ? id : null;
}

/** Signs in anonymously the first time; later launches reuse the stored session. */
export async function ensureSession(): Promise<string> {
  const supabase = await client();
  const { data } = await supabase.auth.getSession();
  if (data.session) return data.session.user.id;
  const { data: signed, error } = await supabase.auth.signInAnonymously();
  if (error || !signed.user) throw new ApiError(error?.message ?? 'sign_in_failed');
  return signed.user.id;
}

export async function loadProfile(): Promise<Profile> {
  const playerId = await ensureSession();
  const supabase = await client();
  const [p, w, s] = await Promise.all([
    supabase.from('players').select('level, xp, nick, character').eq('id', playerId).single(),
    supabase.from('wallets').select('coin, gem, energy, energy_updated_at').eq('player_id', playerId).single(),
    supabase.from('player_stats').select('shooting, passing, pace, stamina, ap_shooting, ap_passing, ap_pace, ap_stamina').eq('player_id', playerId).single(),
  ]);
  const err = p.error ?? w.error ?? s.error;
  if (err) throw new ApiError(err.message);
  if (!p.data || !w.data || !s.data) throw new ApiError('profile_missing');
  return {
    playerId,
    level: p.data.level,
    xp: Number(p.data.xp),
    coin: Number(w.data.coin),
    gem: Number(w.data.gem),
    energy: w.data.energy,
    energyUpdatedAt: Date.parse(w.data.energy_updated_at),
    stats: { shooting: s.data.shooting, passing: s.data.passing, pace: s.data.pace, stamina: s.data.stamina },
    ap: { shooting: s.data.ap_shooting ?? 0, passing: s.data.ap_passing ?? 0, pace: s.data.ap_pace ?? 0, stamina: s.data.ap_stamina ?? 0 },
    nick: p.data.nick ?? null,
    character: p.data.character ?? null,
  };
}

async function call<T>(name: string, body?: unknown): Promise<T> {
  await ensureSession();
  const supabase = await client();
  const { data, error } = await supabase.functions.invoke(name, { body: body ?? {} });
  if (error) {
    // Edge Function errors carry { error: code } in the response body.
    const ctx = (error as { context?: Response }).context;
    const code = ctx ? await ctx.json().then((b: { error?: string }) => b.error, () => undefined) : undefined;
    throw new ApiError(code ?? error.message);
  }
  return data as T;
}

export type MatchKind = 'energy' | 'mahalle' | 'league' | 'trial';
export const startMatch = (kind: MatchKind = 'energy', offerId?: string) => call<Ticket>('match-start', { kind, offerId });
export const finishMatch = (matchId: string, inputs: ChanceInput[], durationMs: number) =>
  call<FinishResponse>('match-finish', { matchId, inputs, durationMs });

export type MahalleEmblem = 'shield' | 'circle' | 'diamond';
export type MahalleColor = 'lime' | 'blue' | 'red' | 'purple' | 'teal' | 'white';

export interface MahalleMember { playerId: string; nick: string | null; level: number; joinedAt: string }
export interface MahalleInfo {
  id: string; name: string; emblem: MahalleEmblem; color: MahalleColor; code: string; isOpen: boolean;
  captainId: string | null; members: MahalleMember[];
}
export interface MahallePreview {
  id: string; name: string; emblem: MahalleEmblem; color: MahalleColor; memberCount: number; captainNick: string | null;
}
export interface OpenMahalle { id: string; name: string; emblem: MahalleEmblem; color: MahalleColor; memberCount: number }

/** The caller's own mahalle, or null when they have none. */
export async function loadMahalle(): Promise<MahalleInfo | null> {
  await ensureSession();
  const supabase = await client();
  const { data, error } = await supabase.rpc('mahalle_overview');
  if (error) throw new ApiError(error.message);
  return (data as MahalleInfo | null) ?? null;
}

export async function previewMahalle(code: string): Promise<MahallePreview | null> {
  await ensureSession();
  const supabase = await client();
  const { data, error } = await supabase.rpc('mahalle_preview', { p_code: code });
  if (error) throw new ApiError(error.message);
  return (data as MahallePreview | null) ?? null;
}

export async function listOpenMahalle(): Promise<OpenMahalle[]> {
  await ensureSession();
  const supabase = await client();
  const { data, error } = await supabase.rpc('open_mahalleler', { p_limit: 20 });
  if (error) throw new ApiError(error.message);
  return (data as OpenMahalle[] | null) ?? [];
}

export const createMahalle = (name: string, emblem: MahalleEmblem, color: MahalleColor, open: boolean) =>
  call<{ ok: true }>('mahalle', { action: 'create', name, emblem, color, open });
export const joinMahalleByCode = (code: string) => call<{ ok: true }>('mahalle', { action: 'join', code });
export const joinMahalleById = (id: string) => call<{ ok: true }>('mahalle', { action: 'join', id });
export const leaveMahalle = () => call<{ ok: true }>('mahalle', { action: 'leave' });
export const saveProfile = (nick: string, character: Character) => call<{ ok: true }>('profile-set', { nick, character });

export interface MahalleContribution {
  playerId: string; nick: string | null; goals: number; assists: number; opponentGoals: number;
  /** x10 */
  rating: number;
  cheers: number; cheered: boolean;
}
export interface MahalleLastDay {
  day: string; opponent: { name: string }; ourGoals: number; theirGoals: number; result: 'W' | 'D' | 'L';
  summary: {
    motm: string | null; turnout: boolean; fills: number;
    payouts: { player: string; coin: number; xp: number; respect: number }[];
  };
}
export interface MahalleToday {
  me: string; day: string; opponent: { name: string } | null; played: boolean;
  contributions: MahalleContribution[]; cheersLeft: number; respect: number; last: MahalleLastDay | null;
}

/** Today's mahalle match (live contributions) and the last settled day. Null without a mahalle. */
export async function loadMahalleToday(): Promise<MahalleToday | null> {
  await ensureSession();
  const supabase = await client();
  const { data, error } = await supabase.rpc('mahalle_bugun');
  if (error) throw new ApiError(error.message);
  return (data as MahalleToday | null) ?? null;
}

export const cheerMate = (to: string, phrase: number) => call<{ ok: true }>('mahalle', { action: 'cheer', to, phrase });

export type ReportReason = 'abuse' | 'harassment' | 'spam' | 'other';
export const reportPlayer = (to: string, reason: ReportReason) => call<{ ok: true }>('mahalle', { action: 'report', to, reason });
export const blockPlayer = (to: string) => call<{ ok: true }>('mahalle', { action: 'block', to });
export const unblockPlayer = (to: string) => call<{ ok: true }>('mahalle', { action: 'unblock', to });

/** Ids of the players the caller blocked. */
export async function loadBlocked(): Promise<string[]> {
  await ensureSession();
  const supabase = await client();
  const { data, error } = await supabase.rpc('engellenenler');
  if (error) throw new ApiError(error.message);
  return (data as string[] | null) ?? [];
}

export interface LeagueTeamInfo { key: string; name: string; goalkeeping: number; attack: number }
export interface CareerOffer {
  id: string; kind: 'direct' | 'trial' | 'better' | 'renew' | 'promote' | 'weaker'; tier: number;
  clubKey: string; clubName: string; salaryWeekly: number; status: 'open' | 'trial_passed' | 'trial_failed';
}
export interface Career {
  today: string;
  /** Coach trust 0..100. */
  trust: number;
  progress: { level: number; matches: number; mahalleMatches: number };
  contract: { tier: number; clubKey: string; clubName: string; salaryWeekly: number; seasonId: string | null; active: boolean } | null;
  season: {
    id: string; seed: string; tier: number; startDay: string; teams: LeagueTeamInfo[]; status: 'active' | 'done';
    place: number | null; prize: number | null; days: { round: number; played: boolean; us: number; them: number }[];
  } | null;
  offers: CareerOffer[];
}

export interface GemGrant { coin: number; gem: number; levels: number[] }
/** Runs the day's career work on the server (missed days, season end, salary, first offers, starting and level gems). */
export const careerStatus = () =>
  call<{ salary: number; seasonEnded: { place: number; prize: number } | null; gems?: GemGrant }>('career', { action: 'status' });
export const acceptOffer = (offerId: string) => call<{ ok: true }>('career', { action: 'accept', offerId });

export async function loadCareer(): Promise<Career | null> {
  await ensureSession();
  const supabase = await client();
  const { data, error } = await supabase.rpc('kariyer');
  if (error) throw new ApiError(error.message);
  return (data as Career | null) ?? null;
}

export type ServerStat = 'shooting' | 'passing' | 'pace' | 'stamina';
export interface TrainResponse {
  grade: 'perfect' | 'good' | 'miss' | null; ap: number; xp: number; coin: number;
  stat: { name: ServerStat; before: number; after: number; ap: number };
  player: { xp: number; level: number; coin: number };
  energy: { energy: number; updatedAt: number } | null;
}
export const trainDrill = (stat: ServerStat, quality: number, durationMs: number) =>
  call<TrainResponse>('train', { kind: 'drill', stat, quality, durationMs });
export const trainPrivate = (stat: ServerStat) => call<TrainResponse>('train', { kind: 'private', stat });

/** Today's training counts (free drills, energy drills, private sessions). */
export async function loadTrainingToday(): Promise<{ free: number; energy: number; private: number }> {
  await ensureSession();
  const supabase = await client();
  const { data, error } = await supabase.rpc('antrenman_bugun');
  if (error) throw new ApiError(error.message);
  return data as { free: number; energy: number; private: number };
}

export const refillEnergy = () => call<{ gem: number; energy: { energy: number; updatedAt: number } }>('shop', { action: 'refill' });
export const buyItem = (itemId: string) => call<{ currency: 'coin' | 'gem'; price: number; balance: number }>('shop', { action: 'buy', itemId });
export const equipItem = (itemId: string, on: boolean) => call<{ ok: true }>('shop', { action: 'equip', itemId, on });

export interface OwnedItem { id: string; equipped: boolean }
export interface CatalogItem { id: string; kind: string; priceGem: number | null; priceCoin: number | null }
export interface ShopToday { refills: number; adEnergy: number; adDouble: number; items: OwnedItem[]; catalog: CatalogItem[] }

/** Today's refills and rewarded ads, the caller's items and the price list. */
export async function loadShopToday(): Promise<ShopToday> {
  await ensureSession();
  const supabase = await client();
  const { data, error } = await supabase.rpc('dukkan_bugun');
  if (error) throw new ApiError(error.message);
  return data as ShopToday;
}

// Career features (oyuncu Edge Function): form, morale, the day's choice, injuries, achievements, the weekly duel.
export type InjuryKind = 'ankle' | 'muscle' | 'knee';
export type FormLevel = 'none' | 'cold' | 'normal' | 'good' | 'hot';
export type Choice = 'rest' | 'work' | 'hang';
export interface WeekScore { matches: number; goals: number; assists: number; score: number }
export interface DuelView {
  week: string;
  daysLeft: number;
  rival: { kind: 'friend' | 'npc'; id: string | null; nick: string | null; level: number };
  me: WeekScore;
  them: WeekScore;
  record: { win: number; lose: number; draw: number };
  minMatches: number;
  winCoin: number;
  winRespect: number;
}
export interface AchievementView { key: string; group: 'match' | 'mahalle' | 'club'; coin: number; target: number; value: number; unlocked: boolean }
export interface Kariyer {
  coin: number;
  morale: number;
  form: { level: FormLevel; avg: number; ratings: number[] };
  injury: { until: number; kind: InjuryKind } | null;
  choice: Choice | null;
  choseToday: boolean;
  massageCost: number;
  duel: DuelView;
  settled: { week: string; status: 'win' | 'lose' | 'draw' | 'void'; coin: number; respect: number; rivalNick: string | null }[];
  achievements: AchievementView[];
  unlocked: { key: string; coin: number }[];
  totals: { matches: number; goals: number; assists: number };
}
export const kariyerDurum = () => call<Kariyer>('oyuncu', { action: 'durum' });
export const kariyerSec = (choice: Choice) => call<{ ok: true }>('oyuncu', { action: 'sec', choice });
export const kariyerMasaj = () => call<{ ok: true; coin: number }>('oyuncu', { action: 'masaj' });

/** Deletes the account and all its game data on the server. Cannot be undone. */
export const deleteAccount = () => call<{ ok: true }>('account-delete', { confirm: true });
