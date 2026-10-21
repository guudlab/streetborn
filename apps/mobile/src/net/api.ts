import type { ChanceInput, MatchResult, MatchSetup } from '@streetborn/engine';

import { supabase } from './supabase.ts';

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

export interface Ticket { matchId: string; setup: MatchSetup; expiresAt: number; energy: { energy: number; updatedAt: number } }

export interface FinishResponse {
  result: MatchResult & { rating: number };
  reward: { coin: number; xp: number; capped: boolean } | null;
  flagged: boolean;
  player: { coin: number; xp: number; level: number };
}

export class ApiError extends Error {
  constructor(public code: string) { super(code); }
}

/** Whether this device already has a player session (no network call). */
export async function hasSession(): Promise<boolean> {
  const { data } = await supabase.auth.getSession();
  return !!data.session;
}

/** Signs in anonymously the first time; later launches reuse the stored session. */
export async function ensureSession(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  if (data.session) return data.session.user.id;
  const { data: signed, error } = await supabase.auth.signInAnonymously();
  if (error || !signed.user) throw new ApiError(error?.message ?? 'sign_in_failed');
  return signed.user.id;
}

export async function loadProfile(): Promise<Profile> {
  const playerId = await ensureSession();
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
  const { data, error } = await supabase.functions.invoke(name, { body: body ?? {} });
  if (error) {
    // Edge Function errors carry { error: code } in the response body.
    const ctx = (error as { context?: Response }).context;
    const code = ctx ? await ctx.json().then((b: { error?: string }) => b.error, () => undefined) : undefined;
    throw new ApiError(code ?? error.message);
  }
  return data as T;
}

export const startMatch = () => call<Ticket>('match-start');
export const finishMatch = (matchId: string, inputs: ChanceInput[], durationMs: number) =>
  call<FinishResponse>('match-finish', { matchId, inputs, durationMs });
