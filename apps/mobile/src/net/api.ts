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
    supabase.from('players').select('level, xp').eq('id', playerId).single(),
    supabase.from('wallets').select('coin, gem, energy, energy_updated_at').eq('player_id', playerId).single(),
    supabase.from('player_stats').select('shooting, passing, pace, stamina').eq('player_id', playerId).single(),
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
    stats: s.data,
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

export const startMatch = (kind: 'energy' | 'mahalle' = 'energy') => call<Ticket>('match-start', { kind });
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
